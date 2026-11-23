import { acquireWorkerPort } from '@zerospin/browser/Node/acquireWorkerPort';
import { assertWorkerArtifact } from '@zerospin/browser/Node/assertWorkerArtifact';
import { closeNodeStorageOwner } from '@zerospin/browser/Node/closeNodeStorageOwner';
import { makeNodeNamespaceLease } from '@zerospin/browser/Node/makeNodeNamespaceLease';
import { openServiceNodeExecution } from '@zerospin/browser/Node/nodeExecution';
import { makeServiceNodeNamespace } from '@zerospin/browser/Node/nodeStorageNamespaces';
import { openWaSqliteNodeStorage } from '@zerospin/browser/Node/openWaSqliteNodeStorage';
import { publicRpcError } from '@zerospin/browser/Node/publicRpcError';
import { makeServiceNodeDefinition } from '@zerospin/browser/ServiceNode/makeServiceNodeDefinition';
import {
  makeServiceSharedWorkerRoutingKey,
  type IServiceNodeRequest,
} from '@zerospin/browser/ServiceNode/serviceNodeRequest';
import { serviceSessionDiscovery } from '@zerospin/browser/ServiceNode/serviceSessionDiscovery';
import type { ServiceSharedWorkerApi } from '@zerospin/browser/ServiceNode/ServiceSharedWorkerApi';
import { makeServiceSharedWorkerName } from '@zerospin/browser/sharedWorkerNames';
import { sharedWorkerVersion } from '@zerospin/browser/sharedWorkerVersion';
import { makeStagedCommandJournal } from '@zerospin/browser/stagedCommandJournal/makeStagedCommandJournal';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { ServiceNode } from '@zerospin/core/ServiceNode/ServiceNode';
import { ServiceNodeCommandSchema } from '@zerospin/core/ServiceNode/ServiceNodeCommandSchema';
import type { IServiceNodeCommand } from '@zerospin/core/ServiceNode/types';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { primitives } from '@zerospin/shapes';
import { newMessagePortRpcSession, RpcStub, RpcTarget } from 'capnweb';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  installHostRecoveryTransport,
  type IHostBackendObservation,
} from './aggregate-host.browser.ts';

const counter = makeModelVersion(
  defineModel({ name: 'counter', abbreviation: 'cnt' }),
  { version: 1, attributes: { amount: primitives.integer() }, indexes: [] },
);
const models = { counter };
const increment = makeServiceContractRelease(
  defineServiceContract('increment'),
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
    program: Effect.fn('serviceHost.increment')(function* ({ db, operations }) {
      const row = yield* findFirst({
        db,
        model: db.models.counter,
        where: { id: { eq: 'cnt_shared' } },
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

export const serviceHostDefinition = makeServiceSessionDefinition({
  systemName: 'plan234Host',
  serviceName: 'counter',
  serviceVersion: 1,
  actorName: 'member',
  actorVersion: 1,
  sessionName: 'counter',
  claimsSchema: Schema.Struct({
    memberId: Schema.String,
    authorization: Schema.Struct({ role: Schema.String }),
  }),
  models,
  contracts: { increment },
});
export const serviceHostWasmUrl = new URL(
  '../dist/sqlite.wasm',
  import.meta.url,
).href;

export interface IServiceHostPrepared {
  request: IServiceNodeRequest;
  claims: { memberId: string; authorization: { role: string } };
  revision: number;
  sessionKey: string;
  name: string;
  namespace: string;
  nodeId: string;
}

/** Seed a new test namespace; all subsequent model changes come from command replay. */
export async function prepareServiceHost(
  uniqueRunId: string,
  apiUrl = 'https://plan234-host.invalid',
): Promise<IServiceHostPrepared> {
  const claims = { memberId: uniqueRunId, authorization: { role: 'member' } };
  const request: IServiceNodeRequest = {
    apiUrl,
    publishableKey: 'pub_plan234_host',
    systemName: serviceHostDefinition.systemName,
    serviceName: serviceHostDefinition.serviceName,
    serviceVersion: serviceHostDefinition.serviceVersion,
    sessionName: serviceHostDefinition.sessionName,
    lock: makeServiceSessionLock(serviceHostDefinition),
  };
  const definition = await makeServiceNodeDefinition(request, claims);
  const key = await sessionKey(definition.identity);
  const name = makeServiceSharedWorkerName(
    await makeServiceSharedWorkerRoutingKey(request),
  );
  const storageNamespace = makeServiceNodeNamespace(key);
  const namespace = makeNodeNamespaceLease(storageNamespace);
  await namespace.ready;
  let storage: Awaited<ReturnType<typeof openWaSqliteNodeStorage>> | undefined;
  let execution:
    | Awaited<ReturnType<typeof openServiceNodeExecution>>
    | undefined;
  let node: ServiceNode | undefined;
  let nodeId: string;
  try {
    if (
      (await indexedDB.databases()).some(db => db.name === storageNamespace)
    ) {
      throw new Error('Host fixture requires a fresh test namespace');
    }
    storage = await openWaSqliteNodeStorage({
      namespace: storageNamespace,
      sqliteWasmUrl: serviceHostWasmUrl,
      create: true,
    });
    execution = await openServiceNodeExecution(
      { sessionDefinition: serviceHostDefinition },
      definition,
    );
    node = new ServiceNode(
      storage.db,
      definition,
      execution.view,
      serviceHostDefinition,
    );
    await node.initializeConnectedStorage(true);
    await node.initializeBaseline({
      serviceIndex: 0,
      dispositionChainHash: '0'.repeat(64),
      resolvedThrough: 0,
      resources: [
        {
          modelName: 'counter',
          version: 1,
          id: 'cnt_shared',
          createdAt: new Date('2026-10-27T00:00:00.000Z'),
          updatedAt: new Date('2026-10-27T00:00:00.000Z'),
          amount: 0,
        },
      ],
    });
    nodeId = (await node.snapshot()).metadata.nodeId;
  } finally {
    await closeNodeStorageOwner({
      ...(node === undefined ? {} : { node }),
      ...(execution === undefined
        ? {}
        : { runtime: { dispose: execution.close } }),
      ...(storage === undefined ? {} : { storage }),
      namespace,
    });
  }
  const revision = await serviceSessionDiscovery.revision();
  await serviceSessionDiscovery.update(request, claims, revision, true);
  return {
    request,
    claims,
    revision,
    sessionKey: key,
    name,
    namespace: storageNamespace,
    nodeId,
  };
}

/** Give only a newly seeded fixture an unsupported, nonzero schema stamp. */
export async function prepareServiceSchemaRefusal(uniqueRunId: string) {
  const prepared = await prepareServiceHost(uniqueRunId);
  const namespace = makeNodeNamespaceLease(prepared.namespace);
  let storage: Awaited<ReturnType<typeof openWaSqliteNodeStorage>> | undefined;
  try {
    await namespace.ready;
    storage = await openWaSqliteNodeStorage({
      namespace: prepared.namespace,
      sqliteWasmUrl: serviceHostWasmUrl,
      create: false,
    });
    await storage.db.run(sql`PRAGMA user_version = 2147483646`);
  } finally {
    await closeNodeStorageOwner({
      ...(storage === undefined ? {} : { storage }),
      namespace,
    });
  }
  return prepared;
}

export function serviceHostSubmission(
  prepared: IServiceHostPrepared,
  sessionIndex = 1,
): IServiceNodeCommand {
  return {
    id: null,
    nodeId: null,
    nodeIndex: null,
    pushIndex: null,
    sessionId: 'sesn_browser_host',
    sessionIndex,
    kind: 'actor',
    serviceName: serviceHostDefinition.serviceName,
    commandName: 'increment',
    contractVersion: 1,
    payload: '{}',
    actorName: serviceHostDefinition.actorName,
    actorVersion: serviceHostDefinition.actorVersion,
    sessionName: serviceHostDefinition.sessionName,
    claims: prepared.claims,
    stagingOutcome: {
      result: sessionIndex,
      completedAt: '2026-10-27T00:00:00.000Z',
    },
  };
}

/** Exercise the real worker port; unavailable networking may reopen its eligible retained identity. */
export async function connectServiceHost(
  prepared: IServiceHostPrepared,
  workerUrl: string,
  attachmentInput: unknown = {
    request: prepared.request,
    expectedClaims: prepared.claims,
  },
) {
  const controller = new AbortController();
  const acquired = await acquireWorkerPort({
    sharedWorkerUrl: workerUrl,
    name: makeServiceSharedWorkerName(
      await makeServiceSharedWorkerRoutingKey(prepared.request),
    ),
    signal: controller.signal,
    onError: () => controller.abort(),
  });
  let providerCalls = 0;
  const admission = new RpcStub(() => {
    providerCalls += 1;
    return Promise.resolve<IAdmissionRequest>({ claims: prepared.claims });
  });
  const api = newMessagePortRpcSession<ServiceSharedWorkerApi>(
    acquired.port,
    undefined,
    { onSendError: publicRpcError },
  );
  let closed = false;
  const release = () => {
    if (closed) return;
    closed = true;
    admission[Symbol.dispose]();
    api[Symbol.dispose]();
    acquired.close();
    controller.abort();
  };
  try {
    const workerReady = await api.ready();
    assertWorkerArtifact(acquired.artifactUrl, workerReady);
    if (workerReady.version !== sharedWorkerVersion) {
      throw new Error('Host worker version mismatch');
    }
    const attachment = await api.attach(attachmentInput, admission);
    return {
      api,
      attachment,
      workerReady,
      snapshot: () => attachment.snapshot(),
      async receive(command: IServiceNodeCommand) {
        const subscriber = await attachment.getStagedCommandSubscriber(
          prepared.nodeId,
        );
        try {
          return await subscriber.receive([command]);
        } finally {
          subscriber[Symbol.dispose]();
        }
      },
      get providerCalls() {
        return providerCalls;
      },
      async close() {
        try {
          await attachment.dispose();
        } finally {
          attachment[Symbol.dispose]();
          release();
        }
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}

export async function waitForServiceHostClose(prepared: IServiceHostPrepared) {
  await navigator.locks.request(
    `${prepared.namespace}:lifetime`,
    { mode: 'exclusive' },
    () => {},
  );
}

export async function inspectServiceHost(prepared: IServiceHostPrepared) {
  const namespace = makeNodeNamespaceLease(prepared.namespace);
  await namespace.ready;
  let storage: Awaited<ReturnType<typeof openWaSqliteNodeStorage>> | undefined;
  try {
    storage = await openWaSqliteNodeStorage({
      namespace: prepared.namespace,
      sqliteWasmUrl: serviceHostWasmUrl,
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
      namespace,
    });
  }
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

export function installServiceRecoveryBackend(finalize = false) {
  const registered = new Set<string>();
  let registrationRaced = false;
  const nextCleanHistory = {
    ...cleanDevHistory,
    id: '0df14e4a-77e3-4c3b-839d-d673d9b6c40a',
    replaced: [...cleanDevHistory.replaced, cleanDevHistory.id],
  };
  class Session extends RpcTarget {
    constructor(
      readonly claims: typeof serviceHostDefinition.claimsSchema.Type,
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
            serviceName: serviceHostDefinition.serviceName,
            serviceVersion: serviceHostDefinition.serviceVersion,
            actorName: serviceHostDefinition.actorName,
            actorVersion: serviceHostDefinition.actorVersion,
            sessionName: serviceHostDefinition.sessionName,
            claims: this.claims,
            serviceIndex: 0,
            dispositionChainHash: '0'.repeat(64),
            resolvedThrough: 0,
            resources: [
              {
                modelName: 'counter',
                version: 1,
                id: 'cnt_shared',
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
  class Admission extends RpcTarget {
    constructor(
      readonly claims: typeof serviceHostDefinition.claimsSchema.Type,
      readonly environment: 'dev' | 'production',
      readonly observation: IHostBackendObservation,
      readonly localReset: boolean,
    ) {
      super();
    }

    authorize() {
      return new Session(
        this.claims,
        this.environment,
        this.observation,
        this.localReset,
      );
    }
  }
  class Service extends RpcTarget {
    constructor(
      readonly environment: 'dev' | 'production',
      readonly observation: IHostBackendObservation,
      readonly localReset: boolean,
    ) {
      super();
    }

    admit(request: IAdmissionRequest) {
      const claims =
        request.claims ??
        Schema.decodeUnknownSync(
          Schema.fromJsonString(serviceHostDefinition.claimsSchema),
        )(
          Schema.decodeUnknownSync(Schema.Struct({ token: Schema.String }))(
            request.credentials,
          ).token,
        );
      return new Admission(
        Schema.decodeUnknownSync(serviceHostDefinition.claimsSchema)(claims),
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

    service() {
      return new Service(this.environment, this.observation, this.localReset);
    }
  }
  return installHostRecoveryTransport({
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
    reply: message =>
      message.type === 'resume'
        ? {
            type: 'replay-complete',
            serviceIndex: finalize ? (message.serviceIndex ?? 0) : 0,
            dispositionChainHash: finalize
              ? message.dispositionChainHash
              : '0'.repeat(64),
            outcomeIndex: finalize ? (message.outcomeIndex ?? 0) : 0,
          }
        : [
            {
              type: 'serviceCommandAdmission',
              id: message.command?.id,
              pushIndex: message.command?.pushIndex,
            },
            ...(finalize && message.command !== undefined
              ? [
                  {
                    type: 'commands',
                    commands: [
                      {
                        id: message.command.id,
                        commandName: 'increment',
                        serviceIndex: message.command.pushIndex,
                        dispositionChainHash: message.command.pushIndex
                          .toString(16)
                          .padStart(64, '0'),
                        failure: null,
                        delta: {
                          upserted: [
                            {
                              modelName: 'counter',
                              version: 1,
                              id: 'cnt_shared',
                              amount: message.command.pushIndex,
                              createdAt: '2026-10-27T00:00:00.000Z',
                              updatedAt: '2026-10-27T01:00:00.000Z',
                            },
                          ],
                          deleted: [],
                        },
                      },
                    ],
                  },
                ]
              : []),
          ],
  });
}

export async function prepareServiceRecovery(
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
  const prepared = await prepareServiceHost(
    uniqueRunId,
    mode === 'reset' || mode === 'live-reset'
      ? `https://zerospin.qrk.localhost/__zerospin-test__/plan283-dev-reset-${mode === 'live-reset' ? 'live-' : ''}${uniqueRunId}`
      : `https://plan283-${environment}-${mode}-${uniqueRunId}.invalid`,
  );
  const namespace = makeNodeNamespaceLease(prepared.namespace);
  await namespace.ready;
  const definition = await makeServiceNodeDefinition(
    prepared.request,
    prepared.claims,
  );
  const execution = await openServiceNodeExecution(
    { sessionDefinition: serviceHostDefinition },
    definition,
  );
  let storage: Awaited<ReturnType<typeof openWaSqliteNodeStorage>> | undefined;
  let node: ServiceNode | undefined;
  try {
    storage = await openWaSqliteNodeStorage({
      namespace: prepared.namespace,
      sqliteWasmUrl: serviceHostWasmUrl,
      create: false,
    });
    node = new ServiceNode(
      storage.db,
      definition,
      execution.view,
      serviceHostDefinition,
    );
    await node.initializeConnectedStorage(false);
    await node.setPushPaused(false);
    await node.accept(serviceHostSubmission(prepared));
    if (mode === 'reset' || mode === 'unreadable' || mode === 'fallback') {
      makeStagedCommandJournal({
        prefix: 'service',
        identityKey: prepared.sessionKey,
        nodeId: prepared.nodeId,
        decode: Schema.decodeUnknownSync(ServiceNodeCommandSchema),
      }).write(serviceHostSubmission(prepared, 2));
    }
    if (mode === 'fallback') {
      await storage.db.run(sql`PRAGMA user_version = 2147483646`);
    }
    if (mode === 'reset' || mode === 'live-reset') {
      await serviceSessionDiscovery.update(
        prepared.request,
        prepared.claims,
        await serviceSessionDiscovery.revision(),
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
      namespace,
    });
  }
  return prepared;
}

export async function connectServiceMigrationHost(
  prepared: IServiceHostPrepared,
  workerUrl: string,
) {
  const owner = await connectServiceHost(prepared, workerUrl);
  const original = serviceHostSubmission(prepared);
  return {
    retain: () => owner.receive(original),
    snapshot: () => owner.attachment.snapshot({ pendingCommands: [original] }),
    setPushPaused: (pushPaused: boolean) =>
      owner.attachment.setPushPaused({ pushPaused }),
    close: owner.close,
  };
}
