import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeCommandOperation } from '@zerospin/core/contracts/makeCommandOperation';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import { accountAggregate } from '../declarations/aggregates/accountAggregate.ts';
import { createReservationV1 as createReservation } from '../declarations/contracts/createReservationV1.ts';
import { receiveCommandV1 as receiveCommand } from '../declarations/contracts/receiveCommandV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

const dispatchPayload = {
  reservationId: primitives.id({ abbreviation: 'rsv' }),
  expiresAt: primitives.integer(),
  aggregateId: primitives.text(),
};
const dispatchOperations = {
  createReservation: makeCommandOperation({
    destination: { service: reservationService, version: 2 },
    contract: createReservation,
  }),
  receiveCommand: makeCommandOperation({
    destination: { aggregate: accountAggregate, version: 2 },
    contract: receiveCommand,
  }),
};

export const dispatchAggregateWorkV1 = makeAggregateContractRelease(
  defineAggregateContract('dispatchWork'),
  {
    version: 1,
    payload: dispatchPayload,
    failures: {
      refused: ContractError.schema({ code: 'dispatch-work-refused' }),
    },
    operations: dispatchOperations,
    program: Effect.fn(function* ({ payload, operations, failures }) {
      yield* operations.createReservation({
        payload: {
          reservationId: payload.reservationId,
          expiresAt: payload.expiresAt,
        },
      });
      yield* operations.receiveCommand({
        aggregateId: payload.aggregateId,
        payload: {},
      });
      if (payload.expiresAt === -1) {
        return yield* failures.refused.make({
          message: 'Source refused dispatch',
        });
      }
    }),
  },
);
