import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { makeZerospinError } from '@zerospin/error';

import { attachToDevelopmentHistory } from '../Node/attachToDevelopmentHistory.ts';
import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { BrowserRpc } from '../Node/BrowserRpc.ts';
import { closeNodeStorageOwner } from '../Node/closeNodeStorageOwner.ts';
import { makeNodeNamespaceLease } from '../Node/makeNodeNamespaceLease.ts';
import { makeWorkerConnections } from '../Node/makeWorkerConnections.ts';
import { NodeStorageOwnerBusyError } from '../Node/NodeErrors.ts';
import {
  assertAggregateNodeRequest,
  type INodeExecution,
} from '../Node/nodeExecution.ts';
import { makeAggregateNodeNamespace } from '../Node/nodeStorageNamespaces.ts';
import { openWaSqliteNodeStorage } from '../Node/openWaSqliteNodeStorage.ts';
import { sharedWorkerVersion } from '../sharedWorkerVersion.ts';

import { makeAggregateSharedWorkerRoutingKey } from './aggregateNodeRequest.ts';
import { aggregateSessionDiscovery } from './aggregateSessionDiscovery.ts';
import {
  AggregateSharedWorkerApi,
  type IAggregateSharedWorkerHost,
} from './AggregateSharedWorkerApi.ts';
import { makeAggregateWorkerRuntime } from './makeAggregateWorkerRuntime.ts';
import { resolveAggregateNode } from './resolveAggregateNode.ts';

type IAggregateIdentityOwner = {
  key: string;
  runtime: ReturnType<typeof makeAggregateWorkerRuntime>;
  namespace: ReturnType<typeof makeNodeNamespaceLease>;
  lifetime: AbortController;
  references: number;
  closing?: Promise<void>;
  failed: boolean;
  failure?: unknown;
};

/** Route ports independently; acquire storage only after each attachment proves its identity. */
export function makeAggregateSharedWorker(props: {
  execution: INodeExecution<IAggregateSessionDefinition>;
  sqliteWasmUrl: string;
  name: string;
  routingKey: string;
}) {
  const { execution, sqliteWasmUrl, routingKey } = props;
  const identities = new Map<string, IAggregateIdentityOwner>();

  const retire = (
    entry: IAggregateIdentityOwner,
    revoke?: () => Promise<void>,
  ): Promise<void> => {
    if (entry.closing !== undefined) return entry.closing;
    const completion = Promise.withResolvers<void>();
    entry.closing = completion.promise;
    void completion.promise.catch(() => undefined);
    // Reserve the closing gate before revocation can reenter reference release.
    entry.namespace.preventOpening();
    if (revoke === undefined) entry.lifetime.abort();
    void Promise.resolve()
      .then(() =>
        closeNodeStorageOwner({
          ...(revoke === undefined
            ? {}
            : {
                connections: {
                  close: async () => {
                    try {
                      await revoke();
                    } finally {
                      entry.lifetime.abort();
                    }
                  },
                },
              }),
          storage: entry.runtime,
          namespace: entry.namespace,
        }),
      )
      .then(
        () => {
          if (identities.get(entry.key) === entry) identities.delete(entry.key);
          completion.resolve();
        },
        error => {
          entry.failed = true;
          entry.failure = error;
          completion.reject(error);
        },
      );
    return completion.promise;
  };

  const release = (entry: IAggregateIdentityOwner) => {
    entry.references -= 1;
    if (entry.references === 0 && entry.closing === undefined) {
      void retire(entry).catch(() => undefined);
    }
  };

  const acquire = (key: string) => {
    const namespace = makeNodeNamespaceLease(makeAggregateNodeNamespace(key));
    try {
      const runtime = makeAggregateWorkerRuntime({
        sessionKey: key,
        execution,
        ownership: namespace.ready,
        onClearAuthentication: operation => retire(entry, operation),
        openStorage: ({
          create,
          recreate,
          developmentStorageId,
          signal,
          onCleanupFailure,
        }) =>
          openWaSqliteNodeStorage({
            namespace: makeAggregateNodeNamespace(key),
            developmentStorageId,
            sqliteWasmUrl,
            create,
            recreate,
            signal,
            onCleanupFailure,
          }),
      });
      const entry: IAggregateIdentityOwner = {
        key,
        namespace,
        runtime,
        lifetime: new AbortController(),
        references: 0,
        failed: false,
      };
      identities.set(key, entry);
      return entry;
    } catch (error) {
      namespace.preventOpening();
      void namespace.close().catch(() => undefined);
      throw error;
    }
  };

  const connections = makeWorkerConnections(() => {
    const group = new AbortController();
    const working = new Set<Promise<unknown>>();
    const attach: IAggregateSharedWorkerHost['attach'] = async (
      input,
      getAdmission,
      portSignal,
      telemetry,
      recoveryNotice,
      journalBootstrap,
    ) => {
      const signal = AbortSignal.any([group.signal, portSignal]);
      assertAggregateNodeRequest(execution.sessionDefinition, input.request);
      if (
        (await awaitConnectionStep(
          makeAggregateSharedWorkerRoutingKey(input.request, input.aggregateId),
          signal,
        )) !== routingKey
      ) {
        throw makeZerospinError('node-attachment-identity-mismatch');
      }
      const revision = await awaitConnectionStep(
        aggregateSessionDiscovery.revision(),
        signal,
      );
      const resolved = await resolveAggregateNode({
        ...input,
        getAdmission,
        revision,
        signal,
      });
      const key = await awaitConnectionStep(
        sessionKey(resolved.definition.identity),
        signal,
      );
      let entry: IAggregateIdentityOwner;
      for (;;) {
        await awaitConnectionStep(
          aggregateSessionDiscovery.check(key, revision, !resolved.online),
          signal,
        );
        const prior = identities.get(key);
        if (prior?.failed) throw prior.failure;
        if (prior?.closing !== undefined) {
          await awaitConnectionStep(prior.closing, signal);
          continue;
        }
        entry = prior ?? acquire(key);
        entry.references += 1;
        break;
      }
      const joinedSignal = AbortSignal.any([signal, entry.lifetime.signal]);
      let retained = false;
      let stopTelemetry: (() => void) | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await awaitConnectionStep(
          Promise.race([
            entry.namespace.ready,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    NodeStorageOwnerBusyError.make({
                      extra: { timeoutMs: 15000 },
                    }),
                  ),
                15000,
              );
            }),
          ]).finally(() => clearTimeout(timer)),
          joinedSignal,
        );
        await awaitConnectionStep(
          aggregateSessionDiscovery.check(key, revision, !resolved.online),
          joinedSignal,
        );
        if (telemetry !== undefined) {
          stopTelemetry = entry.runtime.observeTelemetry(
            telemetry.send,
            telemetry.release,
          );
        }
        const attachResolved = (resolution: typeof resolved) =>
          BrowserRpc.run(
            entry.runtime.attach(
              {
                ...resolution,
                retryConnection: input.retryConnection,
                newSessionAttempt: input.newSessionAttempt,
                diagnostics: input.diagnostics,
              },
              getAdmission,
              recoveryNotice,
              joinedSignal,
              journalBootstrap,
            ),
          );
        const attached = await attachToDevelopmentHistory({
          key,
          resolved,
          attach: attachResolved,
          reauthenticate: () =>
            resolveAggregateNode({
              ...input,
              expectedClaims: resolved.definition.identity.claims,
              getAdmission,
              revision,
              signal,
            }),
        });
        try {
          await awaitConnectionStep(
            aggregateSessionDiscovery.check(key, revision, !resolved.online),
            joinedSignal,
          );
          attached.ownAttachment(() => {
            try {
              stopTelemetry?.();
            } finally {
              release(entry);
            }
          });
          retained = true;
          return attached;
        } finally {
          if (!retained) attached[Symbol.dispose]();
        }
      } finally {
        clearTimeout(timer);
        if (!retained) {
          try {
            stopTelemetry?.();
          } finally {
            release(entry);
          }
        }
      }
    };
    const host: IAggregateSharedWorkerHost = {
      async ready() {
        if (group.signal.aborted) throw makeZerospinError('node-tab-detached');
        return {
          version: sharedWorkerVersion,
          artifactUrl: globalThis.location.href,
        };
      },
      attach(...args) {
        const work = attach(...args);
        working.add(work);
        void work.finally(() => working.delete(work)).catch(() => undefined);
        return work;
      },
    };
    return {
      createApi: () => new AggregateSharedWorkerApi(host),
      close(ports: { close(): void }) {
        group.abort();
        return closeNodeStorageOwner({
          connections: ports,
          storage: {
            async close() {
              await Promise.allSettled([...working]);
              await Promise.allSettled(
                [...identities.values()].map(entry => entry.closing),
              );
            },
          },
        });
      },
    };
  });
  return connections.close;
}
