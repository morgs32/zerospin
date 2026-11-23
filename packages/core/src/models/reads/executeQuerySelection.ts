import { ensureZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IDb } from '../../drizzle/types.ts';
import type { QuerySelection } from '../make/makeQueryDbVersion.ts';
import type { IAnyModels } from '../types.ts';

import { compileReadQuery } from './compileReadQuery.ts';
import { ReadQueryResultSchema } from './ReadQuerySchema.ts';

/** Execute an authored typed selection against its exact owner's current models. */
export const executeQuerySelection = Effect.fn('executeQuerySelection')(
  function* <A>(props: {
    db: IDb;
    models: IAnyModels;
    selection: QuerySelection<A>;
  }) {
    const { db, models, selection } = props;
    return yield* Effect.try({
      try: () => {
        const read = selection.prepareRead();
        const { builtQuery } = compileReadQuery({
          models,
          query: read.request,
        });
        const rows = Schema.decodeUnknownSync(
          ReadQueryResultSchema.fields.rows,
        )(
          db._.session
            .prepareQuery(builtQuery, 'arrays', false, 'values')
            .values(),
        );
        return read.mapRows(rows);
      },
      catch: error =>
        ensureZerospinError({
          code: 'query-selection-execution-failed',
          error,
        }),
    });
  },
);
