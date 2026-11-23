import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as Semaphore from 'effect/Semaphore';

import { AggregateReleaseSchema } from '../../aggregate/make/makeAggregateRelease.ts';
import { makeResourceDbConfig } from '../../drizzle/make/makeDbConfig/makeDbConfig.ts';
import { ServiceReleaseSchema } from '../../service/make/makeServiceRelease.ts';
import type { ISystem } from '../../system/types.ts';

import type { IHarnessOwnerStore } from './executionTypes.ts';
import { openHarnessDb } from './openHarnessDb.ts';
import type { ISystemHarnessCommand, ISystemHarnessOwner } from './types.ts';

/** Own one scoped resource database for each exact registered owner/release. */
export const makeHarnessStores = Effect.fn('makeHarnessStores')(function* (
  system: ISystem,
) {
  const stores = new Map<string, IHarnessOwnerStore>();
  const acquisition = yield* Semaphore.make(1);

  const get = (owner: ISystemHarnessOwner<ISystem>) =>
    acquisition.withPermits(1)(
      Effect.gen(function* () {
        const { release } = owner;
        if ('aggregateId' in owner && owner.aggregateId !== undefined) {
          if (
            !Schema.is(AggregateReleaseSchema)(release) ||
            system.aggregates[release.name]?.releases[release.version] !==
              release ||
            owner.aggregateId.length === 0
          ) {
            return yield* makeZerospinError(
              'system-harness-owner-unregistered',
            );
          }
          const key = JSON.stringify([
            'aggregate',
            release.name,
            release.version,
            owner.aggregateId,
          ]);
          const existing = stores.get(key);
          if (existing !== undefined) return existing;
          const db = yield* openHarnessDb(
            makeResourceDbConfig({ models: release.models }),
          );
          const store: IHarnessOwnerStore = {
            kind: 'aggregate',
            release,
            aggregateId: owner.aggregateId,
            db,
            execution: Semaphore.makeUnsafe(1),
          };
          stores.set(key, store);
          return store;
        }
        if (
          !Schema.is(ServiceReleaseSchema)(release) ||
          system.services[release.name]?.releases[release.version] !== release
        ) {
          return yield* makeZerospinError('system-harness-owner-unregistered');
        }
        const key = JSON.stringify(['service', release.name, release.version]);
        const existing = stores.get(key);
        if (existing !== undefined) return existing;
        const db = yield* openHarnessDb(
          makeResourceDbConfig({ models: release.models }),
        );
        const store: IHarnessOwnerStore = {
          kind: 'service',
          release,
          db,
          execution: Semaphore.makeUnsafe(1),
        };
        stores.set(key, store);
        return store;
      }),
    );

  const forCommand = (command: ISystemHarnessCommand) =>
    Effect.gen(function* () {
      if ('aggregateName' in command) {
        const release =
          system.aggregates[command.aggregateName]?.releases[
            command.aggregateVersion
          ];
        if (release === undefined) {
          return yield* makeZerospinError('system-harness-owner-unregistered');
        }
        return yield* get({ release, aggregateId: command.aggregateId });
      }
      const release =
        system.services[command.serviceName]?.releases[command.serviceVersion];
      if (release === undefined) {
        return yield* makeZerospinError('system-harness-owner-unregistered');
      }
      return yield* get({ release });
    });

  return { get, forCommand, list: () => Array.from(stores.values()) };
});
