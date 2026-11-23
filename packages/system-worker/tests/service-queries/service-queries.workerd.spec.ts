import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import { expect, it } from 'vitest';

import { getNativeSystemApi } from '../../src/getNativeSystemApi/getNativeSystemApi.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import { system } from './system.ts';

it('reads declared ServiceVersionRepo rows through native queries and rejects an undeclared model', async () => {
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
  expect(
    (
      await source.admitFromServiceChain({
        source: {
          systemId: 'sys_servicePublication',
          serviceName: 'reservations',
        },
        position: { sourceIndex: 1, operationIndex: 0 },
        command: {
          id: 'cmd_queries',
          commandName: 'createReservation',
          contractVersion: 1,
          payload: JSON.stringify({
            reservationId: 'rsv_queries',
            expiresAt: 60_000,
          }),
          serviceName: 'reservations',
          serviceVersion: 1,
          kind: 'system',
        },
      })
    ).result._tag,
  ).toBe('Success');
  expect((await source.executeCommandsThrough(1)).result._tag).toBe('Success');

  const resources = makeDrizzleSchemaFromTable(reservation.table);
  const stored = await runInDurableObject(repo, ({ db }) =>
    db.select().from(resources).all(),
  );
  expect(stored).toMatchObject([{ id: 'rsv_queries', expiresAt: 60_000 }]);

  const queries = makeQueryDbVersion({ models: { reservation } });
  const selection = queries.query.reservation.findMany({
    columns: { id: true, expiresAt: true, createdAt: true },
  });
  const api = getNativeSystemApi('sys_servicePublication');
  // Publication uses these same physical Repo names with two releases in its own project.
  expect(
    await Effect.runPromise(
      api
        .executeServiceQuery({
          serviceName: 'reservations',
          serviceVersion: 2,
          query: selection,
        })
        .pipe(Effect.flip),
    ),
  ).toMatchObject({ code: 'listed versions-not-found' });
  const collector = makeTelemetryCollector();
  const rows = await Effect.runPromise(
    api
      .executeServiceQuery({
        serviceName: 'reservations',
        serviceVersion: 1,
        query: selection,
      })
      .pipe(
        Effect.withSpan('serviceQueries.readReservations'),
        Effect.provide(makeTelemetryLayer(collector)),
      ),
  );
  expect(rows).toEqual(
    stored.map(({ id, expiresAt, createdAt }) => ({
      id,
      expiresAt,
      createdAt: new Date(createdAt),
    })),
  );
  expect(collector.flush().links.length).toBeGreaterThan(0);
  expect(
    await Effect.runPromise(
      api.executeServiceQuery({
        serviceName: 'reservations',
        serviceVersion: 1,
        query: queries.query.reservation.findFirst({
          where: { id: { eq: 'rsv_missing' } },
        }),
      }),
    ),
  ).toBeUndefined();
  expect(
    await Effect.runPromise(
      api.executeServiceQuery({
        serviceName: 'reservations',
        serviceVersion: 1,
        query: queries.query.reservation.findMany({
          where: { id: { eq: 'rsv_missing' } },
        }),
      }),
    ),
  ).toEqual([]);
  expect(
    (
      await runInDurableObject(repo, instance =>
        instance.executeServiceQuery({
          ...selection.prepareRead().request,
          modelName: 'undeclared',
        }),
      )
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-query-execution-failed' },
  });
});
