import { makeConnectedServiceSession } from '@zerospin/browser/makeConnectedServiceSession';
import { acquireWorkerPort } from '@zerospin/browser/Node/acquireWorkerPort';
import { makeServiceNodeNamespace } from '@zerospin/browser/Node/nodeStorageNamespaces';
import { makeServiceNodeDefinition } from '@zerospin/browser/ServiceNode/makeServiceNodeDefinition';
import { serviceSessionDiscovery } from '@zerospin/browser/ServiceNode/serviceSessionDiscovery';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { stageServiceSessionCommand } from '@zerospin/core/serviceSession/stageServiceSessionCommand';
import { isZerospinError } from '@zerospin/error';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';

import {
  observeHostRecovery,
  setHostSnapshotsHeld,
  verifyLiveHostClean,
  waitForHostNamespaceWait,
} from './aggregate-host.browser.ts';
import {
  inspectServiceHost,
  installServiceRecoveryBackend,
  serviceHostDefinition,
  serviceHostWasmUrl,
  type IServiceHostPrepared,
} from './service-host.browser.ts';

function publicServiceLayer(prepared: IServiceHostPrepared) {
  return Layer.mergeAll(
    Layer.succeed(ZerospinApiUrl, prepared.request.apiUrl),
    Layer.succeed(
      PublishableKey,
      Redacted.make(prepared.request.publishableKey),
    ),
  );
}

export function makePublicService(
  prepared: IServiceHostPrepared,
  workerUrl: string,
  getCredentials?: () => Effect.Effect<{ token: string }>,
) {
  const configuration = {
    definition: serviceHostDefinition,
    sharedWorkerUrl: workerUrl,
    layer: publicServiceLayer(prepared),
  };
  return getCredentials === undefined
    ? makeConnectedServiceSession({ ...configuration, claims: prepared.claims })
    : makeConnectedServiceSession({
        ...configuration,
        credentialsSchema: Schema.Struct({ token: Schema.String }),
        getCredentials,
        expectedClaims: prepared.claims,
      });
}

/** A valid portable definition cannot open storage through a different authored worker. */
export async function runServicePublicDefinitionRefusal(
  prepared: IServiceHostPrepared,
  workerUrl: string,
) {
  const definition = makeServiceSessionDefinition({
    systemName: serviceHostDefinition.systemName,
    serviceName: serviceHostDefinition.serviceName,
    serviceVersion: serviceHostDefinition.serviceVersion,
    actorName: serviceHostDefinition.actorName,
    actorVersion: serviceHostDefinition.actorVersion,
    sessionName: 'differentPublicSession',
    claimsSchema: serviceHostDefinition.claimsSchema,
    models: serviceHostDefinition.models,
    contracts: serviceHostDefinition.contracts,
  });
  const request = {
    ...prepared.request,
    sessionName: definition.sessionName,
    lock: makeServiceSessionLock(definition),
  };
  const revision = await serviceSessionDiscovery.revision();
  await serviceSessionDiscovery.update(
    request,
    prepared.claims,
    revision,
    true,
  );
  const mismatchedDefinition = await makeServiceNodeDefinition(
    request,
    prepared.claims,
  );
  const namespace = makeServiceNodeNamespace(
    await sessionKey(mismatchedDefinition.identity),
  );
  const before = await inspectServiceHost(prepared);
  const rejected = makeConnectedServiceSession({
    definition,
    sharedWorkerUrl: workerUrl,
    claims: prepared.claims,
    layer: publicServiceLayer(prepared),
  });
  let failure: unknown;
  try {
    await rejected.initialize().catch(error => {
      failure = error;
    });
    if (
      !isZerospinError(failure) ||
      failure.code !== 'node-session-definition-mismatch' ||
      rejected.store.getState().status !== 'failed' ||
      rejected.store.getState().initialized !== null
    ) {
      throw new Error(
        'Public Service did not visibly reject its mismatched worker definition',
      );
    }
  } finally {
    await rejected.dispose();
  }
  const databases = await indexedDB.databases();
  if (databases.some(database => database.name === namespace)) {
    throw new Error('Mismatched public Service opened its Node storage');
  }
  const closing = new AbortController();
  const cleanupTimeout = setTimeout(() => closing.abort(), 10000);
  try {
    await navigator.locks.request(
      `${namespace}:lifetime`,
      { mode: 'exclusive', signal: closing.signal },
      () => undefined,
    );
  } finally {
    clearTimeout(cleanupTimeout);
  }
  const remainingLocks = await navigator.locks.query();
  if (
    [...(remainingLocks.held ?? []), ...(remainingLocks.pending ?? [])].some(
      lock => lock.name === `${namespace}:lifetime`,
    )
  ) {
    throw new Error('Mismatched public Service retained its namespace lease');
  }
  const after = await inspectServiceHost(prepared);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(
      'Mismatched public Service changed the original Node storage',
    );
  }
  return {
    code: failure.code,
    storageUnopened: true,
    originalStorageUnchanged: true,
  };
}

type IServicePublicSession = ReturnType<typeof makePublicService>;

function readPublicService(session: IServicePublicSession) {
  const state = session.store.getState();
  const initialized = state.initialized;
  if (initialized === null) {
    throw new Error('Expected an initialized public Service');
  }
  const counter = initialized.db
    .select()
    .from(
      makeDrizzleSchemaFromTable(serviceHostDefinition.models.counter.table),
    )
    .get();
  if (counter === undefined) throw new Error('Missing public Service counter');
  return {
    state,
    initialized,
    counter,
    commands: initialized.db.select().from(initialized.schema.commands).all(),
  };
}

function waitForServiceCoverage(
  session: IServicePublicSession,
  nodeId: string,
  requireAdmission = false,
) {
  return new Promise<void>((resolve, reject) => {
    let unsubscribe: () => void = () => undefined;
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(
        new Error('Timed out waiting for public Service command coverage'),
      );
    }, 10000);
    const changed = () => {
      const state = session.store.getState();
      if (state.status === 'failed') {
        clearTimeout(timeout);
        unsubscribe();
        reject(state.failure);
        return;
      }
      if (state.initialized === null) return;
      const row = state.initialized.db
        .select()
        .from(state.initialized.schema.commands)
        .get();
      if (
        row?.nodeId === nodeId &&
        row.nodeIndex === 1 &&
        row.pushIndex === 1 &&
        row.inverseOperations === null &&
        state.nodeState?.nodeIndex === 1 &&
        (!requireAdmission || state.nodeState.admittedThroughPushIndex === 1)
      ) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    };
    unsubscribe = session.store.subscribe(changed);
    changed();
  });
}

/** Execute in a real browser after preparing the host and making backend transport unavailable. */
export async function runServicePublicBrowserTests(
  prepared: IServiceHostPrepared,
  workerUrl: string,
) {
  const first = makePublicService(prepared, workerUrl);
  const second = makePublicService(prepared, workerUrl);
  const replacing = makePublicService(prepared, workerUrl);
  let stopRetirement: () => void = () => undefined;
  let cancelInitialized: () => void = () => undefined;
  try {
    await first.initialize();
    const initial = readPublicService(first);
    if (
      initial.state.status !== 'ready' ||
      initial.initialized.claims.memberId !== prepared.claims.memberId ||
      initial.initialized.claims.authorization.role !==
        prepared.claims.authorization.role ||
      initial.counter.amount !== 0 ||
      initial.commands.length !== 0
    ) {
      throw new Error(
        'Public Service bootstrap did not publish the bound baseline',
      );
    }

    const staged = stageServiceSessionCommand({
      session: first,
      contractName: 'increment',
      payload: {},
    });
    if (
      staged._tag !== 'Success' ||
      staged.success.stagingOutcome.result !== 1
    ) {
      throw new Error(
        'Public Service staging did not return its synchronous result',
      );
    }
    const optimistic = readPublicService(first);
    const original = optimistic.commands[0];
    if (
      optimistic.counter.amount !== 1 ||
      optimistic.commands.length !== 1 ||
      original === undefined ||
      original.inverseOperations === null
    ) {
      throw new Error(
        'Public Service staging did not synchronously commit its own overlay',
      );
    }
    await waitForServiceCoverage(first, prepared.nodeId);
    const covered = readPublicService(first);
    const retained = covered.commands[0];
    if (
      covered.counter.amount !== 1 ||
      covered.commands.length !== 1 ||
      retained === undefined ||
      retained.payload !== original.payload ||
      retained.stagingOutcome !== original.stagingOutcome ||
      retained.sessionIndex !== original.sessionIndex ||
      retained.serviceIndex !== null ||
      retained.failure !== null
    ) {
      throw new Error(
        'Public Service coverage changed the staging facts or applied optimism twice',
      );
    }

    await second.initialize();
    const shared = readPublicService(second);
    if (
      shared.state.status !== 'ready' ||
      shared.state.nodeState?.nodeId !== prepared.nodeId ||
      shared.counter.amount !== 1 ||
      shared.commands.length !== 0 ||
      shared.initialized.sessionId === covered.initialized.sessionId
    ) {
      throw new Error(
        'Second public Service did not share optimism with separate local ownership',
      );
    }

    let oldCallbackCalls = 0;
    let retired = false;
    let retirement: Promise<void> | undefined;
    let oldReplica:
      | ReturnType<typeof readPublicService>['initialized']
      | undefined;
    cancelInitialized = replacing.onInitialized(() => {
      oldCallbackCalls += 1;
    });
    stopRetirement = replacing.store.subscribe(state => {
      if (state.initialized === null || retired) return;
      retired = true;
      oldReplica = state.initialized;
      retirement = replacing.dispose();
      void retirement.catch(() => undefined);
    });
    const oldInitialization = await replacing.initialize().then(
      () => ({ completed: true }),
      () => ({ completed: false }),
    );
    if (retirement === undefined || oldReplica === undefined) {
      throw new Error(
        'Service retirement did not cross an actual bootstrap publication',
      );
    }
    await retirement;
    stopRetirement();
    let retiredReplicaRefused = false;
    try {
      oldReplica.db.select().from(oldReplica.schema.commands).all();
    } catch {
      retiredReplicaRefused = true;
    }
    if (!retiredReplicaRefused) {
      throw new Error('Disposed Service replica database stayed open');
    }
    if (
      oldInitialization.completed ||
      oldCallbackCalls !== 0 ||
      replacing.store.getState().status !== 'disposed' ||
      replacing.store.getState().initialized !== null ||
      replacing.store.getState().failure !== null
    ) {
      throw new Error(
        'Disposed Service bootstrap published its queued callback or failed terminally',
      );
    }
    await replacing.initialize();
    const replacement = readPublicService(replacing);
    if (
      replacement.state.status !== 'ready' ||
      replacement.initialized.db === oldReplica.db ||
      replacement.initialized.sessionId === oldReplica.sessionId ||
      replacement.initialized.claims.memberId !== prepared.claims.memberId ||
      replacement.counter.amount !== 1 ||
      replacement.commands.length !== 0 ||
      oldCallbackCalls !== 0
    ) {
      throw new Error(
        'Replacement public Service reused retired replica state',
      );
    }
    cancelInitialized();

    return {
      nodeId: prepared.nodeId,
      stagedResult: staged.success.stagingOutcome.result,
      nodeIndex: covered.state.nodeState?.nodeIndex,
      coveredOwnCommands: covered.commands.length,
      sharedOwnCommands: shared.commands.length,
      replacementOwnCommands: replacement.commands.length,
      optimisticAmount: replacement.counter.amount,
      retiredInitializationRejected: !oldInitialization.completed,
      retiredInitializedCallbacks: oldCallbackCalls,
      retiredReplicaRefused,
    };
  } finally {
    stopRetirement();
    cancelInitialized();
    await Promise.allSettled([
      first.dispose(),
      second.dispose(),
      replacing.dispose(),
    ]).then(cleanup => {
      for (const outcome of cleanup) {
        if (outcome.status === 'rejected') throw outcome.reason;
      }
    });
  }
}

/** Run offline against the fresh namespace returned by prepareServiceSchemaRefusal. */
export async function runServicePublicStorageRefusal(
  prepared: IServiceHostPrepared,
  workerUrl: string,
) {
  if (navigator.onLine) {
    throw new Error(
      'Service schema refusal requires offline Browser networking',
    );
  }
  const before = await inspectServiceHost(prepared);
  if (
    before.version[0]?.[0] !== 2147483646 ||
    before.metadata.length !== 1 ||
    before.resources.length !== 1
  ) {
    throw new Error(
      'Service schema refusal requires a nonempty incompatible fixture',
    );
  }
  const session = makePublicService(prepared, workerUrl);
  let initializedCalls = 0;
  const unsubscribe = session.onInitialized(() => {
    initializedCalls += 1;
  });
  try {
    let failure: unknown;
    await session.initialize().catch(error => {
      failure = error;
    });
    const state = session.store.getState();
    if (
      !isZerospinError(failure) ||
      failure.code !== 'node-storage-reset-required' ||
      state.status !== 'failed' ||
      state.failure?.code !== 'node-storage-reset-required' ||
      state.initialized !== null ||
      initializedCalls !== 0
    ) {
      throw new Error(
        'Public Service did not refuse its incompatible nonempty Node storage',
      );
    }
  } finally {
    unsubscribe();
    await session.dispose();
    const closing = new AbortController();
    const cleanupTimeout = setTimeout(() => closing.abort(), 10000);
    try {
      await navigator.locks.request(
        `${prepared.namespace}:lifetime`,
        { mode: 'exclusive', signal: closing.signal },
        () => undefined,
      );
    } finally {
      clearTimeout(cleanupTimeout);
    }
  }
  const after = await inspectServiceHost(prepared);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(
      'Service schema refusal changed existing rows or its incompatible stamp',
    );
  }
  return {
    code: 'node-storage-reset-required',
    initializedCalls,
    version: after.version[0]?.[0],
    storageUnchanged: true,
  };
}

/** Run online in an isolated browser, using prepareServiceRecovery and its real host worker. */
export async function verifyServicePublicRecovery(
  prepared: IServiceHostPrepared,
  workerUrl: string,
) {
  if (!navigator.onLine) {
    throw new Error('Connected recovery needs online Browser networking');
  }
  const restore = installServiceRecoveryBackend();
  const observed = observeHostRecovery(prepared.request.apiUrl);
  const url = new URL(prepared.request.apiUrl);
  const mode =
    url.hostname === 'zerospin.qrk.localhost'
      ? url.pathname.includes('/plan283-dev-reset-live-')
        ? 'live-reset'
        : 'reset'
      : url.hostname.split('-')[2];
  const controller = new AbortController();
  let keeper: Awaited<ReturnType<typeof acquireWorkerPort>> | undefined;
  const first = makePublicService(prepared, workerUrl);
  let second: ReturnType<typeof makePublicService> | undefined;
  const notices: string[] = [];
  const unsubscribe = first.store.subscribe((state, previous) => {
    if (
      state.status !== 'failed' &&
      state.failure !== null &&
      state.failure !== previous.failure
    ) {
      notices.push(state.failure.code);
    }
  });
  try {
    if (mode === 'unreadable' || mode === 'reset') {
      const refused = await inspectServiceHost(prepared).then(
        () => false,
        () => true,
      );
      if (!refused) {
        throw new Error(
          'Unreadable Service fixture still permitted normal SQLite reads',
        );
      }
    }
    keeper = await acquireWorkerPort({
      sharedWorkerUrl: workerUrl,
      name: prepared.name,
      signal: controller.signal,
      onError: () => controller.abort(),
    });
    let initializationFailure: unknown;
    const failed = await first.initialize().then(
      () => false,
      (error: unknown) => {
        initializationFailure = error;
        return true;
      },
    );
    if (mode === 'unreadable' || mode === 'fallback') {
      const expected =
        mode === 'unreadable'
          ? 'node-storage-upgrade-invalid'
          : 'node-storage-upgrade-newer';
      const state = first.store.getState();
      const journal = `service:${encodeURIComponent(prepared.sessionKey)}:${encodeURIComponent(prepared.nodeId)}:`;
      const databases = await indexedDB.databases();
      if (
        !failed ||
        state.status !== 'failed' ||
        state.failure?.code !== expected ||
        !databases.some(db => db.name === prepared.namespace) ||
        databases.some(db =>
          db.name?.startsWith(prepared.namespace + '/history/'),
        ) ||
        !Object.keys(localStorage).some(key => key.startsWith(journal)) ||
        observed.events.some(event => event.type === 'push')
      ) {
        throw new Error(
          'A refused Service command store must preserve its database and journal',
        );
      }
      return {
        mode,
        error: state.failure.code,
        originalNodeId: prepared.nodeId,
        protocol: observed.events,
      };
    }
    if (failed && mode !== 'bounded' && mode !== 'retry') {
      const failure = first.store.getState().failure;
      throw new Error(
        'Service recovery initialization failed: ' +
          JSON.stringify({
            code: failure?.code,
            message: failure?.message,
            extra: failure?.extra,
            protocol: observed.events,
          }),
        { cause: initializationFailure },
      );
    }
    if (mode === 'live-reset') {
      return await verifyLiveHostClean({
        prepared,
        wasm: serviceHostWasmUrl,
        observed,
        subscribe: first.store.subscribe,
        read: () => {
          const state = first.store.getState();
          if (state.status !== 'ready' || state.initialized === null) {
            return { nodeId: undefined, amount: undefined };
          }
          const current = readPublicService(first);
          return {
            nodeId: current.state.nodeState?.nodeId,
            amount: current.counter.amount,
          };
        },
        stage: () =>
          stageServiceSessionCommand({
            session: first,
            contractName: 'increment',
            payload: {},
          })._tag === 'Success',
      });
    }
    if (mode === 'bounded' || mode === 'retry') {
      if (!failed || first.store.getState().status !== 'failed') {
        throw new Error('Exhausted Service recovery did not become terminal');
      }
      await observed.waitFor(
        () =>
          observed.events.filter(event => event.type === 'resume').length >= 3,
      );
      const firstResumes = observed.events.filter(
        event => event.type === 'resume',
      ).length;
      if (firstResumes !== 3) {
        throw new Error(
          'Service recovery exceeded one preserving and one fresh attempt',
        );
      }
      await first.dispose();
      second = makePublicService(prepared, workerUrl);
      const retried = await second.initialize().then(
        () => true,
        () => false,
      );
      await observed.waitFor(
        () =>
          observed.events.filter(event => event.type === 'resume').length >
          firstResumes,
      );
      const resumes = observed.events.filter(
        event => event.type === 'resume',
      ).length;
      // Each owner gets its initial connection, one preserving repair and one fresh fallback.
      // The retry backend accepts the next owner on its initial connection.
      const expectedAdditionalResumes = mode === 'retry' ? 1 : 3;
      if (resumes - firstResumes !== expectedAdditionalResumes) {
        throw new Error('Fresh Service attempt looped recovery');
      }
      if (mode === 'retry' ? !retried : retried) {
        throw new Error('Fresh Service owner did not rearm bounded recovery');
      }
      return { mode, firstResumes, resumes, retried, terminalFirstOwner: true };
    }
    const replica = readPublicService(first);
    if (replica.state.status !== 'ready') {
      throw new Error('Recovered Service is not usable');
    }
    if (mode === 'preserve') {
      if (
        replica.state.nodeState?.nodeId !== prepared.nodeId ||
        replica.counter.amount !== 1
      ) {
        throw new Error(
          'Service repair lost producer identity or original optimism',
        );
      }
      const commandId = makeNodeCommandId(prepared.nodeId, 1);
      await observed.waitFor(() =>
        observed.events.some(
          event => event.type === 'push' && event.id === commandId,
        ),
      );
      await new Promise<void>((resolve, reject) => {
        let stop: () => void = () => undefined;
        const finish = (error?: unknown) => {
          clearTimeout(timeout);
          stop();
          if (error === undefined) resolve();
          else reject(error);
        };
        const timeout = setTimeout(
          () =>
            finish(
              new Error('Service admission acknowledgement did not arrive'),
            ),
          10000,
        );
        const changed = () => {
          const state = first.store.getState();
          if (state.status === 'failed') finish(state.failure);
          else if (state.nodeState?.admittedThroughPushIndex === 1) finish();
        };
        stop = first.store.subscribe(changed);
        changed();
      });
      if (notices.length !== 0) {
        throw new Error('Lossless Service repair emitted a warning');
      }
      if (
        observed.events.filter(event => event.type === 'resume').length !== 2
      ) {
        throw new Error(
          'Service preserving repair did not finish replacement replay',
        );
      }
    } else {
      if (
        replica.state.nodeState?.nodeId === prepared.nodeId ||
        replica.counter.amount !== 0
      ) {
        throw new Error('Service fallback did not install a fresh baseline');
      }
      if (
        mode === 'reset'
          ? notices.length !== 0
          : notices.length !== 1 ||
            notices[0] !== 'node-recovery-work-unconfirmed'
      ) {
        throw new Error(
          'Service startup loss notice missed the existing failure observer',
        );
      }
      if (mode === 'reset') {
        const newNodeId = replica.state.nodeState?.nodeId;
        if (newNodeId === undefined) {
          throw new Error('Reset Service omitted its new Node');
        }
        const staged = stageServiceSessionCommand({
          session: first,
          contractName: 'increment',
          payload: {},
        });
        if (staged._tag !== 'Success') {
          throw new Error('Reset Service cannot stage a new command');
        }
        await observed.waitFor(() =>
          observed.events.some(
            event =>
              event.type === 'push' &&
              event.id === makeNodeCommandId(newNodeId, 1),
          ),
        );
        if (
          observed.events.some(
            event =>
              event.type === 'push' &&
              event.id === makeNodeCommandId(prepared.nodeId, 1),
          )
        ) {
          throw new Error('Reset Service submitted the old pending command');
        }
        const oldJournal = `service:${encodeURIComponent(prepared.sessionKey)}:${encodeURIComponent(prepared.nodeId)}:`;
        if (
          !Object.keys(localStorage).some(key => key.startsWith(oldJournal))
        ) {
          throw new Error(
            'Reset Service lost the parked staged-command journal',
          );
        }
      }
    }
    return {
      mode,
      nodeId: replica.state.nodeState?.nodeId,
      originalNodeId: prepared.nodeId,
      amount: replica.counter.amount,
      admittedThroughPushIndex:
        first.store.getState().nodeState?.admittedThroughPushIndex,
      unreadableStorageRefused: mode === 'reset',
      notices,
      protocol: observed.events,
    };
  } finally {
    unsubscribe();
    await second?.dispose();
    await first.dispose();
    keeper?.close();
    controller.abort();
    observed.close();
    restore();
  }
}

/** Verify Service's single admission callback and snapshot reuse on fresh and retained startup. */
export async function verifyServicePublicDiscovery(
  prepared: IServiceHostPrepared,
  workerUrl: string,
) {
  const claims = {
    ...prepared.claims,
    memberId: `${prepared.claims.memberId}-discovery`,
  };
  const definition = await makeServiceNodeDefinition(prepared.request, claims);
  const key = await sessionKey(definition.identity);
  const namespace = makeServiceNodeNamespace(key);
  if ((await indexedDB.databases()).some(db => db.name === namespace)) {
    throw new Error('Service discovery needs a fresh identity');
  }
  const selected = { ...prepared, claims, sessionKey: key, namespace };
  const restore = installServiceRecoveryBackend();
  const observed = observeHostRecovery(prepared.request.apiUrl);
  let credentialCalls = 0;
  const credentials = () => {
    credentialCalls += 1;
    return Effect.succeed({ token: JSON.stringify(claims) });
  };
  const first = makePublicService(selected, workerUrl, credentials);
  const retained = makePublicService(selected, workerUrl, credentials);
  const requests = () => ({
    pageSnapshots: observed.allEvents.filter(
      event => event.type === 'snapshot' && !event.worker,
    ).length,
    workerSnapshots: observed.events.filter(event => event.type === 'snapshot')
      .length,
    tickets: observed.events.filter(event => event.type === 'ticket').length,
    credentialCalls,
  });
  try {
    await first.initialize();
    await observed.waitFor(() => requests().tickets === 1);
    const startup = requests();
    if (
      startup.pageSnapshots !== 0 ||
      startup.workerSnapshots !== 1 ||
      startup.tickets !== 1 ||
      startup.credentialCalls !== 1
    ) {
      throw new Error(
        'Service normal startup repeated authentication: ' +
          JSON.stringify(startup),
      );
    }
    const nodeId = readPublicService(first).state.nodeState?.nodeId;
    if (nodeId === undefined) {
      throw new Error('Fresh Service omitted its Node identity');
    }
    const staged = stageServiceSessionCommand({
      session: first,
      contractName: 'increment',
      payload: {},
    });
    if (staged._tag !== 'Success') {
      throw new Error('Service discovery could not stage its pending command');
    }
    await waitForServiceCoverage(first, nodeId);
    await first.dispose();
    await navigator.locks.request(
      `${namespace}:lifetime`,
      { mode: 'exclusive' },
      () => undefined,
    );
    await retained.initialize();
    await observed.waitFor(() => requests().tickets === 2);
    const reopened = readPublicService(retained);
    if (
      reopened.state.nodeState?.nodeId !== nodeId ||
      reopened.counter.amount !== 1
    ) {
      throw new Error(
        'Service retained startup replaced its producer or pending optimism',
      );
    }
    const total = requests();
    if (
      total.pageSnapshots !== 0 ||
      total.workerSnapshots !== 2 ||
      total.tickets !== 2 ||
      total.credentialCalls !== 2
    ) {
      throw new Error(
        'Service retained startup repeated discovery: ' + JSON.stringify(total),
      );
    }
    return {
      startup,
      total,
      nodeId,
      commandId: makeNodeCommandId(nodeId, 1),
      retainedAmount: reopened.counter.amount,
    };
  } finally {
    await Promise.allSettled([first.dispose(), retained.dispose()]);
    observed.close();
    restore();
  }
}

/** Verify same-host Service identity isolation, independent proof and interruption fencing. */
export async function verifyServiceHostIdentityIsolation(
  prepared: IServiceHostPrepared,
  workerUrl: string,
) {
  const restore = installServiceRecoveryBackend();
  const observed = observeHostRecovery(prepared.request.apiUrl);
  const otherClaims = {
    ...prepared.claims,
    memberId: `${prepared.claims.memberId}-other`,
  };
  const detachedClaims = {
    ...prepared.claims,
    memberId: `${prepared.claims.memberId}-detached`,
  };
  const first = makePublicService(prepared, workerUrl);
  const same = makePublicService(prepared, workerUrl);
  const other = makePublicService(
    { ...prepared, claims: otherClaims },
    workerUrl,
  );
  const rejected = makePublicService(prepared, workerUrl, () =>
    Effect.succeed({ token: JSON.stringify(otherClaims) }),
  );
  const late = makePublicService(prepared, workerUrl);
  const detached = makePublicService(
    { ...prepared, claims: detachedClaims },
    workerUrl,
  );
  let lateAttempt: Promise<boolean> | undefined;
  let detachedAttempt: Promise<boolean> | undefined;
  try {
    await Promise.all([first.initialize(), same.initialize()]);
    await observed.waitFor(
      () =>
        observed.events.filter(event => event.type === 'snapshot').length >= 2,
    );
    if (
      observed.events.filter(event => event.type === 'snapshot').length !== 2
    ) {
      throw new Error(
        'Each Service attachment did not supply its own snapshot proof',
      );
    }
    const firstId = readPublicService(first).state.nodeState?.nodeId;
    if (firstId !== readPublicService(same).state.nodeState?.nodeId) {
      throw new Error('Same Service identity acquired different Nodes');
    }
    await other.initialize();
    const otherId = readPublicService(other).state.nodeState?.nodeId;
    if (
      otherId === firstId ||
      readPublicService(other).initialized.claims.memberId !==
        otherClaims.memberId
    ) {
      throw new Error('Distinct Service identities shared Node state');
    }
    if (
      !(await rejected.initialize().then(
        () => false,
        () => true,
      )) ||
      rejected.store.getState().initialized !== null
    ) {
      throw new Error(
        'An existing Service provider authenticated a mismatching attachment',
      );
    }
    setHostSnapshotsHeld(prepared.request.apiUrl, true);
    await observed.waitFor(() =>
      observed.events.some(event => event.type === 'snapshots-held'),
    );
    const before = observed.events.filter(
      event => event.type === 'snapshot',
    ).length;
    lateAttempt = late.initialize().then(
      () => false,
      () => true,
    );
    detachedAttempt = detached.initialize().then(
      () => false,
      () => true,
    );
    await observed.waitFor(
      () =>
        observed.events.filter(event => event.type === 'snapshot').length ===
        before + 2,
    );
    await detached.dispose();
    await first.clearAuthentication();
    const offlineRevoked = await serviceSessionDiscovery
      .find(prepared.request, prepared.claims)
      .then(
        () => false,
        error =>
          error instanceof Error &&
          'code' in error &&
          error.code === 'node-offline-identity-missing',
      );
    if (!offlineRevoked) {
      throw new Error('Service sign-out retained offline eligibility');
    }
    if (same.store.getState().nodeState?.authentication !== 'signed-out') {
      throw new Error(
        'Service sign-out did not reach its other same-identity facade',
      );
    }
    const revokedInitialized = same.store.getState().initialized;
    setHostSnapshotsHeld(prepared.request.apiUrl, false);
    if (!(await lateAttempt)) {
      throw new Error(
        'A pre-sign-out Service snapshot restored its revoked identity',
      );
    }
    if (!(await detachedAttempt)) {
      throw new Error('Detached Service discovery published readiness');
    }
    if (
      readPublicService(other).state.status !== 'ready' ||
      readPublicService(other).state.nodeState?.nodeId !== otherId
    ) {
      throw new Error('Service sign-out revoked another identity');
    }
    const snapshotsBeforeResume = observed.events.filter(
      event => event.type === 'snapshot',
    ).length;
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
    const staged = stageServiceSessionCommand({
      session: other,
      contractName: 'increment',
      payload: {},
    });
    if (staged._tag !== 'Success' || otherId === undefined) {
      throw new Error(
        'Unrelated Service identity could not execute after sign-out',
      );
    }
    await waitForServiceCoverage(other, otherId, true);
    if (
      observed.events.filter(event => event.type === 'snapshot').length !==
        snapshotsBeforeResume ||
      same.store.getState().nodeState?.authentication !== 'signed-out' ||
      same.store.getState().initialized !== revokedInitialized
    ) {
      throw new Error(
        'Browser resume reauthenticated or reinitialized a signed-out Service facade',
      );
    }
    const detachedDefinition = await makeServiceNodeDefinition(
      prepared.request,
      detachedClaims,
    );
    const detachedNamespace = makeServiceNodeNamespace(
      await sessionKey(detachedDefinition.identity),
    );
    if (
      (await indexedDB.databases()).some(db => db.name === detachedNamespace)
    ) {
      throw new Error('Detached Service discovery opened storage');
    }
    return {
      firstId,
      otherId,
      independentProofs: true,
      signedOutResumeBlocked: true,
      lateProofRejected: true,
      offlineEligibilityRevoked: true,
      detachedStorageUnopened: true,
    };
  } finally {
    setHostSnapshotsHeld(prepared.request.apiUrl, false);
    await Promise.allSettled([
      first.dispose(),
      same.dispose(),
      other.dispose(),
      rejected.dispose(),
      late.dispose(),
      detached.dispose(),
    ]);
    await Promise.allSettled([lateAttempt, detachedAttempt]);
    observed.close();
    restore();
  }
}

/** Service namespace ownership waits independently and cancelled acquisition stays closed. */
export async function verifyServiceNamespaceCancellation(
  prepared: IServiceHostPrepared,
  workerUrl: string,
) {
  const restore = installServiceRecoveryBackend();
  const claims = {
    ...prepared.claims,
    memberId: `${prepared.claims.memberId}-lease`,
  };
  const definition = await makeServiceNodeDefinition(prepared.request, claims);
  const namespace = makeServiceNodeNamespace(
    await sessionKey(definition.identity),
  );
  const acquired = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const held = navigator.locks.request(
    `${namespace}:lifetime`,
    { mode: 'exclusive' },
    async () => {
      acquired.resolve();
      await release.promise;
    },
  );
  const current = makePublicService(prepared, workerUrl);
  const waiting = makePublicService({ ...prepared, claims }, workerUrl);
  const replacement = makePublicService({ ...prepared, claims }, workerUrl);
  const blocked = makePublicService({ ...prepared, claims }, workerUrl);
  let pending: Promise<boolean> | undefined;
  try {
    await acquired.promise;
    pending = waiting.initialize().then(
      () => false,
      () => true,
    );
    await waitForHostNamespaceWait(namespace);
    await current.initialize();
    if (current.store.getState().status !== 'ready') {
      throw new Error('Waiting Service identity blocked another identity');
    }
    await waiting.dispose();
    await blocked.initialize().then(
      () => {
        throw new Error('Occupied Service storage published readiness');
      },
      () => undefined,
    );
    const failure = blocked.store.getState().failure;
    if (
      failure?.code !== 'node-storage-owner-busy' ||
      failure.message !==
        'Local session storage is still in use. Close other tabs or windows using this app, then retry.'
    ) {
      throw new Error('Service namespace wait lost its owner-busy failure');
    }
    release.resolve();
    await held;
    if (!(await pending)) {
      throw new Error(
        'Cancelled Service namespace acquisition published readiness',
      );
    }
    if ((await indexedDB.databases()).some(db => db.name === namespace)) {
      throw new Error('Cancelled Service namespace acquisition opened storage');
    }
    await replacement.initialize();
    if (
      readPublicService(replacement).initialized.claims.memberId !==
      claims.memberId
    ) {
      throw new Error('Service could not reacquire its drained identity');
    }
    return {
      independentProgress: true,
      cancelledStorageUnopened: true,
      ownerBusy: failure.code,
      reacquired: true,
    };
  } finally {
    release.resolve();
    await held;
    await Promise.allSettled([
      current.dispose(),
      waiting.dispose(),
      blocked.dispose(),
      replacement.dispose(),
      pending,
    ]);
    restore();
  }
}
