import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as Schema from 'effect/Schema';

import type { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';
import type { IAnyModels } from '../models/types.ts';

import { makeEncodedRowFromResource } from './resourceEnvelope.ts';

/** Prove the complete selected delta before replacing any resource within the owning transaction. */
export async function applyNodeResourceDeltaTx(props: {
  db: SqliteRemoteDatabase;
  tables: Record<string, SQLiteTable>;
  models: IAnyModels;
  delta: typeof ActorDeltaSchema.Type;
}) {
  const { db, tables, models, delta } = props;
  const resolveResourceModel = (modelName: string) => {
    const table = tables[modelName],
      model = models[modelName];
    if (table === undefined || model === undefined) {
      throw makeZerospinError('node-resource-model-invalid');
    }
    const id = getTableConfig(table).columns.find(
      column => column.name === 'id',
    );
    const idCodec = model.table.codec.fields.id;
    if (id === undefined || idCodec === undefined) {
      throw makeZerospinError('node-resource-model-invalid');
    }
    return { table, model, id, idCodec };
  };
  const deleted = delta.deleted.map(ref => {
    const row = resolveResourceModel(ref.modelName);
    if (!Schema.is(Schema.toType(row.idCodec))(ref.id)) {
      throw makeZerospinError('node-resource-invalid');
    }
    return { ...row, resourceId: ref.id };
  });
  const upserted = delta.upserted.map(resource => {
    const row = resolveResourceModel(resource.modelName);
    if (resource.version !== row.model.version) {
      throw makeZerospinError('node-resource-model-invalid');
    }
    return {
      ...row,
      resource: makeEncodedRowFromResource(resource, row.model),
    };
  });
  for (const row of deleted) {
    await db.delete(row.table).where(eq(row.id, row.resourceId));
  }
  for (const row of upserted) {
    await db
      .insert(row.table)
      .values(row.resource)
      .onConflictDoUpdate({ target: row.id, set: row.resource });
  }
}
