import type { IDb } from '@zerospin/core/drizzle/types';
import { ensureZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IRecoveryRegistry } from '../../makeRecoveryRegistry/makeRecoveryRegistry.js';
import { readExecutingSystemSpec } from '../../workerConfiguration/workerConfiguration.js';
import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';
import { compactAggregateHistory } from '../compactAggregateHistory.js';

/** Give each newly listed child the same admitted prefix at enrollment. */
export const onRepoStartup = Effect.fn('AggregateChain.onRepoStartup')(
  function* (props: {
    db: IDb;
    key: { systemId: string; aggregateId: string; aggregateName: string };
    recoveryRegistry: IRecoveryRegistry;
  }) {
    const { db, key, recoveryRegistry } = props;
    const system = readExecutingSystemSpec();
    const releases = Object.values(
      system.aggregates[key.aggregateName]?.releases ?? {},
    );
    yield* recoveryRegistry.hold('finalizeCommandOutbox');
    yield* recoveryRegistry.hold('replayCommandsFanout');
    yield* Effect.try({
      try: () =>
        db.transaction(tx => {
          const { commandProgress, replaySubscribers } =
            aggregateChainDbConfig.schema;
          tx.insert(commandProgress)
            .values({
              singleton: 1,
              admittedThroughIndex: 0,
              finalizedThroughIndex: 0,
              compactedThroughIndex: 0,
            })
            .onConflictDoNothing()
            .run();
          const { admittedThroughIndex } = tx
            .select()
            .from(commandProgress)
            .get()!;
          for (const release of releases) {
            tx.insert(replaySubscribers)
              .values({
                aggregateVersion: release.version,
                acknowledgedAggregateIndex: 0,
                initializationThroughIndex:
                  release.branchFrom === undefined &&
                  release.rebuildFrom === undefined
                    ? 0
                    : admittedThroughIndex,
              })
              .onConflictDoNothing()
              .run();
          }
          compactAggregateHistory(
            tx,
            releases.map(release => release.version),
          );
        }),
      catch: error =>
        ensureZerospinError({
          code: 'aggregate-replay-enrollment-failed',
          error,
        }),
    });
  },
);
