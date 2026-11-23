import { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import { hasAggregateNodeCheckpoint } from '@zerospin/core/AggregateNode/hasAggregateNodeCheckpoint';
import type { ICheckAggregateJournal } from '@zerospin/core/AggregateNode/storage/adoptPublishedAggregateCommandStorageTx';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import type { ISqliteClient } from '@zerospin/core/drizzle/types';
import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
import { makeEncodedRowFromResource } from '@zerospin/core/Node/resourceEnvelope';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  type ITelemetryBatch,
} from '@zerospin/logger';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Logger from 'effect/Logger';
import * as Tracer from 'effect/Tracer';

import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { closeNodeStorageOwner } from '../Node/closeNodeStorageOwner.ts';
import { makeNodeAttachment } from '../Node/makeNodeAttachment.ts';
import { makeNodeAuthentication } from '../Node/makeNodeAuthentication.ts';
import { NodePreparationTimeoutError } from '../Node/NodeErrors.ts';
import {
  openAggregateNodeExecution,
  type INodeExecution,
} from '../Node/nodeExecution.ts';
import {
  nodeRpcErrorFor,
  snapshotFailureCodes,
} from '../Node/nodeRpcErrorFor.ts';
import type { openWaSqliteNodeStorage } from '../Node/openWaSqliteNodeStorage.ts';
import {
  isLocalNodeEndpoint,
  localDevelopmentHistory,
} from '../Node/selectDevelopmentStorage.ts';
import { shouldResetConnectedNode } from '../Node/shouldResetConnectedNode.ts';
import { waitForDevelopmentSystem } from '../Node/waitForDevelopmentSystem.ts';

import { AggregateBrowserSessionApi } from './AggregateBrowserSessionApi.ts';
import { aggregateNodeNetwork } from './aggregateNodeNetwork.ts';
import { AggregateNodeSynchronization } from './AggregateNodeSynchronization.ts';
import { aggregateSessionDiscovery } from './aggregateSessionDiscovery.ts';
import type { AggregateAttachmentSchema } from './AggregateSharedWorkerApi.ts';
import { makeAggregateNodeBaseline } from './makeAggregateNodeBaseline.ts';
import { makeAggregateNodeDefinition } from './makeAggregateNodeDefinition.ts';
import {
  readAggregateTabJournal,
  recoverAggregateTabJournal,
  type IAggregateNodeUpgradeJournal,
} from './recoverAggregateTabJournal.ts';
import {
  type IAggregateNodeAuthentication,
  type IAggregateNodeResolution,
  type IVerifiedAggregateAdmission,
} from './verifiedAggregateAdmission.ts';

const attachmentFailure = nodeRpcErrorFor([
  'node-session-definition-mismatch',
  'session-aggregate-selection-mismatch',
  'node-definition-session-mismatch',
  'node-attachment-identity-mismatch',
  'node-authentication-cancelled',
  'node-discovery-blocked',
  'node-discovery-incomplete',
  'node-storage-reset-required',
  'node-storage-identity-mismatch',
  'node-storage-incomplete',
  'node-storage-missing',
  'node-authentication-identity-mismatch',
  'node-authentication-rejected',
  'node-authentication-unavailable',
  'node-credentials-timeout',
  'node-local-preparation-timeout',
  'node-backend-timeout',
  'node-backend-unreachable',
  'node-signed-out',
  'node-baseline-missing',
  'node-baseline-already-initialized',
  'node-baseline-checkpoint-invalid',
  ...snapshotFailureCodes,
]);
/** The portable owner keeps the native storage gate, identity fencing, and real admission/synchronization pipeline. */
export function makeAggregateWorkerRuntime(props: {
  sessionKey: string;
  openMemory?: () => Promise<ISqliteClient>;
  execution: INodeExecution<IAggregateSessionDefinition>;
  ownership: Promise<void>;
  onClearAuthentication(operation: () => Promise<void>): Promise<void>;
  openStorage(props: {
    create: boolean;
    recreate?: boolean;
    developmentStorageId?: string | null | undefined;
    signal: AbortSignal;
    onCleanupFailure(error: unknown): void;
  }): ReturnType<typeof openWaSqliteNodeStorage>;
}) {
  const {
    sessionKey: storageSessionKey,
    ownership,
    openStorage,
    execution: inputExecution,
    openMemory,
    onClearAuthentication,
  } = props;
  let owner:
    | {
        node: AggregateNode;
        authentication: IAggregateNodeAuthentication;
        synchronization: AggregateNodeSynchronization;
        recover(failure: unknown): Promise<boolean>;
        close(): Promise<void>;
      }
    | undefined;
  let serial: Promise<unknown> = Promise.resolve();
  let generation = 0;
  let closing = false;
  let closed: Promise<void> | undefined;
  const lifetime = new AbortController();
  const cleanupFailures: unknown[] = [];
  const preparing = new Set<Promise<unknown>>();
  let activeRevision = 0;
  let openedStorageId: string | null = null;
  let recoveryAttempted = false;
  let attaching = 0;
  let recovery: Promise<boolean> | undefined;
  let recoveringSynchronization = false;
  let lossWarningPending = false;
  const recoveryNotices = new Set<
    (error: IZerospinErrorJson) => Promise<void>
  >();
  const historyNotices = new Set<
    (error: IZerospinErrorJson) => Promise<void>
  >();
  const notifyRecovery = () => {
    if (!lossWarningPending) return;
    lossWarningPending = false;
    const warning = Effect.runSync(
      encodeError(makeZerospinError('node-recovery-work-unconfirmed')),
    );
    for (const notify of recoveryNotices) {
      // A frozen tab cannot delay a healthy owner's readiness.
      void Promise.resolve()
        .then(() => notify(warning))
        .catch(() => undefined);
    }
  };
  const attachments = new Map<object, () => void>();
  const publishedAttachments = new Set<AggregateBrowserSessionApi>();
  const observers = new Set<{
    send(batch: ITelemetryBatch): Promise<void>;
    pending: Promise<void>;
    active: boolean;
  }>();
  let nodeStartupSpan: Tracer.Span | undefined;
  const retainedTelemetry = makeTelemetryCollector();
  const flushTelemetry = () => {
    const batch = retainedTelemetry.flushOwn();
    retainedTelemetry.flush();
    if (batch.spans.length + batch.logs.length + batch.links.length === 0) {
      return;
    }
    for (const observer of observers) {
      observer.pending = observer.pending
        .then(async () => {
          if (observer.active) await observer.send(batch);
        })
        .catch(() => undefined);
    }
  };
  const collector = {
    ...retainedTelemetry,
    addSpan: (span: Parameters<typeof retainedTelemetry.addSpan>[0]) => {
      retainedTelemetry.addSpan(span);
      queueMicrotask(flushTelemetry);
    },
    addLog: (log: Parameters<typeof retainedTelemetry.addLog>[0]) => {
      retainedTelemetry.addLog(log);
      queueMicrotask(flushTelemetry);
    },
    addLinks: (links: Parameters<typeof retainedTelemetry.addLinks>[0]) => {
      retainedTelemetry.addLinks(links);
      queueMicrotask(flushTelemetry);
    },
  };
  const telemetryLayer = makeTelemetryLayer(collector);
  const quietLogger = Logger.layer([], { mergeWithExisting: false });
  const native = {
    async prepare(
      input: IAggregateNodeResolution &
        Pick<
          typeof AggregateAttachmentSchema.Type,
          'retryConnection' | 'newSessionAttempt' | 'diagnostics'
        >,
      getAdmission: () => Promise<IAggregateAuthenticationRequest>,
      signal: AbortSignal,
      recordStartup?: (
        phase: string,
        startedAt: number,
        outcome: 'ready' | 'failed' | 'cancelled',
        errorCode?: string,
      ) => void,
      journalBootstrap?: IAggregateNodeUpgradeJournal,
    ) {
      if (closing || signal.aborted) {
        throw makeZerospinError('node-tab-detached');
      }
      if (cleanupFailures.length > 0) throw cleanupFailures[0];
      const { request, definition, revision, online, retryConnection } = input;
      const { claims, aggregateId } = definition.identity;
      if ((await sessionKey(definition.identity)) !== storageSessionKey) {
        throw makeZerospinError({
          code: 'node-attachment-identity-mismatch',
        });
      }
      await awaitConnectionStep(ownership, signal);
      const started = generation;
      let attachmentOwner: typeof owner;
      const assertCurrent = () => {
        if (attachmentOwner !== undefined && owner !== attachmentOwner) {
          throw makeZerospinError('node-development-history-replaced');
        }
        if (closing || signal.aborted || started !== generation) {
          throw makeZerospinError({ code: 'node-authentication-cancelled' });
        }
      };
      const check = async () => {
        await awaitConnectionStep(
          aggregateSessionDiscovery.check(storageSessionKey, revision, !online),
          signal,
        );
        assertCurrent();
      };
      let initialProofInvalidated = false;
      await check();
      if (recovery !== undefined) {
        initialProofInvalidated = true;
        await awaitConnectionStep(recovery, signal);
      }
      assertCurrent();
      const readReplacement = async (
        admission: IAggregateAuthenticationRequest,
        recoverySignal: AbortSignal,
        nodeId: string | null = null,
      ) => {
        const snapshot = await awaitConnectionStep(
          aggregateNodeNetwork(request, admission).snapshot(nodeId),
          recoverySignal,
        );
        const verified = await makeAggregateNodeDefinition(
          request,
          snapshot.claims,
          snapshot.aggregateId,
        );
        if (
          recoverySignal.aborted ||
          (await sessionKey(verified.identity)) !== storageSessionKey
        ) {
          throw makeZerospinError('node-authentication-identity-mismatch');
        }
        const baseline = makeAggregateNodeBaseline(snapshot);
        if (
          (nodeId === null && baseline.resolvedThrough !== 0) ||
          !Number.isSafeInteger(baseline.resolvedThrough) ||
          baseline.resolvedThrough < 0 ||
          !Number.isSafeInteger(baseline.aggregateIndex) ||
          baseline.aggregateIndex < 0 ||
          !/^[a-f0-9]{64}$/u.test(baseline.dispositionChainHash)
        ) {
          throw makeZerospinError('node-baseline-checkpoint-invalid');
        }
        const retained = new Set<string>();
        for (const resource of baseline.resources) {
          const model =
            inputExecution.sessionDefinition.models[resource.modelName];
          if (model === undefined || model.version !== resource.version) {
            throw makeZerospinError('node-resource-model-invalid');
          }
          makeEncodedRowFromResource(resource, model);
          const key = JSON.stringify([resource.modelName, resource.id]);
          if (retained.has(key)) {
            throw makeZerospinError('node-resource-invalid');
          }
          retained.add(key);
        }
        return {
          baseline,
          developmentHistory: localDevelopmentHistory(request.apiUrl, snapshot),
          environment: snapshot.environment,
          identity: verified.identity,
        };
      };

      const historyProof = input.online
        ? input.verified.developmentHistory
        : undefined;
      const selectedStorage = await aggregateSessionDiscovery.resolveDatabase(
        storageSessionKey,
        revision,
        online,
        historyProof,
      );
      await check();
      if (owner === undefined) {
        openedStorageId = selectedStorage?.storageId ?? null;
        const executionStartedAt = performance.now();
        const execution = await openAggregateNodeExecution(
          inputExecution,
          definition,
          openMemory,
          signal,
          error => cleanupFailures.push(error),
        ).catch(error => {
          recordStartup?.(
            'node.execution.open',
            executionStartedAt,
            signal.aborted ||
              (isZerospinError(error) &&
                error.code === 'node-authentication-cancelled')
              ? 'cancelled'
              : 'failed',
            isZerospinError(error) ? error.code : undefined,
          );
          throw error;
        });
        recordStartup?.('node.execution.open', executionStartedAt, 'ready');
        const storageStartedAt = performance.now();
        let opened: Awaited<ReturnType<typeof openStorage>>;
        try {
          opened = await openStorage({
            create: online,
            developmentStorageId: openedStorageId,
            signal,
            onCleanupFailure: error => cleanupFailures.push(error),
          });
          recordStartup?.('node.storage.open', storageStartedAt, 'ready');
        } catch (error) {
          recordStartup?.(
            'node.storage.open',
            storageStartedAt,
            signal.aborted ||
              (isZerospinError(error) &&
                error.code === 'node-authentication-cancelled')
              ? 'cancelled'
              : 'failed',
            isZerospinError(error) ? error.code : undefined,
          );
          await execution.close().catch(cleanupError => {
            cleanupFailures.push(cleanupError);
          });
          if (
            isZerospinError(error) &&
            !('scope' in error) &&
            !shouldResetConnectedNode({ failure: error, attempted: false })
          ) {
            throw error;
          }
          // A failed open has not established a supported format; it cannot authorize recreation.
          throw makeZerospinError({
            code: 'node-storage-upgrade-invalid',
            cause: prettyUnknownFailure(error),
          });
        }
        const storage = {
          ...opened,
          close: () =>
            closeNodeStorageOwner({
              runtime: { dispose: execution.close },
              storage: opened,
            }),
        };
        let openingNode: AggregateNode | undefined;
        try {
          if (closing || signal.aborted) {
            throw makeZerospinError('node-tab-detached');
          }
          const node = new AggregateNode(
            storage.db,
            definition,
            execution.view,
            inputExecution.sessionDefinition,
          );
          openingNode = node;
          const retainedStartedAt = performance.now();
          const checkJournal: ICheckAggregateJournal | undefined =
            journalBootstrap === undefined
              ? undefined
              : async (nodeId, checkOriginal) => {
                  await readAggregateTabJournal(
                    journalBootstrap,
                    claims,
                    nodeId,
                    signal,
                    async entries => {
                      for (const entry of entries) await checkOriginal(entry);
                    },
                    { requireComplete: true },
                  );
                  await check();
                };
          try {
            await awaitConnectionStep(
              node
                .initializeConnectedStorage(online, undefined, checkJournal)
                .catch(async error => {
                  if (
                    !online ||
                    !isZerospinError(error) ||
                    error.code !== 'node-read-tables-snapshot-required'
                  ) {
                    throw error;
                  }
                  const details = error.extra;
                  if (
                    typeof details !== 'object' ||
                    details === null ||
                    !('nodeId' in details) ||
                    typeof details.nodeId !== 'string'
                  ) {
                    throw error;
                  }
                  const nodeId = details.nodeId;
                  const fresh = await readReplacement(
                    await getAdmission(),
                    signal,
                    nodeId,
                  );
                  await check();
                  if (fresh.developmentHistory?.id !== historyProof?.id) {
                    throw makeZerospinError(
                      'node-development-history-mismatch',
                    );
                  }
                  return node.initializeConnectedStorage(
                    true,
                    fresh.baseline,
                    checkJournal,
                  );
                }),
              signal,
            );
            recordStartup?.(
              'node.retained.initialize',
              retainedStartedAt,
              'ready',
            );
          } catch (error) {
            recordStartup?.(
              'node.retained.initialize',
              retainedStartedAt,
              signal.aborted ||
                (isZerospinError(error) &&
                  error.code === 'node-authentication-cancelled')
                ? 'cancelled'
                : 'failed',
              isZerospinError(error) ? error.code : undefined,
            );
            if (
              !online ||
              !shouldResetConnectedNode({
                failure: error,
                attempted: recoveryAttempted,
              })
            ) {
              throw error;
            }
            recoveryAttempted = true;
            initialProofInvalidated = true;
            const admission = await awaitConnectionStep(getAdmission(), signal);
            let nodeId: string | undefined;
            try {
              nodeId = await node.readConnectedRecoveryIdentity();
            } catch (readFailure) {
              if (
                !shouldResetConnectedNode({
                  failure: readFailure,
                  attempted: false,
                })
              ) {
                throw readFailure;
              }
            }
            // Validate the authenticated baseline before touching any retained rows.
            const replacement = await readReplacement(
              admission,
              signal,
              nodeId ?? null,
            );
            await check();
            if (replacement.developmentHistory?.id !== historyProof?.id) {
              throw makeZerospinError('node-development-history-mismatch');
            }
            console.info(
              'Connected Node recovery: repairing retained startup',
              error,
            );
            let preserved = false;
            if (nodeId !== undefined) {
              try {
                await node.repairConnectedBaseline(
                  replacement.baseline,
                  assertCurrent,
                );
                preserved = true;
                console.info(
                  'Connected Node recovery: original command identities preserved',
                );
              } catch (repairFailure) {
                console.warn(
                  'Connected Node recovery: original stream unavailable',
                  repairFailure,
                );
                if (
                  !shouldResetConnectedNode({
                    failure: repairFailure,
                    attempted: false,
                  })
                ) {
                  throw repairFailure;
                }
              }
            }
            if (!preserved) {
              if (replacement.environment !== 'production') throw error;
              const fresh =
                nodeId === undefined
                  ? replacement
                  : await readReplacement(admission, signal);
              await check();
              if (fresh.environment !== 'production') throw error;
              await storage.recreate(assertCurrent);
              await node.initializeConnectedStorage(true);
              await node.resetConnectedBaseline(fresh.baseline, assertCurrent);
              lossWarningPending = true;
              console.warn(
                'Connected Node recovery: fresh producer installed; local work may be unconfirmed',
              );
            }
          }
          assertCurrent();
          const authentication = makeNodeAuthentication<
            IAggregateAuthenticationRequest,
            Omit<IVerifiedAggregateAdmission, 'getAdmission'>,
            IVerifiedAggregateAdmission
          >({
            identity: definition.identity,
            verify: async (admission, signal) => {
              try {
                let timer: ReturnType<typeof setTimeout> | undefined;
                await Promise.race([
                  aggregateSessionDiscovery.check(
                    storageSessionKey,
                    activeRevision,
                    false,
                  ),
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
                if (signal.aborted) {
                  throw makeZerospinError('node-authentication-cancelled');
                }
                const snapshot = await aggregateNodeNetwork(
                  request,
                  admission,
                ).snapshot(null);
                if (signal.aborted) {
                  throw makeZerospinError({
                    code: 'node-authentication-cancelled',
                  });
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
                    developmentHistory: localDevelopmentHistory(
                      request.apiUrl,
                      snapshot,
                    ),
                    environment: snapshot.environment,
                  },
                };
              } catch (error) {
                return { status: 'failed', error };
              }
            },
            bind: (value, getAdmission) => ({ ...value, getAdmission }),
          });
          const recoverConnectedNode = async (
            failure: unknown,
          ): Promise<boolean> => {
            const missingProducer =
              isZerospinError(failure) &&
              (failure.code === 'node-producer-not-registered' ||
                failure.code === 'node-development-history-replaced' ||
                failure.code === 'node-development-registration-stale');
            if (recoveringSynchronization) return false;
            if (recovery !== undefined) return recovery;
            if (
              !shouldResetConnectedNode({
                failure,
                attempted: recoveryAttempted && !missingProducer,
              })
            ) {
              return false;
            }
            recoveryAttempted = true;
            const revision = generation;
            const assertRecovering = () => {
              if (
                closing ||
                lifetime.signal.aborted ||
                revision !== generation ||
                attachments.size === 0 ||
                owner?.node !== node
              ) {
                throw makeZerospinError('node-authentication-cancelled');
              }
            };
            const recover = async () => {
              assertRecovering();
              console.info(
                'Connected Node recovery: synchronization repair started',
                failure,
              );
              await synchronization.stop();
              assertRecovering();

              await awaitConnectionStep(
                aggregateSessionDiscovery.check(
                  storageSessionKey,
                  activeRevision,
                  false,
                ),
                lifetime.signal,
              );
              // stop() revokes the retired authentication round; rearm only this fixed identity for fresh proof.
              await authentication.resume(definition.identity);
              const authenticated = await waitForDevelopmentSystem(
                request.apiUrl,
                lifetime.signal,
                () => {
                  assertRecovering();
                  return authentication.authenticate();
                },
                { verifiedHistoryId: selectedStorage?.id },
              );
              const admission = await awaitConnectionStep(
                authenticated.getAdmission(),
                lifetime.signal,
              );
              const selected = await aggregateSessionDiscovery.resolveDatabase(
                storageSessionKey,
                activeRevision,
                true,
                authenticated.developmentHistory,
              );
              const nextStorageId = selected?.storageId ?? null;
              if (nextStorageId !== openedStorageId) {
                // Discovery has committed the successor. No read from the old SQLite file is needed.
                assertRecovering();
                const retired = owner;
                if (!retired) throw makeZerospinError('node-tab-detached');
                owner = undefined;
                try {
                  await retired.close();
                } catch (error) {
                  cleanupFailures.push(error);
                  throw error;
                }
                lossWarningPending = true;
                const replacement = Effect.runSync(
                  encodeError(
                    makeZerospinError('node-development-history-replaced'),
                  ),
                );
                for (const notify of historyNotices) {
                  void Promise.resolve()
                    .then(() => notify(replacement))
                    .catch(() => undefined);
                }
                historyNotices.clear();
                return true;
              }
              if (missingProducer) throw failure;
              let releaseReset = await node.prepareReset(lifetime.signal, true);
              try {
                let retainedNodeId: string | undefined;
                try {
                  retainedNodeId = await node.readConnectedRecoveryIdentity();
                } catch (readFailure) {
                  if (
                    !shouldResetConnectedNode({
                      failure: readFailure,
                      attempted: false,
                    })
                  ) {
                    throw readFailure;
                  }
                }
                const replacement = await readReplacement(
                  admission,
                  lifetime.signal,
                  retainedNodeId ?? null,
                );
                if (
                  replacement.developmentHistory?.id !==
                  authenticated.developmentHistory?.id
                ) {
                  throw makeZerospinError('node-development-history-mismatch');
                }
                assertRecovering();
                const synchronizeReplacement = async (
                  identity: typeof replacement.identity,
                ) => {
                  await authentication.resume(identity);
                  await node.authenticated(
                    identity,
                    () =>
                      !closing &&
                      revision === generation &&
                      attachments.size > 0,
                  );
                  await synchronization.enable();
                  recoveringSynchronization = true;
                  try {
                    await synchronization.resume();
                  } finally {
                    recoveringSynchronization = false;
                  }
                  assertRecovering();
                  const state = node.status();
                  if (state.blockedWork) {
                    throw makeZerospinError(
                      state.failure ?? {
                        code: 'node-synchronization-blocked',
                      },
                    );
                  }
                };
                try {
                  if (retainedNodeId === undefined) {
                    throw makeZerospinError('node-metadata-missing');
                  }
                  await node.repairConnectedBaseline(
                    replacement.baseline,
                    assertRecovering,
                  );
                  await synchronizeReplacement(replacement.identity);
                } catch (repairFailure) {
                  if (
                    replacement.environment !== 'production' ||
                    (isZerospinError(repairFailure) &&
                      repairFailure.code === 'node-producer-not-registered') ||
                    !shouldResetConnectedNode({
                      failure: repairFailure,
                      attempted: false,
                    })
                  ) {
                    throw repairFailure;
                  }
                  await synchronization.stop();
                  assertRecovering();
                  const fresh = await readReplacement(
                    admission,
                    lifetime.signal,
                  );
                  if (fresh.environment !== 'production') throw repairFailure;
                  releaseReset = await node.prepareReset(
                    lifetime.signal,
                    false,
                  );
                  assertRecovering();
                  await storage.recreate(assertRecovering);
                  await node.initializeConnectedStorage(true);
                  await node.resetConnectedBaseline(
                    fresh.baseline,
                    assertRecovering,
                  );
                  lossWarningPending = true;
                  await synchronizeReplacement(fresh.identity);
                }
                await releaseReset(true);
                console.info('Connected Node recovery: ready');
                notifyRecovery();
                return true;
              } finally {
                await releaseReset();
              }
            };
            const work = waitForDevelopmentSystem(
              request.apiUrl,
              lifetime.signal,
              recover,
            );
            recovery = work;
            try {
              return await work;
            } catch (error) {
              console.error(
                'Connected Node recovery exhausted',
                failure,
                error,
              );
              throw error;
            } finally {
              if (recovery === work) recovery = undefined;
            }
          };
          const checkSynchronizationHistory = async (
            verified: IVerifiedAggregateAdmission,
          ) => {
            const selected = await aggregateSessionDiscovery.resolveDatabase(
              storageSessionKey,
              activeRevision,
              true,
              verified.developmentHistory,
            );
            if ((selected?.storageId ?? null) !== openedStorageId) {
              throw makeZerospinError('node-development-history-replaced');
            }
          };
          const synchronization: AggregateNodeSynchronization =
            new AggregateNodeSynchronization(
              node,
              request,
              authentication,
              recoverConnectedNode,
              {
                enabled: () => observers.size > 0,
                layer: telemetryLayer,
              },
              checkSynchronizationHistory,
            );
          let recoveryScheduled = false;
          node.setConnectedRecoveryHandler(failure => {
            if (
              recovery !== undefined ||
              recoveringSynchronization ||
              recoveryScheduled
            ) {
              return true;
            }
            if (
              !shouldResetConnectedNode({
                failure,
                attempted: recoveryAttempted,
              })
            ) {
              return false;
            }
            recoveryScheduled = true;
            queueMicrotask(() => {
              recoveryScheduled = false;
              void recoverConnectedNode(failure).then(
                recovered => {
                  if (!recovered) node.failConnectedRecovery(failure);
                },
                error => node.failConnectedRecovery(error),
              );
            });
            return true;
          });
          owner = {
            recover: recoverConnectedNode,
            node,
            authentication,
            synchronization,
            close: (() => {
              let closed: Promise<void> | undefined;
              return () =>
                (closed ??= closeNodeStorageOwner({
                  synchronization,
                  node,
                  storage,
                }));
            })(),
          };
        } catch (error) {
          await closeNodeStorageOwner({
            ...(openingNode === undefined ? {} : { node: openingNode }),
            storage,
          }).catch(cleanupError => {
            cleanupFailures.push(cleanupError);
          });
          throw error;
        }
      }
      const current = owner;
      attachmentOwner = current;
      const readAttachedSnapshot = async () => {
        try {
          return await current.node.snapshot({ authoritative: true });
        } catch (failure) {
          if (!(await current.recover(failure))) throw failure;
          assertCurrent();
          initialProofInvalidated = true;
          return current.node.snapshot({ authoritative: true });
        }
      };
      let prepared = false;
      const attachment = makeNodeAttachment({
        isCurrent: () =>
          owner === current &&
          !closing &&
          !signal.aborted &&
          started === generation,
        onDetach: () => {
          attachments.delete(attachment);
          if (attachments.size === 0) {
            void current.synchronization.stop().catch(() => undefined);
          }
        },
      });
      const detach = attachment.dispose;
      const abortAttachment = () => {
        try {
          detach();
        } catch (error) {
          cleanupFailures.push(error);
        }
      };
      signal.addEventListener('abort', abortAttachment, { once: true });
      attachment.own(() =>
        signal.removeEventListener('abort', abortAttachment),
      );
      try {
        await check();
        // Old attachments stay revoked after logout, even if another tab signs back in.
        attachment.own(
          current.authentication.register(attachment, async () => {
            if (closing || signal.aborted || started !== generation) {
              throw makeZerospinError({ code: 'node-signed-out' });
            }
            return getAdmission();
          }),
        );
        attachments.set(attachment, detach);
        activeRevision = revision;
        let verified: IVerifiedAggregateAdmission | undefined;
        if (input.online) {
          await awaitConnectionStep(
            current.authentication.resume(definition.identity),
            signal,
          );
          verified = initialProofInvalidated
            ? await awaitConnectionStep(
                current.authentication.authenticate(),
                signal,
              )
            : input.verified;
          initialProofInvalidated = false;
          await check();
          if ((selectedStorage?.storageId ?? null) !== openedStorageId) {
            await current.recover(
              makeZerospinError('node-development-history-replaced'),
            );
            assertCurrent();
            verified = await awaitConnectionStep(
              current.authentication.authenticate(),
              signal,
            );
          }
          const blocked = current.node.status();
          if (
            blocked.blockedWork &&
            blocked.failure !== null &&
            shouldResetConnectedNode({
              failure: makeZerospinError(blocked.failure),
              attempted: recoveryAttempted,
            })
          ) {
            if (await current.recover(makeZerospinError(blocked.failure))) {
              assertCurrent();
              verified = await awaitConnectionStep(
                current.authentication.authenticate(),
                signal,
              );
            }
          }
          if (retryConnection && current.node.status().blockedWork) {
            current.node.assertConnectionRetryable();
            await awaitConnectionStep(current.synchronization.stop(), signal);
            await check();
            current.node.retryConnection();
            await awaitConnectionStep(
              current.authentication.resume(verified.identity),
              signal,
            );
          }
          verified ??= await awaitConnectionStep(
            current.authentication.authenticate(),
            signal,
          );
          await awaitConnectionStep(
            current.node.authenticated(
              verified.identity,
              () => !closing && !signal.aborted && started === generation,
            ),
            signal,
          );
          let attachedSnapshot = await readAttachedSnapshot();
          if (initialProofInvalidated) {
            verified = await awaitConnectionStep(
              current.authentication.authenticate(),
              signal,
            );
            initialProofInvalidated = false;
            await check();
          }
          if (
            verified.environment === 'dev' &&
            isLocalNodeEndpoint(request.apiUrl)
          ) {
            const canCreateRegistration =
              !hasAggregateNodeCheckpoint(attachedSnapshot.metadata) &&
              attachedSnapshot.nodeIndex === 0 &&
              attachedSnapshot.pushIndex === 0;
            const admission = await awaitConnectionStep(
              verified.getAdmission(),
              signal,
            );
            const registration = await awaitConnectionStep(
              aggregateNodeNetwork(request, admission).register(
                attachedSnapshot.metadata.nodeId,
                canCreateRegistration,
                verified.developmentHistory?.id,
              ),
              signal,
            );
            if (registration === 'missing') {
              if (
                !(await current.recover(
                  makeZerospinError('node-producer-not-registered'),
                ))
              ) {
                throw makeZerospinError('node-producer-not-registered');
              }
              assertCurrent();
              verified = await awaitConnectionStep(
                current.authentication.authenticate(),
                signal,
              );
              attachedSnapshot = await readAttachedSnapshot();
            } else if (registration === 'registered' && canCreateRegistration) {
              const fresh = await readReplacement(admission, signal);
              if (
                fresh.developmentHistory?.id !== verified.developmentHistory?.id
              ) {
                throw makeZerospinError('node-development-history-mismatch');
              }
              verified = { ...verified, snapshot: fresh.baseline };
            }
          }
          if (!hasAggregateNodeCheckpoint(attachedSnapshot.metadata)) {
            if (verified.snapshot === undefined) {
              throw makeZerospinError({ code: 'node-baseline-missing' });
            }
            const baselineStartedAt = performance.now();
            try {
              await awaitConnectionStep(
                current.node.initializeBaseline(verified.snapshot),
                signal,
              );
              recordStartup?.(
                'node.baseline.install',
                baselineStartedAt,
                'ready',
              );
            } catch (error) {
              recordStartup?.(
                'node.baseline.install',
                baselineStartedAt,
                signal.aborted ||
                  (isZerospinError(error) &&
                    error.code === 'node-authentication-cancelled')
                  ? 'cancelled'
                  : 'failed',
                isZerospinError(error) ? error.code : undefined,
              );
              throw error;
            }
          }
          await check();
        } else {
          await awaitConnectionStep(
            current.authentication.resume(definition.identity),
            signal,
          );
        }
        await check();
        if (recovery !== undefined) {
          await awaitConnectionStep(recovery, signal);
          verified = undefined;
        }
        await check();
        if (journalBootstrap !== undefined) {
          await recoverAggregateTabJournal({
            node: current.node,
            identity: definition.identity,
            journal: journalBootstrap,
            signal,
            assertCurrent: () => {
              assertCurrent();
              if (owner !== current || recovery !== undefined) {
                throw makeZerospinError('node-tab-detached');
              }
            },
          });
        }
        assertCurrent();
        await current.synchronization.enable();
        assertCurrent();
        const synchronize = Effect.gen(function* () {
          let admission = verified;
          const joining = recovery;
          if (joining !== undefined) {
            yield* Effect.tryPromise({
              try: () => awaitConnectionStep(joining, signal),
              catch: attachmentFailure,
            });
            admission = undefined;
          }
          assertCurrent();
          if (online) {
            yield* current.synchronization.resumeProgram(admission).pipe(
              Effect.catch(error => {
                const joining = recovery;
                if (
                  !isZerospinError(error) ||
                  error.code !== 'node-signed-out' ||
                  joining === undefined
                ) {
                  return Effect.fail(error);
                }
                return Effect.tryPromise({
                  try: () => awaitConnectionStep(joining, signal),
                  catch: attachmentFailure,
                }).pipe(
                  Effect.flatMap(() => {
                    assertCurrent();
                    return current.synchronization.resumeProgram();
                  }),
                );
              }),
            );
          } else if (!online) {
            void current.synchronization.resume().catch(() => undefined);
          }
        });
        const publish = async () => {
          if (recovery !== undefined) {
            await awaitConnectionStep(recovery, signal);
          }
          await check();
          if (online) {
            await aggregateSessionDiscovery.update(
              request,
              claims,
              aggregateId,
              revision,
              true,
              verified?.developmentHistory ?? historyProof,
            );
          }
          await check();
          while (recovery !== undefined) {
            await awaitConnectionStep(recovery, signal);
          }
          assertCurrent();
          const api = new AggregateBrowserSessionApi(
            current.node,
            current.synchronization,
            () =>
              onClearAuthentication(async () => {
                generation += 1;
                await current.synchronization.stop();
                await aggregateSessionDiscovery.update(
                  request,
                  claims,
                  aggregateId,
                  revision,
                  false,
                );
                await current.node.clearAuthentication();
                await Promise.allSettled(
                  [...publishedAttachments].map(api => api.notifySignedOut()),
                );
                for (const detach of attachments.values()) detach();
              }),
            attachment,
          );
          publishedAttachments.add(api);
          api.ownAttachment(() => publishedAttachments.delete(api));
          notifyRecovery();
          return api;
        };
        prepared = true;
        return { synchronize, publish, abandon: detach };
      } finally {
        if (!prepared) detach();
      }
    },
  };
  return {
    observeTelemetry(
      send: (batch: ITelemetryBatch) => Promise<void>,
      release: () => void,
    ) {
      const observer = { send, pending: Promise.resolve(), active: true };
      observers.add(observer);
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        // Completed records already queued belong to this attachment; new work does not.
        flushTelemetry();
        observers.delete(observer);
        const timeout = setTimeout(() => {
          observer.active = false;
          try {
            release();
          } catch {
            /* Diagnostic cleanup cannot affect attachment disposal. */
          }
        }, 1000);
        void observer.pending
          .finally(() => {
            if (!observer.active) return;
            observer.active = false;
            clearTimeout(timeout);
            try {
              release();
            } catch {
              /* Diagnostic cleanup cannot affect attachment disposal. */
            }
          })
          .catch(() => undefined);
      };
    },
    attach: (
      input: IAggregateNodeResolution &
        Pick<
          typeof AggregateAttachmentSchema.Type,
          'retryConnection' | 'newSessionAttempt' | 'diagnostics'
        >,
      getAdmission: () => Promise<IAggregateAuthenticationRequest>,
      recoveryNotice?: (error: IZerospinErrorJson) => Promise<void>,
      attachmentSignal?: AbortSignal,
      journalBootstrap?: IAggregateNodeUpgradeJournal,
    ) => {
      const joiningAttempt = recovery !== undefined || attaching > 0;
      if (input.newSessionAttempt && !joiningAttempt) recoveryAttempted = false;
      attaching += 1;
      if (recoveryNotice !== undefined) recoveryNotices.add(recoveryNotice);
      const enabled = input.diagnostics !== undefined && observers.size > 0;
      const program = Effect.gen(function* () {
        if (closing) return yield* makeZerospinError('node-tab-detached');
        const completed = Promise.withResolvers<void>();
        const attachmentLifetime = new AbortController();
        let preparingAttachment: ReturnType<typeof native.prepare> | undefined;
        let publishingAttachment:
          | Promise<AggregateBrowserSessionApi>
          | undefined;
        const previous = serial;
        serial = previous.then(() => completed.promise);
        const reserve = Effect.tryPromise({
          try: signal =>
            awaitConnectionStep(
              previous,
              AbortSignal.any([
                signal,
                lifetime.signal,
                ...(attachmentSignal === undefined ? [] : [attachmentSignal]),
              ]),
            ),
          catch: attachmentFailure,
        });
        return yield* Effect.gen(function* () {
          yield* reserve;
          const attachmentSpan = enabled
            ? yield* Effect.currentSpan.pipe(Effect.orDie)
            : undefined;
          const reused = owner !== undefined;
          if (attachmentSpan !== undefined && nodeStartupSpan !== undefined) {
            attachmentSpan.addLinks([
              { span: nodeStartupSpan, attributes: { kind: 'causedBy' } },
            ]);
          }
          const sharedStartup =
            enabled && !reused
              ? yield* Effect.makeSpan('node.startup', {
                  root: true,
                  attributes: {
                    workerStartupId: crypto.randomUUID(),
                    generation,
                  },
                  links:
                    attachmentSpan === undefined
                      ? []
                      : [
                          {
                            span: attachmentSpan,
                            attributes: { kind: 'causedBy' },
                          },
                        ],
                })
              : undefined;
          const startupSpan = sharedStartup ?? attachmentSpan;
          const recordStartup =
            startupSpan === undefined
              ? undefined
              : (
                  phase: string,
                  startedAt: number,
                  outcome: 'ready' | 'failed' | 'cancelled',
                  errorCode?: string,
                ) => {
                  try {
                    Effect.runSync(
                      Effect.logInfo('Node startup phase').pipe(
                        Effect.annotateLogs({
                          phase,
                          durationMs: performance.now() - startedAt,
                          outcome,
                          ...(errorCode === undefined ? {} : { errorCode }),
                        }),
                        Effect.withParentSpan(startupSpan),
                        Effect.provide(telemetryLayer),
                        Effect.provide(quietLogger),
                      ),
                    );
                  } catch {
                    /* Startup diagnostics never alter Node readiness. */
                  }
                };
          if (enabled) {
            yield* Effect.logInfo('Node attachment').pipe(
              Effect.annotateLogs({ reused, generation }),
            );
          }
          return yield* Effect.gen(function* () {
            const prepared = yield* Effect.tryPromise({
              try: signal => {
                const opening = native.prepare(
                  input,
                  getAdmission,
                  AbortSignal.any([
                    signal,
                    lifetime.signal,
                    attachmentLifetime.signal,
                    ...(attachmentSignal === undefined
                      ? []
                      : [attachmentSignal]),
                  ]),
                  recordStartup,
                  journalBootstrap,
                );
                preparingAttachment = opening;
                preparing.add(opening);
                void opening
                  .finally(() => preparing.delete(opening))
                  .catch(() => undefined);
                return opening;
              },
              catch: cause => {
                if (isZerospinError(cause) && !('scope' in cause)) return cause;
                return attachmentFailure(cause);
              },
            });
            return yield* (
              sharedStartup === undefined
                ? prepared.synchronize
                : prepared.synchronize.pipe(
                    Effect.withParentSpan(sharedStartup),
                  )
            ).pipe(
              Effect.flatMap(() =>
                Effect.tryPromise({
                  try: () => (publishingAttachment = prepared.publish()),
                  catch: attachmentFailure,
                }),
              ),
            );
          }).pipe(
            Effect.onExit(exit =>
              sharedStartup === undefined
                ? Effect.void
                : Effect.gen(function* () {
                    if (owner !== undefined) nodeStartupSpan = sharedStartup;
                    sharedStartup.end(yield* Clock.currentTimeNanos, exit);
                  }),
            ),
          );
        }).pipe(
          Effect.onExit(exit =>
            Exit.isSuccess(exit)
              ? Effect.sync(() => completed.resolve())
              : Effect.promise(async () => {
                  attachmentLifetime.abort();
                  try {
                    const prepared = await preparingAttachment?.catch(
                      () => undefined,
                    );
                    await publishingAttachment?.catch(() => undefined);
                    await prepared?.abandon();
                  } finally {
                    // Release the reservation after native storage cleanup settles.
                    completed.resolve();
                  }
                }),
          ),
        );
      });
      const ownedProgram = program.pipe(
        Effect.tap(api =>
          Effect.sync(() => {
            if (recoveryNotice !== undefined) {
              historyNotices.add(recoveryNotice);
            }
            api.ownAttachment(() => {
              if (recoveryNotice !== undefined) {
                recoveryNotices.delete(recoveryNotice);
                historyNotices.delete(recoveryNotice);
              }
            });
          }),
        ),
        Effect.onExit(exit =>
          Effect.sync(() => {
            attaching -= 1;
            if (Exit.isFailure(exit) && recoveryNotice !== undefined) {
              recoveryNotices.delete(recoveryNotice);
            }
          }),
        ),
      );
      if (!enabled) return ownedProgram;
      const upstream = input.diagnostics?.traceContext;
      return ownedProgram.pipe(
        Effect.withSpan('node.attachment', {
          root: true,
          attributes: { startupId: input.diagnostics?.startupId },
          links:
            upstream == null
              ? []
              : [
                  {
                    span: Tracer.externalSpan({
                      traceId: upstream.traceId,
                      spanId: upstream.parentSpanId,
                    }),
                    attributes: { kind: 'causedBy' },
                  },
                ],
        }),
        Effect.annotateLogs({ startupId: input.diagnostics?.startupId }),
        Effect.provide(telemetryLayer),
        Effect.provide(quietLogger),
      );
    },
    close(): Promise<void> {
      if (closed !== undefined) return closed;
      const completion = Promise.withResolvers<void>();
      closed = completion.promise;
      closing = true;
      generation += 1;
      lifetime.abort();
      const current = owner;
      const stop = current?.synchronization.stop();
      let failure: unknown;
      let failed = false;
      for (const detach of attachments.values()) {
        try {
          detach();
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
      }
      void (async () => {
        await recovery?.catch(() => undefined);
        await serial;
        await Promise.allSettled([...preparing]);
        if (!failed && cleanupFailures.length > 0) {
          failed = true;
          failure = cleanupFailures[0];
        }
        try {
          await (current ?? owner)?.close();
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
        try {
          await stop;
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
        owner = undefined;
        if (failed) return Promise.reject(failure);
      })().then(completion.resolve, completion.reject);
      return closed;
    },
  };
}
