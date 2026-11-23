import type { IAggregateNodeSnapshot } from '@zerospin/core/AggregateNode/AggregateNode';
import { AggregateNodeCommandCoverageSchema } from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import { hasAggregateNodeCheckpoint } from '@zerospin/core/AggregateNode/hasAggregateNodeCheckpoint';
import type {
  IAggregateNodeCommand,
  IAggregateNodeIdentity,
} from '@zerospin/core/AggregateNode/types';
import { installAggregateNodeView } from '@zerospin/core/aggregateSession/installAggregateNodeView';
import { makeInitializedAggregateSession } from '@zerospin/core/aggregateSession/makeInitializedAggregateSession';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
  ISessionId,
} from '@zerospin/core/aggregateSession/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { INodeRetention } from '@zerospin/core/Node/NodeCommandCoverage';
import type { IAggregateSessionReplayRequirements } from '@zerospin/core/sessionExecution/requirements';
import type { ISessionExecution } from '@zerospin/core/sessionExecution/types';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { makeSessionFailureObserver } from '../Node/makeSessionFailureObserver.ts';
import { retainOriginatingCommand } from '../Node/retainOriginatingCommand.ts';
import type { ISessionRuntimeServices } from '../sessionRuntime';
import type { IStagedCommandRecovery } from '../stagedCommandJournal/recoverStagedCommands.ts';

import type { openAggregateReplica } from './openAggregateReplica.ts';
import type { IAggregateReplica } from './replicaConnection.ts';

function canUseLocalView(state: IAggregateNodeSnapshot['state']) {
  return (
    state.localAvailability === 'available' &&
    state.authentication !== 'signed-out' &&
    state.authentication !== 'rejected' &&
    (!state.blockedWork ||
      (state.synchronization === 'blocked' &&
        state.admissionRejection !== null))
  );
}

/** Commit through core transactions, then publish this replica's capability and progress. */
export const makeAggregateReplicaReceiver = Effect.fn(
  'makeAggregateReplicaReceiver',
)(function* <D extends IAggregateSessionDefinition>(props: {
  session: IAggregateSession<D>;
  sessionId: ISessionId;
  replica: Effect.Success<ReturnType<typeof openAggregateReplica<D>>>;
  execution: ISessionExecution<
    ISessionRuntimeServices | IAggregateSessionReplayRequirements<D>
  >;
  stagedCommandOutbox: {
    pendingCount(): number;
    refresh(): void;
    wake(): void;
    reset(): void;
  };
  originatingCommands: Map<string, string>;
  recovery?:
    | IStagedCommandRecovery<
        IAggregateNodeCommand,
        NonNullable<
          (typeof AggregateNodeCommandCoverageSchema.Type)['resolution']
        >
      >
    | undefined;
  observer: Pick<
    ReturnType<typeof makeSessionFailureObserver>,
    | 'observeCommand'
    | 'observeNodeState'
    | 'sharedWorkerConnectionFailed'
    | 'recoveryWarning'
  >;
  current(): boolean;
  expectedClaims?: Readonly<Record<string, unknown>> | undefined;
  onAuthenticatedClaims?:
    | ((claims: Readonly<Record<string, unknown>>) => void)
    | undefined;
}) {
  const {
    session,
    sessionId,
    execution,
    stagedCommandOutbox,
    current,
    expectedClaims,
    replica,
    observer,
    originatingCommands,
    recovery,
    onAuthenticatedClaims,
  } = props;
  const { definition, dbConfig, db } = replica;
  const { observeCommand, observeNodeState } = observer;
  const publish = (state: Parameters<typeof session.store.setState>[0]) => {
    if (!current()) return;
    try {
      session.store.setState(previous => {
        const next =
          typeof state === 'function'
            ? state(previous)
            : { ...previous, ...state };
        return {
          ...next,
          status:
            next.initialized !== null
              ? 'ready'
              : next.status === 'ready'
                ? 'initializing'
                : next.status,
        };
      });
    } catch (error) {
      console.error('Cannot publish committed session replica state', error);
    }
  };
  let prepared: ReturnType<typeof session.store.getState>['initialized'] = null;
  let boundIdentity: IAggregateNodeIdentity | undefined;
  let admittedNodeId: string | undefined;
  let discardPending = false;
  let replaceCheckpoint = false;
  let awaitingReplay = false;
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      prepared = null;
      publish(previous => ({ ...previous, initialized: null }));
    }),
  );
  const retainCoordinates = (retentions: readonly INodeRetention[]) =>
    Effect.gen(function* () {
      if (
        !current() ||
        admittedNodeId === undefined ||
        retentions.some(receipt => receipt.nodeId !== admittedNodeId)
      ) {
        return;
      }
      yield* makeTx('retainLocalCommandCoordinates')(function* (tx) {
        for (const receipt of retentions) {
          const table = dbConfig.schema.commands;
          const row = tx
            .select()
            .from(table)
            .where(eq(table.sessionIndex, receipt.sessionIndex))
            .get();
          if (
            row === undefined ||
            receipt.sessionId !== sessionId ||
            (row.nodeId !== null &&
              (row.nodeId !== receipt.nodeId ||
                row.nodeIndex !== receipt.nodeIndex ||
                row.pushIndex !== receipt.pushIndex))
          ) {
            return yield* makeZerospinError(
              'session-staged-coordinate-conflict',
            );
          }
          tx.update(table)
            .set({
              nodeId: receipt.nodeId,
              nodeIndex: receipt.nodeIndex,
              pushIndex: receipt.pushIndex,
            })
            .where(eq(table.sessionIndex, receipt.sessionIndex))
            .run();
        }
      })(db);
      if (!current()) return;
      for (const retention of retentions) {
        retainOriginatingCommand(originatingCommands, retention);
      }
      recovery?.acknowledge(retentions);
      stagedCommandOutbox.refresh();
    });
  const receiver: Pick<
    IAggregateReplica,
    'view' | 'reset' | 'state' | 'attachmentReady' | 'recoveryWarning'
  > = {
    recoveryWarning: observer.recoveryWarning,
    reset: async options => {
      if (!current()) return;
      prepared = null;
      admittedNodeId = undefined;
      discardPending = options?.preservePending !== true;
      replaceCheckpoint = !discardPending;
      awaitingReplay = true;
      stagedCommandOutbox.reset();
      recovery?.reset({ preservePending: !discardPending });
      if (discardPending) {
        originatingCommands.clear();
      }
      publish(previous => ({
        ...previous,
        initialized: null,
        ...(previous.nodeState == null
          ? {}
          : {
              nodeState: {
                ...previous.nodeState,
                localAvailability: 'unavailable',
                synchronization: 'connecting',
                blockedWork: true,
              },
            }),
      }));
    },
    view: async snapshot => {
      if (!current()) return;
      snapshot = {
        ...snapshot,
        commandCoverage: Schema.decodeUnknownSync(
          Schema.Array(AggregateNodeCommandCoverageSchema),
        )(snapshot.commandCoverage),
      };
      return execution.runSync(
        Effect.gen(function* () {
          if (!current()) {
            return;
          }
          const metadata = snapshot.metadata;
          if (!hasAggregateNodeCheckpoint(metadata)) {
            return yield* makeZerospinError(
              'node-execution-checkpoint-invalid',
            );
          }
          const identity = snapshot.identity;
          if (
            identity.systemName !== definition.systemName ||
            identity.aggregateName !== definition.aggregateName ||
            identity.aggregateVersion !== definition.aggregateVersion ||
            identity.sessionName !== definition.sessionName ||
            identity.actorName !== definition.actorName ||
            identity.actorVersion !== definition.actorVersion ||
            identity.claims.aggregateId !== identity.aggregateId ||
            (boundIdentity !== undefined && !isEqual(boundIdentity, identity))
          ) {
            return yield* makeZerospinError(
              'session-snapshot-identity-conflict',
            );
          }
          const decodedClaims = Schema.decodeUnknownSync(
            definition.claimsSchema,
          )(identity.claims);
          yield* Effect.try({
            try: () => {
              assertSessionClaims(expectedClaims, decodedClaims);
              onAuthenticatedClaims?.(structuredClone(decodedClaims));
            },
            catch: cause => {
              if (isZerospinError(cause)) return cause;
              throw cause;
            },
          }).pipe(
            Effect.catch(cause =>
              isZerospinError(cause) ? Effect.fail(cause) : Effect.die(cause),
            ),
          );
          if (!current()) {
            return;
          }
          const onCommandStaged = recovery?.bind(snapshot.metadata.nodeId);
          const partition = recovery?.partition(snapshot.commandCoverage, {
            nodeIndex: snapshot.nodeIndex,
            checkpointIndex: metadata.aggregateIndex,
          });
          yield* installAggregateNodeView({
            db,
            definition,
            sessionId,
            snapshot:
              partition === undefined
                ? snapshot
                : { ...snapshot, commandCoverage: partition.current },
            discardPending,
            replaceCheckpoint,
          });
          if (!current()) return;
          partition?.commit();
          boundIdentity ??= structuredClone(identity);
          discardPending = false;
          replaceCheckpoint = false;
          admittedNodeId = snapshot.metadata.nodeId;
          if (awaitingReplay && snapshot.state.synchronization === 'online') {
            awaitingReplay = false;
          }
          const aggregateId = snapshot.identity.aggregateId;
          const initialized = yield* makeInitializedAggregateSession({
            sessionDefinition: definition,
            db,
            onCommandStaged,
            admitted: {
              sessionId,
              aggregateId,
              actorName: definition.actorName,
              actorVersion: definition.actorVersion,
              claims: decodedClaims,
            },
          });
          if (!current()) {
            return;
          }
          prepared = initialized;
          publish(previous => ({
            ...previous,
            ...(!awaitingReplay && canUseLocalView(snapshot.state)
              ? { initialized }
              : { initialized: null }),
            aggregateIndex: metadata.aggregateIndex,
            dispositionChainHash: metadata.dispositionChainHash,
            pushIndex: snapshot.pushIndex,

            nodeState: {
              ...snapshot.state,
              nodeId: snapshot.metadata.nodeId,
              nodeIndex: snapshot.nodeIndex,
              pushIndex: snapshot.pushIndex,
              admittedThroughPushIndex:
                snapshot.metadata.admittedThroughPushIndex,
              outcomeIndex: snapshot.outcomeIndex,
              uncertainHandoffs: stagedCommandOutbox.pendingCount(),
              pushPaused: snapshot.metadata.pushPaused,
            },
          }));
          stagedCommandOutbox.refresh();
          for (const coverage of snapshot.commandCoverage) {
            if (!current()) return;
            retainOriginatingCommand(originatingCommands, coverage);
            if (coverage.resolution !== null && current()) {
              observeCommand(coverage.resolution);
            }
          }
          observeNodeState(snapshot.state);
        }),
      );
    },
    state: state => {
      if (!current()) return;
      execution.runSync(
        Effect.gen(function* () {
          if (!current()) {
            return;
          }
          if (awaitingReplay && state.synchronization === 'online') {
            awaitingReplay = false;
          }
          const previous = session.store.getState();
          const prior = previous.nodeState;
          const initialized =
            prepared !== null && !awaitingReplay && canUseLocalView(state)
              ? (previous.initialized ??
                (yield* makeInitializedAggregateSession({
                  sessionDefinition: definition,
                  db,
                  onCommandStaged: prepared.onCommandStaged,
                  admitted: {
                    sessionId: prepared.sessionId,
                    aggregateId: prepared.aggregateId,
                    actorName: definition.actorName,
                    actorVersion: definition.actorVersion,
                    claims: prepared.claims,
                  },
                })))
              : null;
          if (!current()) {
            return;
          }
          if (initialized === null) {
            publish(previous => ({
              ...previous,
              initialized: null,
              ...(prior == null ? {} : { nodeState: { ...prior, ...state } }),
            }));
          } else {
            const metadata = db
              .select()
              .from(dbConfig.schema.sessionMetadata)
              .where(eq(dbConfig.schema.sessionMetadata.sessionId, sessionId))
              .get();
            if (metadata === undefined || prior == null) {
              return yield* makeZerospinError('session-metadata-missing');
            }
            publish(previous => ({
              ...previous,
              initialized,
              aggregateIndex: metadata.aggregateIndex,
              dispositionChainHash: metadata.dispositionChainHash,
              pushIndex:
                'pushIndex' in state && typeof state.pushIndex === 'number'
                  ? state.pushIndex
                  : prior.pushIndex,
              nodeState: { ...prior, ...state },
            }));
          }
          observeNodeState(state);
          if (!state.blockedWork && state.authentication !== 'signed-out') {
            stagedCommandOutbox.wake();
          }
        }),
      );
    },
    attachmentReady: async () => {
      if (!current()) {
        return;
      }
      execution.runSync(
        Effect.sync(() => {
          if (!current()) {
            return;
          }
          const {
            nodeState: state,
            aggregateIndex,
            dispositionChainHash,
            pushIndex,
          } = session.store.getState();
          // The connector certifies replay readiness; Standalone needs no remote replay-complete.
          if (
            awaitingReplay &&
            prepared !== null &&
            state?.localAvailability === 'available' &&
            !state.blockedWork &&
            aggregateIndex !== null &&
            dispositionChainHash !== null &&
            pushIndex !== null
          ) {
            const initialized = prepared;
            awaitingReplay = false;
            publish(previous => ({
              ...previous,
              initialized,
              aggregateIndex,
              dispositionChainHash,
              pushIndex,
            }));
          }
          stagedCommandOutbox.refresh();
          stagedCommandOutbox.wake();
        }),
      );
    },
  };
  return {
    ...receiver,
    retainCoordinates,
    getIdentity: () => {
      if (boundIdentity === undefined) {
        throw makeZerospinError('aggregate-session-not-ready');
      }
      return structuredClone(boundIdentity);
    },
  };
});
export type IAggregateReplicaReceiver<D extends IAggregateSessionDefinition> =
  Effect.Success<ReturnType<typeof makeAggregateReplicaReceiver<D>>>;
