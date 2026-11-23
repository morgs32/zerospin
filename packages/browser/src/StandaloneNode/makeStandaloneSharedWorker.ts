import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';

import { closeNodeStorageOwner } from '../Node/closeNodeStorageOwner.ts';
import { makeNodeNamespaceLease } from '../Node/makeNodeNamespaceLease.ts';
import { makeWorkerConnections } from '../Node/makeWorkerConnections.ts';
import type { INodeExecution } from '../Node/nodeExecution.ts';
import { openWaSqliteNodeStorage } from '../Node/openWaSqliteNodeStorage.ts';

import { makeStandaloneWorkerRuntime } from './makeStandaloneWorkerRuntime.ts';
import { StandaloneSharedWorkerApi } from './StandaloneSharedWorkerApi.ts';

/** Each client group waits for and releases the same stable storage namespace. */
export function makeStandaloneSharedWorker(props: {
  sqliteWasmUrl: string;
  sessionKey: string;
  execution: INodeExecution<IAggregateSessionDefinition>;
}) {
  const { sqliteWasmUrl, sessionKey, execution } = props;
  const namespace = `/zerospin/standalone/${sessionKey}`;
  const connections = makeWorkerConnections(() => {
    const lease = makeNodeNamespaceLease(namespace);
    try {
      const runtime = makeStandaloneWorkerRuntime({
        sessionKey,
        execution,
        ownership: lease.ready,
        openStorage: ({ signal, onCleanupFailure }) =>
          openWaSqliteNodeStorage({
            namespace,
            sqliteWasmUrl,
            create: true,
            signal,
            onCleanupFailure,
          }),
      });
      return {
        createApi: () =>
          new StandaloneSharedWorkerApi(
            runtime.attach,
            runtime.drainProgram,
            runtime.pushProgram,
            lease.ready,
            runtime.subscribeRecoveryNotices,
          ),
        close(connections: { close(): void }) {
          lease.preventOpening();
          return closeNodeStorageOwner({
            connections,
            synchronization: { stop: runtime.stop },
            storage: { close: runtime.closeStorage },
            namespace: lease,
          });
        },
      };
    } catch (error) {
      lease.preventOpening();
      void lease.close().catch(() => undefined);
      throw error;
    }
  });
  return { close: connections.close };
}
