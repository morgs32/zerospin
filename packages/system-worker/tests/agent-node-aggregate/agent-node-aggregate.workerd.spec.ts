import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { evictDurableObject, reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AggregateAgentVersionChain } from '../../src/AggregateAgentVersionChain/AggregateAgentVersionChain.ts';
import { aggregateAgentVersionChainNameUtils } from '../../src/AggregateAgentVersionChain/aggregateAgentVersionChainName.ts';
import { aggregateAgentVersionRepoNameUtils } from '../../src/AggregateAgentVersionRepo/aggregateAgentVersionRepoName.ts';
import type { AggregateChain } from '../../src/AggregateChain/AggregateChain.ts';
import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../../src/aggregateDispositionChainHash/aggregateDispositionChainHash.ts';
import { EvaluatedAggregateCommandSchema } from '../../src/AggregateVersionChain/evaluatedAggregateCommand.ts';
import { getAggregateVersionRepo } from '../../src/AggregateVersionRepo/getAggregateVersionRepo.ts';
import { getAggregateVersionChain } from '../../src/ownerOperations/releaseRepoNamespaces.ts';
import type { SystemRepo } from '../../src/SystemRepo/SystemRepo.ts';

import { resetAggregateExpirySelectorState } from './aggregateExpiryControls.ts';
import { system } from './system.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      BUCKET: R2Bucket;
      AGENT_TEST_SYSTEM_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & {
          acceptFixtureSystemSpec(
            spec: ISystemSpec,
          ): ReturnType<SystemRepo['registerSystemSpec']>;
        }
      >;
    }
  }
}

type IAdmission = Parameters<AggregateChain['admitFromAggregateAgentNode']>[0];
type ITransition = Parameters<AggregateChain['transitionAgentNodeProducer']>[0];

const chainControl = 'aggregate-agent-test/';
const ownerKey = {
  systemId: 'sys_servicePublication',
  aggregateName: 'agentAccount',
  aggregateId: 'acc_agent',
  aggregateVersion: 1,
};
const now = Date.UTC(2030, 0, 1);
const node = () =>
  env.AGGREGATE_AGENT_NODE_REPO.getByName(
    'aanr_sys_servicePublication/agentAccount/acc_agent/aggregateExpiry',
  );
const source = () =>
  env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_agent/agentAccount',
  );
let position = 0;
beforeEach(async () => {
  await reset();
  resetAggregateExpirySelectorState();
  Reflect.set(system.aggregateAgents.agentAccount.aggregateExpiry, 'active', 1);
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
  resetAggregateExpirySelectorState();
  Reflect.set(system.aggregateAgents.agentAccount.aggregateExpiry, 'active', 1);
  await reset();
});
function chainInputRecords(kind: 'admission' | 'transition') {
  return env.BUCKET.list({ prefix: chainControl + kind + '/' });
}

async function readChainInputs<Input>(kind: 'admission' | 'transition') {
  const records = await chainInputRecords(kind);
  return Promise.all(
    records.objects.map(async ({ key }) => {
      const record = await env.BUCKET.get(key);
      if (record === null) throw new Error('Missing root Chain input ' + key);
      return record.json<Input>();
    }),
  );
}

async function clearChainInputs(kind: 'admission' | 'transition') {
  const records = await chainInputRecords(kind);
  await env.BUCKET.delete(records.objects.map(({ key }) => key));
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
    producer: db.select().from(schema.producerPosition).get()?.lastIndex ?? 0,
  }));
}
async function invoke(
  commandName: string,
  payload: Record<string, string | number>,
) {
  const index = ++position;
  const admitted = await source().admitFromAggregateChain({
    source: {
      systemId: 'sys_servicePublication',
      aggregateName: 'agentAccount',
      aggregateId: 'acc_agent',
    },
    position: { sourceIndex: index, operationIndex: 0 },
    command: {
      id: `cmd_agent_${index}`,
      commandName,
      contractVersion: 1,
      payload: JSON.stringify(payload),
      aggregateName: 'agentAccount',
      aggregateVersion: 1,
      aggregateId: 'acc_agent',
      kind: 'system',
    },
  });
  expect(admitted.result).toMatchObject({ _tag: 'Success' });
  if (admitted.result._tag === 'Failure') throw new Error('Admission failed');
  const owner = await Effect.runPromise(
    getAggregateVersionRepo({ key: ownerKey }),
  );
  expect(
    (
      await owner.awaitCommandResult({
        aggregateIndex: admitted.result.success.destinationIndex,
      })
    ).result._tag,
  ).toBe('Success');
}
async function change(id: string, expiresAt: number, action = 'create') {
  await invoke('changeAggregateReservation', {
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

it('initializes existing rows, replaces keyed deadlines, and stages under its own Agent identity', async () => {
  await change('arv_1', now + 1000);
  expect((await node().initialize()).result).toMatchObject({ _tag: 'Success' });
  expect((await state()).wakes.map(wake => [wake.resourceId, wake.at])).toEqual(
    [['arv_1', now + 1000]],
  );
  await change('arv_1', now + 2000, 'update');
  expect((await node().initialize()).result).toMatchObject({ _tag: 'Success' });
  expect((await state()).wakes.map(wake => [wake.resourceId, wake.at])).toEqual(
    [['arv_1', now + 2000]],
  );
  const append = AggregateAgentVersionChain.prototype.appendExposedCommands;
  const publication = vi
    .spyOn(AggregateAgentVersionChain.prototype, 'appendExposedCommands')
    .mockImplementation(function (this: AggregateAgentVersionChain, input) {
      return input.commands.some(
        command => command.commandName === 'expireAggregateReservation',
      )
        ? Promise.reject(new Error('pause selected history'))
        : append.call(this, input);
    });
  vi.mocked(Date.now).mockReturnValue(now + 2000);
  expect(await alarm()).toBe(true);
  expect((await state()).wakes).toEqual([]);
  expect((await state()).producer).toBe(1);
  const [admitted] = await readChainInputs<IAdmission>('admission');
  if (admitted === undefined) expect.fail('Expected the Agent delivery');
  expect((await state()).pending).toEqual([]);
  expect((await state()).predictions).toMatchObject([
    { id: admitted.command.id },
  ]);
  publication.mockRestore();
  expect(admitted.command).toMatchObject({
    kind: 'agent',
    agentName: 'aggregateExpiry',
    agentVersion: 1,
    aggregateVersion: 1,
    commandName: 'expireAggregateReservation',
  });
  // The second owner release also implements this contract. This Agent belongs to version one.
  expect(
    (
      await source().admitFromAggregateAgentNode({
        ...admitted,
        producerIndex: 2,
        command: {
          ...admitted.command,
          id: 'cmd_wrong_owner',
          aggregateVersion: 2,
        },
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'command-admission-grant-invalid' },
  });
  expect(await alarm()).toBe(true);
  expect((await state()).predictions).toEqual([]);
  expect((await state()).producer).toBe(1);
}, 20000);

it('preserves an Aggregate wake and frozen command across the journal migration', async () => {
  await change('arv_1', now + 1000);
  await change('arv_2', now + 2000);
  await node().initialize();
  await env.BUCKET.put(chainControl + 'lose-admission-reply', '');
  vi.mocked(Date.now).mockReturnValue(now + 1000);
  expect(await alarm()).toBe(false);
  const [offered] = await readChainInputs<IAdmission>('admission');
  if (offered === undefined) {
    expect.fail('Expected the committed Agent delivery');
  }
  const installed = await state();
  expect(installed.pending).toMatchObject([{ id: offered.command.id }]);
  expect(installed.wakes).toMatchObject([{ resourceId: 'arv_2' }]);
  await evictDurableObject(node());
  await runInDurableObject(node(), ({ db }) => {
    db.run(sql`DROP TABLE pendingAgentCommands`);
    db.run(sql`DELETE FROM applied_migrations WHERE migrationId = 1`);
  });
  await evictDurableObject(node());
  expect(await state()).toEqual({ ...installed, predictions: [] });
  await env.BUCKET.delete(chainControl + 'lose-admission-reply');
  await clearChainInputs('admission');
  await node().initialize();
  expect(await readChainInputs<IAdmission>('admission')).toEqual([offered]);
  expect((await state()).pending).toEqual([]);
  expect(
    (await source().getAggregateCommand({ aggregateIndex: 3 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { id: offered.command.id },
  });
  expect(
    (await source().getAggregateCommand({ aggregateIndex: 4 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: null,
  });
}, 20000);

it('bounds pending Agent publications and resumes the offered page after Chain recovery', async () => {
  const key = {
    systemId: 'sys_servicePublication',
    aggregateName: 'agentAccount',
    aggregateId: 'acc_agent',
    aggregateVersion: 1,
    agentName: 'aggregateExpiry',
    agentVersion: 1,
  };
  const repo = env.AGGREGATE_AGENT_VERSION_REPO.getByName(
    Effect.runSync(aggregateAgentVersionRepoNameUtils.makeName(key)),
  );
  expect((await repo.awaitStartup()).result._tag).toBe('Success');
  const subscriber = await repo.agentVersionChainFanoutSubscriber({
    systemId: key.systemId,
    aggregateName: key.aggregateName,
    aggregateId: key.aggregateId,
    aggregateVersion: key.aggregateVersion,
  });
  let previousDispositionChainHash = genesisDispositionChainHash();
  const rows = Array.from({ length: 65 }, (_, offset) => {
    const aggregateIndex = offset + 1;
    const id = `cmd_pending_${aggregateIndex}`;
    const outcome = {
      result: { _tag: 'Success' as const, success: null },
      finalizedAt: new Date(now),
    };
    const dispositionChainHash = advanceDispositionChainHash({
      previousDispositionChainHash,
      aggregateIndex,
      commandId: id,
      outcome,
    });
    previousDispositionChainHash = dispositionChainHash;
    return Schema.decodeUnknownSync(
      Schema.toType(EvaluatedAggregateCommandSchema),
    )({
      id,
      aggregateName: key.aggregateName,
      aggregateId: key.aggregateId,
      aggregateVersion: 1,
      aggregateIndex,
      commandName: 'expireAggregateReservation',
      contractVersion: 1,
      kind: 'system',
      payload: JSON.stringify({ reservationId: 'arv_1' }),
      outcome,
      dispositionChainHash,
      operations: [],
    });
  });
  const append = AggregateAgentVersionChain.prototype.appendExposedCommands;
  const publication = vi
    .spyOn(AggregateAgentVersionChain.prototype, 'appendExposedCommands')
    .mockImplementation(function (this: AggregateAgentVersionChain, input) {
      return append.call(this, {
        ...input,
        sourceKey: { ...input.sourceKey, aggregateVersion: 2 },
      });
    });
  let subscribed = true;
  try {
    expect(
      (await subscriber.receive({ rows, lastIndex: 65 })).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'projection-publication-batch-too-large' },
    });
    const sourceHistory = await Effect.runPromise(
      getAggregateVersionChain({ key: ownerKey }),
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
      failure: { code: 'projection-publication-backlog-full' },
    });
    expect(
      await runInDurableObject(repo, ({ db, schema }) => ({
        head: db.select().from(schema.materializationHead).get()
          ?.aggregateIndex,
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
    const history = env.AGGREGATE_AGENT_VERSION_CHAIN.getByName(
      Effect.runSync(aggregateAgentVersionChainNameUtils.makeName(key)),
    );
    const retained = await runInDurableObject(history, ({ db, schema }) =>
      db
        .select({
          index: schema.exposedCommands.aggregateIndex,
          id: schema.exposedCommands.id,
        })
        .from(schema.exposedCommands)
        .orderBy(schema.exposedCommands.aggregateIndex)
        .all(),
    );
    expect(retained).toEqual(
      rows.map(row => ({ index: row.aggregateIndex, id: row.id })),
    );
  } finally {
    publication.mockRestore();
    if (subscribed) subscriber[Symbol.dispose]();
  }
}, 20000);

it('processes the captured command backlog before firing an obsolete wake', async () => {
  const publication = vi.spyOn(
    AggregateAgentVersionChain.prototype,
    'appendExposedCommands',
  );
  await change('arv_1', now + 1000);
  expect((await node().initialize()).result).toMatchObject({ _tag: 'Success' });
  await change('arv_1', now + 500, 'update');
  await change('arv_1', now + 1000, 'delete');
  vi.mocked(Date.now).mockReturnValue(now + 1000);
  expect(await alarm()).toBe(true);
  expect((await state()).wakes).toEqual([]);
  expect((await state()).producer).toBe(0);
  const published = publication.mock.calls.flatMap(([page]) => page.commands);
  expect(
    published.find(command => command.id === 'cmd_agent_2')?.delta,
  ).toMatchObject({
    upserted: [{ id: 'arv_1', expiresAt: now + 500 }],
    deleted: [],
  });
  expect(
    published.find(command => command.id === 'cmd_agent_3')?.delta,
  ).toEqual({
    upserted: [],
    deleted: [{ modelName: 'agentReservation', id: 'arv_1' }],
  });
}, 20000);

it('resumes a stopped Aggregate producer after its transition acknowledgement is lost', async () => {
  await change('arv_1', now + 1000);
  expect((await node().initialize()).result._tag).toBe('Success');
  const registry = system.aggregateAgents.agentAccount;
  const declaration = registry.aggregateExpiry;
  const deployedCatalog = env.AGENT_TEST_SYSTEM_REPO.getByName(
    'sys_servicePublication',
  );
  await clearChainInputs('transition');
  await env.BUCKET.put(chainControl + 'lose-transition-reply', '');
  try {
    Reflect.deleteProperty(registry, 'aggregateExpiry');
    expect(
      (
        await deployedCatalog.acceptFixtureSystemSpec(
          makeSystemSpec({ system }),
        )
      ).result._tag,
    ).toBe('Success');
    await evictDurableObject(node());
    const interrupted = await node()
      .initialize(false, null)
      .then(
        result => result.result._tag === 'Failure',
        () => true,
      );
    expect(interrupted).toBe(true);
    expect((await state()).initialization?.status).toBe('stopping');
    expect((await state()).wakes).toEqual([]);
    await evictDurableObject(node());
    vi.mocked(Date.now).mockReturnValue(now + 1000);
    expect(await alarm()).toBe(true);
    const transitions = await readChainInputs<ITransition>('transition');
    expect(transitions).toHaveLength(2);
    expect(transitions[1]).toEqual(transitions[0]);
    expect((await state()).initialization?.status).toBe('stopped');
    expect((await state()).producer).toBe(0);
    expect(
      await runInDurableObject(node(), (_, ctx) => ctx.storage.getAlarm()),
    ).toBeNull();
  } finally {
    Reflect.set(registry, 'aggregateExpiry', declaration);
    expect(
      (
        await deployedCatalog.acceptFixtureSystemSpec(
          makeSystemSpec({ system }),
        )
      ).result._tag,
    ).toBe('Success');
  }
}, 20000);
