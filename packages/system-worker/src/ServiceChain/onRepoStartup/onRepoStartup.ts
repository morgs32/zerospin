import type { IDb } from '@zerospin/core/drizzle/types';
import { ensureZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import type { IRecoveryRegistry } from '../../makeRecoveryRegistry/makeRecoveryRegistry.js';
import { compactServiceHistory } from '../compactServiceHistory.js';
import { serviceChainDbConfig } from '../serviceChainDbConfig.js';

/** Newly registered executors subscribe from the retained beginning; existing cursors keep their position. */
export const enrollRegisteredServiceReleases = Effect.fn(
  'ServiceChain.enrollRegisteredServiceReleases',
)(function* (db: IDb, key: { systemId: string; serviceName: string }) {
  const spec = yield* getSystemSpec(key.systemId);
  const releases = Object.values(
    spec.services[key.serviceName]?.releases ?? {},
  );
  if (releases.length === 0) return;
  yield* Effect.try({
    try: () =>
      db.transaction(tx => {
        const { admissionPosition, replaySubscribers } =
          serviceChainDbConfig.schema;
        const admittedThroughIndex =
          tx.select().from(admissionPosition).get()?.lastIndex ?? 0;
        for (const release of releases) {
          const predecessor = release.branchFrom ?? release.rebuildFrom;
          tx.insert(replaySubscribers)
            .values({
              serviceVersion: release.version,
              acknowledgedServiceIndex: 0,
              initializationThroughIndex:
                predecessor === undefined ? 0 : admittedThroughIndex,
            })
            .onConflictDoNothing()
            .run();
        }
        compactServiceHistory(
          tx,
          releases.map(release => release.version),
        );
      }),
    catch: error =>
      ensureZerospinError({ code: 'service-replay-enrollment-failed', error }),
  });
});

export const onRepoStartup = Effect.fn('ServiceChain.onRepoStartup')(
  function* (props: {
    db: IDb;
    key: { systemId: string; serviceName: string };
    recoveryRegistry: IRecoveryRegistry;
  }) {
    const { key, recoveryRegistry, db } = props;
    yield* recoveryRegistry.hold('executeCommandOutbox');
    yield* recoveryRegistry.hold('replayCommandsFanout');
    db.insert(serviceChainDbConfig.schema.finalizedPosition)
      .values({ singleton: 1, lastIndex: 0, compactedThroughIndex: 0 })
      .onConflictDoNothing()
      .run();
    yield* enrollRegisteredServiceReleases(db, key);
  },
);
