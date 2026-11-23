import { aggregateSessionDiscovery } from '@zerospin/browser/AggregateNode/aggregateSessionDiscovery';
import { makeAggregateNodeDefinition } from '@zerospin/browser/AggregateNode/makeAggregateNodeDefinition';
import { makeConnectedAggregateSession } from '@zerospin/browser/makeConnectedAggregateSession';
import { acquireWorkerPort } from '@zerospin/browser/Node/acquireWorkerPort';
import { makeAggregateNodeNamespace } from '@zerospin/browser/Node/nodeStorageNamespaces';
import { makeStagedCommandJournal } from '@zerospin/browser/stagedCommandJournal/makeStagedCommandJournal';
import { AggregateNodeCommandSchema } from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { stageAggregateSessionCommand } from '@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';

import {
  connect as connectAggregateHost,
  counter,
  definition,
  inspect as inspectAggregateHost,
  installAggregateRecoveryBackend,
  observeHostRecovery,
  setHostSnapshotsHeld,
  sqliteWasmUrl,
  verifyLiveHostClean,
  waitForHostNamespaceWait,
  type IAggregateHostPrepared,
} from './aggregate-host.browser.ts';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type IPublicAggregateDefinition = Omit<typeof definition, 'sessionName'> & {
  sessionName: string;
};

export function makePublicAggregate(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
  getCredentials = () => Effect.succeed({ token: 'public-browser-test' }),
  sessionDefinition: IPublicAggregateDefinition = definition,
  diagnostics = false,
) {
  return makeConnectedAggregateSession({
    definition: sessionDefinition,
    diagnostics,
    sharedWorkerUrl: workerUrl,
    credentialsSchema: Schema.Struct({ token: Schema.String }),
    getCredentials,
    expectedClaims: prepared.claims,
    aggregateId: prepared.aggregateId,
    layer: Layer.mergeAll(
      Layer.succeed(ZerospinApiUrl, prepared.request.apiUrl),
      Layer.succeed(
        PublishableKey,
        Redacted.make(prepared.request.publishableKey),
      ),
    ),
  });
}

type IPublicAggregate = ReturnType<typeof makePublicAggregate>;
const counterTable = makeDrizzleSchemaFromTable(counter.table);

function readReplica(session: IPublicAggregate) {
  const state = session.store.getState();
  check(state.initialized !== null, 'Aggregate replica is not initialized');
  return {
    state,
    initialized: state.initialized,
    commands: state.initialized.db
      .select()
      .from(aggregateSessionRepoDbConfig.schema.commands)
      .all(),
    resources: state.initialized.db.select().from(counterTable).all(),
    metadata: state.initialized.db
      .select()
      .from(aggregateSessionRepoDbConfig.schema.sessionMetadata)
      .get(),
  };
}

function waitForReplica(session: IPublicAggregate, predicate: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    let unsubscribe: () => void = () => undefined;
    const finish = (error?: unknown) => {
      clearTimeout(timeout);
      unsubscribe();
      if (error === undefined) resolve();
      else reject(error);
    };
    const timeout = setTimeout(
      () => finish(new Error('Aggregate publication did not arrive')),
      10000,
    );
    const inspect = () => {
      try {
        const state = session.store.getState();
        if (state.status === 'failed') return finish(state.failure);
        if (predicate()) finish();
      } catch (error) {
        finish(error);
      }
    };
    unsubscribe = session.store.subscribe(inspect);
    inspect();
  });
}

/** Stage normally in the held worker; the driver must reload without disposing this session. */
export async function prepareAggregateJournalReload(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
) {
  check(
    navigator.serviceWorker.controller === null,
    'Journal reload must not depend on an HTTP service worker',
  );
  check(
    new URL(workerUrl, globalThis.location.href).searchParams.has(
      'hold-staged',
    ),
    'Journal reload requires the existing worker fixture to withhold handoff',
  );
  const restore = installAggregateRecoveryBackend(true);
  const gates = await caches.open('zerospin-test-journal-handoff');
  const gateUrl = new URL(
    `/__zerospin-test__/journal-handoff/${encodeURIComponent(prepared.nodeId)}`,
    globalThis.location.origin,
  ).href;
  const session = makePublicAggregate(prepared, workerUrl, () =>
    Effect.succeed({ token: JSON.stringify(prepared.claims) }),
  );
  try {
    // CacheStorage controls only this test's interruption, not command persistence.
    await gates.put(gateUrl, new Response('withhold before Node retention'));
    await session.initialize();
    const staged = stageAggregateSessionCommand({
      session,
      contractName: 'increment',
      payload: {},
    });
    check(staged._tag === 'Success', 'Journal fixture staging failed');
    const journal = makeStagedCommandJournal({
      prefix: 'aggregate',
      identityKey: prepared.key,
      nodeId: prepared.nodeId,
      decode: Schema.decodeUnknownSync(AggregateNodeCommandSchema),
    });
    const original = journal
      .read()
      .find(
        command =>
          command.sessionId === staged.success.sessionId &&
          command.sessionIndex === staged.success.sessionIndex,
      );
    check(original !== undefined, 'Staging did not persist its exact original');
    const observer = await connectAggregateHost(prepared, workerUrl);
    try {
      const snapshot = await observer.api.snapshot({
        pendingCommands: [original],
      });
      check(
        snapshot.pushIndex === 0 &&
          snapshot.commandCoverage.every(command => command.nodeId === null),
        'Journal-only fixture already reached Node retention',
      );
    } finally {
      await observer.close();
    }
    return { original, nodeId: prepared.nodeId, nodePushIndex: 0, gateUrl };
  } catch (error) {
    await gates.delete(gateUrl);
    await session.dispose();
    throw error;
  } finally {
    restore();
  }
}

/** Run after abrupt reload with the same worker URL; remove only this test's gate. */
export async function verifyAggregateJournalReload(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
  before: Awaited<ReturnType<typeof prepareAggregateJournalReload>>,
) {
  check(
    navigator.serviceWorker.controller === null &&
      new URL(workerUrl, globalThis.location.href).searchParams.has(
        'hold-staged',
      ) &&
      new URL(workerUrl, globalThis.location.href).searchParams.has('finalize'),
    'Journal recovery requires no HTTP worker and the same finalizing fixture',
  );
  const restore = installAggregateRecoveryBackend(true);
  const session = makePublicAggregate(prepared, workerUrl, () =>
    Effect.succeed({ token: JSON.stringify(prepared.claims) }),
  );
  let observer: Awaited<ReturnType<typeof connectAggregateHost>> | undefined;
  try {
    const gates = await caches.open('zerospin-test-journal-handoff');
    await gates.delete(before.gateUrl);
    if ((await gates.keys()).length === 0) {
      await caches.delete('zerospin-test-journal-handoff');
    }
    await session.initialize();
    await waitForReplica(
      session,
      () => readReplica(session).state.nodeState?.pushIndex === 1,
    ).catch(cause => {
      throw new Error('Journal original did not reach Node retention', {
        cause,
      });
    });
    observer = await connectAggregateHost(prepared, workerUrl);
    await observer.api.setPushPaused({ pushPaused: false });
    await waitForReplica(
      session,
      () => readReplica(session).state.nodeState?.outcomeIndex === 1,
    ).catch(cause => {
      throw new Error('Recovered journal command did not retain its outcome', {
        cause,
      });
    });
    const snapshot = await observer.api.snapshot({
      pendingCommands: [before.original],
    });
    const retained = snapshot.commandCoverage.find(
      command =>
        command.sessionId === before.original.sessionId &&
        command.sessionIndex === before.original.sessionIndex,
    );
    check(
      snapshot.metadata.nodeId === before.nodeId &&
        snapshot.pushIndex === 1 &&
        snapshot.outcomeIndex === 1 &&
        retained?.nodeId === before.nodeId &&
        retained.pushIndex === 1 &&
        retained.resolution !== null,
      'Reload lost, reallocated, or failed to finalize the journal original',
    );
    return {
      sessionId: retained.sessionId,
      sessionIndex: retained.sessionIndex,
      commandId: makeNodeCommandId(retained.nodeId, retained.pushIndex),
      nodeId: snapshot.metadata.nodeId,
      pushIndex: snapshot.pushIndex,
      outcomeIndex: snapshot.outcomeIndex,
      noHttpServiceWorker: true,
    };
  } finally {
    await observer?.close();
    await session.dispose();
    const gates = await caches.open('zerospin-test-journal-handoff');
    if ((await gates.keys()).length === 0) {
      await caches.delete('zerospin-test-journal-handoff');
    }
    restore();
  }
}

/** Run after fixture preparation and asset loading, with Browser networking offline. */
export async function verifyAggregatePublicBootstrap(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
) {
  const first = makePublicAggregate(prepared, workerUrl);
  const second = makePublicAggregate(prepared, workerUrl);
  let initializedCalls = 0;
  const unsubscribe = first.onInitialized(() => {
    initializedCalls += 1;
  });
  try {
    check(
      first.store.getState().status === 'idle',
      'Aggregate constructor is not cold',
    );
    await first.initialize();
    await Promise.resolve();
    const initial = readReplica(first);
    check(
      initial.state.status === 'ready' && initializedCalls === 1,
      'Aggregate did not publish readiness once',
    );
    check(
      initial.initialized.claims.aggregateId === prepared.claims.aggregateId &&
        initial.initialized.claims.memberId === prepared.claims.memberId,
      'Aggregate bootstrap claims changed',
    );
    check(
      initial.resources.length === 1 &&
        initial.resources[0]?.amount === 0 &&
        initial.commands.length === 0,
      'Aggregate bootstrap installed wrong models or local history',
    );

    const staged = stageAggregateSessionCommand({
      session: first,
      contractName: 'increment',
      payload: {},
    });
    check(
      staged._tag === 'Success' && staged.success.stagingOutcome.result === 1,
      'Aggregate public command did not return synchronous success',
    );
    const optimistic = readReplica(first);
    check(
      optimistic.resources[0]?.amount === 1 && optimistic.commands.length === 1,
      'Aggregate public staging did not commit optimism',
    );
    check(
      optimistic.commands[0]?.nodeId === null &&
        optimistic.commands[0]?.inverseOperations !== null,
      'Aggregate staging skipped its local overlay',
    );
    const original = optimistic.commands[0]!;
    await waitForReplica(first, () => {
      const replica = readReplica(first);
      return (
        replica.commands[0]?.nodeId === prepared.nodeId &&
        replica.commands[0]?.inverseOperations === null &&
        replica.metadata?.afterNodeIndex === 1
      );
    });
    const covered = readReplica(first);
    const retained = covered.commands[0]!;
    check(
      covered.resources[0]?.amount === 1 && covered.commands.length === 1,
      'Aggregate covering view doubled or lost local optimism',
    );
    check(
      retained.payload === original.payload &&
        JSON.stringify(retained.stagingOutcome) ===
          JSON.stringify(original.stagingOutcome) &&
        retained.sessionIndex === original.sessionIndex,
      'Aggregate covering view rewrote original staging facts',
    );

    await second.initialize();
    const peer = readReplica(second);
    check(
      peer.state.status === 'ready' &&
        peer.state.nodeState?.nodeId === prepared.nodeId &&
        peer.resources[0]?.amount === 1,
      'Aggregate peer did not install shared optimism',
    );
    check(
      peer.commands.length === 0 &&
        peer.initialized.sessionId !== covered.initialized.sessionId,
      "Aggregate peer inherited another replica's command ownership",
    );
    await first.dispose();
    let retiredReplicaRefused = false;
    try {
      covered.initialized.db
        .select()
        .from(aggregateSessionRepoDbConfig.schema.commands)
        .all();
    } catch {
      retiredReplicaRefused = true;
    }
    check(
      retiredReplicaRefused,
      'Disposed Aggregate replica database stayed open',
    );
    await first.initialize();
    const replacement = readReplica(first);
    check(
      replacement.state.status === 'ready' &&
        replacement.initialized.sessionId !== covered.initialized.sessionId &&
        replacement.resources[0]?.amount === 1 &&
        replacement.commands.length === 0,
      'Aggregate replacement did not install shared data with fresh local ownership',
    );
    return {
      nodeId: prepared.nodeId,
      sessionId: covered.initialized.sessionId,
      peerSessionId: peer.initialized.sessionId,
      synchronousResult: staged.success.stagingOutcome.result,
      nodeIndex: retained.nodeIndex,
      value: covered.resources[0]?.amount,
      ownCommands: covered.commands.length,
      peerCommands: peer.commands.length,
      retiredReplicaRefused,
      replacementSessionId: replacement.initialized.sessionId,
    };
  } finally {
    unsubscribe();
    try {
      await second.dispose();
    } finally {
      await first.dispose();
    }
  }
}

/** Run offline against the fresh namespace returned by prepareAggregateSchemaRefusal. */
export async function verifyAggregatePublicStorageRefusal(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
) {
  check(
    !navigator.onLine,
    'Aggregate schema refusal requires offline Browser networking',
  );
  const before = await inspectAggregateHost(prepared);
  check(
    before.version[0]?.[0] === 2147483646 &&
      before.metadata.length === 1 &&
      before.resources.length === 1,
    'Aggregate schema refusal requires a nonempty incompatible fixture',
  );
  const session = makePublicAggregate(prepared, workerUrl);
  let initializedCalls = 0;
  const unsubscribe = session.onInitialized(() => {
    initializedCalls += 1;
  });
  try {
    const rejected = await session.initialize().then(
      () => false,
      () => true,
    );
    const state = session.store.getState();
    check(
      rejected &&
        state.status === 'failed' &&
        state.failure?.code === 'node-storage-reset-required' &&
        state.initialized === null &&
        initializedCalls === 0,
      'Public Aggregate did not refuse its incompatible nonempty Node storage',
    );
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
  const after = await inspectAggregateHost(prepared);
  check(
    JSON.stringify(after) === JSON.stringify(before),
    'Aggregate schema refusal changed existing rows or its incompatible stamp',
  );
  return {
    code: 'node-storage-reset-required',
    initializedCalls,
    version: after.version[0]?.[0],
    storageUnchanged: true,
  };
}

/** Late credential completion belongs to the retired public initialization. */
export async function verifyAggregatePublicReplacement(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
) {
  const entered = Promise.withResolvers<void>();
  const released = Promise.withResolvers<{ token: string }>();
  const resumed = Promise.withResolvers<void>();
  let credentialCalls = 0;
  const session = makePublicAggregate(prepared, workerUrl, () => {
    credentialCalls += 1;
    return credentialCalls === 1
      ? Effect.promise(async () => {
          entered.resolve();
          const credentials = await released.promise;
          resumed.resolve();
          return credentials;
        })
      : Effect.succeed({ token: 'public-browser-test' });
  });
  const pending = session.initialize().then(
    () => false,
    () => true,
  );
  try {
    await entered.promise;
    const disposing = session.dispose();
    const replacement = session.initialize();
    await disposing;
    await replacement;
    const current = readReplica(session);
    const before = JSON.stringify({
      resources: current.resources,
      commands: current.commands,
      sessionId: current.initialized.sessionId,
    });
    released.resolve({ token: 'retired-public-browser-test' });
    await resumed.promise;
    check(await pending, 'Aggregate retired bootstrap unexpectedly succeeded');
    await Promise.resolve();
    const after = readReplica(session);
    check(
      after.state.status === 'ready' &&
        after.state.failure === null &&
        after.initialized.db === current.initialized.db,
      'Aggregate late bootstrap changed replacement readiness',
    );
    check(
      JSON.stringify({
        resources: after.resources,
        commands: after.commands,
        sessionId: after.initialized.sessionId,
      }) === before,
      'Aggregate late bootstrap changed replacement data',
    );
    return {
      replacementSessionId: after.initialized.sessionId,
      lateBootstrapRejected: true,
      replacementUnchanged: true,
    };
  } finally {
    released.resolve({ token: 'retired-public-browser-test' });
    await session.dispose();
    await pending;
  }
}

/** An eligible identity cannot make a differently authored worker install a replica. */
export async function verifyAggregatePublicDefinitionRefusal(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
) {
  const other = makeAggregateSessionDefinition({
    systemName: definition.systemName,
    aggregateName: definition.aggregateName,
    aggregateVersion: definition.aggregateVersion,
    actorName: definition.actorName,
    actorVersion: definition.actorVersion,
    sessionName: 'differentCounter',
    claimsSchema: definition.claimsSchema,
    models: definition.models,
    contracts: definition.contracts,
  });
  const request = {
    ...prepared.request,
    sessionName: other.sessionName,
    lock: makeAggregateSessionLock(other),
  };
  const revision = await aggregateSessionDiscovery.revision();
  await aggregateSessionDiscovery.update(
    request,
    prepared.claims,
    prepared.aggregateId,
    revision,
    true,
  );
  const nodeDefinition = await makeAggregateNodeDefinition(
    request,
    prepared.claims,
    prepared.aggregateId,
  );
  const namespace = makeAggregateNodeNamespace(
    await sessionKey(nodeDefinition.identity),
  );
  const before = await inspectAggregateHost(prepared);
  const session = makePublicAggregate(prepared, workerUrl, undefined, other);
  let failureCode: string;
  let initializedCalls = 0;
  const unsubscribe = session.onInitialized(() => {
    initializedCalls += 1;
  });
  try {
    const rejected = await session.initialize().then(
      () => false,
      () => true,
    );
    const state = session.store.getState();
    check(
      rejected && state.status === 'failed' && state.initialized === null,
      'Aggregate wrong definition did not fail initialization',
    );
    check(
      state.failure?.code === 'node-session-definition-mismatch' &&
        initializedCalls === 0,
      'Aggregate wrong definition hid its failure or announced readiness',
    );
    check(
      !(await indexedDB.databases()).some(db => db.name === namespace),
      'Aggregate wrong definition created durable Node storage',
    );
    failureCode = state.failure.code;
  } finally {
    unsubscribe();
    await session.dispose();
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
  }
  const after = await inspectAggregateHost(prepared);
  check(
    JSON.stringify(after) === JSON.stringify(before),
    'Aggregate wrong definition changed the original Node storage',
  );
  return {
    failureCode,
    initializedCalls,
    storageCreated: false,
    originalStorageUnchanged: true,
  };
}

/** Run online in an isolated browser, using prepareAggregateRecovery and its real host worker. */
export async function verifyAggregatePublicRecovery(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
) {
  check(navigator.onLine, 'Connected recovery needs online Browser networking');
  const restore = installAggregateRecoveryBackend();
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
  const make = () =>
    makePublicAggregate(prepared, workerUrl, () =>
      Effect.succeed({ token: JSON.stringify(prepared.claims) }),
    );
  const first = make();
  let second: ReturnType<typeof make> | undefined;
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
      const refused = await inspectAggregateHost(prepared).then(
        () => false,
        () => true,
      );
      check(
        refused,
        'Unreadable Aggregate fixture still permitted normal SQLite reads',
      );
    }
    keeper = await acquireWorkerPort({
      sharedWorkerUrl: workerUrl,
      name: prepared.hostName,
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
      const journal = `aggregate:${encodeURIComponent(prepared.key)}:${encodeURIComponent(prepared.nodeId)}:`;
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
          'A refused Aggregate command store must preserve its database and journal',
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
        'Aggregate recovery initialization failed: ' +
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
        wasm: sqliteWasmUrl,
        observed,
        subscribe: first.store.subscribe,
        read: () => {
          const state = first.store.getState();
          if (state.status !== 'ready' || state.initialized === null) {
            return { nodeId: undefined, amount: undefined };
          }
          const current = readReplica(first);
          return {
            nodeId: current.state.nodeState?.nodeId,
            amount: current.resources[0]?.amount,
          };
        },
        stage: () =>
          stageAggregateSessionCommand({
            session: first,
            contractName: 'increment',
            payload: {},
          })._tag === 'Success',
      });
    }
    if (mode === 'bounded' || mode === 'retry') {
      check(
        failed && first.store.getState().status === 'failed',
        'Exhausted Aggregate recovery did not become terminal',
      );
      await observed.waitFor(
        () =>
          observed.events.filter(event => event.type === 'resume').length >= 3,
      );
      const firstResumes = observed.events.filter(
        event => event.type === 'resume',
      ).length;
      check(
        firstResumes === 3,
        'Aggregate recovery exceeded one preserving and one fresh attempt',
      );
      await first.dispose();
      second = make();
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
      check(
        resumes - firstResumes === expectedAdditionalResumes,
        'Fresh Aggregate attempt looped recovery',
      );
      check(
        mode === 'retry' ? retried : !retried,
        'Fresh Aggregate owner did not rearm bounded recovery',
      );
      return { mode, firstResumes, resumes, retried, terminalFirstOwner: true };
    }
    const replica = readReplica(first);
    check(
      replica.state.status === 'ready',
      'Recovered Aggregate is not usable',
    );
    if (mode === 'preserve') {
      check(
        replica.state.nodeState?.nodeId === prepared.nodeId &&
          replica.resources[0]?.amount === 1,
        'Aggregate repair lost producer identity or original optimism',
      );
      const commandId = makeNodeCommandId(prepared.nodeId, 1);
      await observed.waitFor(() =>
        observed.events.some(
          event => event.type === 'push' && event.id === commandId,
        ),
      );
      check(
        notices.length === 0,
        'Lossless Aggregate repair emitted a warning',
      );
      check(
        observed.events.filter(event => event.type === 'resume').length === 2,
        'Aggregate preserving repair did not finish its replacement replay',
      );
    } else {
      check(
        replica.state.nodeState?.nodeId !== prepared.nodeId &&
          replica.resources[0]?.amount === 0,
        'Aggregate fallback did not install a fresh baseline',
      );
      check(
        mode === 'reset'
          ? notices.length === 0
          : notices.length === 1 &&
              notices[0] === 'node-recovery-work-unconfirmed',
        'Aggregate startup loss notice missed the existing failure observer',
      );
      if (mode === 'reset') {
        const newNodeId = replica.state.nodeState?.nodeId;
        check(
          newNodeId !== undefined,
          'Reset Aggregate did not publish a new Node',
        );
        const staged = stageAggregateSessionCommand({
          session: first,
          contractName: 'increment',
          payload: {},
        });
        check(
          staged._tag === 'Success',
          'Reset Aggregate cannot stage a new command',
        );
        await observed.waitFor(() =>
          observed.events.some(
            event =>
              event.type === 'push' &&
              event.id === makeNodeCommandId(newNodeId, 1),
          ),
        );
        check(
          !observed.events.some(
            event =>
              event.type === 'push' &&
              event.id === makeNodeCommandId(prepared.nodeId, 1),
          ),
          'Reset Aggregate submitted the old pending command',
        );
        const oldJournal = `aggregate:${encodeURIComponent(prepared.key)}:${encodeURIComponent(prepared.nodeId)}:`;
        check(
          Object.keys(localStorage).some(key => key.startsWith(oldJournal)),
          'Reset Aggregate lost the parked staged-command journal',
        );
      }
    }
    return {
      mode,
      nodeId: replica.state.nodeState?.nodeId,
      originalNodeId: prepared.nodeId,
      amount: replica.resources[0]?.amount,
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

/** Prove normal cold and retained startup request counts through the production public facade. */
export async function verifyAggregatePublicDiscovery(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
) {
  const claims = {
    ...prepared.claims,
    memberId: `${prepared.claims.memberId}-discovery`,
  };
  const identity = await makeAggregateNodeDefinition(
    prepared.request,
    claims,
    prepared.aggregateId,
  );
  const key = await sessionKey(identity.identity);
  const namespace = makeAggregateNodeNamespace(key);
  check(
    !(await indexedDB.databases()).some(db => db.name === namespace),
    'Discovery scenario needs a fresh identity',
  );
  const selected = { ...prepared, claims, key, namespace };
  const restore = installAggregateRecoveryBackend();
  const observed = observeHostRecovery(prepared.request.apiUrl);
  let credentialCalls = 0;
  const credentials = () => {
    credentialCalls += 1;
    return Effect.succeed({ token: JSON.stringify(claims) });
  };
  const first = makePublicAggregate(selected, workerUrl, credentials);
  const retained = makePublicAggregate(selected, workerUrl, credentials);
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
    check(
      startup.pageSnapshots === 0 &&
        startup.workerSnapshots === 1 &&
        startup.tickets === 1 &&
        startup.credentialCalls === 2,
      'Aggregate normal startup did not use one SharedWorker snapshot and two credential callbacks: ' +
        JSON.stringify(startup),
    );
    const nodeId = readReplica(first).state.nodeState?.nodeId;
    check(
      nodeId !== undefined,
      'Fresh Aggregate did not publish its Node identity',
    );
    const staged = stageAggregateSessionCommand({
      session: first,
      contractName: 'increment',
      payload: {},
    });
    check(
      staged._tag === 'Success',
      'Aggregate discovery scenario could not stage its pending command',
    );
    await waitForReplica(
      first,
      () => readReplica(first).commands[0]?.nodeId === nodeId,
    );
    await first.dispose();
    await navigator.locks.request(
      `${namespace}:lifetime`,
      { mode: 'exclusive' },
      () => undefined,
    );
    await retained.initialize();
    await observed.waitFor(() => requests().tickets === 2);
    const reopened = readReplica(retained);
    check(
      reopened.state.nodeState?.nodeId === nodeId &&
        reopened.resources[0]?.amount === 1,
      'Aggregate retained startup replaced its producer or lost pending optimism',
    );
    const total = requests();
    check(
      total.pageSnapshots === 0 &&
        total.workerSnapshots === 2 &&
        total.tickets === 2 &&
        total.credentialCalls === 4,
      'Aggregate retained startup repeated normal discovery: ' +
        JSON.stringify(total),
    );
    return {
      startup,
      total,
      nodeId,
      commandId: makeNodeCommandId(nodeId, 1),
      retainedAmount: reopened.resources[0]?.amount,
    };
  } finally {
    await Promise.allSettled([first.dispose(), retained.dispose()]);
    observed.close();
    restore();
  }
}

/** Same host, distinct identities, and interrupted proofs retain separate authority and lifetime. */
export async function verifyAggregateHostIdentityIsolation(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
) {
  const restore = installAggregateRecoveryBackend();
  const observed = observeHostRecovery(prepared.request.apiUrl);
  const otherClaims = {
    ...prepared.claims,
    memberId: `${prepared.claims.memberId}-other`,
  };
  const detachedClaims = {
    ...prepared.claims,
    memberId: `${prepared.claims.memberId}-detached`,
  };
  const first = makePublicAggregate(
    prepared,
    workerUrl,
    () => Effect.succeed({ token: JSON.stringify(prepared.claims) }),
    undefined,
    true,
  );
  const same = makePublicAggregate(prepared, workerUrl, () =>
    Effect.succeed({ token: JSON.stringify(prepared.claims) }),
  );
  const other = makePublicAggregate(
    { ...prepared, claims: otherClaims },
    workerUrl,
    () => Effect.succeed({ token: JSON.stringify(otherClaims) }),
    undefined,
    true,
  );
  const rejected = makePublicAggregate(prepared, workerUrl, () =>
    Effect.succeed({ token: JSON.stringify(otherClaims) }),
  );
  const late = makePublicAggregate(prepared, workerUrl, () =>
    Effect.succeed({ token: JSON.stringify(prepared.claims) }),
  );
  const detached = makePublicAggregate(
    { ...prepared, claims: detachedClaims },
    workerUrl,
    () => Effect.succeed({ token: JSON.stringify(detachedClaims) }),
  );
  let lateAttempt: Promise<boolean> | undefined;
  let detachedAttempt: Promise<boolean> | undefined;
  try {
    await Promise.all([first.initialize(), same.initialize()]);
    await observed.waitFor(
      () =>
        observed.events.filter(event => event.type === 'snapshot').length >= 2,
    );
    check(
      observed.events.filter(event => event.type === 'snapshot').length === 2,
      'Each same-identity Aggregate attachment did not supply its own snapshot proof',
    );
    const firstId = readReplica(first).state.nodeState?.nodeId;
    check(
      firstId === readReplica(same).state.nodeState?.nodeId,
      'Same Aggregate identity acquired different Nodes',
    );
    await other.initialize();
    const otherId = readReplica(other).state.nodeState?.nodeId;
    check(
      otherId !== firstId &&
        readReplica(other).initialized.claims.memberId === otherClaims.memberId,
      'Distinct Aggregate identities shared Node state',
    );
    const otherSessionId = readReplica(other).initialized.sessionId;
    await waitForReplica(other, () =>
      other.store
        .getState()
        .telemetry.spans.some(
          span =>
            span.name === 'node.attachment' &&
            span.attributes?.startupId === otherSessionId,
        ),
    );
    check(
      !first.store
        .getState()
        .telemetry.spans.some(
          span => span.attributes?.startupId === otherSessionId,
        ),
      'Aggregate diagnostics crossed authenticated identities',
    );
    const mismatch = await rejected.initialize().then(
      () => false,
      () => true,
    );
    check(
      mismatch && rejected.store.getState().initialized === null,
      'An existing Aggregate provider authorized an unverified mismatching attachment',
    );
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
    const offlineRevoked = await aggregateSessionDiscovery
      .find(prepared.request, prepared.claims)
      .then(
        () => false,
        error =>
          error instanceof Error &&
          'code' in error &&
          error.code === 'node-offline-identity-missing',
      );
    check(offlineRevoked, 'Aggregate sign-out retained offline eligibility');
    check(
      same.store.getState().nodeState?.authentication === 'signed-out',
      'Aggregate sign-out did not reach its other same-identity facade',
    );
    const revokedInitialized = same.store.getState().initialized;
    setHostSnapshotsHeld(prepared.request.apiUrl, false);
    check(
      await lateAttempt,
      'A pre-sign-out Aggregate snapshot restored its revoked identity',
    );
    check(
      await detachedAttempt,
      'A detached Aggregate discovery published readiness',
    );
    check(
      readReplica(other).state.status === 'ready' &&
        readReplica(other).state.nodeState?.nodeId === otherId,
      'Aggregate sign-out revoked an unrelated identity',
    );
    const snapshotsBeforeResume = observed.events.filter(
      event => event.type === 'snapshot',
    ).length;
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
    const staged = stageAggregateSessionCommand({
      session: other,
      contractName: 'increment',
      payload: {},
    });
    check(
      staged._tag === 'Success',
      'Unrelated Aggregate identity could not execute after sign-out',
    );
    await waitForReplica(
      other,
      () => other.store.getState().nodeState?.admittedThroughPushIndex === 1,
    );
    check(
      observed.events.filter(event => event.type === 'snapshot').length ===
        snapshotsBeforeResume &&
        same.store.getState().nodeState?.authentication === 'signed-out' &&
        same.store.getState().initialized === revokedInitialized,
      'Browser resume reauthenticated or reinitialized a signed-out Aggregate facade',
    );
    const detachedDefinition = await makeAggregateNodeDefinition(
      prepared.request,
      detachedClaims,
      prepared.aggregateId,
    );
    const detachedNamespace = makeAggregateNodeNamespace(
      await sessionKey(detachedDefinition.identity),
    );
    check(
      !(await indexedDB.databases()).some(db => db.name === detachedNamespace),
      'Detached Aggregate discovery opened storage',
    );
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

/** A namespace wait is identity-local and cannot open storage after its attachment leaves. */
export async function verifyAggregateNamespaceCancellation(
  prepared: IAggregateHostPrepared,
  workerUrl: string,
) {
  const restore = installAggregateRecoveryBackend();
  const claims = {
    ...prepared.claims,
    memberId: `${prepared.claims.memberId}-lease`,
  };
  const definition = await makeAggregateNodeDefinition(
    prepared.request,
    claims,
    prepared.aggregateId,
  );
  const namespace = makeAggregateNodeNamespace(
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
  const current = makePublicAggregate(prepared, workerUrl, () =>
    Effect.succeed({ token: JSON.stringify(prepared.claims) }),
  );
  const waiting = makePublicAggregate({ ...prepared, claims }, workerUrl, () =>
    Effect.succeed({ token: JSON.stringify(claims) }),
  );
  const replacement = makePublicAggregate(
    { ...prepared, claims },
    workerUrl,
    () => Effect.succeed({ token: JSON.stringify(claims) }),
  );
  const blocked = makePublicAggregate({ ...prepared, claims }, workerUrl, () =>
    Effect.succeed({ token: JSON.stringify(claims) }),
  );
  let pending: Promise<boolean> | undefined;
  try {
    await acquired.promise;
    pending = waiting.initialize().then(
      () => false,
      () => true,
    );
    await waitForHostNamespaceWait(namespace);
    await current.initialize();
    check(
      current.store.getState().status === 'ready',
      'Waiting Aggregate identity blocked an unrelated identity',
    );
    await waiting.dispose();
    await blocked.initialize().then(
      () => {
        throw new Error('Occupied Aggregate storage published readiness');
      },
      () => undefined,
    );
    const failure = blocked.store.getState().failure;
    check(
      failure?.code === 'node-storage-owner-busy',
      'Aggregate namespace wait lost its owner-busy failure',
    );
    check(
      failure.message ===
        'Local session storage is still in use. Close other tabs or windows using this app, then retry.',
      'Aggregate owner-busy message was not preserved',
    );
    release.resolve();
    await held;
    check(
      await pending,
      'Cancelled Aggregate namespace acquisition published readiness',
    );
    check(
      !(await indexedDB.databases()).some(db => db.name === namespace),
      'Cancelled Aggregate namespace acquisition opened storage',
    );
    await replacement.initialize();
    check(
      readReplica(replacement).initialized.claims.memberId === claims.memberId,
      'Aggregate could not reacquire the drained identity',
    );
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
