import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import type { IReadQueryResult } from '@zerospin/core/models/reads/ReadQuerySchema';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { System } from '@zerospin/core/system/System';
import type { IRpcEnvelope } from '@zerospin/logger';
import { materializeCommandTx } from '@zerospin/owner-release-worker/ServiceVersionRepo/materializeCommandTx';
import type { IServiceVersionRepoInstance } from '@zerospin/owner-release-worker/VersionRepos';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import { evictDurableObject, reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { IServiceCommandOccurrence } from '../../src/ServiceChain/types.ts';
import type { ServiceVersionChain } from '../../src/ServiceVersionChain/ServiceVersionChain.ts';
import { requireAuthoredWorkerConfig } from '../../src/workerConfiguration/workerConfiguration.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import { evaluationTimes, resetEvaluationTimes } from './observeTimeV2.ts';
import { system } from './system.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      TIMED_REPLAY_REPO: DurableObjectNamespace<IServiceVersionRepoInstance>;
      TIMED_REPLAY_HISTORY: DurableObjectNamespace<ServiceVersionChain>;
    }
  }
}

beforeEach(() => {
  resetEvaluationTimes();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

it('replays expired reservations at their original time while queries and new commands use current time', async () => {
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
  const parallel = env.TIMED_REPLAY_REPO.getByName(
    'svr_sys_servicePublication/reservations/2',
  );
  const parallelHistory = env.TIMED_REPLAY_HISTORY.getByName(
    'svc_sys_servicePublication/reservations/2',
  );
  const resources = makeDrizzleSchemaFromTable(reservation.table);
  const queries = makeQueryDbVersion({ models: { reservation } });
  expect((await source.executeCommandsThrough(0)).result._tag).toBe('Success');
  const now = Date.now() + 86_400_000;
  const expiresAt = now + 1_000;
  const afterExpiry = expiresAt + 1_000;
  const liveTime = vi.spyOn(Date, 'now').mockReturnValue(now);
  const command = {
    commandName: 'createTimedReservation',
    contractVersion: 1,
    payload: JSON.stringify({ reservationId: 'rsv_before', expiresAt }),
    serviceName: 'reservations',
    serviceVersion: 1,
    kind: 'system' as const,
  };
  const evaluated = async (input: typeof command, serviceIndex: number) => {
    const { result: admission } = await source.admitDirectSystemCommand({
      command: input,
    });
    if (admission._tag !== 'Success') expect.fail(JSON.stringify(admission));
    expect(admission.success.serviceIndex).toBe(serviceIndex);
    expect(
      (await source.executeCommandsThrough(serviceIndex)).result._tag,
    ).toBe('Success');
    const history = env.SERVICE_VERSION_CHAIN.getByName(
      'svc_sys_servicePublication/reservations/1',
    );
    await expect
      .poll(() => history.getEvaluatedCommand({ serviceIndex }))
      .toMatchObject({
        result: { _tag: 'Success', success: { id: admission.success.id } },
      });
    const { result } = await history.getEvaluatedCommand({ serviceIndex });
    if (result._tag !== 'Success' || result.success === null) {
      expect.fail(JSON.stringify(result));
    }
    return result.success;
  };
  const original = await evaluated(command, 1);
  expect(original.outcome).toEqual({
    finalizedAt: new Date(now),
    result: {
      _tag: 'Success',
      success: {
        currentTimeMillis: now,
        currentTimeNanos: String(BigInt(now) * 1_000_000n),
      },
    },
  });
  const committed = await runInDurableObject(repo, ({ db }) =>
    db.select().from(resources).all(),
  );
  expect(committed).toEqual([
    {
      id: 'rsv_before',
      expiresAt,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    },
  ]);
  const beforeQuery = queries.query.reservation
    .findMany({
      where: { expiresAt: { gt: Date.now() } },
    })
    .prepareRead();
  const before = await runInDurableObject(repo, instance =>
    instance.executeServiceQuery(beforeQuery.request),
  );
  if (before.result._tag !== 'Success') {
    throw new Error('Reservation query failed');
  }
  expect(beforeQuery.mapRows(before.result.success.rows)).toMatchObject([
    { id: 'rsv_before' },
  ]);

  liveTime.mockReturnValue(afterExpiry);
  await evictDurableObject(repo);
  expect((await repo.awaitStartup()).result._tag).toBe('Success');
  expect(
    await runInDurableObject(repo, ({ db }) =>
      db.select().from(resources).all(),
    ),
  ).toEqual(committed);
  const afterQuery = queries.query.reservation
    .findMany({
      where: { expiresAt: { gt: Date.now() } },
    })
    .prepareRead();
  const after = await runInDurableObject(repo, instance =>
    instance.executeServiceQuery(afterQuery.request),
  );
  if (after.result._tag !== 'Success') {
    throw new Error('Reservation query failed');
  }
  expect(afterQuery.mapRows(after.result.success.rows)).toEqual([]);
  const expiredCommand = {
    ...command,
    payload: JSON.stringify({ reservationId: 'rsv_after', expiresAt }),
  };
  const expired = await evaluated(expiredCommand, 2);
  expect(expired.outcome).toMatchObject({
    finalizedAt: new Date(afterExpiry),
    result: { _tag: 'Failure', failure: { code: 'reservation-expired' } },
  });
  expect(expired.operations).toEqual([]);
  using replay = await parallel.replayCommandsFanoutSubscriber({
    systemId: 'sys_servicePublication',
    serviceName: 'reservations',
  });
  expect((await replay.catchup()).result._tag).toBe('Success');
  await expect
    .poll(() => parallelHistory.getEvaluatedCommand({ serviceIndex: 2 }))
    .toMatchObject({
      result: { _tag: 'Success', success: expired },
    });
  expect(
    (await parallelHistory.getEvaluatedCommand({ serviceIndex: 1 })).result,
  ).toEqual({
    _tag: 'Success',
    success: original,
  });
  const allQuery = queries.query.reservation.findMany().prepareRead();
  const readReplayedRows = async () => {
    const { result }: IRpcEnvelope<IReadQueryResult> =
      await parallel.executeServiceQuery(allQuery.request);
    if (result._tag !== 'Success') expect.fail(JSON.stringify(result));
    return allQuery.mapRows(result.success.rows);
  };
  expect(await readReplayedRows()).toEqual(committed);
  const parallelQuery: IRpcEnvelope<IReadQueryResult> =
    await parallel.executeServiceQuery(afterQuery.request);
  if (parallelQuery.result._tag !== 'Success') {
    throw new Error('Reservation query failed');
  }
  expect(afterQuery.mapRows(parallelQuery.result.success.rows)).toEqual([]);
  expect((await replay.catchup()).result._tag).toBe('Success');
  expect(await readReplayedRows()).toEqual(committed);
}, 20_000);

it.each(['original', 'replay'] as const)(
  'freezes Service evaluation at finalizedAt during %s evaluation',
  async mode => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
        .result._tag,
    ).toBe('Success');
    expect((await systemRepo.initialize()).result._tag).toBe('Success');
    const repo = env.SERVICE_VERSION_REPO.getByName(
      'svr_sys_servicePublication/reservations/2',
    );
    const occurrence: IServiceCommandOccurrence = {
      id: 'cmd_time',
      commandName: 'observeTime',
      contractVersion: mode === 'original' ? 2 : 1,
      payload: '{}',
      serviceName: 'reservations',
      serviceVersion: mode === 'original' ? 2 : 1,
      serviceIndex: 1,
      kind: 'system',
      outcome:
        mode === 'original'
          ? null
          : {
              finalizedAt: new Date(1_000),
              result: { _tag: 'Success', success: 1_000 },
            },
    };
    const firstObservation = evaluationTimes.length;
    let wallTime = mode === 'original' ? 1_000 : 90_000;
    const evaluated = await runInDurableObject(repo, instance =>
      requireAuthoredWorkerConfig().managedRuntime.runPromise(
        Clock.clockWith(liveClock =>
          Effect.gen(function* () {
            const command = yield* materializeCommandTx(instance.db, {
              row: occurrence,
              serviceRelease: system.services.reservations.releases[2],
              key: instance.key,
              ...(mode === 'original'
                ? { mode: 'original' as const }
                : { mode: 'replay' as const, retainedCommand: null }),
            });
            return { command, liveTime: yield* Clock.currentTimeMillis };
          }).pipe(
            Effect.provideService(System, system),
            Effect.provideService(Clock.Clock, {
              ...liveClock,
              currentTimeMillisUnsafe: () => wallTime,
              currentTimeMillis: Effect.sync(() => {
                const sampled = wallTime;
                wallTime = 90_000;
                return sampled;
              }),
              currentTimeNanosUnsafe: () => BigInt(wallTime) * 1_000_000n,
              currentTimeNanos: Effect.sync(
                () => BigInt(wallTime) * 1_000_000n,
              ),
            }),
          ),
        ),
      ),
    );
    expect(evaluationTimes.slice(firstObservation)).toEqual([
      ...(mode === 'replay' ? [{ phase: 'adapter', millis: 1_000 }] : []),
      { phase: 'guard', millis: 1_000 },
      { phase: 'program', millis: 1_000 },
    ]);
    expect(evaluated.command).toMatchObject({
      id: occurrence.id,
      serviceVersion: occurrence.serviceVersion,
      outcome: {
        result: { _tag: 'Success', success: 1_000 },
        finalizedAt: new Date(1_000),
      },
    });
    expect(evaluated.liveTime).toBe(90_000);
  },
  20_000,
);
