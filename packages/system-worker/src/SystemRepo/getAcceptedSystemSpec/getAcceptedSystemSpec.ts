import type { IDb } from '@zerospin/core/drizzle/types';
import { makeFn } from '@zerospin/logger';
import { eq, sql } from 'drizzle-orm';

import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

/** Read one exact snapshot or the newest registration matching the requested Service. */
export const getAcceptedSystemSpec = makeFn('SystemRepo.getAcceptedSystemSpec')(
  function* (props: {
    db: IDb<typeof systemRepoDbConfig>;
    selection:
      | string
      | { serviceName: string; serviceVersion: number }
      | undefined;
  }) {
    const { db, selection } = props;
    const table = systemRepoDbConfig.schema.acceptedSystemSpecs;
    let filter;
    if (typeof selection === 'string') {
      filter = eq(table.hash, selection);
    } else if (selection !== undefined) {
      filter = sql`EXISTS (
        SELECT 1 FROM json_each(${table.spec}, '$.services') AS service,
                      json_each(service.value, '$.releases') AS release
        WHERE service.key = ${selection.serviceName} AND release.key = ${String(selection.serviceVersion)}
      )`;
    }
    const row = db
      .select()
      .from(table)
      .where(filter)
      .orderBy(sql`rowid DESC`)
      .limit(1)
      .get();
    if (row === undefined) return null;
    const { spec } =
      yield* systemRepoDbConfig.tables.acceptedSystemSpecs.decodeRow(row);
    return spec;
  },
);
