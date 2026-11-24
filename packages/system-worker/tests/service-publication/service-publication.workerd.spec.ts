import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import type { IRepoTableData } from '@zerospin/core/system/types';
import type { IRpcEnvelope } from '@zerospin/logger';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { afterEach, expect, it, vi } from 'vitest';

import { ServiceVersionArchive } from '../../src/ServiceVersionArchive/ServiceVersionArchive.ts';
import { ServiceVersionChain } from '../../src/ServiceVersionChain/ServiceVersionChain.ts';
import { getServiceVersionRepo } from '../../src/ServiceVersionRepo/getServiceVersionRepo.ts';
import {
  configureServingSystemSpec,
  listPinnedOwnerReleases,
  readServingSystemSpec,
} from '../../src/workerConfiguration/workerConfiguration.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import {
  reservationEvaluations,
  resetReservationEvaluations,
} from './createReservationV1.ts';
import config, { pinnedOlderConfig, system } from './system.ts';

afterEach(async () => {
  vi.restoreAllMocks();
  resetReservationEvaluations();
  await reset();
});

it('retries a lost publication reply after ServiceVersionRepo eviction without evaluating again', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');

  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const repo = env.SERVICE_VERSION_REPO.getByName(
    'svr_sys_servicePublication/reservations/1',
  );
  const history = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/1',
  );
  const resources = makeDrizzleSchemaFromTable(reservation.table);
  let lostReplies = 0;

  const append = ServiceVersionChain.prototype.appendEvaluatedCommands;
  const publication = vi
    .spyOn(ServiceVersionChain.prototype, 'appendEvaluatedCommands')
    .mockImplementation(async function (this: ServiceVersionChain, props) {
      const reply = await append.call(this, props);
      if (reply.result._tag === 'Success') {
        lostReplies += 1;
        throw new Error('Lost publication reply after durable commit');
      }
      return reply;
    });

  let archiveFault: 'before commit' | 'after commit' | null = 'before commit';
  let lostArchiveReplies = 0;
  const appendArchive = ServiceVersionArchive.prototype.appendEvaluatedCommands;
  vi.spyOn(
    ServiceVersionArchive.prototype,
    'appendEvaluatedCommands',
  ).mockImplementation(async function (this: ServiceVersionArchive, props) {
    if (this.key.serviceVersion !== 1) return appendArchive.call(this, props);
    if (archiveFault === 'before commit') {
      throw new Error('Archive unavailable');
    }
    const reply = await appendArchive.call(this, props);
    if (archiveFault === 'after commit' && reply.result._tag === 'Success') {
      lostArchiveReplies += 1;
      throw new Error('Lost Archive reply after durable commit');
    }
    return reply;
  });

  const evaluationsBefore = reservationEvaluations;
  const command = {
    id: 'cmd_publication',
    commandName: 'createReservation',
    contractVersion: 1,
    payload: JSON.stringify({ reservationId: 'rsv_one', expiresAt: 60_000 }),
    serviceName: 'reservations',
    serviceVersion: 1,
    kind: 'system',
  } as const;
  expect(
    (
      await source.admitFromServiceChain({
        source: {
          systemId: 'sys_servicePublication',
          serviceName: 'reservations',
        },
        position: { sourceIndex: 1, operationIndex: 0 },
        command,
      })
    ).result._tag,
  ).toBe('Success');
  expect((await source.executeCommandsThrough(1)).result).toMatchObject({
    _tag: 'Success',
  });
  await expect.poll(() => lostReplies).toBeGreaterThan(0);

  const pending = await runInDurableObject(repo, ({ db, schema }) => ({
    resources: db.select().from(resources).all(),
    head: db.select().from(schema.materializationHead).all(),
    outbox: db.select().from(schema.serviceVersionChainOutbox).all(),
  }));
  expect(pending.resources).toMatchObject([
    { id: 'rsv_one', expiresAt: 60_000 },
  ]);
  expect(pending.head).toMatchObject([{ serviceIndex: 1 }]);
  expect(pending.outbox).toMatchObject([
    { id: 'cmd_publication', serviceIndex: 1, serviceVersion: 1 },
  ]);
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.commands).all(),
    ),
  ).toEqual(pending.outbox);
  // The counter belongs to the original release program.
  await expect.poll(() => reservationEvaluations).toBe(evaluationsBefore + 1);
  const evaluations = reservationEvaluations;
  const retainedCommand = (
    await history.getEvaluatedCommand({ serviceIndex: 1 })
  ).result;

  const compactedThrough = async () => {
    const { result }: IRpcEnvelope<IRepoTableData> =
      await source.getRepoTableRows({
        tableName: 'finalizedPosition',
      });
    if (result._tag !== 'Success') expect.fail(JSON.stringify(result));
    return result.success.rows[0]?.compactedThroughIndex;
  };
  expect(await compactedThrough()).toBe(0);

  publication.mockRestore();
  await evictDurableObject(repo);
  await runDurableObjectAlarm(repo);
  await expect
    .poll(() =>
      runInDurableObject(repo, ({ db, schema }) => ({
        resources: db.select().from(resources).all(),
        head: db.select().from(schema.materializationHead).all(),
        outbox: db.select().from(schema.serviceVersionChainOutbox).all(),
      })),
    )
    .toEqual({ ...pending, outbox: [] });
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.commands).all(),
    ),
  ).toEqual(pending.outbox);
  expect(reservationEvaluations).toBe(evaluations);
  await expect
    .poll(async () => {
      await source.onAlarm();
      return compactedThrough();
    })
    .toBe(1);
  expect(
    (await source.getServiceCommand({ serviceIndex: 1 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { id: command.id, serviceIndex: 1 },
  });

  archiveFault = 'after commit';
  expect(
    Exit.isFailure(
      await runInDurableObject(history, instance =>
        config.managedRuntime.runPromise(
          instance.archiveFanout.drain().pipe(Effect.exit),
        ),
      ),
    ),
  ).toBe(true);
  expect(lostArchiveReplies).toBeGreaterThan(0);
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.archiveFanoutSubscribers).all(),
    ),
  ).toMatchObject([{ acknowledgedServiceIndex: 0 }]);
  archiveFault = null;
  await evictDurableObject(history);
  await runInDurableObject(history, instance =>
    config.managedRuntime.runPromise(instance.archiveFanout.drain()),
  );
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.commands).all(),
    ),
  ).toEqual([]);
  expect(
    (await history.getEvaluatedCommand({ serviceIndex: 1 })).result,
  ).toEqual(retainedCommand);
  expect(reservationEvaluations).toBe(evaluations);
}, 20_000);

it('restores the branch predecessor through enrollment and evaluates the next command on the child release', async () => {
  const systemId = 'sys_servicePublication';
  const serviceName = 'reservations';
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const catalog = env.SYSTEM_REPO.getByName(systemId);
  const current = readServingSystemSpec();
  if (current === undefined) expect.fail('Expected the stable System Worker');
  const select = (spec: typeof current) => {
    env.ZEROSPIN_SYSTEM_SPEC_HASH = spec.hash;
    configureServingSystemSpec(
      JSON.stringify({ spec, ownerReleases: listPinnedOwnerReleases() }),
    );
  };
  const admit = (index: number) =>
    source.admitDirectSystemCommand({
      command: {
        serviceName,
        serviceVersion: 1,
        contractVersion: 1,
        kind: 'system',
        commandName: 'createReservation',
        payload: JSON.stringify({
          reservationId: 'rsv_branch_' + index,
          expiresAt: 60_000,
        }),
      },
    });
  try {
    const first = makeSystemSpec({ system: pinnedOlderConfig().system });
    // The fixture owner Workers were built with the full declaration.
    expect(
      (await catalog.registerSystemSpec({ spec: current })).result._tag,
    ).toBe('Success');
    select(first);
    expect(
      (await catalog.registerSystemSpec({ spec: first })).result._tag,
    ).toBe('Success');
    expect((await catalog.initialize()).result._tag).toBe('Success');
    expect((await admit(1)).result._tag).toBe('Success');
    expect((await source.executeCommandsThrough(1)).result._tag).toBe(
      'Success',
    );
    await expect
      .poll(async () => {
        await source.onAlarm();
        const { result }: IRpcEnvelope<IRepoTableData> =
          await source.getRepoTableRows({ tableName: 'finalizedPosition' });
        return result;
      })
      .toMatchObject({
        _tag: 'Success',
        success: { rows: [{ compactedThroughIndex: 1 }] },
      });
    select(current);
    expect(
      (await catalog.registerSystemSpec({ spec: current })).result._tag,
    ).toBe('Success');
    await evictDurableObject(source);
    expect((await source.awaitStartup()).result._tag).toBe('Success');
    const child = await Effect.runPromise(
      getServiceVersionRepo({
        key: { systemId, serviceName, serviceVersion: 2 },
      }),
    );
    expect(
      (await child.awaitCommandResult({ serviceIndex: 1 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: { outcome: { result: { _tag: 'Success', success: null } } },
    });
    expect((await admit(2)).result._tag).toBe('Success');
    expect(
      (await child.awaitCommandResult({ serviceIndex: 2 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: {
        outcome: { result: { _tag: 'Success', success: 'evaluated-by-v2' } },
      },
    });
  } finally {
    select(current);
  }
}, 20_000);
