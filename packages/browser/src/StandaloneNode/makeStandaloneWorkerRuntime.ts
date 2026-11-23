import { RoutePattern } from '@remix-run/route-pattern';
import {
  AggregateNode,
  type IAggregateNodeSnapshot,
} from '@zerospin/core/AggregateNode/AggregateNode';
import { hasAggregateNodeCheckpoint } from '@zerospin/core/AggregateNode/hasAggregateNodeCheckpoint';
import { makeAggregateNodeOptimisticView } from '@zerospin/core/AggregateNode/makeAggregateNodeOptimisticView';
import type { IAggregateNodeBaseline } from '@zerospin/core/AggregateNode/types';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import {
  GENESIS_EXECUTED_PREIMAGE,
  hashDispositionChain,
} from '@zerospin/core/contracts/dispositionChainHash';
import { makeAsyncContractReadDb } from '@zerospin/core/contracts/make/makeContractReadDb';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import type { ISqliteClient } from '@zerospin/core/drizzle/types';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { hashNodeValue } from '@zerospin/core/Node/sessionKey';
import { drainStandaloneCommands } from '@zerospin/core/StandaloneNode/drainStandaloneCommands';
import {
  normalizeSystemAppLayer,
  type ISystemAppLayerError,
} from '@zerospin/core/system/make/normalizeSystemAppLayer';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';

import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { BrowserRpc } from '../Node/BrowserRpc.ts';
import { closeNodeStorageOwner } from '../Node/closeNodeStorageOwner.ts';
import type { INodeExecution } from '../Node/nodeExecution.ts';
import type { openWaSqliteNodeStorage } from '../Node/openWaSqliteNodeStorage.ts';
import { resetNodeStorage } from '../Node/resetNodeStorage.ts';

import type { IStandaloneSessionAttachment } from './StandaloneBrowserSessionApi.ts';
import {
  encodeStandaloneClaims,
  standalonePath,
  standaloneStorageKey,
} from './standaloneIdentity.ts';
import type { StandaloneAttachmentSchema } from './StandaloneSharedWorkerApi.ts';

type IDrainError =
  | Effect.Error<ReturnType<typeof drainStandaloneCommands>>
  | ISystemAppLayerError;

/** The local standalone owner serializes attachment, SQLite lifetime, and authored execution. */
export function makeStandaloneWorkerRuntime(props: {
  sessionKey: string;
  openMemory?: () => Promise<ISqliteClient>;
  execution: INodeExecution<IAggregateSessionDefinition>;
  ownership: Promise<void>;
  openStorage(props: {
    signal: AbortSignal;
    onCleanupFailure(error: unknown): void;
  }): Promise<
    Pick<
      Awaited<ReturnType<typeof openWaSqliteNodeStorage>>,
      'db' | 'withRelations' | 'close'
    >
  >;
}) {
  const {
    sessionKey: storageSessionKey,
    execution,
    ownership,
    openStorage,
    openMemory,
  } = props;
  let discardAttempted = false;
  const isUnreadable = (failure: unknown) =>
    isZerospinError(failure) &&
    !('scope' in failure) &&
    [
      'node-metadata-missing',
      'node-metadata-ambiguous',
      'node-execution-checkpoint-invalid',
      'node-resource-invalid',
      'node-resource-date-invalid',
      'node-resource-model-invalid',
      'node-command-input-missing',
      'node-command-final-missing',
      'node-command-contract-mismatch',
      'node-storage-incomplete',
    ].includes(failure.code);
  const mayDiscard = (failure: unknown, enabled: boolean) =>
    enabled && !discardAttempted && isUnreadable(failure);
  let stopping = false;
  let stopped: Promise<void> | undefined;
  let closed: Promise<void> | undefined;
  const lifetime = new AbortController();
  const cleanupFailures: unknown[] = [];
  let owner:
    | {
        node: AggregateNode;
        close(): Promise<void>;
        stop(): Promise<void>;
        execute(
          manual?: boolean,
          expectedNodeId?: string,
        ): Promise<Exit.Exit<boolean, IDrainError>>;
      }
    | undefined;
  let serial: Promise<unknown> = Promise.resolve();
  const recoveryNotices = new Set<
    (error: IZerospinErrorJson) => Promise<void>
  >();
  const notifyRecovery = () => {
    const warning = Effect.runSync(
      encodeError(makeZerospinError('standalone-state-reset')),
    );
    for (const notify of [...recoveryNotices]) {
      // Notification delivery must not hold the owner or a reset acknowledgement.
      void Promise.resolve()
        .then(() => {
          return !stopping && recoveryNotices.has(notify)
            ? notify(warning)
            : undefined;
        })
        .catch(() => undefined);
    }
  };
  let draining: Promise<Exit.Exit<void, IDrainError>> | null = null;
  let drainRequested = false;
  const requestDrain = (): Promise<Exit.Exit<void, IDrainError>> => {
    drainRequested = true;
    draining ??= (async () => {
      do {
        drainRequested = false;
        const execution =
          owner === undefined ? Exit.succeed(false) : await owner.execute();
        if (Exit.isFailure(execution)) {
          drainRequested = false;
          return execution;
        }
      } while (drainRequested);
      return Exit.succeed(undefined);
    })().finally(() => {
      draining = null;
      if (drainRequested && !stopping) void drain().catch(() => undefined);
    });
    return draining;
  };
  const drainProgram = () =>
    Effect.promise(requestDrain).pipe(
      Effect.flatMap(exit =>
        Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.void,
      ),
    );
  const drain = () => BrowserRpc.run(drainProgram());
  const pushProgram = (expectedNodeId: string) =>
    Effect.suspend(() => {
      if (stopping || owner === undefined) {
        return makeZerospinError('standalone-worker-unavailable');
      }
      const current = owner;
      return Effect.promise(() => current.execute(true, expectedNodeId)).pipe(
        Effect.flatMap(exit =>
          Exit.isFailure(exit)
            ? Effect.failCause(exit.cause)
            : Effect.succeed({
                status: exit.value ? ('pushed' as const) : ('empty' as const),
              }),
        ),
      );
    });
  const attach = (
    request: typeof StandaloneAttachmentSchema.Type,
  ): Promise<IStandaloneSessionAttachment> => {
    const result = serial.then(async () => {
      let recovered = false;
      const assertCurrent = () => {
        if (stopping) {
          throw makeZerospinError('standalone-worker-unavailable');
        }
        if (cleanupFailures.length > 0) throw cleanupFailures[0];
      };
      assertCurrent();
      const { sessionDefinition } = execution;
      if (sessionDefinition.sessionName !== request.sessionName) {
        throw makeZerospinError('standalone-session-definition-missing');
      }
      const { claims, encoded, aggregateId } = encodeStandaloneClaims(
        sessionDefinition,
        Schema.decodeUnknownSync(sessionDefinition.claimsSchema)(
          request.claims,
        ),
      );
      const path = standalonePath(RoutePattern.parse(request.pattern), claims);
      if (
        path !== request.path ||
        (await standaloneStorageKey(sessionDefinition, path)) !==
          storageSessionKey
      ) {
        throw makeZerospinError('standalone-storage-identity-mismatch');
      }
      await awaitConnectionStep(ownership, lifetime.signal);
      assertCurrent();
      const lock =
        makeAggregateSessionSpec(sessionDefinition).aggregateSessionLock;
      const retainedIdentity = await hashNodeValue({
        key: storageSessionKey,
        aggregateId,
        lock,
      });
      const assertSnapshotIdentity = (snapshot: IAggregateNodeSnapshot) => {
        if (
          snapshot.metadata.aggregateId !== aggregateId ||
          snapshot.metadata.sessionKey !== retainedIdentity
        ) {
          throw makeZerospinError('standalone-storage-identity-mismatch');
        }
      };
      const baseline = async (): Promise<IAggregateNodeBaseline> => {
        const resources: IEncodedResourceShape[] = [];
        for (const resource of request.resources ?? []) {
          const name = resource.modelName;
          const model =
            typeof name === 'string'
              ? sessionDefinition.models[name]
              : undefined;
          if (model === undefined) {
            throw makeZerospinError('standalone-resource-model-invalid');
          }
          const decodedResource = Schema.decodeUnknownSync(
            model.resourceJsonCodec,
          )(resource);
          resources.push(
            Schema.encodeSync(model.resourceJsonCodec)(decodedResource),
          );
        }
        return {
          resources,
          aggregateIndex: 0,
          dispositionChainHash: await hashDispositionChain(
            GENESIS_EXECUTED_PREIMAGE,
          ),
          resolvedThrough: 0,
        };
      };
      const replacedStorage = owner === undefined && request.reset === true;
      if (owner === undefined) {
        const appLayer =
          execution.layer === undefined
            ? Layer.empty
            : normalizeSystemAppLayer(
                // The worker entry checks release requirements; this dynamic owner retains its complete supplied context.
                Schema.decodeUnknownSync(
                  Schema.declare<Layer.Layer<unknown, IAnyError>>(
                    (value): value is Layer.Layer<unknown, IAnyError> =>
                      value === execution.layer && Layer.isLayer(value),
                  ),
                )(execution.layer),
              );
        const storage = await openStorage({
          signal: lifetime.signal,
          onCleanupFailure: error => cleanupFailures.push(error),
        });
        const runtime = ManagedRuntime.make(
          Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory, appLayer),
        );
        let projection:
          | Awaited<ReturnType<typeof makeAggregateNodeOptimisticView>>
          | undefined;
        try {
          const identity = {
            apiUrl: '',
            publishableKey: '',
            systemName: 'standalone',
            aggregateName: sessionDefinition.aggregateName,
            aggregateVersion: sessionDefinition.aggregateVersion,
            aggregateId,
            actorName: sessionDefinition.actorName,
            actorVersion: sessionDefinition.actorVersion,
            sessionName: sessionDefinition.sessionName,
            claims: encoded,
            definitionHash: await hashNodeValue(lock),
          };
          await runtime.runPromise(Effect.void, { signal: lifetime.signal });
          const view = (projection = await makeAggregateNodeOptimisticView({
            sessionDefinition,
            openMemory,
            runSync: program => runtime.runSync(program),
          }));
          const node = new AggregateNode(
            storage.db,
            { identity, lock },
            view,
            sessionDefinition,
            {
              storageKey: retainedIdentity,
              validate: async command => {
                const { aggregateId: commandAggregateId } =
                  encodeStandaloneClaims(
                    sessionDefinition,
                    Schema.decodeUnknownSync(sessionDefinition.claimsSchema)(
                      command.claims,
                    ),
                  );
                if (commandAggregateId !== command.aggregateId) {
                  throw makeZerospinError('node-command-identity-mismatch');
                }
              },
            },
          );
          const replacement = request.reset ? await baseline() : undefined;
          assertCurrent();
          let fresh: boolean | undefined;
          const initializeNode = async () => {
            fresh = await node.initialize(true, replacement);
            await node.assertStandaloneRetainedCommands();
            if (
              (fresh && !request.reset) ||
              !hasAggregateNodeCheckpoint((await node.snapshot()).metadata)
            ) {
              await node.initializeBaseline(await baseline());
            }
            await node.snapshot();
            assertCurrent();
          };
          try {
            await initializeNode();
          } catch (error) {
            if (
              isZerospinError(error) &&
              error.code === 'node-storage-reset-required'
            ) {
              assertCurrent();
              await resetNodeStorage({ db: storage.db, assertCurrent });
              await initializeNode();
              recovered = true;
            } else {
              if (
                fresh === true ||
                request.reset === true ||
                !mayDiscard(error, request.discardUnrestorable === true)
              ) {
                throw error;
              }
              await node.assertStandaloneRecoveryIdentity();
              // Validate caller seeds before replacing any retained standalone rows.
              const clean = await baseline();
              assertCurrent();
              discardAttempted = true;
              await node.reset(clean);
              await node.snapshot();
              assertCurrent();
              recovered = true;
            }
          }
          const resourceDb = storage.withRelations(
            makeResourceDbConfig({ models: sessionDefinition.models })
              .relations,
          );
          const readDb = makeAsyncContractReadDb({
            query: resourceDb.query,
            models: sessionDefinition.models,
          });
          const ownedSessionDefinition = sessionDefinition;
          class StandaloneOwner {
            readonly node = node;

            #stopped: Promise<void> | undefined;
            #closed: Promise<void> | undefined;

            stop() {
              return (this.#stopped ??= runtime.dispose());
            }

            close() {
              return (this.#closed ??= closeNodeStorageOwner({
                connections: { close: () => this.stop() },
                node,
                storage,
              }));
            }

            execute(manual = false, expectedNodeId?: string) {
              return runtime.runPromiseExit(
                drainStandaloneCommands({
                  sessionDefinition: ownedSessionDefinition,
                  db: storage.db,
                  readDb,
                  aggregateId,
                  node,
                  manual,
                  ...(expectedNodeId === undefined ? {} : { expectedNodeId }),
                }),
              );
            }
          }
          assertCurrent();
          owner = new StandaloneOwner();
        } catch (error) {
          await closeNodeStorageOwner({
            ...(projection === undefined ? {} : { node: projection }),
            runtime,
            storage,
          }).catch(cleanupError => {
            cleanupFailures.push(cleanupError);
          });
          throw error;
        }
      }
      const currentOwner = owner;
      const readCurrent = async () => {
        await currentOwner.node.assertStandaloneRecoveryIdentity();
        await currentOwner.node.assertStandaloneRetainedCommands();
        const snapshot = await currentOwner.node.snapshot();
        assertSnapshotIdentity(snapshot);
        return snapshot;
      };
      const readSnapshot = async () => {
        try {
          return await readCurrent();
        } catch (error) {
          if (!mayDiscard(error, request.discardUnrestorable === true)) {
            throw error;
          }
          await currentOwner.node.assertStandaloneRecoveryIdentity();
          const clean = await baseline();
          discardAttempted = true;
          let release = await currentOwner.node.prepareReset(
            lifetime.signal,
            true,
          );
          try {
            // Another attached client may have repaired the document before fencing completed.
            try {
              return await readCurrent();
            } catch (currentFailure) {
              if (!isUnreadable(currentFailure)) {
                throw currentFailure;
              }
            }
            await currentOwner.node.assertStandaloneRecoveryIdentity();
            release = await currentOwner.node.prepareReset(lifetime.signal);
            assertCurrent();
            await currentOwner.node.reset(clean);
            await release(true);
            const snapshot = await readCurrent();
            recovered = true;
            return snapshot;
          } finally {
            await release();
          }
        }
      };
      const snapshot = await readSnapshot();
      if (
        snapshot.identity.aggregateId !== aggregateId ||
        snapshot.identity.definitionHash !== (await hashNodeValue(lock))
      ) {
        throw makeZerospinError('standalone-storage-identity-mismatch');
      }
      if (request.reset && !replacedStorage) {
        const release = await owner.node.prepareReset(lifetime.signal);
        try {
          await owner.node.reset(await baseline());
          await release(true);
        } finally {
          await release();
        }
      }
      const boundNodeId = (await owner.node.snapshot()).metadata.nodeId;
      assertCurrent();
      if (recovered && request.reset !== true) notifyRecovery();
      void drain().catch(() => undefined);
      return { node: owner.node, boundNodeId, claims: encoded };
    });
    serial = result.catch(() => undefined);
    return result;
  };
  return {
    subscribeRecoveryNotices(
      notify: (error: IZerospinErrorJson) => Promise<void>,
    ) {
      if (stopping) throw makeZerospinError('standalone-worker-unavailable');
      recoveryNotices.add(notify);
      return () => {
        recoveryNotices.delete(notify);
      };
    },
    attach,
    drain,
    drainProgram,
    pushProgram,
    stop() {
      if (stopped !== undefined) return stopped;
      stopping = true;
      recoveryNotices.clear();
      lifetime.abort();
      const interrupted = owner?.stop();
      stopped = (async () => {
        await serial;
        await (interrupted ?? owner?.stop());
        await draining;
      })();
      return stopped;
    },
    closeStorage() {
      return (closed ??= (async () => {
        await owner?.close();
        owner = undefined;
        if (cleanupFailures.length > 0) throw cleanupFailures[0];
      })());
    },
  };
}
