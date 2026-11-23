import { makeTx } from '../../make/makeTx.ts';
import type { IDatabaseDefinition, ITx } from '../../types.ts';
import { provisionDbTables } from '../provisionDbTables.ts';

/** Provision missing tables and indexes atomically. */
export const provisionDbTx = makeTx('provisionDbTx')(function* (
  tx: ITx,
  props: { definition: IDatabaseDefinition },
) {
  yield* provisionDbTables(tx, props);
});
