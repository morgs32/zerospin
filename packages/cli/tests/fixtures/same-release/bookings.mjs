import * as sdk from '@zerospin/sdk';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

const reservationsService = sdk.defineService({ name: 'reservations' });
const inventoryService = sdk.defineService({ name: 'inventory' });
const reservationId = sdk.primitives.id({ abbreviation: 'rsv' });
const handler = PATCHED ? 'corrected' : 'original';
const night = PATCHED ? 86_400_000 : 3_600_000;

export const reservation = sdk.makeModelVersion(
  sdk.defineModel({ name: 'reservation', abbreviation: 'rsv' }),
  {
    version: 1,
    attributes: {
      expiresAt: sdk.primitives.integer(),
      bookedBy: sdk.primitives.text(),
      mappedBy: sdk.primitives.text(),
    },
    indexes: [],
  },
);
export const hold = sdk.makeModelVersion(
  sdk.defineModel({ name: 'hold', abbreviation: 'hld' }),
  { version: 1, attributes: { reservationId }, indexes: [] },
);

const Hold = sdk.makeServiceContractRelease(sdk.defineServiceContract('Hold'), {
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

const completeBooking = sdk.makeServiceContractRelease(
  sdk.defineServiceContract('completeBooking'),
  {
    version: 1,
    payload: { reservationId, mappedBy: sdk.primitives.text() },
    operations: { update: reservation.operations.update },
    program: Effect.fn(function* ({ payload, operations }) {
      yield* operations.update({
        resourceId: payload.reservationId,
        attributes: { mappedBy: payload.mappedBy },
      });
    }),
  },
);

const Book = sdk.makeServiceContractRelease(sdk.defineServiceContract('Book'), {
  version: 1,
  payload: {
    reservationId,
    checkIn: sdk.primitives.integer(),
    nights: sdk.primitives.integer(),
  },
  failures: {
    aliceMissing: sdk.ContractError.schema({
      code: 'alice-reservation-missing',
    }),
  },
  models: { reservation: { model: reservation, fields: ['bookedBy'] } },
  guard: Effect.fn(function* ({ payload, db, failures }) {
    if (payload.reservationId !== 'rsv_bob') return;
    const alice = yield* sdk.findFirst({
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
    holdInventory: sdk.makeCommandOperation({
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

export const reservations = sdk.makeServiceRelease(reservationsService, {
  version: 1,
  models: { reservation },
  actors: {},
  system: { Book },
  contracts: { completeBooking },
});
export const inventory = sdk.makeServiceRelease(inventoryService, {
  version: 1,
  models: { hold },
  actors: {},
  system: { Hold },
});
