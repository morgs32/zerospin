import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { ServiceVersionRepo } from '@zerospin/owner-release-worker/VersionRepos';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import {
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ServiceVersionChain } from '../../src/ServiceVersionChain/ServiceVersionChain.ts';
import {
  reservationWorkEvaluations,
  resetReservationWorkEvaluations,
} from '../declarations/contracts/performReservationWorkV1.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import { system } from './system.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      MATERIALIZATION_TEST_REPO: DurableObjectNamespace<ServiceVersionRepo>;
    }
  }
}

beforeEach(() => {
  resetReservationWorkEvaluations();
});

const resources = makeDrizzleSchemaFromTable(reservation.table);

beforeEach(async () => {
  await reset();
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
});
afterEach(() => vi.restoreAllMocks());

const serviceChain = () =>
  env.SERVICE_CHAIN.getByName('sc_sys_servicePublication/reservations');

async function admitWork(
  reservationId: string,
  mode: 'success' | 'noop' | 'failure' | 'rejectExtension',
) {
  const { result } = await serviceChain().admitDirectSystemCommand({
    command: {
      commandName: 'performReservationWork',
      contractVersion: 1,
      payload: JSON.stringify({ reservationId, expiresAt: 60_000, mode }),
      serviceName: 'reservations',
      serviceVersion: 1,
      kind: 'system',
    },
  });
  if (result._tag !== 'Success') expect.fail(JSON.stringify(result));
  return { ...result.success, outcome: null };
}

it('commits resources, checkpoint and complete output together, then recovers the original command locally or from history', async () => {
  const repo = env.MATERIALIZATION_TEST_REPO.getByName(
    'svr_sys_servicePublication/reservations/1',
  );
  const history = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/1',
  );
  const publication = vi
    .spyOn(ServiceVersionChain.prototype, 'appendEvaluatedCommands')
    .mockRejectedValue(new Error('Publication unavailable before commit'));
  using subscriber = await repo.executeCommandSubscriber;
  // Admit through the root Chain while this test controls each owner delivery.
  vi.spyOn(
    ServiceVersionRepo.prototype,
    'executeCommandSubscriber',
    'get',
  ).mockImplementation(() => {
    throw new Error('Original delivery paused');
  });
  const command = await admitWork('rsv_atomic', 'success');
  const readbackKey = 'service-materialization/command-read';
  await serviceChain().getServiceCommand({
    serviceIndex: command.serviceIndex,
  });
  const observedRead = await env.BUCKET.get(readbackKey);
  expect(await observedRead?.text()).toBe(String(command.serviceIndex));
  await env.BUCKET.delete(readbackKey);

  await runInDurableObject(repo, ({ db }) => {
    db.run(
      sql`CREATE TRIGGER reject_pending_output BEFORE INSERT ON serviceVersionChainOutbox BEGIN SELECT RAISE(ABORT, 'pending-output-unavailable'); END`,
    );
  });
  expect(await subscriber.receive([command])).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'service-original-execution-defect' },
    },
    telemetry: {
      spans: expect.arrayContaining([
        expect.objectContaining({
          name: 'ServiceVersionRepo.retainEvaluatedCommandTx',
          status: 'error',
          attributes: expect.objectContaining({
            'error.cause': expect.stringContaining(
              'pending-output-unavailable',
            ),
          }),
        }),
      ]),
    },
  });
  expect(
    await runInDurableObject(repo, ({ db, schema }) => ({
      resources: db.select().from(resources).all(),
      head: db.select().from(schema.materializationHead).all(),
      outbox: db.select().from(schema.serviceVersionChainOutbox).all(),
    })),
  ).toEqual({ resources: [], head: [], outbox: [] });
  expect(await env.BUCKET.head(readbackKey)).toBeNull();
  await runInDurableObject(repo, ({ db }) => {
    db.run(sql`DROP TRIGGER reject_pending_output`);
  });

  const result = (await subscriber.receive([command])).result;
  if (result._tag !== 'Success') expect.fail(JSON.stringify(result));
  const evaluated = result.success[0];
  if (evaluated === undefined) {
    expect.fail('Expected complete evaluated command');
  }
  expect(evaluated).toMatchObject({
    ...command,
    outcome: { result: { _tag: 'Success' } },
  });
  expect(
    evaluated.operations.map(({ operationName, operationIndex }) => [
      operationName,
      operationIndex,
    ]),
  ).toEqual([
    ['create', 0],
    ['external', 1],
    ['update', 2],
  ]);
  const evaluations = reservationWorkEvaluations;
  expect((await subscriber.receive([command])).result).toEqual(result);
  expect(
    (await subscriber.receive([{ ...command, payload: '{"mismatch":true}' }]))
      .result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-command-identity-mismatch' },
  });
  expect(reservationWorkEvaluations).toBe(evaluations);

  const pending = await runInDurableObject(repo, ({ db, schema }) => ({
    resources: db.select().from(resources).all(),
    head: db.select().from(schema.materializationHead).all(),
    outbox: db.select().from(schema.serviceVersionChainOutbox).all(),
  }));
  expect(pending.resources).toMatchObject([
    { id: 'rsv_atomic', expiresAt: 60_001 },
  ]);
  expect(pending.head).toMatchObject([{ serviceIndex: 1 }]);
  expect(pending.outbox).toHaveLength(1);
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.commands).all(),
    ),
  ).toEqual([]);

  publication.mockRestore();
  await runDurableObjectAlarm(repo);
  await expect
    .poll(() =>
      runInDurableObject(repo, ({ db, schema }) =>
        db.select().from(schema.serviceVersionChainOutbox).all(),
      ),
    )
    .toEqual([]);
  expect((await subscriber.receive([command])).result).toEqual(result);
  expect(reservationWorkEvaluations).toBe(evaluations);
  expect(await env.BUCKET.head(readbackKey)).toBeNull();
  expect(
    (
      await history.appendEvaluatedCommands({
        commands: [{ ...evaluated, payload: '{"mismatch":true}' }],
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-evaluated-command-mismatch' },
  });
  expect(
    (
      await history.getEvaluatedCommand({
        serviceIndex: evaluated.serviceIndex,
      })
    ).result,
  ).toEqual({ _tag: 'Success', success: evaluated });
});

it('retains noop and failure outcomes without model changes', async () => {
  const source = serviceChain();
  const repo = env.MATERIALIZATION_TEST_REPO.getByName(
    'svr_sys_servicePublication/reservations/1',
  );
  const history = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/1',
  );
  const noop = await admitWork('rsv_noop', 'noop');
  const failure = await admitWork('rsv_failure', 'rejectExtension');
  expect(
    (await source.executeCommandsThrough(failure.serviceIndex)).result,
  ).toEqual({ _tag: 'Success', success: undefined });

  using subscriber = await repo.executeCommandSubscriber;
  const evaluated = [];
  for (const command of [noop, failure]) {
    const { result } = await subscriber.receive([command]);
    if (result._tag !== 'Success' || result.success[0] === undefined) {
      expect.fail(JSON.stringify(result));
    }
    const output = result.success[0];
    evaluated.push(output);
    expect(
      (await source.getServiceCommand({ serviceIndex: command.serviceIndex }))
        .result,
    ).toEqual({
      _tag: 'Success',
      success: { ...command, outcome: output.outcome },
    });
  }
  expect(
    evaluated.map(command => [command.outcome.result._tag, command.operations]),
  ).toEqual([
    ['Success', []],
    ['Failure', []],
  ]);
  expect(
    await runInDurableObject(repo, ({ db }) =>
      db.select().from(resources).all(),
    ),
  ).toEqual([]);

  await runDurableObjectAlarm(repo);
  await expect
    .poll(() =>
      runInDurableObject(repo, ({ db, schema }) =>
        db.select().from(schema.serviceVersionChainOutbox).all(),
      ),
    )
    .toEqual([]);
  expect(
    (await history.getEvaluatedCommandPage({ afterIndex: 0 })).result,
  ).toEqual({
    _tag: 'Success',
    success: { rows: evaluated, lastIndex: 2 },
  });

  // Rebuild this release's checkpoint from both published results in one page.
  await runInDurableObject(repo, ({ db, schema }) => {
    db.delete(schema.materializationHead).run();
  });
  using replay = await repo.replayCommandsFanoutSubscriber({
    systemId: 'sys_servicePublication',
    serviceName: 'reservations',
  });
  const first = await history.getEvaluatedCommand({ serviceIndex: 1 });
  if (first.result._tag !== 'Success' || first.result.success === null) {
    expect.fail('Expected the first finalized command');
  }
  vi.spyOn(
    ServiceVersionChain.prototype,
    'getEvaluatedCommand',
  ).mockResolvedValueOnce({
    ...first,
    result: {
      _tag: 'Success',
      success: { ...first.result.success, payload: '{"changed":true}' },
    },
  });
  expect((await replay.catchup(2)).result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-command-identity-mismatch' },
  });

  const restored = await replay.catchup(2);
  expect(restored.result._tag).toBe('Success');
  expect(
    restored.telemetry.spans.filter(
      span => span.name === 'FanoutQueue.getPage',
    ),
  ).toHaveLength(1);
  expect(
    (
      await replay.receive({
        rows: [{ ...first.result.success, payload: '{"changed":true}' }],
        lastIndex: 2,
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-command-identity-mismatch' },
  });
});
