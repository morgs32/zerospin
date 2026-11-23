import { aggregateNodeNetwork } from '@zerospin/browser/AggregateNode/aggregateNodeNetwork';
import type { IAggregateNodeRequest } from '@zerospin/browser/AggregateNode/aggregateNodeRequest';
import { AggregateNodeSynchronization } from '@zerospin/browser/AggregateNode/AggregateNodeSynchronization';
import { makeAggregateNodeBaseline } from '@zerospin/browser/AggregateNode/makeAggregateNodeBaseline';
import { makeAggregateNodeDefinition } from '@zerospin/browser/AggregateNode/makeAggregateNodeDefinition';
import type { IVerifiedAggregateAdmission } from '@zerospin/browser/AggregateNode/verifiedAggregateAdmission';
import { awaitConnectionStep } from '@zerospin/browser/Node/awaitConnectionStep';
import { closeNodeStorageOwner } from '@zerospin/browser/Node/closeNodeStorageOwner';
import { makeNodeAuthentication } from '@zerospin/browser/Node/makeNodeAuthentication';
import { NodePreparationTimeoutError } from '@zerospin/browser/Node/NodeErrors';
import { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import { hasAggregateNodeCheckpoint } from '@zerospin/core/AggregateNode/hasAggregateNodeCheckpoint';
import { makeAggregateNodeOptimisticView } from '@zerospin/core/AggregateNode/makeAggregateNodeOptimisticView';
import type { IAnyAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IAggregateNativeConfiguration } from './decodeAggregateNativeSessionInputs.ts';
import { makeNativeNodeDb } from './makeNativeNodeDb.ts';
import { openNativeSqlite } from './openNativeSqlite.ts';

/** The Swift executor's directory lease owns this Node file and its finite SQL drain. */
export const openAggregateNativeNodeOwner = Effect.fn(
  'openAggregateNativeNodeOwner',
)(function* (props: {
  sessionDefinition: IAnyAggregateSessionDefinition;
  request: IAggregateNodeRequest;
  claims: Readonly<Record<string, unknown>>;
  configuration: IAggregateNativeConfiguration;
  signal: AbortSignal;
}) {
  const { sessionDefinition, request, claims, configuration, signal } = props;
  const definition = yield* Effect.promise(() =>
    makeAggregateNodeDefinition(request, claims, configuration.aggregateId),
  );
  const key = yield* Effect.promise(() => sessionKey(definition.identity));
  if (signal.aborted) return yield* Effect.interrupt;
  const client = yield* Effect.acquireRelease(
    Effect.sync(() => openNativeSqlite(`node_${key}`)),
    owned => Effect.sync(() => owned.sqlite3.close(owned.db)),
  );
  const { db } = makeNativeNodeDb(client);
  const context = yield* Effect.context<unknown>();
  const view = yield* Effect.acquireRelease(
    Effect.promise(() =>
      makeAggregateNodeOptimisticView({
        sessionDefinition,
        openMemory: async () => openNativeSqlite(':memory:'),
        runSync: program => Effect.runSyncWith(context)(program),
      }),
    ),
    view => Effect.sync(() => view.close()),
  );
  const node = new AggregateNode(db, definition, view, sessionDefinition);
  yield* Effect.addFinalizer(() => Effect.promise(() => node.close()));
  const authentication = makeNodeAuthentication<
    IAggregateAuthenticationRequest,
    Omit<IVerifiedAggregateAdmission, 'getAdmission'>,
    IVerifiedAggregateAdmission
  >({
    identity: definition.identity,
    bind: (verified, getAdmission) => ({ ...verified, getAdmission }),
    verify: async (admission, verifySignal) => {
      try {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const local = await Promise.race([
          node.snapshot(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  NodePreparationTimeoutError.make({
                    extra: { timeoutMs: 5000 },
                  }),
                ),
              5000,
            );
          }),
        ]).finally(() => clearTimeout(timer));
        if (signal.aborted || verifySignal.aborted) {
          throw makeZerospinError('node-authentication-cancelled');
        }
        const nodeId = local.metadata.nodeId;
        const snapshot = await awaitConnectionStep(
          aggregateNodeNetwork(request, admission).snapshot(nodeId),
          verifySignal,
        );
        if (signal.aborted || verifySignal.aborted) {
          throw makeZerospinError('node-authentication-cancelled');
        }
        const verified = await makeAggregateNodeDefinition(
          request,
          snapshot.claims,
          snapshot.aggregateId,
        );
        return {
          status: 'verified',
          value: {
            identity: verified.identity,
            snapshot: makeAggregateNodeBaseline(snapshot),
            environment: snapshot.environment,
          },
        };
      } catch (error) {
        return { status: 'failed', error };
      }
    },
  });
  const unregister = authentication.register({}, async () => ({
    aggregateId: configuration.aggregateId,
    credentials: configuration.credentials,
  }));
  yield* Effect.addFinalizer(() => Effect.sync(unregister));
  const synchronization = new AggregateNodeSynchronization(
    node,
    request,
    authentication,
  );
  let closed: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (closed !== undefined) return closed;
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const closing = new Promise<void>((completed, failed) => {
      resolve = completed;
      reject = failed;
    });
    closed = closing;
    void closeNodeStorageOwner({
      connections: {
        close() {
          try {
            authentication.clear();
          } finally {
            unregister();
          }
        },
      },
      synchronization,
      node,
    }).then(resolve, reject);
    return closing;
  };
  yield* Effect.addFinalizer(() => Effect.promise(close));
  if (signal.aborted) return yield* Effect.interrupt;
  yield* Effect.promise(() => node.initialize());
  const initial = yield* Effect.promise(() => node.snapshot());
  if (!hasAggregateNodeCheckpoint(initial.metadata)) {
    if (initial.nodeIndex !== 0 || initial.pushIndex !== 0) {
      return yield* makeZerospinError('node-baseline-checkpoint-invalid');
    }
    const verified = yield* Effect.tryPromise({
      try: () => awaitConnectionStep(authentication.authenticate(), signal),
      catch: error => error,
    });
    const admission = yield* Effect.tryPromise({
      try: () => awaitConnectionStep(verified.getAdmission(), signal),
      catch: error => error,
    });
    const network = aggregateNodeNetwork(request, admission);
    const registration = yield* Effect.tryPromise({
      try: () =>
        awaitConnectionStep(
          network.register(initial.metadata.nodeId, true),
          signal,
        ),
      catch: error => error,
    });
    const baseline =
      registration === 'registered'
        ? makeAggregateNodeBaseline(
            yield* Effect.tryPromise({
              try: () => awaitConnectionStep(network.snapshot(null), signal),
              catch: error => error,
            }),
          )
        : verified.snapshot;
    if (baseline === undefined) {
      return yield* Effect.fail(makeZerospinError('node-baseline-missing'));
    }
    if (signal.aborted) return yield* Effect.interrupt;
    yield* Effect.promise(() => node.initializeBaseline(baseline));
    yield* Effect.promise(() => node.authenticated(verified.identity));
  }
  return { key, node, definition, authentication, synchronization, close };
});
export type IAggregateNativeNodeOwner = Effect.Success<
  ReturnType<typeof openAggregateNativeNodeOwner>
>;
