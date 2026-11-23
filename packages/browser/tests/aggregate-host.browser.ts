import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateSharedWorkerRoutingKey } from '@zerospin/browser/AggregateNode/aggregateNodeRequest';
import { aggregateSessionDiscovery } from '@zerospin/browser/AggregateNode/aggregateSessionDiscovery';
import type { AggregateSharedWorkerApi } from '@zerospin/browser/AggregateNode/AggregateSharedWorkerApi';
import { makeAggregateNodeDefinition } from '@zerospin/browser/AggregateNode/makeAggregateNodeDefinition';
import { makeStandaloneAggregateSession } from '@zerospin/browser/makeStandaloneAggregateSession';
import { acquireWorkerPort } from '@zerospin/browser/Node/acquireWorkerPort';
import { assertWorkerArtifact } from '@zerospin/browser/Node/assertWorkerArtifact';
import { closeNodeStorageOwner } from '@zerospin/browser/Node/closeNodeStorageOwner';
import { makeNodeNamespaceLease } from '@zerospin/browser/Node/makeNodeNamespaceLease';
import { openAggregateNodeExecution } from '@zerospin/browser/Node/nodeExecution';
import { makeAggregateNodeNamespace } from '@zerospin/browser/Node/nodeStorageNamespaces';
import { openWaSqliteNodeStorage } from '@zerospin/browser/Node/openWaSqliteNodeStorage';
import { makeAggregateSharedWorkerName } from '@zerospin/browser/sharedWorkerNames';
import { makeStagedCommandJournal } from '@zerospin/browser/stagedCommandJournal/makeStagedCommandJournal';
import { makeStandaloneWorkerRuntime } from '@zerospin/browser/StandaloneNode/makeStandaloneWorkerRuntime';
import { standaloneStorageKey } from '@zerospin/browser/StandaloneNode/standaloneIdentity';
import { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import { AggregateNodeCommandSchema } from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import { aggregateNodeMetadata } from '@zerospin/core/AggregateNode/aggregateNodeTables';
import { readAggregateNodeMetadata } from '@zerospin/core/AggregateNode/readAggregateNodeMetadata';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { stageAggregateSessionCommand } from '@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import { isZerospinError } from '@zerospin/error';
import { makeDrizzleSchemaFromTable, primitives } from '@zerospin/shapes';
import {
  newHttpBatchRpcResponse,
  newMessagePortRpcSession,
  RpcStub,
  RpcTarget,
} from 'capnweb';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

export const counter = makeModelVersion(
  defineModel({ name: 'counter', abbreviation: 'cnt' }),
  { version: 1, attributes: { amount: primitives.integer() }, indexes: [] },
);
export const models = { counter };
export const increment = makeAggregateContractRelease(
  defineAggregateContract('increment'),
  {
    version: 1,
    payload: {},
    result: Schema.Number,
    models: {
      counter: {
        model: models.counter,
        fields: ['createdAt', 'updatedAt', 'amount'],
      },
    },
    operations: { update: counter.operations.update },
    program: Effect.fn('aggregateHostIncrement.program')(function* ({
      db,
      operations,
    }) {
      const row = yield* findFirst({
        db,
        model: db.models.counter,
        where: { id: { eq: 'cnt_host' } },
      });
      if (row === undefined) throw new Error('Missing seeded host counter');
      yield* operations.update({
        resourceId: row.id,
        attributes: { amount: row.amount + 1 },
      });
      return row.amount + 1;
    }),
  },
);
export const definition = makeAggregateSessionDefinition({
  systemName: 'hostVerification',
  aggregateName: 'account',
  aggregateVersion: 1,
  actorName: 'member',
  actorVersion: 1,
  sessionName: 'counter',
  claimsSchema: Schema.Struct({
    aggregateId: Schema.String,
    memberId: Schema.String,
  }),
  models,
  contracts: { increment },
});
export const sqliteWasmUrl = new URL('../dist/sqlite.wasm', import.meta.url)
  .href;

export const standaloneDefinition = makeAggregateSessionDefinition({
  systemName: 'standalone',
  aggregateName: 'draft',
  aggregateVersion: 1,
  actorName: 'guest',
  actorVersion: 1,
  sessionName: 'counter',
  claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
  models: { counter },
  contracts: { increment },
});

export async function prepare(
  runId: string,
  apiUrl = 'https://plan234-host.invalid',
) {
  const aggregateId = `host-${runId}`;
  const claims = { aggregateId, memberId: runId };
  const request = {
    apiUrl,
    publishableKey: 'pub_host',
    systemName: definition.systemName,
    aggregateName: definition.aggregateName,
    aggregateVersion: definition.aggregateVersion,
    sessionName: definition.sessionName,
    lock: makeAggregateSessionLock(definition),
  };
  const nodeDefinition = await makeAggregateNodeDefinition(
    request,
    claims,
    aggregateId,
  );
  const key = await sessionKey(nodeDefinition.identity);
  const namespace = makeAggregateNodeNamespace(key);
  const hostName = makeAggregateSharedWorkerName(
    await makeAggregateSharedWorkerRoutingKey(request, aggregateId),
  );
  const lease = makeNodeNamespaceLease(namespace);
  await lease.ready;
  const execution = await openAggregateNodeExecution(
    { sessionDefinition: definition },
    nodeDefinition,
  ).catch(async error => {
    await lease.close();
    throw error;
  });
  let storage: Awaited<ReturnType<typeof openWaSqliteNodeStorage>> | undefined;
  let node: AggregateNode | undefined;
  let nodeId: string;
  try {
    if ((await indexedDB.databases()).some(db => db.name === namespace)) {
      throw new Error('Host fixture requires a fresh test namespace');
    }
    storage = await openWaSqliteNodeStorage({
      namespace,
      sqliteWasmUrl,
      create: true,
    });
    node = new AggregateNode(
      storage.db,
      nodeDefinition,
      execution.view,
      definition,
    );
    await node.initializeConnectedStorage(true);
    await node.initializeBaseline({
      aggregateIndex: 0,
      dispositionChainHash: '0'.repeat(64),
      resolvedThrough: 0,
      resources: [
        {
          modelName: 'counter',
          version: 1,
          id: 'cnt_host',
          amount: 0,
          createdAt: new Date('2026-10-27T00:00:00.000Z'),
          updatedAt: new Date('2026-10-27T00:00:00.000Z'),
        },
      ],
    });
    await node.setPushPaused(true);
    nodeId = (await node.snapshot()).metadata.nodeId;
    await aggregateSessionDiscovery.update(
      request,
      claims,
      aggregateId,
      0,
      true,
    );
  } finally {
    await closeNodeStorageOwner({
      ...(node === undefined ? {} : { node }),
      runtime: { dispose: execution.close },
      ...(storage === undefined ? {} : { storage }),
      namespace: lease,
    });
  }
  return {
    runId,
    request,
    claims,
    aggregateId,
    key,
    namespace,
    hostName,
    nodeId,
    attachment: { request, aggregateId, expectedClaims: claims },
  };
}

export type IAggregateHostPrepared = Awaited<ReturnType<typeof prepare>>;

/** Give only a newly seeded fixture an unsupported, nonzero schema stamp. */
export async function prepareAggregateSchemaRefusal(uniqueRunId: string) {
  const prepared = await prepare(uniqueRunId);
  const lease = makeNodeNamespaceLease(prepared.namespace);
  let storage: Awaited<ReturnType<typeof openWaSqliteNodeStorage>> | undefined;
  try {
    await lease.ready;
    storage = await openWaSqliteNodeStorage({
      namespace: prepared.namespace,
      sqliteWasmUrl,
      create: false,
    });
    await storage.db.run(sql`PRAGMA user_version = 2147483646`);
  } finally {
    await closeNodeStorageOwner({
      ...(storage === undefined ? {} : { storage }),
      namespace: lease,
    });
  }
  return prepared;
}

export function input(
  prepared: IAggregateHostPrepared,
  sessionIndex = 1,
): IAggregateNodeCommand {
  return {
    id: null,
    nodeId: null,
    nodeIndex: null,
    pushIndex: null,
    sessionId: `sesn_${prepared.runId}` as const,
    sessionIndex,
    commandName: 'increment',
    contractVersion: 1,
    payload: '{}',
    kind: 'actor' as const,
    aggregateName: definition.aggregateName,
    aggregateVersion: definition.aggregateVersion,
    aggregateId: prepared.aggregateId,
    actorName: definition.actorName,
    actorVersion: definition.actorVersion,
    sessionName: definition.sessionName,
    claims: prepared.claims,
    stagingOutcome: {
      result: sessionIndex,
      completedAt: '2026-10-27T01:00:00.000Z',
    },
  };
}

export async function connect(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
  attachment: unknown = prepared.attachment,
) {
  const controller = new AbortController();
  const acquired = await acquireWorkerPort({
    sharedWorkerUrl: workerUrl,
    name: makeAggregateSharedWorkerName(
      await makeAggregateSharedWorkerRoutingKey(
        prepared.request,
        prepared.aggregateId,
      ),
    ),
    signal: controller.signal,
    onError: () => undefined,
  });
  const connection = newMessagePortRpcSession<AggregateSharedWorkerApi>(
    acquired.port,
  );
  const admission = new RpcStub(
    async (): Promise<IAggregateAuthenticationRequest> => ({
      aggregateId: prepared.aggregateId,
      credentials: { token: JSON.stringify(prepared.claims) },
    }),
  );
  try {
    const ready = await connection.ready();
    assertWorkerArtifact(acquired.artifactUrl, ready);
    const api = await connection.attach(attachment, admission);
    let closed = false;
    return {
      api,
      ready,
      async retain(sessionIndex = 1) {
        const subscriber = await api.getStagedCommandSubscriber(
          prepared.nodeId,
        );
        try {
          return await subscriber.receive([input(prepared, sessionIndex)]);
        } finally {
          subscriber[Symbol.dispose]();
        }
      },
      async close() {
        if (closed) return;
        closed = true;
        try {
          await api.dispose();
        } finally {
          admission[Symbol.dispose]();
          connection[Symbol.dispose]();
          controller.abort();
          acquired.close();
        }
      },
    };
  } catch (error) {
    admission[Symbol.dispose]();
    connection[Symbol.dispose]();
    controller.abort();
    acquired.close();
    throw error;
  }
}

export async function inspect(prepared: IAggregateHostPrepared) {
  const lease = makeNodeNamespaceLease(prepared.namespace);
  await lease.ready;
  let storage: Awaited<ReturnType<typeof openWaSqliteNodeStorage>> | undefined;
  try {
    storage = await openWaSqliteNodeStorage({
      namespace: prepared.namespace,
      sqliteWasmUrl,
      create: false,
    });
    return {
      metadata: await storage.db.values(sql`SELECT * FROM nodeMetadata`),
      commands: await storage.db.values(
        sql`SELECT * FROM commands ORDER BY nodeIndex`,
      ),
      resources: await storage.db.values(sql`SELECT * FROM counter`),
      version: await storage.db.values(sql`PRAGMA user_version`),
      ledger: await storage.db.values(
        sql`SELECT * FROM applied_migrations ORDER BY migrationId`,
      ),
      schema: await storage.db.values(
        sql`SELECT type, name, sql FROM sqlite_schema ORDER BY type, name`,
      ),
    };
  } finally {
    await closeNodeStorageOwner({
      ...(storage === undefined ? {} : { storage }),
      namespace: lease,
    });
  }
}

const HostRecoveryMessageSchema = Schema.Struct({
  type: Schema.String,
  nodeId: Schema.optional(Schema.String),
  aggregateIndex: Schema.optional(Schema.Number),
  serviceIndex: Schema.optional(Schema.Number),
  outcomeIndex: Schema.optional(Schema.Number),
  dispositionChainHash: Schema.optional(Schema.String),
  command: Schema.optional(
    Schema.Struct({ id: Schema.String, pushIndex: Schema.Number }),
  ),
});
export type IHostRecoveryMessage = typeof HostRecoveryMessageSchema.Type;
export type IHostRecoveryEvent = {
  type: string;
  worker: boolean;
  nodeId?: string | null | undefined;
  id?: string | undefined;
};

export type IHostBackendObservation = {
  record(event: Omit<IHostRecoveryEvent, 'worker'>): void;
  historyReplaced(): boolean;
  raceRegistration(): boolean;
  systemStarting(): boolean;
  waitForSnapshot(): Promise<void>;
};

/** Only opt-in disposable plan283 origins use these backend protocol doubles. */
export function installHostRecoveryTransport(props: {
  gateway(url: URL, observation: IHostBackendObservation): RpcTarget;
  reply(message: IHostRecoveryMessage): unknown;
}) {
  const { gateway, reply } = props;
  const originalFetch = globalThis.fetch;
  const OriginalWebSocket = globalThis.WebSocket;
  const channels = new Map<string, BroadcastChannel>();
  const resumes = new Map<string, number>();
  const unobservedOutcomes = new Map<
    string,
    { frame: unknown; index: number }
  >();
  const cleans = new Set<string>();
  const stoppedBackends = new Set<string>();
  const startupReplies = new Map<string, number>();
  const snapshotHolds = new Map<
    string,
    ReturnType<typeof Promise.withResolvers<void>>
  >();
  const activeSockets = new Set<RecoverySocket>();
  const record = (url: URL, event: Omit<IHostRecoveryEvent, 'worker'>) => {
    const label =
      url.hostname === 'zerospin.qrk.localhost'
        ? (url.pathname.split('/')[2] ?? '')
        : url.hostname;
    let channel = channels.get(label);
    if (channel === undefined) {
      channel = new BroadcastChannel(`zerospin-plan283:${label}`);
      channels.set(label, channel);
      channel.onmessage = message => {
        if (typeof document !== 'undefined') return;
        const control = Schema.decodeUnknownOption(
          Schema.Struct({
            type: Schema.Literals([
              'invalidate',
              'drop-socket',
              'restore-network',
              'replace-history',
              'hold-snapshots',
              'release-snapshots',
            ]),
            worker: Schema.Literal(false),
          }),
        )(message.data);
        if (control._tag === 'None') return;
        if (
          control.value.type === 'drop-socket' &&
          label.startsWith('plan283-production-upgrade-')
        ) {
          Object.defineProperty(navigator, 'onLine', {
            value: false,
            configurable: true,
          });
          record(url, { type: 'socket-dropped' });
          for (const socket of activeSockets) {
            if (new URL(socket.url).hostname === label) socket.close();
          }
        } else if (
          control.value.type === 'restore-network' &&
          label.startsWith('plan283-production-upgrade-')
        ) {
          Reflect.deleteProperty(navigator, 'onLine');
          globalThis.dispatchEvent(new Event('online'));
        } else if (control.value.type === 'hold-snapshots') {
          if (!snapshotHolds.has(label)) {
            snapshotHolds.set(label, Promise.withResolvers<void>());
          }
          record(url, { type: 'snapshots-held' });
        } else if (control.value.type === 'release-snapshots') {
          snapshotHolds.get(label)?.resolve();
          snapshotHolds.delete(label);
        } else if (
          control.value.type === 'replace-history' &&
          label.startsWith('plan283-dev-reset-live-')
        ) {
          cleans.add(label);
          stoppedBackends.add(label);
          record(url, { type: 'history-replaced' });
          for (const socket of activeSockets) {
            if (new URL(socket.url).pathname.includes(label)) socket.close();
          }
        } else if (label.split('-')[2] === 'live') {
          for (const socket of activeSockets) {
            if (new URL(socket.url).hostname === url.hostname) {
              socket.invalidate();
            }
          }
        }
      };
    }
    channel.postMessage({ ...event, worker: typeof document === 'undefined' });
  };
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const label =
      url.hostname === 'zerospin.qrk.localhost'
        ? (url.pathname.split('/')[2] ?? '')
        : url.hostname;
    if (stoppedBackends.delete(label)) {
      // The CLI has stopped its old server and has not bound the replacement listener yet.
      record(url, { type: 'backend-unreachable' });
      throw new TypeError('Failed to fetch');
    }
    if (
      label.startsWith('plan283-production-upgrade-') &&
      (await (await caches.open('zerospin-test-offline')).match(url.origin))
    ) {
      throw new TypeError('Failed to fetch');
    }
    return label.startsWith('plan283-')
      ? newHttpBatchRpcResponse(
          request,
          gateway(url, {
            record: event => record(url, event),
            systemStarting: () => {
              if (
                !label.startsWith('plan283-dev-reset-') ||
                (label.startsWith('plan283-dev-reset-live-') &&
                  !cleans.has(label))
              ) {
                return false;
              }
              const count = startupReplies.get(label) ?? 0;
              if (count >= 2) return false;
              startupReplies.set(label, count + 1);
              record(url, { type: 'system-starting' });
              return true;
            },
            raceRegistration: () => label.startsWith('plan283-dev-reset-live-'),
            historyReplaced: () =>
              !label.startsWith('plan283-dev-reset-live-') || cleans.has(label),
            waitForSnapshot: () =>
              snapshotHolds.get(label)?.promise ?? Promise.resolve(),
          }),
        )
      : originalFetch(input, init);
  };
  class RecoverySocket extends EventTarget implements WebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    binaryType: BinaryType = 'blob';
    bufferedAmount = 0;
    extensions = '';
    protocol = '';
    readyState: WebSocket['readyState'] = 0;
    url: string;
    onclose: WebSocket['onclose'] = null;
    onerror: WebSocket['onerror'] = null;
    onmessage: WebSocket['onmessage'] = null;
    onopen: WebSocket['onopen'] = null;
    private lastResume: IHostRecoveryMessage | undefined;

    constructor(url: string | URL, _protocols?: string | string[]) {
      super();
      this.url = String(url);
      activeSockets.add(this);
      queueMicrotask(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this.dispatchEvent(new Event('open'));
      });
    }

    close() {
      activeSockets.delete(this);
      if (this.readyState === 3) return;
      this.readyState = 3;
      queueMicrotask(() => this.dispatchEvent(new CloseEvent('close')));
    }

    accept(): void {
      throw new Error(
        'Browser recovery fixture does not accept server WebSockets',
      );
    }

    serializeAttachment(_attachment: unknown): void {
      throw new Error(
        'Browser recovery fixture has no server attachment storage',
      );
    }

    deserializeAttachment(): unknown {
      throw new Error(
        'Browser recovery fixture has no server attachment storage',
      );
    }

    private checkpointConflict(message: IHostRecoveryMessage) {
      if (message.serviceIndex !== undefined) {
        return {
          type: 'state-required',
          reason: 'checkpoint-conflict',
          requested: {
            serviceIndex: message.serviceIndex,
            dispositionChainHash: message.dispositionChainHash,
          },
          retainedDispositionChainHash: '1'.repeat(64),
          current: { serviceIndex: 0, dispositionChainHash: '0'.repeat(64) },
        };
      }
      return {
        type: 'state-required',
        reason: 'checkpoint-conflict',
        requested: {
          aggregateIndex: message.aggregateIndex ?? 0,
          dispositionChainHash: message.dispositionChainHash,
        },
        retainedDispositionChainHash: '1'.repeat(64),
        current: { aggregateIndex: 0, dispositionChainHash: '0'.repeat(64) },
      };
    }

    invalidate() {
      const message = this.lastResume;
      if (message === undefined || this.readyState !== 1) return;
      queueMicrotask(() => {
        if (this.readyState === 1) {
          this.dispatchEvent(
            new MessageEvent('message', {
              data: JSON.stringify(this.checkpointConflict(message)),
            }),
          );
        }
      });
    }

    send(data: string | Blob | ArrayBuffer | ArrayBufferView) {
      const message = Schema.decodeUnknownSync(
        Schema.fromJsonString(HostRecoveryMessageSchema),
      )(String(data));
      const url = new URL(this.url);
      const label =
        url.hostname === 'zerospin.qrk.localhost'
          ? (url.pathname.split('/')[2] ?? '')
          : url.hostname;
      let response: unknown;
      if (message.type === 'resume') {
        const count = (resumes.get(label) ?? 0) + 1;
        resumes.set(label, count);
        record(url, {
          type: 'resume',
          ...(message.nodeId === undefined ? {} : { nodeId: message.nodeId }),
        });
        const mode = label.split('-')[2];
        const reject =
          mode === 'bounded' ||
          (mode === 'retry' && count <= 3) ||
          (mode === 'preserve' && count === 1);
        this.lastResume = message;
        response = reject ? this.checkpointConflict(message) : reply(message);
        const missing = unobservedOutcomes.get(label);
        if (missing) {
          const indexName =
            message.serviceIndex === undefined
              ? 'aggregateIndex'
              : 'serviceIndex';
          response = [
            missing.frame,
            {
              type: 'replay-complete',
              [indexName]: missing.index,
              dispositionChainHash: missing.index
                .toString(16)
                .padStart(64, '0'),
              outcomeIndex: missing.index,
            },
          ];
          record(url, { type: 'replayed-outcome' });
        }
      } else {
        if (message.command !== undefined) {
          record(url, { type: 'push', id: message.command.id });
        }
        response = reply(message);
        if (
          label.startsWith('plan283-production-upgrade-') &&
          message.command &&
          Array.isArray(response)
        ) {
          const [admission, final] = response;
          if (!final || final.type !== 'commands') {
            throw new Error(
              'The fixture server did not finalize its admitted command',
            );
          }
          unobservedOutcomes.set(label, {
            frame: final,
            index: message.command.pushIndex,
          });
          response = [admission];
          record(url, { type: 'withheld-outcome', id: message.command.id });
        }
      }
      queueMicrotask(() => {
        if (this.readyState === 1) {
          for (const frame of Array.isArray(response) ? response : [response]) {
            this.dispatchEvent(
              new MessageEvent('message', { data: JSON.stringify(frame) }),
            );
          }
        }
      });
    }
  }
  globalThis.WebSocket = new Proxy(RecoverySocket, {
    construct(constructor, args: unknown[]) {
      const url = new URL(String(args[0]));
      const label =
        url.hostname === 'zerospin.qrk.localhost'
          ? (url.pathname.split('/')[2] ?? '')
          : url.hostname;
      return Reflect.construct(
        label.startsWith('plan283-') ? constructor : OriginalWebSocket,
        args,
      );
    },
  });
  return () => {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = OriginalWebSocket;
    for (const hold of snapshotHolds.values()) hold.resolve();
    for (const channel of channels.values()) channel.close();
  };
}

/** Observe request realms and retain the existing SharedWorker-only protocol view. */
export function observeHostRecovery(apiUrl: string) {
  const events: IHostRecoveryEvent[] = [];
  const allEvents: IHostRecoveryEvent[] = [];
  const url = new URL(apiUrl);
  const label =
    url.hostname === 'zerospin.qrk.localhost'
      ? (url.pathname.split('/')[2] ?? '')
      : url.hostname;
  const channel = new BroadcastChannel(`zerospin-plan283:${label}`);
  const changed = new Set<() => void>();
  channel.onmessage = event => {
    const entry = Schema.decodeUnknownSync(
      Schema.Struct({
        type: Schema.String,
        worker: Schema.Boolean,
        nodeId: Schema.optional(Schema.NullOr(Schema.String)),
        id: Schema.optional(Schema.String),
      }),
    )(event.data);
    allEvents.push(entry);
    if (entry.worker) events.push(entry);
    for (const notify of changed) notify();
  };
  return {
    events,
    allEvents,
    waitFor(predicate: () => boolean) {
      if (predicate()) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          changed.delete(notify);
          reject(
            new Error(
              'Recovery protocol observation did not arrive: ' +
                JSON.stringify(events),
            ),
          );
        }, 10000);
        const notify = () => {
          if (!predicate()) return;
          clearTimeout(timeout);
          changed.delete(notify);
          resolve();
        };
        changed.add(notify);
      });
    },
    close() {
      channel.close();
    },
  };
}

const previousDevHistory = {
  systemId: 'host-fixture',
  id: '5db721d1-a567-4ff7-8274-0f55a03a16e2',
  replaced: [],
};
const cleanDevHistory = {
  systemId: 'host-fixture',
  id: 'da5f261d-178a-4ef6-bc16-610be66507bc',
  replaced: [previousDevHistory.id],
};

export function installAggregateRecoveryBackend(
  finalize: boolean | 'retry-final' = false,
) {
  const registered = new Set<string>();
  let registrationRaced = false;
  const nextCleanHistory = {
    ...cleanDevHistory,
    id: '0df14e4a-77e3-4c3b-839d-d673d9b6c40a',
    replaced: [...cleanDevHistory.replaced, cleanDevHistory.id],
  };
  class Session extends RpcTarget {
    constructor(
      readonly claims: typeof definition.claimsSchema.Type,
      readonly environment: 'dev' | 'production',
      readonly observation: IHostBackendObservation,
      readonly localReset: boolean,
    ) {
      super();
    }

    registerNode(input: {
      args: readonly [
        { nodeId: string; create: boolean; developmentHistoryId?: string },
      ];
    }) {
      const { nodeId, create } = input.args[0];
      if (
        create &&
        !registrationRaced &&
        this.observation.raceRegistration() &&
        input.args[0].developmentHistoryId === cleanDevHistory.id
      ) {
        // The first successor snapshot was valid, then a second clean won before registration.
        registrationRaced = true;
        registered.clear();
        this.observation.record({ type: 'registration-raced', nodeId });
      }
      const currentHistory = registrationRaced
        ? nextCleanHistory
        : cleanDevHistory;
      if (
        this.localReset &&
        this.observation.historyReplaced() &&
        input.args[0].developmentHistoryId !== currentHistory.id
      ) {
        return {
          link: null,
          result: {
            _tag: 'Failure' as const,
            failure: {
              _tag: 'ZerospinError',
              code: 'node-development-history-mismatch',
              message: 'The local System history changed.',
              status: null,
              extra: null,
              cause: null,
            },
          },
        };
      }
      this.observation.record({
        type: create ? 'register-new' : 'register-existing',
        nodeId,
      });
      if (
        this.localReset &&
        create &&
        input.args[0].developmentHistoryId === currentHistory.id
      ) {
        registered.add(nodeId);
      }
      return {
        link: null,
        result: {
          _tag: 'Success' as const,
          success: !this.localReset
            ? 'not-local'
            : !this.observation.historyReplaced() || registered.has(nodeId)
              ? 'registered'
              : 'missing',
        },
      };
    }

    async getSnapshot(input: { args: readonly [{ nodeId: string | null }] }) {
      this.observation.record({
        type: 'snapshot',
        nodeId: input.args[0].nodeId,
      });
      await this.observation.waitForSnapshot();
      if (this.localReset && this.observation.systemStarting()) {
        return {
          link: null,
          result: {
            _tag: 'Failure' as const,
            failure: {
              _tag: 'ZerospinError',
              code: 'node-development-system-starting',
              message: 'The local development System is starting.',
              status: 503,
              cause: null,
              extra: null,
            },
          },
        };
      }
      return {
        link: null,
        result: {
          _tag: 'Success',
          success: {
            environment: this.environment,
            ...(this.localReset
              ? {
                  developmentHistory: this.observation.historyReplaced()
                    ? registrationRaced
                      ? nextCleanHistory
                      : cleanDevHistory
                    : previousDevHistory,
                }
              : {}),
            aggregateId: this.claims.aggregateId,
            aggregateName: definition.aggregateName,
            aggregateVersion: definition.aggregateVersion,
            actorName: definition.actorName,
            actorVersion: definition.actorVersion,
            sessionName: definition.sessionName,
            claims: this.claims,
            aggregateIndex: 0,
            dispositionChainHash: '0'.repeat(64),
            resolvedThrough: 0,
            resources: [
              {
                modelName: 'counter',
                version: 1,
                id: 'cnt_host',
                amount: 0,
                createdAt: new Date('2026-10-27T00:00:00.000Z'),
                updatedAt: new Date('2026-10-27T00:00:00.000Z'),
              },
            ],
          },
        },
      };
    }

    createWebSocketTicket() {
      this.observation.record({ type: 'ticket' });
      return {
        link: null,
        result: { _tag: 'Success', success: { ticket: 'fixture' } },
      };
    }
  }
  class AuthenticatedActor extends RpcTarget {
    constructor(
      readonly claims: typeof definition.claimsSchema.Type,
      readonly environment: 'dev' | 'production',
      readonly observation: IHostBackendObservation,
      readonly localReset: boolean,
    ) {
      super();
    }

    openSession() {
      return new Session(
        this.claims,
        this.environment,
        this.observation,
        this.localReset,
      );
    }
  }
  class Aggregate extends RpcTarget {
    constructor(
      readonly environment: 'dev' | 'production',
      readonly observation: IHostBackendObservation,
      readonly localReset: boolean,
    ) {
      super();
    }

    authenticate(request: IAggregateAuthenticationRequest) {
      const credentials = Schema.decodeUnknownSync(
        Schema.Struct({ token: Schema.String }),
      )(request.credentials);
      const claims = Schema.decodeUnknownSync(
        Schema.fromJsonString(definition.claimsSchema),
      )(credentials.token);
      return new AuthenticatedActor(
        claims,
        this.environment,
        this.observation,
        this.localReset,
      );
    }
  }
  class Gateway extends RpcTarget {
    constructor(
      readonly environment: 'dev' | 'production',
      readonly observation: IHostBackendObservation,
      readonly localReset: boolean,
    ) {
      super();
    }

    aggregate() {
      return new Aggregate(this.environment, this.observation, this.localReset);
    }
  }
  const committed = new Map<string, unknown>();
  let resumeCount = 0;
  const restore = installHostRecoveryTransport({
    gateway: (url, observation) =>
      new Gateway(
        url.hostname.includes('-dev-') ||
          url.pathname.startsWith('/__zerospin-test__/plan283-dev-reset-')
          ? 'dev'
          : 'production',
        observation,
        url.hostname === 'zerospin.qrk.localhost' &&
          url.pathname.startsWith('/__zerospin-test__/plan283-dev-reset-'),
      ),
    reply(message) {
      if (message.type === 'resume') {
        resumeCount += 1;
        if (finalize === 'retry-final' && resumeCount > 1) {
          return [
            // A replayed final is an exact retry, not a second execution.
            {
              type: 'commands',
              commands: [...committed.values(), ...committed.values()],
            },
            {
              type: 'replay-complete',
              aggregateIndex: committed.size,
              dispositionChainHash: committed.size
                .toString(16)
                .padStart(64, '0'),
              outcomeIndex: committed.size,
            },
          ];
        }
        return {
          type: 'replay-complete',
          aggregateIndex: finalize ? (message.aggregateIndex ?? 0) : 0,
          dispositionChainHash: finalize
            ? message.dispositionChainHash
            : '0'.repeat(64),
          outcomeIndex: finalize ? (message.outcomeIndex ?? 0) : 0,
        };
      }
      const command = message.command;
      if (command === undefined) {
        throw new Error('Fixture push omitted its command');
      }
      const final = {
        id: command.id,
        commandName: 'increment',
        aggregateIndex: command.pushIndex,
        dispositionChainHash: command.pushIndex.toString(16).padStart(64, '0'),
        failure: null,
        delta: {
          upserted: [
            {
              modelName: 'counter',
              version: 1,
              id: 'cnt_host',
              amount: command.pushIndex,
              createdAt: '2026-10-27T00:00:00.000Z',
              updatedAt: '2026-10-27T01:00:00.000Z',
            },
          ],
          deleted: [],
        },
      };
      if (finalize && !committed.has(command.id)) {
        committed.set(command.id, final);
      }
      return [
        {
          type: 'aggregateCommandAdmission',
          id: command.id,
          pushIndex: command.pushIndex,
        },
        ...(finalize === true || (finalize === 'retry-final' && resumeCount > 1)
          ? [{ type: 'commands', commands: [final] }]
          : []),
      ];
    },
  });
  return Object.assign(restore, { committedCount: () => committed.size });
}

/** Seed only a fresh fixture, then damage its schema or retain one original for recovery. */
export async function prepareAggregateRecovery(
  uniqueRunId: string,
  mode:
    | 'preserve'
    | 'fallback'
    | 'unreadable'
    | 'bounded'
    | 'retry'
    | 'live'
    | 'live-reset'
    | 'reset',
  environment: 'dev' | 'production' = 'production',
) {
  if ((mode === 'reset' || mode === 'live-reset') && environment !== 'dev') {
    throw new Error(
      'The reset fixture requires the local development environment',
    );
  }
  const prepared = await prepare(
    uniqueRunId,
    mode === 'reset' || mode === 'live-reset'
      ? `https://zerospin.qrk.localhost/__zerospin-test__/plan283-dev-reset-${mode === 'live-reset' ? 'live-' : ''}${uniqueRunId}`
      : `https://plan283-${environment}-${mode}-${uniqueRunId}.invalid`,
  );
  const lease = makeNodeNamespaceLease(prepared.namespace);
  await lease.ready;
  const nodeDefinition = await makeAggregateNodeDefinition(
    prepared.request,
    prepared.claims,
    prepared.aggregateId,
  );
  const execution = await openAggregateNodeExecution(
    { sessionDefinition: definition },
    nodeDefinition,
  );
  let storage: Awaited<ReturnType<typeof openWaSqliteNodeStorage>> | undefined;
  let node: AggregateNode | undefined;
  try {
    storage = await openWaSqliteNodeStorage({
      namespace: prepared.namespace,
      sqliteWasmUrl,
      create: false,
    });
    node = new AggregateNode(
      storage.db,
      nodeDefinition,
      execution.view,
      definition,
    );
    await node.initializeConnectedStorage(false);
    await node.setPushPaused(false);
    await node.accept(input(prepared));
    if (mode === 'reset' || mode === 'unreadable' || mode === 'fallback') {
      makeStagedCommandJournal({
        prefix: 'aggregate',
        identityKey: prepared.key,
        nodeId: prepared.nodeId,
        decode: Schema.decodeUnknownSync(AggregateNodeCommandSchema),
      }).write(input(prepared, 2));
    }
    if (mode === 'fallback') {
      await storage.db.run(sql`PRAGMA user_version = 2147483646`);
    }
    if (mode === 'reset' || mode === 'live-reset') {
      await aggregateSessionDiscovery.update(
        prepared.request,
        prepared.claims,
        prepared.aggregateId,
        await aggregateSessionDiscovery.revision(),
        true,
        previousDevHistory,
      );
    }
    if (mode === 'reset' || mode === 'unreadable') {
      // The disposable catalog is unreadable even to ordinary SQLite queries.
      await storage.db.run(sql`PRAGMA writable_schema = ON`);
      await storage.db.run(
        sql`UPDATE sqlite_master SET sql = 'CREATE TABLE counter (' WHERE name = 'counter'`,
      );
      await storage.db.run(sql`PRAGMA schema_version = 2147483646`);
      await storage.db.run(sql`PRAGMA writable_schema = OFF`);
    }
  } finally {
    await closeNodeStorageOwner({
      ...(node === undefined ? {} : { node }),
      runtime: { dispose: execution.close },
      ...(storage === undefined ? {} : { storage }),
      namespace: lease,
    });
  }
  return prepared;
}

/** Simulate an unreadable old copy and a backend restart while the public session still owns the Node. */
async function cleanLiveHost(
  prepared: { namespace: string; request: { apiUrl: string } },
  wasm: string,
) {
  const url = new URL(prepared.request.apiUrl);
  const label = url.pathname.split('/')[2];
  if (
    url.hostname !== 'zerospin.qrk.localhost' ||
    !label?.startsWith('plan283-dev-reset-live-')
  ) {
    throw new Error('Live clean requires an isolated development fixture');
  }
  const storage = await openWaSqliteNodeStorage({
    namespace: prepared.namespace,
    sqliteWasmUrl: wasm,
    create: false,
  });
  try {
    await storage.db.run(sql`PRAGMA writable_schema = ON`);
    await storage.db.run(
      sql`UPDATE sqlite_master SET sql = 'CREATE TABLE counter (' WHERE name = 'counter'`,
    );
    await storage.db.run(sql`PRAGMA schema_version = 2147483646`);
    await storage.db.run(sql`PRAGMA writable_schema = OFF`);
    const readable = await storage.db.values(sql`SELECT * FROM counter`).then(
      () => true,
      () => false,
    );
    if (readable) {
      throw new Error('The live fixture still permits normal reads');
    }
  } finally {
    await storage.close();
  }
  const channel = new BroadcastChannel(`zerospin-plan283:${label}`);
  channel.postMessage({ type: 'replace-history', worker: false });
  channel.close();
}
/** Exercise an unreadable old file, a real socket reconnect, and one command through the same public session. */
export async function verifyLiveHostClean(props: {
  prepared: { namespace: string; nodeId: string; request: { apiUrl: string } };
  wasm: string;
  observed: ReturnType<typeof observeHostRecovery>;
  read(): { nodeId: string | undefined; amount: number | undefined };
  subscribe(notify: () => void): () => void;
  stage(): boolean;
}) {
  const { prepared, observed } = props;
  const oldNodeId = prepared.nodeId;
  if (props.read().nodeId !== oldNodeId) {
    throw new Error('The live owner changed before the clean');
  }
  const oldCommand = makeNodeCommandId(oldNodeId, 1);
  await observed.waitFor(() =>
    observed.events.some(
      event => event.type === 'push' && event.id === oldCommand,
    ),
  );
  await cleanLiveHost(prepared, props.wasm);
  await observed.waitFor(() =>
    observed.events.some(
      event => event.type === 'resume' && event.nodeId !== oldNodeId,
    ),
  );
  await new Promise<void>((resolve, reject) => {
    const check = () => {
      const id = props.read().nodeId;
      if (id === undefined || id === oldNodeId) return;
      unsubscribe();
      clearTimeout(timeout);
      resolve();
    };
    const unsubscribe = props.subscribe(check);
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('The replacement was not published to the open tab'));
    }, 10000);
    check();
  });
  const { nodeId, amount } = props.read();
  if (nodeId === undefined || nodeId === oldNodeId || amount !== 0) {
    throw new Error('The open session did not switch to its clean baseline');
  }
  if (!props.stage()) {
    throw new Error('The open session cannot stage a new command');
  }
  const newCommand = makeNodeCommandId(nodeId, 1);
  await observed.waitFor(() =>
    observed.events.some(
      event => event.type === 'push' && event.id === newCommand,
    ),
  );
  if (
    observed.events.filter(event => event.type === 'backend-unreachable')
      .length !== 1
  ) {
    throw new Error(
      'The live owner did not reauthenticate after the backend listener returned',
    );
  }
  if (
    observed.events.filter(event => event.type === 'system-starting').length !==
    2
  ) {
    throw new Error(
      'The live owner did not wait through both readiness responses',
    );
  }
  const raced = observed.events.findIndex(
    event => event.type === 'registration-raced',
  );
  if (
    raced === -1 ||
    !observed.events
      .slice(raced + 1)
      .some(event => event.type === 'snapshot') ||
    !observed.events
      .slice(raced + 1)
      .some(event => event.type === 'register-new' && event.nodeId === nodeId)
  ) {
    throw new Error(
      'A clean during registration did not reauthenticate before registering the final producer',
    );
  }
  const pivot = observed.events.findIndex(
    event => event.type === 'history-replaced',
  );
  if (
    pivot < 0 ||
    observed.events
      .slice(pivot)
      .some(
        event =>
          (event.type === 'push' && event.id === oldCommand) ||
          (event.type === 'register-new' && event.nodeId === oldNodeId),
      )
  ) {
    throw new Error(
      'The open session resubmitted its old command after the clean',
    );
  }
  return {
    mode: 'live-reset',
    originalNodeId: oldNodeId,
    nodeId,
    protocol: observed.events,
  };
}
/** Ask only an opt-in live fixture's active SharedWorker socket to reject its current checkpoint. */
export function invalidateHostRecovery(apiUrl: string) {
  const url = new URL(apiUrl);
  if (
    !url.hostname.startsWith('plan283-') ||
    url.hostname.split('-')[2] !== 'live'
  ) {
    throw new Error(
      'Live invalidation requires a disposable plan283 live fixture origin',
    );
  }
  const channel = new BroadcastChannel(`zerospin-plan283:${url.hostname}`);
  channel.postMessage({ type: 'invalidate', worker: false });
  channel.close();
}

/** Pause only the disposable origin's authenticated snapshot responses in its real SharedWorker. */
export function setHostSnapshotsHeld(apiUrl: string, held: boolean) {
  const url = new URL(apiUrl);
  if (!url.hostname.startsWith('plan283-')) {
    throw new Error('Snapshot controls require a disposable backend origin');
  }
  const channel = new BroadcastChannel(`zerospin-plan283:${url.hostname}`);
  channel.postMessage({
    type: held ? 'hold-snapshots' : 'release-snapshots',
    worker: false,
  });
  channel.close();
}

/** Wait for the real namespace lease queue rather than a timing guess. */
export async function waitForHostNamespaceWait(namespace: string) {
  const deadline = performance.now() + 10000;
  while (performance.now() < deadline) {
    const locks = await navigator.locks.query();
    if (
      locks.pending?.some(
        lock =>
          lock.name === `${namespace}:lifetime` && lock.mode === 'exclusive',
      )
    ) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(
    'Identity namespace acquisition did not wait for its prior owner',
  );
}

/** Exercise real standalone replacement only in a newly created disposable namespace. */
export async function verifyStandaloneResetNotice(
  runId: string,
  workerUrl: string,
  failReplacement = false,
) {
  if (!/^plan287-[a-zA-Z0-9-]+$/.test(runId)) {
    throw new Error('Standalone recovery fixture requires a unique plan287 ID');
  }
  const path = `/${runId}`;
  const claims = { aggregateId: runId };
  const key = await standaloneStorageKey(standaloneDefinition, path);
  const namespace = `/zerospin/standalone/${key}`;
  if ((await indexedDB.databases()).some(db => db.name === namespace)) {
    throw new Error(
      'Standalone recovery fixture refuses an existing namespace',
    );
  }
  const seed: typeof counter.resourceJsonCodec.Type = {
    modelName: 'counter',
    version: 1,
    id: 'cnt_host',
    amount: 7,
    createdAt: new Date('2026-11-02T00:00:00.000Z'),
    updatedAt: new Date('2026-11-02T00:00:00.000Z'),
  };
  const lease = makeNodeNamespaceLease(namespace);
  await lease.ready;
  let storage = await openWaSqliteNodeStorage({
    namespace,
    sqliteWasmUrl,
    create: true,
  });
  const runtime = makeStandaloneWorkerRuntime({
    sessionKey: key,
    execution: { sessionDefinition: standaloneDefinition },
    ownership: lease.ready,
    openStorage: async () => storage,
  });
  try {
    await runtime.attach({
      sessionName: standaloneDefinition.sessionName,
      pattern: path,
      path,
      claims,
      resources: [Schema.encodeSync(counter.resourceJsonCodec)(seed)],
    });
    await runtime.stop();
    await runtime.closeStorage();
    // Reopen after owner cleanup so corruption cannot race retained Node work.
    storage = await openWaSqliteNodeStorage({
      namespace,
      sqliteWasmUrl,
      create: false,
    });
    await storage.db
      .update(aggregateNodeMetadata)
      .set({ dispositionChainHash: 'broken' });
    if (failReplacement) {
      await storage.db.run(sql`CREATE TRIGGER standalone_reset_fixture_failure
        BEFORE INSERT ON nodeMetadata BEGIN
          SELECT RAISE(ABORT, 'standalone fixture replacement refused');
        END`);
    }
    await storage.close();
    storage = await openWaSqliteNodeStorage({
      namespace,
      sqliteWasmUrl,
      create: false,
    });
    const retained = await storage.db
      .select()
      .from(aggregateNodeMetadata)
      .limit(2);
    if (
      retained.length !== 1 ||
      retained[0]?.aggregateId !== runId ||
      retained[0]?.dispositionChainHash !== 'broken'
    ) {
      throw new Error('Standalone fixture corruption was not persisted');
    }
    let unreadable = false;
    try {
      await readAggregateNodeMetadata(storage.db);
    } catch (error) {
      if (
        !isZerospinError(error) ||
        error.code !== 'node-execution-checkpoint-invalid'
      ) {
        throw error;
      }
      unreadable = true;
    }
    if (!unreadable) {
      throw new Error('Standalone fixture retained state remained readable');
    }
  } finally {
    await closeNodeStorageOwner({
      connections: { close: runtime.stop },
      node: { close: runtime.closeStorage },
      storage,
      namespace: lease,
    });
  }

  const session = makeStandaloneAggregateSession({
    definition: standaloneDefinition,
    sharedWorkerUrl: workerUrl,
    claims,
    backupPath: RoutePattern.parse(path),
    resources: { counter: [seed] },
    discardUnrestorable: true,
  });
  const notices: { code: string; message: string; status: string }[] = [];
  const received = Promise.withResolvers<void>();
  const unsubscribe = session.store.subscribe((state, previous) => {
    if (
      state.failure !== null &&
      state.failure !== previous.failure &&
      state.status !== 'failed'
    ) {
      notices.push({
        code: state.failure.code,
        message: state.failure.message,
        status: state.status,
      });
      received.resolve();
    }
  });
  try {
    if (failReplacement) {
      let rejected = false;
      try {
        await session.initialize();
      } catch {
        rejected = true;
      }
      if (!rejected || session.store.getState().status !== 'failed') {
        throw new Error(
          'A failed standalone replacement did not stay terminal',
        );
      }
      if (notices.length !== 0) {
        throw new Error('Failed standalone replacement reported reset success');
      }
      return { failedReplacement: true, status: 'failed', notices };
    }
    await session.initialize();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        received.promise,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(
            () =>
              reject(new Error('Standalone reset notice was not delivered')),
            5000,
          );
        }),
      ]);
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
    }
    if (
      notices.length !== 1 ||
      notices[0]?.code !== 'standalone-state-reset' ||
      notices[0]?.message !==
        'Your saved local document could not be restored and was reset to its initial state.' ||
      session.store.getState().status !== 'ready'
    ) {
      throw new Error(
        'Standalone reset notice changed code, message, or readiness',
      );
    }
    const initialized = session.store.getState().initialized;
    if (initialized === null) {
      throw new Error('Standalone replica did not initialize');
    }
    const table = makeDrizzleSchemaFromTable(counter.table);
    const row = initialized.db.select().from(table).get();
    if (row?.amount !== 7) {
      throw new Error('Standalone replacement lost its seed');
    }
    const staged = stageAggregateSessionCommand({
      session,
      contractName: 'increment',
      payload: {},
    });
    if (
      staged._tag !== 'Success' ||
      staged.success.stagingOutcome.result !== 8
    ) {
      throw new Error('Standalone replacement did not remain usable');
    }
    return {
      failedReplacement: false,
      status: 'ready',
      notices,
      stagedAmount: 8,
    };
  } finally {
    unsubscribe();
    await session.dispose();
  }
}

type IMigrationHost = {
  retain(): Promise<unknown>;
  snapshot(): Promise<{
    state: { synchronization: string };
    pushIndex: number;
    outcomeIndex: number;
    metadata: {
      nodeId: string;
      pushPaused: boolean;
      admittedThroughPushIndex: number;
    };
    commandCoverage: readonly {
      nodeId: string | null;
      pushIndex: number | null;
      resolution: unknown;
    }[];
  }>;
  setPushPaused(paused: boolean): Promise<unknown>;
  close(): Promise<void>;
};

/** Open the same database from separately built worker releases; each release supplies its own normal attachment. */
export async function verifyBrowserStorageUpgrade(props: {
  prepared: { nodeId: string; namespace: string; request: { apiUrl: string } };
  old(): Promise<IMigrationHost>;
  current(): Promise<IMigrationHost>;
  inspect(): ReturnType<typeof inspect>;
}) {
  const { prepared } = props;
  const backend = new URL(prepared.request.apiUrl).origin;
  const offline = await caches.open('zerospin-test-offline');
  const observed = observeHostRecovery(backend);
  let old: IMigrationHost | undefined;
  let current: IMigrationHost | undefined;
  try {
    old = await props.old();
    await old.setPushPaused(true);
    await offline.put(backend, new Response('offline'));
    await old.retain();
    const written = await old.snapshot();
    if (
      written.pushIndex !== 1 ||
      written.metadata.admittedThroughPushIndex !== 0
    ) {
      throw new Error('The first release did not retain its pending command');
    }
    await old.close();
    old = undefined;
    const before = await props.inspect();
    const beforeMigration = observed.events.length;
    old = await props.old();
    const next = props.current();
    void next.catch(() => undefined);
    await waitForHostNamespaceWait(prepared.namespace);
    await old.close();
    old = undefined;
    current = await next;
    const pending = await current.snapshot();
    if (
      pending.pushIndex !== 1 ||
      pending.outcomeIndex !== 0 ||
      pending.metadata.nodeId !== prepared.nodeId ||
      !pending.metadata.pushPaused ||
      pending.commandCoverage[0]?.nodeId !== prepared.nodeId ||
      pending.commandCoverage[0]?.resolution !== null
    ) {
      throw new Error(
        'Offline migration changed the producer or its pending original',
      );
    }
    await current.close();
    current = undefined;
    const migrated = await props.inspect();
    if (
      Number(migrated.version[0]?.[0]) <= Number(before.version[0]?.[0]) ||
      migrated.ledger.length <= before.ledger.length ||
      JSON.stringify(migrated.schema) === JSON.stringify(before.schema) ||
      JSON.stringify(migrated.commands) !== JSON.stringify(before.commands) ||
      JSON.stringify(migrated.metadata) !== JSON.stringify(before.metadata) ||
      observed.events
        .slice(beforeMigration)
        .some(event => event.type === 'push' || event.type === 'resume')
    ) {
      throw new Error(
        'Migration must install its declared schema and preserve every queued byte offline',
      );
    }

    const error = await props.old().then(
      attachment => {
        old = attachment;
        throw new Error('Older worker opened a newer database');
      },
      cause => cause as unknown,
    );
    if (
      Schema.decodeUnknownOption(
        Schema.Struct({ code: Schema.Literal('node-storage-upgrade-newer') }),
      )(error)._tag === 'None'
    ) {
      throw error;
    }
    if (JSON.stringify(await props.inspect()) !== JSON.stringify(migrated)) {
      throw new Error('Returning older worker changed the migrated database');
    }
    await offline.delete(backend);
    current = await props.current();
    await current.setPushPaused(false);
    await observed.waitFor(() =>
      observed.events.some(event => event.type === 'withheld-outcome'),
    );
    // The server finalized the original but the first socket delivered only its admission.
    const admissionDeadline = performance.now() + 10000;
    while ((await current.snapshot()).metadata.admittedThroughPushIndex !== 1) {
      if (performance.now() > admissionDeadline) {
        throw new Error('The original admission did not arrive');
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if ((await current.snapshot()).outcomeIndex !== 0) {
      throw new Error('The supposedly missed outcome was delivered');
    }
    const channel = new BroadcastChannel(
      `zerospin-plan283:${new URL(backend).hostname}`,
    );
    channel.postMessage({ type: 'drop-socket', worker: false });
    await observed.waitFor(() =>
      observed.events.some(event => event.type === 'socket-dropped'),
    );
    const disconnectDeadline = performance.now() + 10000;
    while ((await current.snapshot()).state.synchronization !== 'offline') {
      if (performance.now() > disconnectDeadline) {
        throw new Error('Socket disconnection was not observed');
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    channel.postMessage({ type: 'restore-network', worker: false });
    channel.close();
    const deadline = performance.now() + 15000;
    for (;;) {
      const snapshot = await current.snapshot();
      if (snapshot.outcomeIndex === 1) {
        const original = snapshot.commandCoverage[0];
        const pushes = observed.events.filter(event => event.type === 'push');
        if (
          snapshot.metadata.nodeId !== prepared.nodeId ||
          snapshot.pushIndex !== 1 ||
          snapshot.metadata.admittedThroughPushIndex !== 1 ||
          original?.pushIndex !== 1 ||
          original.nodeId !== prepared.nodeId ||
          original.resolution === null ||
          observed.events.filter(event => event.type === 'replayed-outcome')
            .length !== 1 ||
          pushes.length !== 1 ||
          pushes[0]?.id !== makeNodeCommandId(prepared.nodeId, 1)
        ) {
          throw new Error(
            'Reconnect did not settle exactly the original command',
          );
        }
        return {
          nodeId: prepared.nodeId,
          before: before.version,
          after: migrated.version,
          pushes: pushes.length,
          outcome: snapshot.outcomeIndex,
        };
      }
      if (performance.now() > deadline) {
        throw new Error(
          'Reconnect did not recover the original outcome: ' +
            JSON.stringify(observed.events),
        );
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  } finally {
    await current?.close();
    await old?.close();
    await offline.delete(backend);
    observed.close();
  }
}

export async function connectAggregateMigrationHost(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
): Promise<IMigrationHost> {
  const owner = await connect(prepared, workerUrl);
  return {
    retain: () => owner.retain(),
    snapshot: () => owner.api.snapshot({ pendingCommands: [input(prepared)] }),
    setPushPaused: (pushPaused: boolean) =>
      owner.api.setPushPaused({ pushPaused }),
    close: owner.close,
  };
}
