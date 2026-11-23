import { makeZerospinError } from '@zerospin/error';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import { eq } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as Effect from 'effect/Effect';

import { sqliteEffect } from '../drizzle/sqliteEffect.ts';
import type { IDbConfig, ITx } from '../drizzle/types.ts';
import type { IModel } from '../models/types.ts';

import type { IOperationName } from './types.ts';

export const getResourceRow = Effect.fn('getResourceRow')(function* <
  CONFIG extends IDbConfig,
>(props: {
  tx: ITx<CONFIG> | SqliteRemoteDatabase;
  model: IModel;
  operationName: Exclude<IOperationName, 'create'>;
  resourceId: string;
  physicalTableName?: string | undefined;
}) {
  const { model, operationName, resourceId, tx, physicalTableName } = props;
  const table = makeDrizzleSchemaFromTable(
    model.table,
    undefined,
    true,
    physicalTableName === undefined
      ? undefined
      : { name: physicalTableName, indexes: [] },
  );
  const id = table.id;
  if (id === undefined) {
    throw new Error('Resource schema requires an id column');
  }
  const row = yield* sqliteEffect(() =>
    tx.select().from(table).where(eq(id, resourceId)).get(),
  );
  if (row === undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'operation-row-not-found',
        message: `Cannot apply ${operationName} operation on missing row "${resourceId}"`,
        extra: { modelName: model.modelName, resourceId },
      }),
    );
  }
  if (!('updatedAt' in row) || !(row.updatedAt instanceof Date)) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'operation-row-invalid-updated-at',
        message: `Cannot apply ${operationName} operation on row "${resourceId}" without updatedAt`,
        extra: { modelName: model.modelName, resourceId },
      }),
    );
  }

  const resourceRow: Record<string, unknown> & { readonly updatedAt: Date } = {
    ...row,
    modelName: model.modelName,
    version: model.version,
    updatedAt: row.updatedAt,
  };
  return resourceRow;
});
