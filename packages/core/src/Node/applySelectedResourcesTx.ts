import { makeZerospinError } from '@zerospin/error';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import type { ITx } from '../drizzle/types.ts';
import type { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';
import type { IAnyModels } from '../models/types.ts';

import { makeEncodedRowFromResource } from './resourceEnvelope.ts';

/** Materialize selected resources with their caller's checkpoint transaction. */
export const applySelectedResourcesTx = Effect.fn('applySelectedResourcesTx')(
  function* (props: {
    tx: ITx;
    models: IAnyModels;
    delta: typeof ActorDeltaSchema.Type;
    replace?: boolean;
  }) {
    const { tx, models, delta, replace } = props;
    const resolveModel = (modelName: string) => {
      const model = models[modelName];
      if (model === undefined) {
        throw makeZerospinError('node-resource-model-invalid');
      }
      const id = getTableColumns(model.drizzleSchema).id;
      const idCodec = model.table.codec.fields.id;
      if (id === undefined || idCodec === undefined) {
        throw makeZerospinError('node-resource-model-invalid');
      }
      return { model, id, idCodec };
    };
    const deleted = delta.deleted.map(reference => {
      const resolved = resolveModel(reference.modelName);
      if (!Schema.is(Schema.toType(resolved.idCodec))(reference.id)) {
        throw makeZerospinError('node-resource-invalid');
      }
      return { ...resolved, resourceId: reference.id };
    });
    const upserted = delta.upserted.map(resource => {
      const resolved = resolveModel(resource.modelName);
      return {
        ...resolved,
        resourceId: resource.id,
        values: makeEncodedRowFromResource(resource, resolved.model),
      };
    });
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON'));
    if (replace === true) {
      mapValues(models, model => tx.delete(model.drizzleSchema).run());
    } else {
      // Clear old values together so selected rows can exchange any unique column or index.
      for (const { model, id, resourceId } of [...deleted, ...upserted]) {
        tx.delete(model.drizzleSchema).where(eq(id, resourceId)).run();
      }
    }
    for (const { model, values } of upserted) {
      tx.insert(model.drizzleSchema).values(values).run();
    }
  },
);
