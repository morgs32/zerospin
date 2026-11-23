import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { provisionDbTables } from '@zerospin/core/drizzle/provisionDb/provisionDbTables';
import { validateDbSchema } from '@zerospin/core/drizzle/provisionDb/validateDbSchema';
import type { IDatabaseDefinition, ITx } from '@zerospin/core/drizzle/types';

import { stampMigration } from './migrationLedger.js';
import type { IPreparedDORepoMigration } from './types.js';

/** Provision the current graph and stamp represented history without replaying old DDL. */
export const provisionMigratableSchemaTx = makeTx(
  'MigratableDORepo.provisionSchema',
)(function* (
  tx: ITx,
  props: {
    definition: IDatabaseDefinition;
    history: readonly IPreparedDORepoMigration[];
  },
) {
  const { definition, history } = props;
  yield* provisionDbTables(tx, { definition });
  yield* validateDbSchema(tx, { definition });
  for (const migration of history) {
    yield* stampMigration(tx, migration);
  }
});
