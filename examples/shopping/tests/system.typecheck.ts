/** Compile-only checks for Agent grants, command results and selected rows. */
import { expectTypeOf } from '@effect/vitest';
import type { IAgentWakeCapabilities } from '@zerospin/core/agent/makeAgentWake';
import * as sdk from '@zerospin/sdk';
import { makeSystemHarness } from '@zerospin/sdk/testing';
import * as Effect from 'effect/Effect';

import { reservationsAgentV1 } from '../src/zerospin/agents/reservationsAgentV1.ts';
import type { PromotionDecisionSchema } from '../src/zerospin/services/promotion/promotionDecision.ts';
import { promotionServiceReleaseV1 } from '../src/zerospin/services/promotion/promotionServiceReleaseV1.ts';
import { system } from '../src/zerospin/system.ts';

export function agentReleaseInferenceExamples() {
  expectTypeOf(
    system.serviceAgents.promotion.reservations.releases[1],
  ).toEqualTypeOf<typeof reservationsAgentV1>();
}

export function agentCommandReferenceExamples({
  stageCommand,
}: IAgentWakeCapabilities) {
  type IReleaseCommand =
    typeof promotionServiceReleaseV1.contracts.releaseUncommittedReservation;
  const name = 'releaseUncommittedReservation';
  const ref = sdk.makeAgentCommandRef<IReleaseCommand>(name, 1);
  stageCommand(ref, { reservationId: 'prv_one', expectedExpiresAt: 10 });
  // @ts-expect-error The name must match the referenced command.
  sdk.makeAgentCommandRef<IReleaseCommand>('reservePromotion', 1);
  // @ts-expect-error This owner contract is version 1.
  sdk.makeAgentCommandRef<IReleaseCommand>(name, 2);
  // @ts-expect-error The owner requires expectedExpiresAt in the staged payload.
  stageCommand(ref, { reservationId: 'prv_one' });

  sdk.makeServiceAgentRelease({
    serviceName: 'promotion',
    serviceVersion: 1,
    agentName: 'reservations',
    agentVersion: 1,
    sessionName: 'reservations',
    db: reservationsAgentV1.db,
    selections: {},
    // @ts-expect-error Purchases grants Aggregate commands to an Aggregate Agent.
    contracts: system.aggregateAgents.user.purchases.releases[1].contracts,
  });

  const otherContract = sdk.makeServiceContractRelease(
    sdk.defineServiceContract(name),
    {
      version: 1,
      payload: { days: sdk.primitives.integer() },
    },
  );
  const otherGrant = sdk.makeAgentCommandRef<typeof otherContract>(name, 1);
  const otherAgent = {
    ...reservationsAgentV1,
    contracts: { [name]: otherGrant },
  };
  sdk.makeSystem({
    ...system,
    serviceAgents: {
      promotion: {
        reservations: {
          active: 1,
          releases: {
            // @ts-expect-error The same name and version on this owner require a different payload.
            1: otherAgent,
          },
        },
      },
    },
  });
}

export const systemHarnessExamples = Effect.gen(function* () {
  const harness = yield* makeSystemHarness({ system });
  const command = {
    id: 'cmd_shopping_system_typecheck_1',
    contractVersion:
      promotionServiceReleaseV1.contracts.reservePromotion.version,
    serviceName: promotionServiceReleaseV1.name,
    serviceVersion: promotionServiceReleaseV1.version,
    kind: 'system',

    commandName: 'reservePromotion',
    payload: {
      id: 'prv_one',
      aggregateId: 'user_one',
      cartId: 'crt_one',
    },
  } as const;
  const decision = yield* harness.push(command);
  expectTypeOf(decision).toEqualTypeOf<typeof PromotionDecisionSchema.Type>();
  const db = sdk.makeQueryDbVersion({
    models: promotionServiceReleaseV1.models,
  });
  const reservation = yield* harness.query(
    { release: promotionServiceReleaseV1 },
    db.query.promotionReservation.findFirst({
      where: { id: { eq: decision.reservationId } },
    }),
  );
  if (reservation !== undefined) {
    expectTypeOf(reservation.expiresAt).toEqualTypeOf<number | null>();
    expectTypeOf(reservation.status).toEqualTypeOf<
      typeof PromotionDecisionSchema.Type.status
    >();
    const expiresAt: number | null = reservation.expiresAt;
    const status: typeof PromotionDecisionSchema.Type.status =
      reservation.status;
    // @ts-expect-error A selected reservation's status is not a number.
    const invalidStatus: number = reservation.status;
    void invalidStatus;
    return { expiresAt, status };
  }
  return undefined;
});
