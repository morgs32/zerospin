import * as sdk from '@zerospin/sdk';
import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';

import { system } from './system';
import { latestUserRelease } from './userReleaseSelection';

export const seeds: sdk.ISeedProgram = api =>
  Effect.gen(function* () {
    const release = system.aggregates.user.releases[latestUserRelease];
    if (!release) throw new Error(`Missing Shopping user@${latestUserRelease}`);
    const aggregateId = 'user_release_demo';
    const outcome = yield* api.executeAggregateCommand(release, {
      aggregateId,
      contractName: 'addReleaseCartItem',
      payload: {
        cartId: 'crt_release',
        cartItemId: 'cit_release',
        product: { id: 'prd_release', name: 'Coffee Mug', price: 1400 },
      },
    });
    if (outcome.result._tag === 'Failure') {
      return yield* Effect.fail(outcome.result.failure);
    }
    const db = sdk.makeQueryDbVersion({ models: release.models });
    const item = yield* api.executeAggregateQuery({
      aggregateName: 'user',
      aggregateId,
      aggregateVersion: latestUserRelease,
      query: db.query.cartItem.findFirst({
        where: { id: { eq: 'cit_release' } },
      }),
    });
    yield* Console.log({
      aggregateVersion: latestUserRelease,
      quantity: item?.quantity,
    });
  });
