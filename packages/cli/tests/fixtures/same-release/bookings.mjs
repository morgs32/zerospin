import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeCommandOperation } from '@zerospin/core/contracts/makeCommandOperation';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { defineService } from '@zerospin/core/service/defineService';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

const reservationsService = defineService({ name: 'reservations' });
const inventoryService = defineService({ name: 'inventory' });
const reservationId = primitives.id({ abbreviation: 'rsv' });
const handler = globalThis.PATCHED ? 'corrected' : 'original';
const night = globalThis.PATCHED ? 86_400_000 : 3_600_000;

export const reservation = makeModelVersion(
  defineModel({ name: 'reservation', abbreviation: 'rsv' }),
  {
    version: 1,
    attributes: {
      expiresAt: primitives.integer(),
      bookedBy: primitives.text(),
      mappedBy: primitives.text(),
    },
    indexes: [],
  },
);
export const hold = makeModelVersion(
  defineModel({ name: 'hold', abbreviation: 'hld' }),
  { version: 1, attributes: { reservationId }, indexes: [] },
);

const Hold = makeServiceContractRelease(defineServiceContract('Hold'), {
  version: 1,
  payload: { reservationId },
  result: Schema.String,
  operations: { create: hold.operations.create },
  program: Effect.fn(function* ({ payload, operations }) {
    yield* operations.create({
      resourceId: 'hld_' + payload.reservationId.slice(4),
      attributes: { reservationId: payload.reservationId },
    });
    return payload.reservationId;
  }),
});

const completeBooking = makeServiceContractRelease(
  defineServiceContract('completeBooking'),
  {
    version: 1,
    payload: { reservationId, mappedBy: primitives.text() },
    operations: { update: reservation.operations.update },
    program: Effect.fn(function* ({ payload, operations }) {
      yield* operations.update({
        resourceId: payload.reservationId,
        attributes: { mappedBy: payload.mappedBy },
      });
    }),
  },
);

const Book = makeServiceContractRelease(defineServiceContract('Book'), {
  version: 1,
  payload: {
    reservationId,
    checkIn: primitives.integer(),
    nights: primitives.integer(),
  },
  failures: {
    aliceMissing: ContractError.schema({
      code: 'alice-reservation-missing',
    }),
  },
  models: { reservation: { model: reservation, fields: ['bookedBy'] } },
  guard: Effect.fn(function* ({ payload, db, failures }) {
    if (payload.reservationId !== 'rsv_bob') return;
    const alice = yield* findFirst({
      db,
      model: db.models.reservation,
      where: { id: { eq: 'rsv_alice' } },
    });
    if (alice?.bookedBy !== 'original') {
      return yield* failures.aliceMissing.make({
        message: 'Bob requires the original Alice reservation',
      });
    }
  }),
  operations: {
    create: reservation.operations.create,
    holdInventory: makeCommandOperation({
      destination: { service: inventoryService, version: 1 },
      contract: Hold,
      onSuccess: {
        contract: completeBooking,
        payload: ({ success }) =>
          Effect.succeed({ reservationId: success, mappedBy: handler }),
      },
    }),
  },
  program: Effect.fn(function* ({ payload, operations }) {
    yield* operations.create({
      resourceId: payload.reservationId,
      attributes: {
        expiresAt: payload.checkIn + payload.nights * night,
        bookedBy: handler,
        mappedBy: 'pending',
      },
    });
    if (payload.reservationId === 'rsv_rollback' && env.FAIL_BOOKING === true) {
      throw new Error('Interrupted after staging reservation');
    }
    if (
      payload.reservationId === 'rsv_alice' ||
      payload.reservationId === 'rsv_bob'
    ) {
      yield* operations.holdInventory({
        payload: { reservationId: payload.reservationId },
      });
    }
  }),
});

export const reservations = makeServiceRelease(reservationsService, {
  version: 1,
  models: { reservation },
  actors: {},
  system: { Book },
  contracts: { completeBooking },
});
export const inventory = makeServiceRelease(inventoryService, {
  version: 1,
  models: { hold },
  actors: {},
  system: { Hold },
});
