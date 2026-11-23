import type { ITx } from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { makeEncodedRowFromResource } from '@zerospin/core/Node/resourceEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

/** Seed complete declared rows inside the caller's metadata transaction. */
export const seedMockResourcesTx = Effect.fn('seedMockResourcesTx')(
  function* (props: {
    tx: ITx;
    models: IAnyModels;
    resources:
      | Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>
      | undefined;
  }) {
    const { tx, models, resources } = props;
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
    const seeds = mapValues(resources ?? {}, (rows, modelName) => ({
      model: models[modelName],
      rows,
    }));
    for (const { model, rows } of Object.values(seeds)) {
      if (model === undefined) {
        return yield* makeZerospinError('mock-session-resource-model-invalid');
      }
      for (const row of rows) {
        if (
          row.modelName !== model.modelName ||
          row.version !== model.version
        ) {
          return yield* makeZerospinError(
            'mock-session-resource-model-invalid',
          );
        }
        const encoded = yield* Schema.encodeEffect(model.resourceJsonCodec)(
          row,
          {
            onExcessProperty: 'error',
          },
        );
        const resource = makeEncodedRowFromResource(encoded, model);
        yield* Schema.decodeUnknownEffect(model.table.codec)(resource, {
          onExcessProperty: 'error',
        });
        tx.insert(model.drizzleSchema).values(resource).run();
      }
    }
  },
);
