/*
 * System-worker annotation:
 * Registers one concrete Durable Object repo and its local SQLite tables.
 */

import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import type { IRepoRegistration } from '@zerospin/core/system/types';
import { makeFn } from '@zerospin/logger';

import { requireAcceptedSystemSpec } from '../requireAcceptedSystemSpec.js';
import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

/*
 * Repo startup records its physical instance and table names in SystemRepo.
 * A repeated registration updates table metadata for the same repoType/repoName.
 *
 * 1. Require the Repo's complete SystemSpec hash to have already been accepted.
 * 2. Commit the physical Repo metadata.
 */
export const registerRepo = makeFn('SystemRepo.registerRepo')(
  function* (props: {
    db: IDb<typeof systemRepoDbConfig>;
    registration: IRepoRegistration;
    systemSpecHash: string;
  }) {
    const { db, registration, systemSpecHash } = props;
    // Accepted snapshots are retained permanently; registration only reads membership.
    yield* requireAcceptedSystemSpec(db, systemSpecHash);

    yield* makeTx('SystemRepo.registerRepo.transaction')(function* (
      tx: ITx<typeof systemRepoDbConfig>,
      repoRegistration: IRepoRegistration,
    ) {
      tx.insert(systemRepoDbConfig.schema.repos)
        .values({
          repoType: repoRegistration.repoType,
          repoName: repoRegistration.repoName,
          tableNames: JSON.stringify(repoRegistration.tableNames),
        })
        .onConflictDoUpdate({
          target: [
            systemRepoDbConfig.schema.repos.repoType,
            systemRepoDbConfig.schema.repos.repoName,
          ],
          set: { tableNames: JSON.stringify(repoRegistration.tableNames) },
        })
        .run();
    })(db, registration);
  },
);
