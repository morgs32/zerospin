import type { IDb } from '@zerospin/core/drizzle/types';
import { compileReadQuery } from '@zerospin/core/models/reads/compileReadQuery';
import {
  ReadQueryResultSchema,
  type IReadQuery,
} from '@zerospin/core/models/reads/ReadQuerySchema';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ensureZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type * as Semaphore from 'effect/Semaphore';

import type { ServiceVersionRepo } from '../ServiceVersionRepo.js';

/**
 * 1. Resolve declared models from this owner's retained key.
 * 2. Compile and collect current committed positional rows synchronously under the permit.
 */
export const executeServiceQuery = makeFn(
  'ServiceVersionRepo.executeServiceQuery',
)(function* (props: {
  db: IDb;
  key: ServiceVersionRepo['key'];
  query: IReadQuery;
  execution: Semaphore.Semaphore;
}) {
  const { db, key, query, execution } = props;
  const system = yield* System;
  const registry = yield* getByKeyOrThrow({
    record: system.services,
    key: key.serviceName,
    recordKind: 'services',
  });
  const serviceRelease = yield* getByKeyOrThrow({
    record: registry.releases,
    key: key.serviceVersion,
    recordKind: 'listed versions',
  });

  return yield* execution.withPermits(1)(
    Effect.try({
      try: () => {
        const { builtQuery, compilerVersion, layout } = compileReadQuery({
          models: serviceRelease.models,
          query,
        });
        const rows = Schema.decodeUnknownSync(
          ReadQueryResultSchema.fields.rows,
        )(
          db._.session
            .prepareQuery(builtQuery, 'arrays', false, 'values')
            .values(),
        );
        return { rows, compilerVersion, layout };
      },
      catch: error =>
        ensureZerospinError({
          code: 'service-query-execution-failed',
          error,
        }),
    }),
  );
});
