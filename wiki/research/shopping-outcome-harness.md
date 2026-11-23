# SDK System harness and Shopping outcomes

**Date:** 2026-10-21  
**Status:** Verified: strict compiler checks and all nineteen Effect/Vitest scenarios pass.

## Interface and ownership

`makeSystemHarness` from `@zerospin/sdk/testing` is a scoped local host for real
application definitions. Authors use the existing SDK command constructors and
typed query builders. The harness supplies disposable SQLite, execution,
in-process dispatch and explicit processing of due Agent behavior. It assumes
Zerospin's distributed admission, delivery, replay and persistence machinery
works; Workerd, Durable Objects, Chains, browser automation and Clerk are absent.
[Public export](../../packages/sdk/src/testing/index.ts),
[implementation](../../packages/core/src/testing/systemHarness/makeSystemHarness.ts).

```ts
harness.push(command);
harness.flush();
harness.query(owner, selection);
```

- `push` accepts a decoded command constructed by `sdk.makeServiceSystemCommand` or
  `sdk.makeAggregateSystemCommand`. It returns the authored result or propagates the
  native failure. It commits model changes and queues emitted work without
  running the subsequent work itself.
- `flush` drains command/external work in emission order, then reconciles due
  Agents and repeats until nothing is runnable at the current Clock time. It
  never advances time. A 1,000-execution limit reports pending work instead of allowing
  an unbounded application loop.
- `query` executes an existing `QuerySelection` and preserves its result type.
  Its owner is an exact registered release, plus `aggregateId` for an Aggregate.
  There is no implicit latest-release routing or cross-release replay.

Exact command retries reuse their in-memory result without repeating emitted
work. Reusing command identity with changed input fails. All stores close when
the surrounding Effect Scope closes.
[Public types](../../packages/core/src/testing/systemHarness/types.ts),
[scoped storage](../../packages/core/src/testing/systemHarness/openHarnessDb.ts).

## Existing SDK authoring

Commands, identities and reads stay visible. This expiry test uses Shopping's
existing `system` and `promotionServiceReleaseV1` declarations:

```ts
import { describe, expect, it } from '@effect/vitest';
import * as sdk from '@zerospin/sdk';
import { makeSystemHarness } from '@zerospin/sdk/testing';
import { Effect } from 'effect';
import { TestClock } from 'effect/testing';

describe('Promotion reservation', () => {
  it.effect('releases an expired reservation', () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      const db = sdk.makeQueryDbVersion({
        models: promotionServiceReleaseV1.models,
      });
      const command = yield* sdk.makeServiceSystemCommand(
        promotionServiceReleaseV1,
        {
          contractName: 'reservePromotion',
          payload: {
            id: 'prv_one',
            aggregateId: 'user_one',
            cartId: 'crt_one',
          },
        },
      );

      yield* harness.push(command);
      yield* harness.flush();
      yield* TestClock.adjust('10 minutes');
      yield* harness.flush();

      const reservation = yield* harness.query(
        { release: promotionServiceReleaseV1 },
        db.query.promotionReservation.findFirst({
          where: { id: { eq: 'prv_one' } },
        }),
      );
      expect(reservation?.status).toBe('released');
    }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );
});
```

`NanoIdFactory` supplies the caller's `CuidFactory` requirement. Harness
construction does not install services into later sibling Effects. `it.effect`
supplies a fresh Scope and `TestClock` for each test. `TestClock`
controls the Clock used by the reservation program and the local Agent host.
There is no separate clock-advance wrapper or Agent activation call.
[SDK command constructor](../../packages/core/src/service/make/makeServiceSystemCommand.ts),
[query builder](../../packages/core/src/models/make/makeQueryDbVersion.ts),
[reservation](../../examples/shopping/src/zerospin/services/promotion/ReservePromotionV1.ts),
[official Effect v4 TestClock](https://effect.website/docs/v4/testing/testclock).

## Application services and external work

Checkout supplies its existing application Layer explicitly:

```ts
Effect.gen(function* () {
  const harness = yield* makeSystemHarness({
    system,
    layer: api =>
      Layer.mergeAll(
        ShoppingProvidersLive,
        Layer.succeed(ShoppingSystemApi, Effect.succeed(api)),
      ),
  });
  // SDK commands and queries run here, inside the same scope.
});
```

The Layer is built once in the test Scope and runs in the caller's Effect
context. There is no separate `ManagedRuntime`. The local `api` implements the
existing `executeServiceCommand` and `executeServiceQuery` interfaces used by
Shopping. Marketplace quotation executes its actual authored query; Promotion
commitment executes its actual command. `ShoppingSystemApi` now requests only
those capabilities. The production implementation remains assignable to that
interface.
[Shopping interface](../../examples/shopping/src/zerospin/ShoppingSystemApi.ts),
[production Layer](../../examples/shopping/src/zerospin/ShoppingSystemApiLive.ts),
[deterministic provider](../../examples/shopping/src/zerospin/ShoppingProvidersLive.ts).

The command executor resolves the registered execution entry, including mapped
programs such as `checkoutServerV1`. Invocation validation, evaluation, outgoing
work preparation and model application share one synchronous `makeTx`. Only
successful commitment publishes outgoing work. Destination commands and external
continuations execute in their own transactions after the source transaction
closes. External requests use the shared request/response codecs and actual
callbacks.
[Executor](../../packages/core/src/testing/systemHarness/executeHarnessCommand.ts),
[model application](../../packages/core/src/contracts/applyOperationTx.ts),
[external execution](../../packages/core/src/contracts/externalExecution/executeExternalRequest.ts),
[external result](../../packages/core/src/contracts/externalExecution/makeExternalOutcome.ts).

The local API returns the receipt shape that `requestPromotionCommitment`
already decodes: original encoded command, an in-memory positive `serviceIndex`
and `outcome: { result, finalizedAt }`. Declared business refusals are Failure
results in that simulated receipt. Direct `push` still propagates their native
failure; queued business refusals settle their command while defects and
configuration/codec failures fail `flush`. These receipts establish no retained
Chain history or durable acknowledgement.
[Commitment consumer](../../examples/shopping/src/zerospin/aggregates/user/contracts/utils/requestPromotionCommitment.ts),
[receipt schema](../../packages/core/src/contracts/CommandSchema.ts).

## Automatic Agent behavior

`getScheduledAgents(system)` discovers the registered definitions that have an
`onWake`. Service scopes and matching Aggregate instances attach automatically;
query-only definitions do not execute their ordinary contracts. Browser Agent
Sessions only observe and are unnecessary for these tests.
[Scheduled definitions](../../packages/core/src/agent/getScheduledAgents.ts),
[local Agent host](../../packages/core/src/testing/systemHarness/reconcileHarnessAgents.ts).

On `flush`, the host evaluates the real Agent selection against current model
rows, supplies `Clock.currentTimeMillis` to `reconcileAgentBehaviorsTx`, executes
its command intents, then supplies their completion IDs during reconciliation.
Wake state is isolated by exact Agent definition and owner instance/release.
The reservation Agent's actual selection, absolute `expiresAt` and release
contract determine the resulting row change; the test does not manually invoke
the release command.
[Resource reader](../../packages/core/src/models/reads/readSelectedResources.ts),
[reconciliation](../../packages/core/src/agentBehavior/reconcileAgentBehaviorsTx.ts),
[Shopping Agent](../../examples/shopping/src/zerospin/agents/reservationsAgentNodeDefinition.ts).

The local host uses no timer fibers or Durable Object alarms. Advancing
`TestClock` changes time; `flush` processes due behavior. Actual backend timing,
alarm, reconstruction and recovery verification remains separate in
[Plan 249](../archive/plans/249-plan-aggregate-agent-backend-node.md).

## Direct outcome checks

Shopping owns fourteen checks in `examples/shopping/tests/`, using visible SDK
commands and query selections without a fixture DSL or profile/span collector:

1. Create Product at 2000, add quantity one, apply Promotion, checkout and flush;
   expect a paid Purchase at total 1000, matching frozen quantity, cleared cart
   items and its matching redeemed reservation.
2. Perform the same setup; observe the original hold still reserved at 599 seconds,
   then released one second later. Checkout is refused without payment.
3. Add a Product snapshot to the cart without creating that Product in
   Marketplace, checkout without a reservation and flush; expect a refused
   Purchase with no payment reference.
4. Submit a negative Product price; expect native `product-price-invalid` and an
   empty Product query.
5. Create a Product priced at zero; expect the stored Product to retain zero.
6. Add the same Product twice; expect one original line with summed quantity and
   unchanged preview fields. Set its quantity absolutely and expect that value.
7. Add one beyond the supported quantity; expect native `cart-quantity-invalid`
   and the original stored line unchanged.
8. Remove a Product and re-add it; expect one line with its fresh canonical ID.
9. Deliver cancellation before queued reserve; expect a retired reservation that
   delayed reserve and commitment cannot reopen.
10. Fill capacity through SDK commands; verify one active Cart hold, terminal-ID
    retirement, released-slot reuse, expiry and lifetime redemption accounting.
11. Decline an odd-cent checkout, then pay a fresh checkout; verify exact provider
    totals and that an old release cannot affect the newer allocation.
12. Fail the payment provider; retain Cart lock, items and committed capacity past
    expiry, refusing unsafe cancellation or another Purchase's release.
13. Return a valid commitment decision for another Purchase; refuse checkout
    without payment and release the actual Purchase's allocation.
14. Reject stale selection and an unsafe quote without claiming the reservation;
    correct the quantity and reuse the same hold for a paid checkout.

The `zerospin:test` command compiles the complete test program, then uses Vitest's
Node environment to discover app-owned tests alongside Core contract and System
Worker Repo naming tests, for nineteen runtime checks overall. The successful
checkout and unavailable-Product stories replace the older direct quote-operation
tests. Compilation includes Shopping's compiler-only example for the public
testing import, exact command-result inference and typed reservation rows.
Vitest uses one workspace configuration with explicit test-file selections and
no setup file. All runtime tests use explicit `describe` blocks and `it.effect` from
`@effect/vitest`, which supplies Scope and `TestClock`; SDK commands, queries and
assertions remain inside each scenario. The harness is unchanged.
The approved repair removed the two obsolete
`resourceId` references from `requestPromotionCommitment`. The current unified
run passes compilation and all nineteen scenarios, including six added promotion
stories; scoped test lint and formatting also pass. Application closure assumes framework correctness:
Service replay belongs to Plan 214, Actor admission/selection privacy to Plans
218/221, and Backend Node timing/recovery to Plan 249. Command delivery and Clerk
provider integration follow-ups remain in Plan 151.
[Runtime scenarios](../../examples/shopping/tests/system.spec.ts),
[reservation scenarios](../../examples/shopping/tests/promotion.spec.ts),
[payment scenarios](../../examples/shopping/tests/promotion-checkout.spec.ts),
[compiler example](../../examples/shopping/tests/system.typecheck.ts),
[test instructions](../../tests/README.md).
