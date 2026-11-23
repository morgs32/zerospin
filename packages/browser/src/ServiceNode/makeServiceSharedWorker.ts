import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import type { IServiceSessionDefinition } from '@zerospin/core/serviceSession/types';
import { makeZerospinError, type IZerospinErrorJson } from '@zerospin/error';

import { attachToDevelopmentHistory } from '../Node/attachToDevelopmentHistory.ts';
import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { BrowserRpc } from '../Node/BrowserRpc.ts';
import { closeNodeStorageOwner } from '../Node/closeNodeStorageOwner.ts';
import { makeNodeNamespaceLease } from '../Node/makeNodeNamespaceLease.ts';
import { makeWorkerConnections } from '../Node/makeWorkerConnections.ts';
import { NodeStorageOwnerBusyError } from '../Node/NodeErrors.ts';
import {
  assertServiceNodeRequest,
  type INodeExecution,
} from '../Node/nodeExecution.ts';
import { makeServiceNodeNamespace } from '../Node/nodeStorageNamespaces.ts';
import { openWaSqliteNodeStorage } from '../Node/openWaSqliteNodeStorage.ts';
import { sharedWorkerVersion } from '../sharedWorkerVersion.ts';

import { makeServiceWorkerRuntime } from './makeServiceWorkerRuntime.ts';
import type { IServiceNodeUpgradeJournal } from './recoverServiceTabJournal.ts';
import { resolveServiceNode } from './resolveServiceNode.ts';
import { makeServiceSharedWorkerRoutingKey } from './serviceNodeRequest.ts';
import { serviceSessionDiscovery } from './serviceSessionDiscovery.ts';
import {
  ServiceSharedWorkerApi,
  type IServiceSharedWorkerHost,
  type ServiceAttachmentSchema,
} from './ServiceSharedWorkerApi.ts';

type IServiceIdentityOwner = {
  key: string;
  namespace: ReturnType<typeof makeNodeNamespaceLease>;
  runtime: ReturnType<typeof makeServiceWorkerRuntime>;
  lifetime: AbortController;
  references: number;
  closing?: Promise<void>;
};

/** Authenticate ports independently, then acquire only their complete identity's durable Node. */
export function makeServiceSharedWorker(props: {
  execution: INodeExecution<IServiceSessionDefinition>;
  sqliteWasmUrl: string;
  name: string;
  routingKey: string;
}) {
  const { execution, sqliteWasmUrl, routingKey } = props;
  const identities = new Map<string, IServiceIdentityOwner>();

  const retire = (
    entry: IServiceIdentityOwner,
    revoke?: () => Promise<void>,
  ) => {
    if (entry.closing !== undefined) return entry.closing;
    const completion = Promise.withResolvers<void>();
    entry.closing = completion.promise;
    void entry.closing.catch(() => undefined);
    entry.namespace.preventOpening();
    if (revoke === undefined) entry.lifetime.abort();
    void closeNodeStorageOwner({
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
    }).then(() => {
      if (identities.get(entry.key) === entry) identities.delete(entry.key);
      completion.resolve();
    }, completion.reject);
    return completion.promise;
  };

  const release = (entry: IServiceIdentityOwner) => {
    entry.references -= 1;
    if (entry.references === 0) void retire(entry).catch(() => undefined);
  };

  const acquire = (key: string) => {
    const namespaceName = makeServiceNodeNamespace(key);
    const namespace = makeNodeNamespaceLease(namespaceName);
    let entry: IServiceIdentityOwner;
    let runtime: ReturnType<typeof makeServiceWorkerRuntime>;
    try {
      runtime = makeServiceWorkerRuntime({
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
            namespace: namespaceName,
            developmentStorageId,
            sqliteWasmUrl,
            create,
            recreate,
            signal,
            onCleanupFailure,
          }),
      });
    } catch (error) {
      namespace.preventOpening();
      void namespace.close().catch(() => undefined);
      throw error;
    }
    entry = {
      key,
      namespace,
      runtime,
      references: 0,
      lifetime: new AbortController(),
    };
    identities.set(key, entry);
    return entry;
  };

  const connections = makeWorkerConnections(() => {
    const lifetime = new AbortController();
    const pending = new Set<Promise<unknown>>();
    const host: IServiceSharedWorkerHost = {
      async ready() {
        if (lifetime.signal.aborted) {
          throw makeZerospinError('node-tab-detached');
        }
        return {
          version: sharedWorkerVersion,
          artifactUrl: globalThis.location.href,
        };
      },
      attach(
        input,
        getAdmission,
        portSignal,
        recoveryNotice,
        journalBootstrap,
      ) {
        const work = attach(
          input,
          getAdmission,
          AbortSignal.any([lifetime.signal, portSignal]),
          recoveryNotice,
          journalBootstrap,
        );
        pending.add(work);
        void work.finally(() => pending.delete(work)).catch(() => undefined);
        return work;
      },
    };

    async function attach(
      input: typeof ServiceAttachmentSchema.Type,
      getAdmission: () => Promise<IAdmissionRequest>,
      signal: AbortSignal,
      recoveryNotice?: (error: IZerospinErrorJson) => Promise<void>,
      journalBootstrap?: IServiceNodeUpgradeJournal,
    ) {
      assertServiceNodeRequest(execution.sessionDefinition, input.request);
      if (
        (await awaitConnectionStep(
          makeServiceSharedWorkerRoutingKey(input.request),
          signal,
        )) !== routingKey
      ) {
        throw makeZerospinError('node-attachment-identity-mismatch');
      }
      const revision = await awaitConnectionStep(
        serviceSessionDiscovery.revision(),
        signal,
      );
      const resolved = await resolveServiceNode({
        request: input.request,
        expectedClaims: input.expectedClaims,
        getAdmission,
        revision,
        signal,
      });
      const key = await awaitConnectionStep(
        sessionKey(resolved.definition.identity),
        signal,
      );
      let entry: IServiceIdentityOwner;
      while (true) {
        await awaitConnectionStep(
          serviceSessionDiscovery.check(key, revision, !resolved.online),
          signal,
        );
        const prior = identities.get(key);
        if (prior?.closing !== undefined) {
          await awaitConnectionStep(prior.closing, signal);
          continue;
        }
        if (signal.aborted) throw makeZerospinError('node-tab-detached');
        entry = prior ?? acquire(key);
        entry.references += 1;
        break;
      }
      let retained = false;
      const current = entry;
      const attachmentSignal = AbortSignal.any([
        signal,
        current.lifetime.signal,
      ]);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await awaitConnectionStep(
          Promise.race([
            current.namespace.ready,
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
          attachmentSignal,
        );
        await awaitConnectionStep(
          serviceSessionDiscovery.check(key, revision, !resolved.online),
          attachmentSignal,
        );
        const attachResolved = (resolution: typeof resolved) =>
          BrowserRpc.run(
            current.runtime.attach(
              {
                ...resolution,
                retryConnection: input.retryConnection,
                newSessionAttempt: input.newSessionAttempt,
              },
              getAdmission,
              recoveryNotice,
              attachmentSignal,
              journalBootstrap,
            ),
          );
        const attached = await attachToDevelopmentHistory({
          key,
          resolved,
          attach: attachResolved,
          reauthenticate: () =>
            resolveServiceNode({
              ...input,
              expectedClaims: resolved.definition.identity.claims,
              getAdmission,
              revision,
              signal,
            }),
        });
        if (attachmentSignal.aborted) {
          attached[Symbol.dispose]();
          throw makeZerospinError('node-tab-detached');
        }
        attached.ownAttachment(() => release(current));
        retained = true;
        return attached;
      } finally {
        clearTimeout(timer);
        if (!retained) release(current);
      }
    }

    return {
      createApi: () => new ServiceSharedWorkerApi(host),
      close(connections: { close(): void }) {
        lifetime.abort();
        return closeNodeStorageOwner({
          connections,
          storage: {
            async close() {
              await Promise.allSettled([...pending]);
              // Durable cleanup failures remain bound to their identity and keep its lease.
              await Promise.allSettled(
                [...identities.values()].flatMap(entry =>
                  entry.closing === undefined ? [] : [entry.closing],
                ),
              );
            },
          },
        });
      },
    };
  });
  return connections.close;
}
