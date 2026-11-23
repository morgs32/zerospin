import {
  AggregateNodeCommandSchema,
  type AggregateNodeCommandCoverageSchema,
} from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import { decodeRetainedAggregateSessionCommand } from '@zerospin/core/aggregateSession/decodeRetainedAggregateSessionCommand';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
  ISessionId,
} from '@zerospin/core/aggregateSession/types';
import { resolveSessionFailure } from '@zerospin/core/contracts/failureCodec';
import type { INodeRetention } from '@zerospin/core/Node/NodeCommandCoverage';
import { sessionSubmissionKey } from '@zerospin/core/Node/sessionSubmissionKey';
import type { IAggregateSessionReplayRequirements } from '@zerospin/core/sessionExecution/requirements';
import type { ISessionExecution } from '@zerospin/core/sessionExecution/types';
import type { ISessionFailureReporter } from '@zerospin/core/sessionFailure/types';
import type { IAnyError } from '@zerospin/error';
import { getTableName } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import type * as Scope from 'effect/Scope';

import { makeSessionFailureObserver } from '../Node/makeSessionFailureObserver.ts';
import { retainOriginatingCommand } from '../Node/retainOriginatingCommand.ts';
import { makeSessionCommandHandoff } from '../outbox/makeSessionCommandHandoff.ts';
import { publishAggregateSessionProgress } from '../publishAggregateSessionProgress.ts';
import type { ISessionRuntimeServices } from '../sessionRuntime.ts';
import { recoverStagedCommands } from '../stagedCommandJournal/recoverStagedCommands.ts';

import {
  makeAggregateReplicaReceiver,
  type IAggregateReplicaReceiver,
} from './makeAggregateReplicaReceiver.ts';
import { openAggregateReplica } from './openAggregateReplica.ts';
import type {
  IAggregateReplica,
  IAggregateReplicaConnection,
} from './replicaConnection.ts';

/** Own this lifetime's Aggregate database, staging handoff and received views. */
export const openAggregateSessionReplica = Effect.fn(
  'openAggregateSessionReplica',
)(function* <D extends IAggregateSessionDefinition>(props: {
  session: IAggregateSession<D>;
  sessionId: ISessionId;
  execution: ISessionExecution<
    ISessionRuntimeServices | IAggregateSessionReplayRequirements<D>
  >;
  connection: IAggregateReplicaConnection;
  reportFailure: ISessionFailureReporter;
  signal: AbortSignal;
  expectedClaims?: Readonly<Record<string, unknown>> | undefined;
  onAuthenticatedClaims?(claims: Readonly<Record<string, unknown>>): void;
  diagnostics?: { startupId: string } | undefined;
}): Effect.fn.Return<IAggregateReplica, IAnyError, Scope.Scope> {
  const {
    session,
    sessionId,
    execution,
    connection,
    reportFailure,
    signal,
    expectedClaims,
    onAuthenticatedClaims,
    diagnostics,
  } = props;
  const replicaStartedAt = performance.now();
  const openReplica = openAggregateReplica({ session, sessionId, signal });
  const replica = yield* diagnostics === undefined
    ? openReplica
    : openReplica.pipe(
        Effect.onExit(exit => {
          const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null;
          return Effect.logInfo('Session startup phase').pipe(
            Effect.annotateLogs({
              startupId: diagnostics.startupId,
              phase: 'session.replica.open',
              durationMs: performance.now() - replicaStartedAt,
              outcome: Exit.isSuccess(exit)
                ? 'ready'
                : Cause.hasInterruptsOnly(exit.cause)
                  ? 'cancelled'
                  : 'failed',
              errorCode:
                error !== null && typeof error === 'object' && 'code' in error
                  ? String(error.code)
                  : null,
            }),
          );
        }),
        Effect.withSpan('session.replica.open'),
      );
  const { definition, dbConfig, db, readPending } = replica;
  const current = () => !signal.aborted;
  const originatingCommands = new Map<string, string>();
  const {
    observeCommand,
    observeNodeState,
    sharedWorkerConnectionFailed,
    recoveryWarning,
  } = makeSessionFailureObserver({
    isCurrent: current,
    originatingCommands,
    reportFailure,
    recognizeFailure: (commandName, failure) =>
      execution.runSync(
        Effect.suspend(() =>
          resolveSessionFailure(definition, commandName, failure),
        ),
      ),
  });
  const recovery =
    connection.journalIdentityKey === undefined
      ? undefined
      : recoverStagedCommands<
          IAggregateNodeCommand,
          NonNullable<
            (typeof AggregateNodeCommandCoverageSchema.Type)['resolution']
          >
        >({
          prefix: 'aggregate',
          sessionId,
          identityKey: () => connection.journalIdentityKey?.(),
          decode: input =>
            Schema.decodeUnknownSync(AggregateNodeCommandSchema)(input, {
              onExcessProperty: 'error',
            }),
          resolutionIndex: resolution => resolution.aggregateIndex,
          attachment: nodeId => connection.stagedCommandAttachment(nodeId),
          isActive: () =>
            current() &&
            session.store.getState().nodeState?.blockedWork === false &&
            session.store.getState().nodeState?.authentication !== 'signed-out',
          originating: command =>
            originatingCommands.set(
              sessionSubmissionKey(command),
              command.commandName,
            ),
          retained: records => {
            for (const record of records) {
              retainOriginatingCommand(originatingCommands, record);
            }
          },
        });
  let receiver: IAggregateReplicaReceiver<D>;
  const prepareCommand = (row: typeof dbConfig.schema.commands.$inferSelect) =>
    decodeRetainedAggregateSessionCommand(row, {
      definition,
      identity: receiver.getIdentity(),
      sessionId,
    });
  const stagedCommandOutbox = yield* makeSessionCommandHandoff<
    typeof dbConfig.schema.commands.$inferSelect,
    IAggregateNodeCommand,
    ISessionRuntimeServices | IAggregateSessionReplayRequirements<D>
  >({
    reportFailure,
    recover: recovery?.drain,
    readPending: () => readPending(true),
    prepare: prepareCommand,
    attachment: () => {
      const nodeId = session.store.getState().nodeState?.nodeId;
      return nodeId === undefined
        ? null
        : connection.stagedCommandAttachment(nodeId);
    },
    retainCoordinates: (records: readonly INodeRetention[]) =>
      receiver.retainCoordinates(records),
    isActive: () =>
      current() &&
      session.store.getState().nodeState?.blockedWork !== true &&
      session.store.getState().nodeState?.authentication !== 'signed-out',
    context: execution.runSync(
      Effect.context<
        ISessionRuntimeServices | IAggregateSessionReplayRequirements<D>
      >(),
    ),
    originating: row => {
      originatingCommands.set(
        sessionSubmissionKey({ sessionId, sessionIndex: row.sessionIndex }),
        row.commandName,
      );
    },
    changed: () => {
      const nodeState = session.store.getState().nodeState;
      if (current() && nodeState != null) {
        try {
          session.store.setState({
            nodeState: {
              ...nodeState,
              uncertainHandoffs: stagedCommandOutbox.pendingCount(),
            },
          });
        } catch (error) {
          console.error(
            'Cannot publish aggregate command handoff state',
            error,
          );
        }
      }
    },
  });
  receiver = yield* makeAggregateReplicaReceiver({
    session,
    sessionId,
    replica,
    execution,
    stagedCommandOutbox,
    originatingCommands,
    recovery,
    observer: {
      observeCommand,
      observeNodeState,
      sharedWorkerConnectionFailed,
      recoveryWarning,
    },
    current,
    expectedClaims,
    onAuthenticatedClaims,
  });
  const onJournalChanged = (event: StorageEvent) => {
    if (current() && recovery?.journalChanged(event.key))
      stagedCommandOutbox.wake();
  };
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('storage', onJournalChanged);
  }
  const unsubscribeCommands = db.$client.subscribeToTableChanges(changed => {
    if (!current()) {
      return;
    }
    const state = session.store.getState();
    if (
      state.initialized !== null &&
      state.initialized.db === db &&
      changed.has(getTableName(dbConfig.schema.sessionMetadata))
    ) {
      publishAggregateSessionProgress({
        db,
        sessionId,
        store: session.store,
      });
    }
    if (changed.has(getTableName(dbConfig.schema.commands))) {
      stagedCommandOutbox.observe();
    }
  });
  signal.addEventListener('abort', unsubscribeCommands, { once: true });
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      unsubscribeCommands();
      signal.removeEventListener('abort', unsubscribeCommands);
      if (typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener('storage', onJournalChanged);
      }
    }),
  );
  return {
    ...receiver,
    pendingCommands: () => [
      ...readPending().map(row => execution.runSync(prepareCommand(row))),
      ...(recovery?.pendingCommands() ?? []),
    ],
    connectionFailed: failure => {
      if (current()) sharedWorkerConnectionFailed(failure);
    },
  };
});
