import { ServiceAgentNodeRepo } from '@zerospin/agent-worker/AgentNodeRepos';
import { makeAgentCommandRef } from '@zerospin/core/agent/makeAgentCommandRef';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { evictDurableObject, reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { getServiceVersionChain } from '../../src/ownerOperations/releaseRepoNamespaces.ts';
import { ServiceAgentVersionChain } from '../../src/ServiceAgentVersionChain/ServiceAgentVersionChain.ts';
import { serviceAgentVersionChainNameUtils } from '../../src/ServiceAgentVersionChain/serviceAgentVersionChainName.ts';
import { serviceAgentVersionRepoNameUtils } from '../../src/ServiceAgentVersionRepo/serviceAgentVersionRepoName.ts';
import type { ServiceChain } from '../../src/ServiceChain/ServiceChain.ts';
import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../../src/serviceDispositionChainHash/serviceDispositionChainHash.ts';
import { EvaluatedServiceCommandSchema } from '../../src/ServiceVersionChain/evaluatedServiceCommand.ts';
import { getServiceVersionRepo } from '../../src/ServiceVersionRepo/getServiceVersionRepo.ts';
import type { SystemRepo } from '../../src/SystemRepo/SystemRepo.ts';
import type { changeServiceReservationV1 } from '../declarations/contracts/service/changeServiceReservationV1.ts';

import {
  resetServiceExpirySelectorState,
  serviceExpirySelectorState as selector,
} from './serviceExpiryControls.ts';
import { serviceExpiryV1 as agent } from './serviceExpiryV1.ts';
import { serviceExpiryV2 } from './serviceExpiryV2.ts';
import { system } from './system.ts';

type IAdmission = Parameters<ServiceChain['admitFromServiceAgentNode']>[0];
type IRegistration = Parameters<SystemRepo['registerRepo']>[0];

const rootControl = 'service-agent-test/';
const admissionFault = rootControl + 'admission-fault';
const ownerKey = {
  systemId: 'sys_servicePublication',
  serviceName: 'agentReservations',
  serviceVersion: 1,
};
const now = Date.UTC(2030, 0, 1);
const node = () =>
  env.SERVICE_AGENT_NODE_REPO.getByName(
    'sanr_sys_servicePublication/agentReservations/serviceExpiry',
  );
const source = () =>
  env.SERVICE_CHAIN.getByName('sc_sys_servicePublication/agentReservations');
async function awaitOwnerCommandResult(serviceIndex: number) {
  const repo = await Effect.runPromise(
    getServiceVersionRepo({ key: ownerKey }),
  );
  return repo.awaitCommandResult({ serviceIndex });
}
let position = 0;
beforeEach(async () => {
  await reset();
  resetServiceExpirySelectorState();
  Reflect.set(
    system.serviceAgents.agentReservations.serviceExpiry,
    'active',
    1,
  );
  position = 0;
  vi.spyOn(Date, 'now').mockReturnValue(now);
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result,
  ).toMatchObject({ _tag: 'Success' });
});
afterEach(async () => {
  vi.restoreAllMocks();
  resetServiceExpirySelectorState();
  Reflect.set(
    system.serviceAgents.agentReservations.serviceExpiry,
    'active',
    1,
  );
  await reset();
});
function rootInputRecords(kind: 'admission' | 'registration') {
  return env.BUCKET.list({ prefix: rootControl + kind + '/' });
}

async function readRootInputs<Input>(kind: 'admission' | 'registration') {
  const records = await rootInputRecords(kind);
  return Promise.all(
    records.objects.map(async ({ key }) => {
      const record = await env.BUCKET.get(key);
      if (record === null) throw new Error('Missing root Worker input ' + key);
      return record.json<Input>();
    }),
  );
}

async function clearRootInputs(kind: 'admission' | 'registration') {
  const records = await rootInputRecords(kind);
  await env.BUCKET.delete(records.objects.map(({ key }) => key));
}

async function firstAdmission() {
  const [input] = await readRootInputs<IAdmission>('admission');
  if (input === undefined) expect.fail('Expected a Service Agent admission');
  return input;
}

async function initialize() {
  const result = await node().initialize();
  if (result.result._tag === 'Failure') {
    throw new Error(JSON.stringify(result.result.failure));
  }
  return result;
}
async function state() {
  return runInDurableObject(node(), ({ db, schema }) => ({
    wakes: db
      .select()
      .from(schema.pendingAgentWakes)
      .all()
      .sort((a, b) => a.resourceId.localeCompare(b.resourceId)),
    pending: db.select().from(schema.commandDeliveryOutbox).all(),
    predictions: db.select().from(schema.pendingAgentCommands).all(),
    head: db.select().from(schema.materializationHead).get(),
    initialization: db.select().from(schema.initializationState).get(),
    modelRows:
      db.all(
        sql`SELECT name FROM sqlite_master WHERE name = '__agent_view_agentReservation'`,
      ).length === 0
        ? []
        : db.all<{ id: string }>(
            sql`SELECT id FROM __agent_view_agentReservation ORDER BY id`,
          ),
    indexes: db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = '__agent_view_agentReservation'`,
    ),
    producer: db.select().from(schema.producerPosition).get()?.lastIndex ?? 0,
  }));
}
async function invoke(
  commandName: string,
  payload: Record<string, string | number>,
) {
  const index = ++position;
  const admitted = await source().admitFromServiceChain({
    source: {
      systemId: 'sys_servicePublication',
      serviceName: 'agentReservations',
    },
    position: { sourceIndex: index, operationIndex: 0 },
    command: {
      id: `cmd_agent_${index}`,
      commandName,
      contractVersion: 1,
      payload: JSON.stringify(payload),
      serviceName: 'agentReservations',
      serviceVersion: 1,
      kind: 'system',
    },
  });
  expect(admitted.result).toMatchObject({ _tag: 'Success' });
  if (admitted.result._tag === 'Failure') throw new Error('Admission failed');
  expect(
    (await awaitOwnerCommandResult(admitted.result.success.destinationIndex))
      .result._tag,
  ).toBe('Success');
}
async function change(id: string, expiresAt: number, action = 'create') {
  await invoke('changeServiceReservation', {
    reservationId: id,
    expiresAt,
    action,
  });
}
async function alarm() {
  return runInDurableObject(node(), instance =>
    instance.onAlarm().then(
      () => true,
      () => false,
    ),
  );
}

it('applies structured selection changes to the Agent view and wake schedule', async () => {
  const publication = vi.spyOn(
    ServiceAgentVersionChain.prototype,
    'appendExposedCommands',
  );
  await change('arv_1', 0);
  await initialize();
  expect((await state()).wakes).toEqual([]);
  await change('arv_1', now + 1000, 'update');
  await initialize();
  expect((await state()).wakes.map(wake => wake.resourceId)).toEqual(['arv_1']);
  await change('arv_1', 0, 'update');
  await initialize();
  expect((await state()).wakes).toEqual([]);
  const published = publication.mock.calls.flatMap(([page]) => page.commands);
  expect(
    published.find(command => command.id === 'cmd_agent_1')?.delta,
  ).toEqual({
    upserted: [],
    deleted: [],
  });
  expect(
    published.find(command => command.id === 'cmd_agent_2')?.delta,
  ).toMatchObject({
    upserted: [{ id: 'arv_1', expiresAt: now + 1000 }],
    deleted: [],
  });
  expect(
    published.find(command => command.id === 'cmd_agent_3')?.delta,
  ).toEqual({
    upserted: [],
    deleted: [{ modelName: 'agentReservation', id: 'arv_1' }],
  });
});

it('initializes existing rows, replaces keyed deadlines, and stages under its own Agent identity', async () => {
  await change('arv_1', now + 1000);
  expect((await initialize()).result).toMatchObject({ _tag: 'Success' });
  expect((await state()).wakes.map(wake => [wake.resourceId, wake.at])).toEqual(
    [['arv_1', now + 1000]],
  );
  await change('arv_1', now + 2000, 'update');
  expect((await initialize()).result).toMatchObject({ _tag: 'Success' });
  expect((await state()).wakes.map(wake => [wake.resourceId, wake.at])).toEqual(
    [['arv_1', now + 2000]],
  );
  vi.mocked(Date.now).mockReturnValue(now + 2000);
  expect(await alarm()).toBe(true);
  expect((await state()).wakes).toEqual([]);
  expect((await state()).producer).toBe(1);
  const admitted = await firstAdmission();
  expect(admitted.command).toMatchObject({
    kind: 'agent',
    agentName: 'serviceExpiry',
    agentVersion: 1,
    serviceVersion: 1,
    commandName: 'expireServiceReservation',
  });
  for (const { override, code } of [
    { override: { contractVersion: 2 }, code: 'admission-contract-not-found' },
    {
      override: {
        commandName: 'changeServiceReservation',
        payload: JSON.stringify({
          reservationId: 'arv_1',
          expiresAt: now,
          action: 'update',
        }),
      },
      code: 'command-admission-grant-invalid',
    },
    {
      override: { payload: JSON.stringify({ reservationId: 5 }) },
      code: 'decode-command-payload-failed',
    },
  ]) {
    expect(
      (
        await source().admitFromServiceAgentNode({
          ...admitted,
          producerIndex: 2,
          command: {
            ...admitted.command,
            id: 'cmd_invalid_offer',
            ...override,
          },
        })
      ).result,
    ).toMatchObject({ _tag: 'Failure', failure: { code } });
  }
  expect(await alarm()).toBe(true);
  expect((await state()).producer).toBe(1);
}, 20000);

it('retains one hosted admission receipt across concurrent calls and Chain restart', async () => {
  await change('arv_1', now + 2000);
  const ownsChain = !('AGENT_TEST_SYSTEM_REPO' in env);
  if (ownsChain) {
    await runInDurableObject(source(), ({ db }) => {
      db.run(sql`DROP TABLE agentCommandReceipts`);
      db.run(sql`DELETE FROM applied_migrations WHERE migrationId > 0`);
    });
    await evictDurableObject(source());
  }
  const scope = { ...ownerKey, agentName: 'serviceExpiry', agentVersion: 1 };
  const { systemId: _systemId, ...release } = scope;
  const command = {
    ...release,
    id: 'cmd_hosted_expiry',
    kind: 'agent',
    commandName: 'expireServiceReservation',
    contractVersion: 1,
    payload: JSON.stringify({ reservationId: 'arv_1' }),
  };
  expect(
    (
      await source().admitAgentCommand(
        { ...scope, systemId: 'sys_other' },
        command,
        async () => true,
      )
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-command-producer-mismatch' },
  });
  expect(
    (
      await source().admitAgentCommand(
        scope,
        { ...command, agentName: 'anotherAgent' },
        async () => true,
      )
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-command-producer-mismatch' },
  });
  expect(
    (
      await source().admitAgentCommand(
        scope,
        { ...command, contractVersion: 2 },
        async () => true,
      )
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'admission-contract-not-found' },
  });
  const receipt = {
    _tag: 'Success',
    success: { commandId: command.id, serviceIndex: 2 },
  };
  const results = await Promise.all([
    source().admitAgentCommand(scope, command, async () => true),
    source().admitAgentCommand(scope, command, async () => true),
  ]);
  expect(results.map(result => result.result)).toEqual([receipt, receipt]);
  expect((await awaitOwnerCommandResult(2)).result._tag).toBe('Success');

  if (ownsChain) {
    await expect
      .poll(
        async () => {
          await source().onAlarm();
          return runInDurableObject(
            source(),
            ({ db, schema }) =>
              db.select().from(schema.finalizedPosition).get()?.lastIndex,
          );
        },
        { timeout: 10000 },
      )
      .toBe(2);
    await runInDurableObject(source(), ({ db }) => {
      db.run(sql`DROP TABLE agentCommandReceipts`);
      db.run(
        sql`CREATE TABLE agentCommandReceipts (commandId text PRIMARY KEY NOT NULL, command text NOT NULL, serviceIndex integer NOT NULL)`,
      );
      db.run(
        sql`INSERT INTO agentCommandReceipts VALUES (${command.id}, ${JSON.stringify(command)}, 2)`,
      );
      db.run(sql`DELETE FROM applied_migrations WHERE migrationId = 2`);
    });
    await evictDurableObject(source());
  }
  expect(
    (await source().admitAgentCommand(scope, command, async () => false))
      .result,
  ).toEqual(receipt);
  expect(
    (
      await source().admitAgentCommand(
        scope,
        { ...command, payload: JSON.stringify({ reservationId: 'arv_2' }) },
        async () => true,
      )
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-agent-command-conflict' },
  });
  expect(
    (
      await source().admitAgentCommand(
        scope,
        { ...command, id: 'cmd_retired_build' },
        async () => false,
      )
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-agent-build-ineligible' },
  });
  expect(
    (await source().getServiceCommand({ serviceIndex: 3 })).result,
  ).toEqual({
    _tag: 'Success',
    success: null,
  });
}, 20000);

it('completes Agent wake delivery through ServiceChain and the addressed owner release', async () => {
  // The split Worker has its own clock and cannot see the runner's mock.
  vi.restoreAllMocks();
  await change('arv_1', Date.now() - 1);
  expect(
    (await env.SYSTEM_REPO.getByName('sys_servicePublication').initialize())
      .result,
  ).toMatchObject({ _tag: 'Success', success: [] });
  await expect
    .poll(
      async () =>
        (await source().getServiceCommand({ serviceIndex: 2 })).result,
      { timeout: 10000 },
    )
    .toMatchObject({
      _tag: 'Success',
      success: {
        kind: 'agent',
        agentName: 'serviceExpiry',
        agentVersion: 1,
        serviceVersion: 1,
        commandName: 'expireServiceReservation',
      },
    });
  expect((await awaitOwnerCommandResult(2)).result._tag).toBe('Success');
  expect(
    (await source().getServiceCommand({ serviceIndex: 3 })).result,
  ).toEqual({
    _tag: 'Success',
    success: null,
  });
}, 20000);

it('bounds pending Agent publications and resumes the offered page after Chain recovery', async () => {
  const key = {
    systemId: 'sys_servicePublication',
    serviceName: 'agentReservations',
    serviceVersion: 1,
    agentName: 'serviceExpiry',
    agentVersion: 1,
  };
  const repo = env.SERVICE_AGENT_VERSION_REPO.getByName(
    Effect.runSync(serviceAgentVersionRepoNameUtils.makeName(key)),
  );
  expect((await repo.awaitStartup()).result._tag).toBe('Success');
  const subscriber = await repo.agentVersionRepoFanoutSubscriber({
    systemId: key.systemId,
    serviceName: key.serviceName,
    serviceVersion: key.serviceVersion,
  });
  let previousDispositionChainHash = genesisDispositionChainHash();
  const rows = Array.from({ length: 65 }, (_, offset) => {
    const serviceIndex = offset + 1;
    const id = `cmd_pending_${serviceIndex}`;
    const outcome = {
      result: { _tag: 'Success' as const, success: null },
      finalizedAt: new Date(now),
    };
    const dispositionChainHash = advanceDispositionChainHash({
      previousDispositionChainHash,
      serviceIndex,
      commandId: id,
      outcome,
    });
    previousDispositionChainHash = dispositionChainHash;
    return Schema.decodeUnknownSync(
      Schema.toType(EvaluatedServiceCommandSchema),
    )({
      id,
      serviceName: key.serviceName,
      serviceVersion: 1,
      serviceIndex,
      commandName: 'expireServiceReservation',
      contractVersion: 1,
      kind: 'system',
      payload: JSON.stringify({ reservationId: 'arv_1' }),
      outcome,
      dispositionChainHash,
      operations: [],
    });
  });
  const append = ServiceAgentVersionChain.prototype.appendExposedCommands;
  const publication = vi
    .spyOn(ServiceAgentVersionChain.prototype, 'appendExposedCommands')
    .mockImplementation(function (this: ServiceAgentVersionChain, input) {
      return append.call(this, {
        ...input,
        sourceKey: { ...input.sourceKey, serviceVersion: 2 },
      });
    });
  let subscribed = true;
  try {
    expect(
      (await subscriber.receive({ rows, lastIndex: 65 })).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'service-projection-publication-batch-too-large' },
    });
    const sourceHistory = await Effect.runPromise(
      getServiceVersionChain({ key: ownerKey }),
    );
    const firstPage = { rows: rows.slice(0, 64), lastIndex: 64 };
    expect(
      (
        await sourceHistory.appendEvaluatedCommands({
          commands: firstPage.rows,
        })
      ).result._tag,
    ).toBe('Success');
    expect(
      (await subscriber.receive({ rows: rows.slice(0, 64), lastIndex: 65 }))
        .result._tag,
    ).toBe('Success');
    const finalPage = { rows: rows.slice(64), lastIndex: 65 };
    expect((await subscriber.receive(finalPage)).result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'service-projection-publication-backlog-full' },
    });
    expect(
      await runInDurableObject(repo, ({ db, schema }) => ({
        head: db.select().from(schema.materializationHead).get()?.serviceIndex,
        pending: db.select().from(schema.exposedCommandOutbox).all().length,
      })),
    ).toEqual({ head: 64, pending: 64 });
    expect((await subscriber.receive(firstPage)).result._tag).toBe('Success');
    subscriber[Symbol.dispose]();
    subscribed = false;
    await sourceHistory.onAlarm();
    expect(
      (
        await sourceHistory.appendEvaluatedCommands({
          commands: finalPage.rows,
        })
      ).result._tag,
    ).toBe('Success');
    await evictDurableObject(repo);
    publication.mockRestore();
    expect((await repo.awaitStartup()).result._tag).toBe('Success');
    expect((await repo.synchronizeSelectedHistory()).result).toEqual({
      _tag: 'Success',
      success: 65,
    });
    expect(
      await runInDurableObject(repo, ({ db, schema }) =>
        db.select().from(schema.exposedCommandOutbox).all(),
      ),
    ).toEqual([]);
    const history = env.SERVICE_AGENT_VERSION_CHAIN.getByName(
      Effect.runSync(serviceAgentVersionChainNameUtils.makeName(key)),
    );
    const retained = await runInDurableObject(history, ({ db, schema }) =>
      db
        .select({
          index: schema.exposedCommands.serviceIndex,
          id: schema.exposedCommands.id,
        })
        .from(schema.exposedCommands)
        .orderBy(schema.exposedCommands.serviceIndex)
        .all(),
    );
    expect(retained).toEqual(
      rows.map(row => ({ index: row.serviceIndex, id: row.id })),
    );
  } finally {
    publication.mockRestore();
    if (subscribed) subscriber[Symbol.dispose]();
  }
}, 20000);

it('processes the captured command backlog before firing an obsolete wake', async () => {
  await change('arv_1', now + 1000);
  expect((await initialize()).result).toMatchObject({ _tag: 'Success' });
  await change('arv_1', now + 1000, 'delete');
  vi.mocked(Date.now).mockReturnValue(now + 1000);
  expect(await alarm()).toBe(true);
  expect((await state()).wakes).toEqual([]);
  expect((await state()).producer).toBe(0);
}, 20000);

it('keeps a consumed deadline consumed through other edits, and rearms when it changes', async () => {
  await change('arv_1', now + 1000);
  await initialize();
  vi.mocked(Date.now).mockReturnValue(now + 1000);
  expect(await alarm()).toBe(true);
  expect((await state()).producer).toBe(1);
  vi.mocked(Date.now).mockReturnValue(now + 2000);
  await change('arv_2', now + 10000);
  await change('arv_1', now + 1000, 'update');
  await initialize();
  expect((await state()).wakes).toEqual([
    { ruleName: 'reservationExpiry', resourceId: 'arv_2', at: now + 10000 },
  ]);
  expect((await state()).producer).toBe(1);
  await change('arv_1', now + 5000, 'update');
  await initialize();
  expect((await state()).wakes.map(wake => [wake.resourceId, wake.at])).toEqual(
    [
      ['arv_1', now + 5000],
      ['arv_2', now + 10000],
    ],
  );
}, 20000);

it('discards partial stages, retries an unhandled wake, and commits handled recovery', async () => {
  await change('arv_1', now + 1000);
  await initialize();
  const callback = agent.wakeRules.reservationExpiry!.onWake;
  const recovery = vi.spyOn(callback, 'onFailure');
  vi.spyOn(callback, 'program').mockImplementation(context =>
    Effect.gen(function* () {
      yield* context.stageCommand(agent.contracts.expireServiceReservation, {
        reservationId: 'arv_1',
      });
      // The owner also implements this command, but this Agent has no grant for it.
      yield* context.stageCommand(
        makeAgentCommandRef<typeof changeServiceReservationV1>(
          'changeServiceReservation',
          1,
        ),
        { reservationId: 'arv_1', expiresAt: now, action: 'update' },
      );
    }),
  );
  vi.mocked(Date.now).mockReturnValue(now + 1000);
  expect(await alarm()).toBe(false);
  expect((await state()).producer).toBe(0);
  expect((await state()).wakes).toHaveLength(1);
  const failure = recovery.mock.calls[0]?.[0].failure;
  expect(Cause.isCause(failure) && Cause.pretty(failure)).toContain(
    'agent-command-not-granted',
  );
  recovery.mockImplementation(context =>
    context
      .stageCommand(agent.contracts.expireServiceReservation, {
        reservationId: 'arv_1',
      })
      .pipe(Effect.asVoid),
  );
  expect(await alarm()).toBe(true);
  expect((await state()).producer).toBe(1);
  expect((await state()).wakes).toEqual([]);
}, 20000);

it('retains a wake and rolls back its command when consumption cannot commit', async () => {
  await change('arv_1', now + 1000);
  await initialize();
  vi.mocked(Date.now).mockReturnValue(now + 1000);
  await runInDurableObject(node(), ({ db }) =>
    db.run(
      sql`CREATE TRIGGER prevent_wake_delete BEFORE DELETE ON pendingAgentWakes BEGIN SELECT RAISE(ABORT, 'commit failed'); END`,
    ),
  );
  expect(await alarm()).toBe(false);
  expect((await state()).wakes.map(wake => wake.resourceId)).toEqual(['arv_1']);
  expect((await state()).producer).toBe(0);
  await runInDurableObject(node(), ({ db }) =>
    db.run(sql`DROP TRIGGER prevent_wake_delete`),
  );
}, 20000);

it('persists initialization failure, pauses alarms, and retries through System initialization', async () => {
  selector.fail = true;
  await change('arv_1', now + 10000);
  expect((await initialize()).result).toMatchObject({ _tag: 'Success' });
  expect((await state()).initialization?.status).toBe('initializationFailed');
  selector.fail = false;
  expect(await alarm()).toBe(true);
  expect((await state()).initialization?.status).toBe('initializationFailed');
  expect(
    (await env.SYSTEM_REPO.getByName('sys_servicePublication').initialize())
      .result,
  ).toMatchObject({ _tag: 'Success' });
  expect((await state()).initialization?.status).toBe('ready');
  expect((await state()).wakes.map(wake => wake.resourceId)).toEqual(['arv_1']);
}, 20000);

it('upgrades a Service Agent with an outstanding old delivery and a future wake', async () => {
  await change('arv_1', now + 1000);
  await change('arv_2', now + 2000);
  await initialize();
  await env.BUCKET.put(admissionFault, 'before');
  vi.mocked(Date.now).mockReturnValue(now + 1000);
  expect(await alarm()).toBe(false);
  const installed = await state();
  const offered = await firstAdmission();
  expect(installed.wakes).toMatchObject([{ resourceId: 'arv_2' }]);
  expect(installed.pending).toMatchObject([{ id: offered.command.id }]);

  // The previous release had the same operational rows and no prediction journal.
  await evictDurableObject(node());
  await runInDurableObject(node(), ({ db }) => {
    db.run(sql`DROP TABLE pendingAgentCommands`);
    db.run(sql`DELETE FROM applied_migrations WHERE migrationId > 0`);
  });
  await evictDurableObject(node());
  expect(await state()).toEqual({ ...installed, predictions: [] });
  await env.BUCKET.delete(admissionFault);
  await clearRootInputs('admission');
  await initialize();
  expect(await readRootInputs<IAdmission>('admission')).toEqual([offered]);
  expect((await state()).pending).toEqual([]);
}, 20000);

it('refuses an unsupported retained Agent layout before contacting the System catalog', async () => {
  await initialize();
  expect(
    (await readRootInputs<IRegistration>('registration')).some(
      ({ registration }) => registration.repoType === 'ServiceAgentNodeRepo',
    ),
  ).toBe(true);

  await evictDurableObject(node());
  await runInDurableObject(node(), async ({ db }, ctx) => {
    db.run(sql`DROP TABLE pendingAgentCommands`);
    db.run(sql`DELETE FROM applied_migrations WHERE migrationId > 0`);
    db.run(sql`ALTER TABLE producerPosition ADD COLUMN unknownCounter INTEGER`);
    await clearRootInputs('registration');
    let startup: Promise<unknown> | undefined;
    vi.spyOn(ctx, 'blockConcurrencyWhile').mockImplementation(callback => {
      const pending = callback();
      void pending.catch(() => {});
      startup = pending;
      return pending;
    });
    new ServiceAgentNodeRepo(ctx, env);
    await expect(startup).rejects.toThrow(
      'Database table "producerPosition" differs from its declaration: column count differs',
    );
    expect(await readRootInputs<IRegistration>('registration')).toEqual([]);
    expect(
      db.all(
        sql`SELECT migrationId FROM applied_migrations ORDER BY migrationId`,
      ),
    ).toEqual([{ migrationId: 0 }]);
    expect(
      db.all(
        sql`SELECT name FROM sqlite_master WHERE name = 'pendingAgentCommands'`,
      ),
    ).toEqual([]);
  });
}, 20000);

it('resumes the frozen delivery after redeploy without rearming its consumed wake', async () => {
  await change('arv_1', now + 1000);
  await initialize();
  await env.BUCKET.put(admissionFault, 'after');
  const publication = vi
    .spyOn(ServiceAgentVersionChain.prototype, 'appendExposedCommands')
    .mockRejectedValue(new Error('pause selected history'));
  vi.mocked(Date.now).mockReturnValue(now + 1000);
  expect(await alarm()).toBe(false);
  const frozen = await state();
  const offered = await firstAdmission();
  expect(frozen.wakes).toEqual([]);
  expect(frozen.pending).toMatchObject([
    {
      id: offered.command.id,
      producerIndex: 1,
      generation: frozen.initialization!.generation,
    },
  ]);

  expect(frozen.predictions).toMatchObject([
    { id: offered.command.id, producerIndex: 1 },
  ]);
  await evictDurableObject(node());
  expect(await state()).toEqual(frozen);
  publication.mockRestore();

  // Publication can arrive after the Chain committed admission but before the Node heard its reply.
  expect((await awaitOwnerCommandResult(2)).result._tag).toBe('Success');
  expect(await alarm()).toBe(false);
  expect((await state()).predictions).toEqual([]);
  expect((await state()).pending).toEqual(frozen.pending);
  await env.BUCKET.delete(admissionFault);
  await clearRootInputs('admission');
  await initialize();
  expect(await readRootInputs<IAdmission>('admission')).toEqual([offered]);
  const resumed = await state();
  expect(resumed.initialization).toEqual(frozen.initialization);
  expect(resumed.producer).toBe(1);
  expect(resumed.wakes).toEqual([]);
  expect(resumed.pending).toEqual([]);
  expect(
    (await source().getServiceCommand({ serviceIndex: 2 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { id: offered.command.id },
  });
  expect(
    (await source().getServiceCommand({ serviceIndex: 3 })).result,
  ).toEqual({ _tag: 'Success', success: null });
}, 20000);

it('preserves a pending wake on reopening the same declared release', async () => {
  await change('arv_1', now + 1000);
  await initialize();
  const installed = await state();
  expect(installed.wakes).toHaveLength(1);

  selector.disabled = true;
  await evictDurableObject(node());
  await initialize();
  const resumed = await state();
  expect(resumed.initialization).toEqual(installed.initialization);
  expect(resumed.wakes).toEqual(installed.wakes);
}, 20000);

it.each(['replace', 'remove'] as const)(
  '%s abandons the old installation and fences delayed admissions',
  async transition => {
    const registry = system.serviceAgents.agentReservations;
    const declaration = registry.serviceExpiry;
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    const deployedCatalog = env.AGENT_TEST_SYSTEM_REPO.getByName(
      'sys_servicePublication',
    );
    const reconcile = async (initializationFails = false) => {
      expect(
        (
          await deployedCatalog.acceptFixtureSystemSpec(
            makeSystemSpec({ system }),
          )
        ).result._tag,
      ).toBe('Success');
      await evictDurableObject(node());
      expect((await systemRepo.initialize()).result).toMatchObject({
        _tag: 'Success',
        success: initializationFails
          ? [expect.stringContaining('serviceExpiry')]
          : [],
      });
    };
    await change('arv_1', now + 1000);
    await initialize();
    await env.BUCKET.put(
      admissionFault,
      transition === 'remove' ? 'after' : 'before',
    );
    vi.mocked(Date.now).mockReturnValue(now + 1000);
    expect(await alarm()).toBe(false);
    const old = await firstAdmission();
    expect((await state()).pending).toHaveLength(1);
    // A future deadline lets us observe installation separately from new delivery.
    await change('arv_1', now + 10000, 'update');
    await clearRootInputs('admission');
    try {
      if (transition === 'remove') {
        Reflect.deleteProperty(registry, 'serviceExpiry');
      } else {
        Reflect.set(declaration, 'active', 2);
      }
      const binding =
        transition === 'remove'
          ? null
          : {
              serviceVersion: serviceExpiryV2.serviceVersion,
              agentVersion: 2,
            };
      expect((await node().initialize(false, binding)).result).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'agent-node-deployment-pending' },
      });
      selector.fail = transition === 'replace';
      await reconcile(selector.fail);
      expect((await state()).pending).toEqual([]);
      expect(await readRootInputs<IAdmission>('admission')).toEqual([]);
      if (transition === 'remove') {
        expect((await state()).initialization?.status).toBe('stopped');
        expect((await state()).wakes).toEqual([]);
        expect(
          await runInDurableObject(node(), (_, ctx) => ctx.storage.getAlarm()),
        ).toBeNull();
        await evictDurableObject(node());
        expect(await alarm()).toBe(true);
        expect(await readRootInputs<IAdmission>('admission')).toEqual([]);
        Reflect.set(registry, 'serviceExpiry', declaration);
        await reconcile();
      } else {
        const failed = (await state()).initialization;
        expect(failed?.status).toBe('initializationFailed');
        selector.fail = false;
        await evictDurableObject(node());
        expect(await alarm()).toBe(true);
        expect((await state()).initialization).toEqual(failed);
        await reconcile();
        expect((await state()).initialization?.generation).toBe(
          failed?.generation,
        );
      }
      expect((await state()).modelRows).toEqual([{ id: 'arv_1' }]);
      expect((await state()).wakes.map(wake => wake.at)).toEqual([now + 10000]);
      expect(
        (await state()).indexes.some(
          index =>
            index.name ===
            '__agent_view_agentReservation_agent_reservation_expiry',
        ),
      ).toBe(transition === 'replace');
      await env.BUCKET.delete(admissionFault);
      expect(
        (await source().admitFromServiceAgentNode(old)).result,
      ).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'agent-node-producer-generation-conflict' },
      });
      const second = await source().getServiceCommand({ serviceIndex: 2 });
      expect(second.result).toMatchObject({
        _tag: 'Success',
        success: {
          id: transition === 'remove' ? old.command.id : 'cmd_agent_2',
        },
      });
      await clearRootInputs('admission');
      vi.mocked(Date.now).mockReturnValue(now + 10000);
      expect(await alarm()).toBe(true);
      const fresh = await firstAdmission();
      expect(fresh).toMatchObject({ producerIndex: 1 });
      expect(fresh.generation).toBeGreaterThan(old.generation);
      expect((await state()).pending).toEqual([]);
    } finally {
      Reflect.set(registry, 'serviceExpiry', declaration);
      Reflect.set(declaration, 'active', 1);
      expect(
        (
          await deployedCatalog.acceptFixtureSystemSpec(
            makeSystemSpec({ system }),
          )
        ).result._tag,
      ).toBe('Success');
    }
  },
  20000,
);
