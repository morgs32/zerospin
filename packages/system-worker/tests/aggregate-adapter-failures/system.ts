import { makeAgentCommandRef } from '@zerospin/core/agent/makeAgentCommandRef';
import { makeAggregateAgentRelease } from '@zerospin/core/agent/makeAggregateAgentRelease';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineAggregateExternalContract } from '@zerospin/core/contracts/defineAggregateExternalContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeAggregateExternalContractRelease } from '@zerospin/core/contracts/make/makeAggregateExternalContractRelease';
import { upgradeAggregateContractRelease } from '@zerospin/core/contracts/make/upgradeAggregateContractRelease';
import { makeCommandOperation } from '@zerospin/core/contracts/makeCommandOperation';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { env } from 'cloudflare:workers';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';

// oxlint-disable-next-line eslint/no-restricted-imports -- Canonical replay exercises the actual Game release.
import { aggregateRelease as gameV1 } from '../../../../examples/tic-tac-toe/src/gameAggregateReleaseV1.ts';
// oxlint-disable-next-line eslint/no-restricted-imports -- Snapshot replay uses the actual example releases.
import { gameReleaseV2 } from '../../../../examples/tic-tac-toe/src/gameAggregateReleaseV2.ts';
// oxlint-disable-next-line eslint/no-restricted-imports -- Snapshot replay uses the actual example releases.
import { gameReleaseV3 } from '../../../../examples/tic-tac-toe/src/gameAggregateReleaseV3.ts';
import { reservationsV2 } from '../chain-command-delivery/reservationsV2.ts';
import { createReservationV1 } from '../declarations/contracts/createReservationV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

import { accountV1 } from './accountV1.ts';
import { accountV2 } from './accountV2.ts';

export const system = makeSystem({
  name: 'servicePublication',

  aggregates: {
    account: { releases: { 1: accountV1, 2: accountV2 } },
    game: {
      releases: { 1: gameV1, 2: gameReleaseV2, 3: gameReleaseV3 },
    },
  },
  services: {},
});

// oxlint-disable-next-line import/no-default-export -- The production config alias supplies this scenario's System.
export default makeConfig({
  system,
  systemId: 'sys_servicePublication',
});

class PaymentProvider extends Context.Service<
  PaymentProvider,
  { readonly releaseVersion: number }
>()('PaymentProvider') {}

const paymentLayer = (releaseVersion: number) =>
  Layer.succeed(PaymentProvider, { releaseVersion });

const checkout = { name: 'checkout' } as const;
export const payment = makeModelVersion(
  defineModel({ name: 'payment', abbreviation: 'pay' }),
  { version: 1, attributes: { decision: primitives.text() }, indexes: [] },
);
const reserve = makeCommandOperation({
  destination: { service: reservationService, version: 2 },
  contract: createReservationV1,
});
function makeRecordPayment() {
  return makeAggregateContractRelease(
    defineAggregateContract('recordPayment'),
    {
      version: 1,
      payload: {
        paymentId: primitives.id({ abbreviation: 'pay' }),
        decision: primitives.text(),
      },
      operations: { create: payment.operations.create, reserve },
      program: Effect.fn(function* ({ payload, operations }) {
        yield* operations.create({
          resourceId: payload.paymentId,
          attributes: { decision: payload.decision },
        });
        yield* operations.reserve({
          payload: { reservationId: 'rsv_pinned_payment', expiresAt: 60_000 },
        });
      }),
    },
  );
}
function makeFinishCheckout() {
  return makeAggregateContractRelease(
    defineAggregateContract('finishCheckout'),
    {
      version: 1,
      payload: {},
      program: () => Effect.void,
    },
  );
}
const reservations = { releases: { 2: reservationsV2 } } as const;
const systemId = 'sys_servicePublication';

function makePinnedOlderRelease(
  recordPayment: ReturnType<typeof makeRecordPayment>,
  finishCheckout: ReturnType<typeof makeFinishCheckout>,
) {
  return makeAggregateRelease(checkout, {
    version: 1,
    layer: paymentLayer(1),
    models: { payment },
    actors: {},
    system: { finishCheckout },
    contracts: { recordPayment },
  });
}

export function pinnedOlderConfig() {
  return makeConfig({
    systemId,
    system: makeSystem({
      name: 'servicePublication',
      aggregates: { checkout: { releases: { 1: pinnedOlderRelease } } },
      services: { reservations },
    }),
  });
}

function makePinnedNewerRelease(
  older: ReturnType<typeof makePinnedOlderRelease>,
  recordPayment: ReturnType<typeof makeRecordPayment>,
  finishCheckout: ReturnType<typeof makeFinishCheckout>,
) {
  const assertPaymentOwner = Effect.sync(() => {
    if (!('ZEROSPIN_OWNER_RELEASE' in env)) {
      throw new Error(
        'Payment operations must run in the pinned owner executable',
      );
    }
  });
  const recordPaymentV2 = upgradeAggregateContractRelease(recordPayment, {
    version: 2,
    operations: { create: payment.operations.create, reserve },
    payload: { decision: null, providerDecision: primitives.text() },
    up: Effect.fn(function* ({ payload }) {
      return {
        paymentId: payload.paymentId,
        providerDecision: payload.decision,
      };
    }),
    down: Effect.fn(function* ({ payload }) {
      return {
        paymentId: payload.paymentId,
        decision: 'adapted-' + payload.providerDecision,
      };
    }),
    program: Effect.fn(function* ({ payload, operations }) {
      yield* operations.create({
        resourceId: payload.paymentId,
        attributes: { decision: payload.providerDecision },
      });
      yield* operations.reserve({
        payload: { reservationId: 'rsv_pinned_payment', expiresAt: 60_000 },
      });
    }),
  });
  const finishCheckoutV2 = upgradeAggregateContractRelease(finishCheckout, {
    version: 2,
    payload: { reason: primitives.text() },
    up: () => Effect.succeed({ reason: 'completed' }),
    down: () => Effect.succeed({}),
    program: () => Effect.void,
  });
  const reviewPayment = makeAggregateContractRelease(
    defineAggregateContract('reviewPayment'),
    {
      version: 1,
      payload: {
        paymentId: recordPayment.payload.paymentId,
        reason: primitives.text(),
      },
      program: () => Effect.void,
    },
  );
  const paymentRequest = defineAggregateExternalContract({
    name: 'paymentRequest',
    version: 1,
    payload: { paymentId: primitives.id({ abbreviation: 'pay' }) },
    response: Schema.Literal('declined'),
  });
  const requestPayment = makeAggregateContractRelease(
    defineAggregateContract('requestPayment'),
    {
      version: 1,
      payload: paymentRequest.payload,
      operations: { requestPayment: paymentRequest.externalOperation },
      program: Effect.fn(function* ({ payload, operations }) {
        yield* operations.requestPayment({ payload });
      }),
    },
  );
  return makeAggregateRelease(checkout, {
    version: 2,
    layer: paymentLayer(2),
    branchFrom: older,
    models: { payment },
    actors: {},
    system: { requestPayment, finishCheckout: finishCheckoutV2 },
    contracts: { recordPayment: recordPaymentV2, reviewPayment },
    external: {
      paymentRequest: makeAggregateExternalContractRelease(paymentRequest, {
        request: Effect.fn(function* ({ payload }) {
          if (!('ZEROSPIN_OWNER_RELEASE' in env)) {
            return yield* makeZerospinError(
              'payment-provider-requires-owner-release',
            );
          }
          const { releaseVersion } = yield* PaymentProvider;
          if (releaseVersion !== 2) {
            yield* Effect.die(
              new Error('Expected the checkout@2 provider Layer'),
            );
          }
          yield* Effect.promise(() =>
            env.PINNED_PROVIDER.put('provider/' + crypto.randomUUID(), ''),
          );
          if (
            payload.paymentId === 'pay_review' ||
            payload.paymentId === 'pay_review_mapper_failure'
          ) {
            return yield* makeZerospinError('payment-provider-unavailable');
          }
          return 'declined' as const;
        }),
        onSuccess: {
          contract: recordPaymentV2,
          payload: Effect.fn(function* ({ payload, response }) {
            yield* assertPaymentOwner;
            const { releaseVersion } = yield* PaymentProvider;
            if (releaseVersion !== 2) {
              yield* Effect.die(new Error('Expected the checkout@2 Layer'));
            }
            if (payload.paymentId === 'pay_mapper_failure') {
              throw new Error('Payment continuation mapper threw');
            }
            return { paymentId: payload.paymentId, providerDecision: response };
          }),
        },
        onFailure: {
          contract: reviewPayment,
          payload: Effect.fn(function* ({ payload, failure }) {
            yield* assertPaymentOwner;
            if (payload.paymentId === 'pay_review_mapper_failure') {
              throw new Error('Review continuation mapper threw');
            }
            return { paymentId: payload.paymentId, reason: failure.code };
          }),
        },
      }),
    },
  });
}

export const pinnedOlderRelease = makePinnedOlderRelease(
  makeRecordPayment(),
  makeFinishCheckout(),
);

const recordPayment = makeRecordPayment();
const finishCheckout = makeFinishCheckout();
const stableOlderRelease = makePinnedOlderRelease(
  recordPayment,
  finishCheckout,
);
export const pinnedNewerRelease = makePinnedNewerRelease(
  stableOlderRelease,
  recordPayment,
  finishCheckout,
);

export function pinnedStableConfig() {
  const paymentReviewer = makeAggregateAgentRelease({
    aggregateName: 'checkout',
    aggregateVersion: 2,
    agentName: 'paymentReviewer',
    agentVersion: 1,
    sessionName: 'review',
    db: makeQueryDbVersion({ models: {} }),
    contracts: {
      finishCheckout: makeAgentCommandRef<
        typeof pinnedNewerRelease.system.finishCheckout
      >('finishCheckout', 2),
    },
    selections: {},
  });
  return makeConfig({
    systemId,
    system: makeSystem({
      name: 'servicePublication',
      aggregates: {
        checkout: {
          releases: { 1: stableOlderRelease, 2: pinnedNewerRelease },
        },
      },
      aggregateAgents: {
        checkout: {
          paymentReviewer: { releases: { 1: paymentReviewer }, active: 1 },
        },
      },
      services: { reservations },
    }),
  });
}
