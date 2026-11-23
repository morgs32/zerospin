import type { ISessionId } from '@zerospin/core/aggregateSession/types';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { resolveFailure } from '@zerospin/core/contracts/failureCodec';
import { StagingOutcomeSchema } from '@zerospin/core/contracts/StagingOutcomeSchema';
import type { INodeRetention } from '@zerospin/core/Node/NodeCommandCoverage';
import { sessionSubmissionKey } from '@zerospin/core/Node/sessionSubmissionKey';
import {
  ServiceNodeCommandSchema,
  type ServiceNodeCommandCoverageSchema,
} from '@zerospin/core/ServiceNode/ServiceNodeCommandSchema';
import type { IServiceNodeCommand } from '@zerospin/core/ServiceNode/types';
import { serviceSessionRepoDbConfig } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import type { ISessionExecution } from '@zerospin/core/sessionExecution/types';
import type { ISessionFailureReporter } from '@zerospin/core/sessionFailure/types';
import {
  makeZerospinError,
  mapParseError,
  recognizeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import { getTableName } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type * as Scope from 'effect/Scope';

import { makeSessionFailureObserver } from '../Node/makeSessionFailureObserver.ts';
import { retainOriginatingCommand } from '../Node/retainOriginatingCommand.ts';
import { makeSessionCommandHandoff } from '../outbox/makeSessionCommandHandoff.ts';
import { recoverStagedCommands } from '../stagedCommandJournal/recoverStagedCommands.ts';

import { bindServiceReplicaCommands } from './bindServiceReplicaCommands.ts';
import {
  makeServiceReplicaReceiver,
  type IServiceReplicaReceiver,
} from './makeServiceReplicaReceiver.ts';
import { openServiceReplica } from './openServiceReplica.ts';
import type {
  IServiceReplica,
  IServiceReplicaConnection,
} from './replicaConnection.ts';

/** Own this lifetime's Service database, staging handoff and received views. */
export const openServiceSessionReplica = Effect.fn('openServiceSessionReplica')(
  function* <D extends IServiceSessionDefinition>(props: {
    session: IServiceSession<D, D['models'], unknown>;
    sessionId: ISessionId;
    execution: ISessionExecution<unknown>;
    connection: IServiceReplicaConnection;
    reportFailure: ISessionFailureReporter;
    signal: AbortSignal;
    expectedClaims?: Readonly<Record<string, unknown>> | undefined;
    onAuthenticatedClaims?(claims: Readonly<Record<string, unknown>>): void;
  }): Effect.fn.Return<IServiceReplica, IAnyError, Scope.Scope> {
    const {
      session,
      sessionId,
      execution,
      connection,
      reportFailure,
      signal,
      expectedClaims,
      onAuthenticatedClaims,
    } = props;
    const replica = yield* openServiceReplica({ session, signal });
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
          Effect.suspend(() => {
            const contract = definition.contracts[commandName];
            return contract === undefined
              ? Effect.sync(() => recognizeZerospinError(Schema.Never, failure))
              : resolveFailure(contract, failure);
          }),
        ),
    });
    const recovery =
      connection.journalIdentityKey === undefined
        ? undefined
        : recoverStagedCommands<
            IServiceNodeCommand,
            NonNullable<
              (typeof ServiceNodeCommandCoverageSchema.Type)['resolution']
            >
          >({
            prefix: 'service',
            sessionId,
            identityKey: () => connection.journalIdentityKey?.(),
            decode: input =>
              Schema.decodeUnknownSync(ServiceNodeCommandSchema)(input, {
                onExcessProperty: 'error',
              }),
            resolutionIndex: resolution => resolution.serviceIndex,
            attachment: nodeId => connection.stagedCommandAttachment(nodeId),
            isActive: () =>
              current() &&
              session.store.getState().nodeState?.blockedWork === false &&
              session.store.getState().nodeState?.authentication !==
                'signed-out',
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
    let receiver: IServiceReplicaReceiver<D>;
    const prepareCommand = (
      row: typeof dbConfig.schema.commands.$inferSelect,
    ) =>
      Effect.gen(function* () {
        const decodedCommand = yield* serviceSessionRepoDbConfig.tables.commands
          .decodeRow(row)
          .pipe(
            mapParseError({
              code: 'node-command-preparation-failed',
              prefix: 'Invalid retained local command',
            }),
          );
        if (decodedCommand.stagingOutcome === null) {
          throw makeZerospinError('node-command-staging-missing');
        }
        return Schema.decodeUnknownSync(ServiceNodeCommandSchema)({
          id:
            decodedCommand.nodeId === null || decodedCommand.pushIndex === null
              ? null
              : makeNodeCommandId(
                  decodedCommand.nodeId,
                  decodedCommand.pushIndex,
                ),
          nodeId: decodedCommand.nodeId,
          nodeIndex: decodedCommand.nodeIndex,
          pushIndex: decodedCommand.pushIndex,
          sessionId,
          sessionIndex: decodedCommand.sessionIndex,
          commandName: decodedCommand.commandName,
          payload: decodedCommand.payload,
          contractVersion:
            definition.contracts[decodedCommand.commandName]?.version,
          serviceName: definition.serviceName,
          kind: 'actor',
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          sessionName: definition.sessionName,
          claims: receiver.getEncodedClaims(),
          stagingOutcome: Schema.encodeSync(StagingOutcomeSchema)(
            decodedCommand.stagingOutcome,
          ),
        });
      });
    const stagedCommandOutbox = yield* makeSessionCommandHandoff<
      typeof dbConfig.schema.commands.$inferSelect,
      IServiceNodeCommand,
      unknown
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
      context: execution.runSync(Effect.context<unknown>()),
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
              'Cannot publish service command handoff state',
              error,
            );
          }
        }
      },
    });
    receiver = yield* makeServiceReplicaReceiver({
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
    const unsubscribeCommands = db.$client.subscribeToTableChanges(changed => {
      if (current() && changed.has(getTableName(dbConfig.schema.commands))) {
        stagedCommandOutbox.observe();
      }
    });
    yield* Effect.addFinalizer(() => Effect.sync(unsubscribeCommands));
    yield* bindServiceReplicaCommands({
      session,
      sessionId,
      replica,
      current,
      getEncodedClaims: receiver.getEncodedClaims,
      getOnCommandStaged: receiver.getOnCommandStaged,
      stagedCommandOutbox,
    });
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
  },
);
