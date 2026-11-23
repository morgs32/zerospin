import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { makeAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeCommandOperation } from '@zerospin/core/contracts/makeCommandOperation';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import { viewerV1 } from '../declarations/aggregateActors/viewerV1.ts';
import { accountAggregate } from '../declarations/aggregates/accountAggregate.ts';
import { createReservationV1 } from '../declarations/contracts/createReservationV1.ts';
import { receiveCommandV1 } from '../declarations/contracts/receiveCommandV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

import { dispatchAggregateWorkV1 } from './dispatchAggregateWorkV1.ts';

const failActorCommand = makeAggregateContractRelease(
  defineAggregateContract('failActorCommand'),
  {
    version: 1,
    payload: { note: primitives.text() },
    failures: {
      refused: ContractError.schema({ code: 'actor-command-refused' }),
    },
    program: Effect.fn(function* ({ failures, payload }) {
      if (payload.note === 'throw') throw new Error('Actor execution defect');
      return yield* failures.refused.make({ message: 'Actor command refused' });
    }),
  },
);
const failureActor = makeAggregateActorRelease(
  { name: 'failure' },
  {
    version: 1,
    db: viewerV1.db,
    exposedModels: {},
    identity: viewerV1.identity,
    authentication: viewerV1.authentication,
    selections: {},
    contracts: { failActorCommand },
  },
);
const completeAggregateReservation = makeAggregateContractRelease(
  defineAggregateContract('completeAggregateReservation'),
  {
    version: 1,
    payload: { reservationId: primitives.id({ abbreviation: 'rsv' }) },
    failures: {
      refused: ContractError.schema({ code: 'aggregate-continuation-refused' }),
    },
    program: Effect.fn(function* ({ failures }) {
      return yield* failures.refused.make({
        message: 'Aggregate continuation refused',
      });
    }),
  },
);
const dispatchWithContinuation = makeAggregateContractRelease(
  defineAggregateContract('dispatchWithContinuation'),
  {
    version: 1,
    payload: { reservationId: primitives.id({ abbreviation: 'rsv' }) },
    operations: {
      reserve: makeCommandOperation({
        destination: { service: reservationService, version: 2 },
        contract: createReservationV1,
        onSuccess: {
          contract: completeAggregateReservation,
          payload: Effect.fn('completeAggregateReservation.payload')(
            function* ({ payload }) {
              if (payload.reservationId === 'rsv_throw_in_mapper') {
                throw new Error('Aggregate command mapper failed');
              }
              return { reservationId: payload.reservationId };
            },
          ),
        },
      }),
    },
    program: Effect.fn(function* ({ payload, operations }) {
      yield* operations.reserve({
        payload: { reservationId: payload.reservationId, expiresAt: 60000 },
      });
    }),
  },
);

export const accountV1 = makeAggregateRelease(accountAggregate, {
  version: 1,
  models: {},
  actors: { viewer: viewerV1, failure: failureActor },
  system: {
    dispatchWork: dispatchAggregateWorkV1,
    dispatchWithContinuation,
    receiveCommand: receiveCommandV1,
  },
  external: {},
  contracts: { completeAggregateReservation },
});
