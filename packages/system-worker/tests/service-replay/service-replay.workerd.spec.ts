import { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { System } from '@zerospin/core/system/System';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { materializeCommandTx } from '@zerospin/owner-release-worker/ServiceVersionRepo/materializeCommandTx';
import { ServiceVersionRepo } from '@zerospin/owner-release-worker/VersionRepos';
import * as shapeIds from '@zerospin/shapes';
import { evictDurableObject, reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { getTableName } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { IOwnerReleaseWorkerBinding } from '../../src/ownerOperations/ownerReleaseWorkerBindings.ts';
import { decodeServiceEvaluatedCommandRow } from '../../src/ServiceVersionChain/evaluatedServiceCommand.ts';
import type { IServiceVersionRepo } from '../../src/ServiceVersionRepo/types.ts';
import {
  reservationWorkEvaluations,
  resetReservationWorkEvaluations,
} from '../declarations/contracts/performReservationWorkV1.ts';
import {
  recordReservationWorkRequests,
  resetRecordReservationWork,
} from '../declarations/contracts/recordReservationWorkV1.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import { replayEvaluationsPath } from './reservationsV2.ts';
import config, { system } from './system.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      REPLAY_PARALLEL_RELEASE: Fetcher &
        Pick<
          IOwnerReleaseWorkerBinding,
          'getServiceVersionChain' | 'getServiceVersionRepo'
        >;
    }
  }
}

async function readMaterialization(
  repo: Pick<IServiceVersionRepo, 'getRepoTableRows'>,
) {
  const [resources, head] = await Promise.all([
    repo.getRepoTableRows({
      tableName: getTableName(reservation.drizzleSchema),
    }),
    repo.getRepoTableRows({ tableName: 'materializationHead' }),
  ]);
  const [rows, headRows] = await Effect.runPromise(
    Effect.all([readRpcEnvelope(resources), readRpcEnvelope(head)]),
  );
  return { resources: rows.rows, head: headRows.rows };
}

async function readParallelEvaluations() {
  const response = await env.REPLAY_PARALLEL_RELEASE.fetch(
    new URL(replayEvaluationsPath, 'https://release.internal'),
  );
  expect(response.status).toBe(200);
  return Schema.decodeUnknownSync(Schema.Number)(await response.json());
}

beforeEach(() => {
  resetReservationWorkEvaluations();
  resetRecordReservationWork();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

it('restores remote retained output without evaluation and evaluates a parallel release once', async () => {
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
  const parallelKey = {
    systemId: 'sys_servicePublication',
    serviceName: 'reservations',
    serviceVersion: 2,
  };
  const [parallel, parallelHistory] = await Promise.all([
    env.REPLAY_PARALLEL_RELEASE.getServiceVersionRepo(parallelKey),
    env.REPLAY_PARALLEL_RELEASE.getServiceVersionChain(parallelKey),
  ]);
  const evaluations = reservationWorkEvaluations;
  const parallelEvaluations = await readParallelEvaluations();
  const command = {
    commandName: 'performReservationWork',
    contractVersion: 1,
    payload: JSON.stringify({
      reservationId: 'rsv_rebuild',
      expiresAt: 60_000,
      mode: 'success',
    }),
    serviceName: 'reservations',
    serviceVersion: 1,
    kind: 'system' as const,
  };
  const admitted = await Effect.runPromise(
    readRpcEnvelope(await source.admitDirectSystemCommand({ command })),
  );
  expect(
    (await source.executeCommandsThrough(admitted.serviceIndex)).result._tag,
  ).toBe('Success');
  const evaluated = await Effect.runPromise(
    readRpcEnvelope(
      await repo.awaitCommandResult({ serviceIndex: admitted.serviceIndex }),
    ),
  );
  await expect
    .poll(() => history.getEvaluatedCommand({ serviceIndex: 1 }))
    .toMatchObject({ result: { _tag: 'Success', success: evaluated } });
  await expect
    .poll(() =>
      runInDurableObject(repo, ({ db, schema }) =>
        db.select().from(schema.serviceVersionChainOutbox).all(),
      ),
    )
    .toEqual([]);
  const committed = await readMaterialization(repo);
  async function readExternalOperations() {
    const table = await Effect.runPromise(
      readRpcEnvelope(
        await source.getRepoTableRows({ tableName: 'externalOperationOutbox' }),
      ),
    );
    return Schema.decodeUnknownSync(
      Schema.Struct({ rows: Schema.Array(Schema.Unknown) }),
    )(table).rows;
  }
  const external = await readExternalOperations();
  expect(external).toHaveLength(1);
  expect(
    evaluated.operations.map(operation => operation.operationIndex),
  ).toEqual([0, 1, 2]);
  expect(reservationWorkEvaluations).toBe(evaluations + 1);

  const newCommandIds = vi.spyOn(shapeIds, 'makeIdFromAbbreviation');
  const providerRequests = recordReservationWorkRequests.length;

  // Keep a real admitted command beyond the finalized replay prefix.
  vi.spyOn(
    ServiceVersionRepo.prototype,
    'executeCommandSubscriber',
    'get',
  ).mockImplementation(() => {
    throw new Error('Pause original execution beyond the replay prefix');
  });
  const pending = await Effect.runPromise(
    readRpcEnvelope(
      await source.admitDirectSystemCommand({
        command: {
          ...command,
          payload: JSON.stringify({
            reservationId: 'rsv_pending',
            expiresAt: 60_000,
            mode: 'noop',
          }),
        },
      }),
    ),
  );
  using fanout = await source.replayCommandsFanout;
  expect((await fanout.getPage({ afterIndex: 0 })).result).toMatchObject({
    _tag: 'Success',
    success: { lastIndex: 1, rows: [{ serviceIndex: 1, id: admitted.id }] },
  });

  using replay = await parallel.replayCommandsFanoutSubscriber({
    systemId: 'sys_servicePublication',
    serviceName: 'reservations',
  });
  expect((await replay.catchup()).result._tag).toBe('Success');
  await expect
    .poll(() => parallelHistory.getEvaluatedCommand({ serviceIndex: 1 }))
    .toMatchObject({
      result: { _tag: 'Success', success: { id: evaluated.id } },
    });
  const parallelResult = await parallelHistory.getEvaluatedCommand({
    serviceIndex: 1,
  });
  expect(parallelResult.result._tag).toBe('Success');
  if (
    parallelResult.result._tag !== 'Success' ||
    parallelResult.result.success === null
  ) {
    throw new Error('Replay failed');
  }
  expect(parallelResult.result.success).toMatchObject({
    ...admitted,
    id: evaluated.id,
    serviceVersion: 1,
    outcome: evaluated.outcome,
  });
  expect(
    parallelResult.result.success.operations.map(
      operation => operation.operationIndex,
    ),
  ).toEqual([0, 2]);
  expect(await readMaterialization(parallel)).toEqual(committed);
  expect(await readParallelEvaluations()).toBe(parallelEvaluations + 1);

  // Only this ephemeral materialization loses storage; both retained histories and ServiceChain remain.
  await runInDurableObject(repo, (_, { storage }) => storage.deleteAll());
  await evictDurableObject(repo);
  expect((await repo.awaitStartup()).result._tag).toBe('Success');
  expect(await readMaterialization(repo)).toEqual(committed);
  expect((await replay.catchup()).result._tag).toBe('Success');
  expect(reservationWorkEvaluations).toBe(evaluations + 1);
  expect(await readParallelEvaluations()).toBe(parallelEvaluations + 1);
  expect(newCommandIds).not.toHaveBeenCalled();
  expect(recordReservationWorkRequests).toHaveLength(providerRequests);
  expect(await readExternalOperations()).toEqual(external);
  expect(
    (await history.getEvaluatedCommand({ serviceIndex: 1 })).result,
  ).toEqual({
    _tag: 'Success',
    success: evaluated,
  });
  expect(
    (await source.getServiceCommand({ serviceIndex: 2 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { id: pending.id, outcome: null },
  });
  expect(
    (await parallelHistory.getEvaluatedCommand({ serviceIndex: 1 })).result,
  ).toEqual(parallelResult.result);
}, 20_000);

it('materializes retained V1 through omitted V2 codecs into the execution release', async () => {
  const v1 = makeServiceContractRelease(
    defineServiceContract('recordHistoricalReservation'),
    {
      version: 1,
      payload: {
        reservationId: shapeIds.primitives.id({ abbreviation: 'rsv' }),
        expiresAt: shapeIds.primitives.integer(),
      },
      operations: { createReservation: reservation.operations.create },
      program: Effect.fn(function* (props) {
        const { payload, operations } = props;
        yield* operations.createReservation({
          resourceId: payload.reservationId,
          attributes: { expiresAt: payload.expiresAt },
        });
      }),
    },
  );
  const v2 = upgradeServiceContractRelease(v1, {
    version: 2,
    payload: { expiresAt: shapeIds.primitives.text() },
    up: props => {
      const { payload } = props;
      return Effect.succeed({
        ...payload,
        expiresAt: String(payload.expiresAt),
      });
    },
  });
  const v3 = upgradeServiceContractRelease(v2, {
    version: 3,
    payload: { expiresAt: shapeIds.primitives.integer() },
    up: props => {
      const { payload } = props;
      return Effect.succeed({
        ...payload,
        expiresAt: Number(payload.expiresAt) + 5,
      });
    },
  });
  const executionRelease = makeServiceRelease(
    { name: 'reservations' },
    {
      version: 2,
      models: { reservation },
      actors: {},
      system: { recordHistoricalReservation: v3 },
      external: {},
    },
  );
  const replaySystem = makeSystem({
    name: 'historicalReplayDomain',
    aggregates: {},
    services: {
      reservations: { releases: { 2: executionRelease }, canonical: 2 },
    },
  });
  expect(
    Object.keys(
      makeSystemSpec({ system: replaySystem }).services.reservations
        ?.releases ?? {},
    ),
  ).toEqual(['2']);
  // Accept the configured Worker to activate its existing reservation database.
  // The explicit System dependency below isolates materialization; acceptance
  // and binding to executing code are verified at their separate lifecycle seam.
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const repo = env.SERVICE_VERSION_REPO.getByName(
    'svr_sys_servicePublication/reservations/2',
  );
  const retained = Schema.decodeUnknownSync(
    Schema.toType(ServiceChainedCommandSchema),
  )({
    id: 'cmd_historical_materialization',
    commandName: 'recordHistoricalReservation',
    contractVersion: 1,
    serviceName: 'reservations',
    serviceVersion: 1,
    serviceIndex: 1,
    kind: 'system',
    dispositionChainHash: null,
    payload: JSON.stringify({ reservationId: 'rsv_historical', expiresAt: 7 }),
    outcome: {
      result: { _tag: 'Success', success: null },
      finalizedAt: new Date(1_000),
    },
  });
  await runInDurableObject(repo, async ({ db, schema, key, dbConfig }) => {
    const evaluated = await config.managedRuntime.runPromise(
      materializeCommandTx(db, {
        row: retained,
        serviceRelease: executionRelease,
        key,
        mode: 'replay',
        retainedCommand: null,
      }).pipe(Effect.provideService(System, replaySystem)),
    );
    if (evaluated === undefined) {
      throw new Error('Historical materialization was skipped');
    }
    const resources = shapeIds.makeDrizzleSchemaFromTable(reservation.table);
    expect(db.select().from(resources).all()).toMatchObject([
      { id: 'rsv_historical', expiresAt: 12 },
    ]);
    expect(db.select().from(schema.materializationHead).all()).toEqual([
      {
        singletonId: 1,
        serviceIndex: 1,
        dispositionChainHash: evaluated.dispositionChainHash,
      },
    ]);
    const row = db.select().from(schema.serviceVersionChainOutbox).get();
    const output = await config.managedRuntime.runPromise(
      dbConfig.tables.serviceVersionChainOutbox
        .decodeRow(row)
        .pipe(Effect.flatMap(decodeServiceEvaluatedCommandRow)),
    );
    expect(output).toEqual(evaluated);
    expect(output).toMatchObject({
      id: retained.id,
      contractVersion: 1,
      serviceIndex: 1,
      outcome: {
        result: { _tag: 'Success' },
        finalizedAt: retained.outcome?.finalizedAt,
      },
      operations: [
        { modelName: 'reservation', modelVersion: 1, operationName: 'create' },
      ],
    });
  });
});
