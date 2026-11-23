/*
 * System-worker annotation:
 * Lists the registered instances for one concrete repo type.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { RepoTypeSchema } from '@zerospin/core/system/RepoTypeSchema';
import type { IRepoType } from '@zerospin/core/system/types';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type { IAnyDrizzleSchema } from '@zerospin/shapes';
import { asc, eq, getTableName, type AnyColumn } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

const RepoTableNames = Schema.fromJsonString(Schema.Array(Schema.String));

/*
 * Secret-key inspection reads one concrete Repo kind from the singleton
 * SystemRepo's intrinsic singleton or catalog of explicit child registrations.
 *
 * 1. Describe the addressed singleton directly for SystemRepo inspection.
 * 2. Read and decode explicit child registrations for every other Repo kind.
 */
export const getRepoRegistrations = makeFn('SystemRepo.getRepoRegistrations')(
  function* (props: {
    db: IDb;
    repoTable: IAnyDrizzleSchema & {
      repoType: AnyColumn;
      repoName: AnyColumn;
    };
    repoType: IRepoType;
    systemId: string;
  }) {
    const { db, repoTable, repoType, systemId } = props;
    // 1 — the singleton owns its exact address and current fixed table schema
    if (repoType === 'SystemRepo') {
      return [
        {
          repoType,
          repoName: systemId,
          tableNames: Object.values(
            mapValues(systemRepoDbConfig.schema, getTableName),
          ),
        },
      ];
    }

    // 2 — filter child repoType and order by physical repoName
    const rows = db
      .select()
      .from(repoTable)
      .where(eq(repoTable.repoType, repoType))
      .orderBy(asc(repoTable.repoName))
      .all();

    // Decode known child Repo kinds and each JSON tableNames array.
    return yield* Effect.try({
      try: () =>
        Schema.decodeUnknownSync(
          Schema.Array(
            Schema.Struct({
              repoType: RepoTypeSchema,
              repoName: Schema.String,
              tableNames: Schema.String,
            }),
          ),
        )(rows).map(row => ({
          ...row,
          tableNames: Schema.decodeUnknownSync(RepoTableNames)(row.tableNames),
        })),

      // Retain the requested repoType and original decoding failure.
      catch: failure =>
        makeZerospinError({
          code: 'repo-registration-table-names-invalid',
          message: 'Registered repo table names are not valid JSON',
          cause: prettyUnknownFailure(failure),
          extra: { repoType },
        }),
    });
  },
);
