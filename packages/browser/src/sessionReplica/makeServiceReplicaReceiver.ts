import type { ISessionId } from '@zerospin/core/aggregateSession/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { INodeRetention } from '@zerospin/core/Node/NodeCommandCoverage';
import { hasServiceNodeCheckpoint } from '@zerospin/core/ServiceNode/hasServiceNodeCheckpoint';
import { ServiceNodeCommandCoverageSchema } from '@zerospin/core/ServiceNode/ServiceNodeCommandSchema';
import type {
  IServiceNodeCommand,
  IServiceNodeIdentity,
} from '@zerospin/core/ServiceNode/types';
import { installServiceNodeView } from '@zerospin/core/serviceSession/installServiceNodeView';
import type {
  IInitializedServiceSession,
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import type { ISessionExecution } from '@zerospin/core/sessionExecution/types';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { makeSessionFailureObserver } from '../Node/makeSessionFailureObserver.ts';
import { retainOriginatingCommand } from '../Node/retainOriginatingCommand.ts';
import type { IStagedCommandRecovery } from '../stagedCommandJournal/recoverStagedCommands.ts';

import type { openServiceReplica } from './openServiceReplica.ts';
import type { IServiceReplica } from './replicaConnection.ts';

/** Commit through core transactions, then publish this replica's capability and progress. */
export const makeServiceReplicaReceiver = Effect.fn(
  'makeServiceReplicaReceiver',
)(function* <D extends IServiceSessionDefinition>(props: {
  session: IServiceSession<D, D['models'], unknown>;
  sessionId: ISessionId;
  replica: Effect.Success<ReturnType<typeof openServiceReplica<D, unknown>>>;
  execution: ISessionExecution<unknown>;
  stagedCommandOutbox: {
    pendingCount(): number;
    refresh(): void;
    wake(): void;
    reset(): void;
  };
  originatingCommands: Map<string, string>;
  recovery?:
    | IStagedCommandRecovery<
        IServiceNodeCommand,
        NonNullable<
          (typeof ServiceNodeCommandCoverageSchema.Type)['resolution']
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
  const { definition, dbConfig, db, models, serviceSessionLockKey } = replica;
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
  let prepared: IInitializedServiceSession<
    D['models'],
    D['claimsSchema']['Type']
  > | null = null;
  let boundIdentity: IServiceNodeIdentity | undefined;
  const getEncodedClaims = () => {
    if (boundIdentity === undefined) {
      throw makeZerospinError('service-session-not-ready');
    }
    return structuredClone(boundIdentity.claims);
  };
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
    IServiceReplica,
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
          Schema.Array(ServiceNodeCommandCoverageSchema),
        )(snapshot.commandCoverage),
      };
      return execution.runSync(
        Effect.gen(function* () {
          if (!current()) {
            return;
          }
          const metadata = snapshot.metadata;
          if (!hasServiceNodeCheckpoint(metadata)) {
            return yield* makeZerospinError(
              'node-execution-checkpoint-invalid',
            );
          }
          const identity = snapshot.identity;
          if (
            identity.systemName !== definition.systemName ||
            identity.serviceName !== definition.serviceName ||
            identity.serviceVersion !== definition.serviceVersion ||
            identity.sessionName !== definition.sessionName ||
            identity.actorName !== definition.actorName ||
            identity.actorVersion !== definition.actorVersion ||
            (boundIdentity !== undefined && !isEqual(boundIdentity, identity))
          ) {
            return yield* makeZerospinError(
              'session-snapshot-identity-conflict',
            );
          }
          const encodedClaims = structuredClone(identity.claims);
          const decodedClaims = Object.freeze(
            Schema.decodeUnknownSync(definition.claimsSchema)(
              structuredClone(encodedClaims),
            ),
          );
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
          if (!current()) return;
          recovery?.bind(snapshot.metadata.nodeId);
          const partition = recovery?.partition(snapshot.commandCoverage, {
            nodeIndex: snapshot.nodeIndex,
            checkpointIndex: metadata.serviceIndex,
          });
          yield* installServiceNodeView({
            sessionId,
            db,
            definition,
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
          if (!current()) return;
          prepared = {
            sessionId,
            claims: decodedClaims,
            encodedClaims: Object.freeze(getEncodedClaims()),
            serviceName: definition.serviceName,
            serviceVersion: definition.serviceVersion,
            sessionName: definition.sessionName,
            serviceSessionLockKey,
            db,
            schema: dbConfig.schema,
            models,
            serviceIndex: metadata.serviceIndex,
            dispositionChainHash: metadata.dispositionChainHash,
          };
          publish(previous => ({
            ...previous,
            initialized:
              !awaitingReplay &&
              !snapshot.state.blockedWork &&
              snapshot.state.localAvailability === 'available'
                ? prepared
                : null,
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
        Effect.sync(() => {
          if (!current()) {
            return;
          }
          if (awaitingReplay && state.synchronization === 'online') {
            awaitingReplay = false;
          }
          const prior = session.store.getState().nodeState;
          publish(previous => ({
            ...previous,
            initialized:
              !awaitingReplay &&
              !state.blockedWork &&
              state.localAvailability === 'available'
                ? prepared
                : null,
            ...(prior == null ? {} : { nodeState: { ...prior, ...state } }),
          }));
          observeNodeState(state);
          if (!state.blockedWork && state.authentication !== 'signed-out') {
            stagedCommandOutbox.wake();
          }
        }),
      );
    },
    attachmentReady: async () => {
      if (!current()) return;
      execution.runSync(
        Effect.sync(() => {
          if (!current()) return;
          stagedCommandOutbox.refresh();
          stagedCommandOutbox.wake();
        }),
      );
    },
  };
  return {
    ...receiver,
    retainCoordinates,
    getEncodedClaims,
    getOnCommandStaged: () =>
      admittedNodeId === undefined ? undefined : recovery?.bind(admittedNodeId),
  };
});
export type IServiceReplicaReceiver<D extends IServiceSessionDefinition> =
  Effect.Success<ReturnType<typeof makeServiceReplicaReceiver<D>>>;
