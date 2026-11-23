---
title: Test authored behavior
description: Execute real commands, query disposable SQLite, and control providers and Agent callbacks and pending wakes with the Node-only System harness.
order: 14
---

## Choose the behavior to prove

Import `makeSystemHarness` from `@zerospin/sdk/testing` for Node tests of your
authored System. Push complete decoded commands and use the typed query builder.
The harness supplies scoped disposable SQLite, local command/external
dispatch and Agent callback execution. Normal SDK and browser imports do not
load this Node-only runtime.

Assert the domain result and resulting rows for a representative command and
its meaningful refusal. This exercises real contract evaluation and command-owned
model changes. Keep browser rendering, authentication, transport and durable
recovery evidence with their own runtime checks.

## Execute a command and query its owner

This example uses Shopping's existing `system` and Promotion Service release.
Resolve the two local imports from the Shopping source directory:

```ts
import * as sdk from '@zerospin/sdk';
import { makeSystemHarness } from '@zerospin/sdk/testing';
import { Effect } from 'effect';
import { TestClock } from 'effect/testing';
import { system } from './zerospin/system';
import { promotionServiceReleaseV1 } from './zerospin/services/promotion/promotionServiceReleaseV1';

const reservation = await Effect.runPromise(
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const db = sdk.makeQueryDbVersion({
      models: promotionServiceReleaseV1.models,
    });
    yield* harness.push({
      id: 'cmd_reserve_one',
      kind: 'system',
      serviceName: promotionServiceReleaseV1.name,
      serviceVersion: promotionServiceReleaseV1.version,
      commandName: 'reservePromotion',
      contractVersion:
        promotionServiceReleaseV1.system.reservePromotion.version,
      payload: {
        id: 'prv_one',
        aggregateId: 'user_one',
        cartId: 'crt_one',
      },
    });
    yield* harness.flush();

    yield* TestClock.adjust('10 minutes');
    yield* harness.flush();

    return yield* harness.query(
      { release: promotionServiceReleaseV1 },
      db.query.promotionReservation.findFirst({
        where: { id: { eq: 'prv_one' } },
      }),
    );
  }).pipe(
    Effect.scoped,
    Effect.provide(sdk.NanoIdFactory),
    Effect.provide(TestClock.layer()),
  ),
);

// reservation?.status === 'released'
```

`push(command)` executes that exact command and returns its decoded authored
result. A rejected command fails with its native contract failure. Emitted
command and external operations become runnable only after the model transaction
commits. Supply a stable `id` for the occurrence. These local executions do not
retain Chain history or prove distributed admission and duplicate recovery.

A complete System command must select an exact `release.system` grant. `push`
also accepts Actor and Agent commands. Actor commands carry `actorName`,
`actorVersion`, captured `claims`, `nodeId`, `sessionName` and `pushIndex`; the
harness validates the exact Actor grant, runs owner guards with those claims and
scopes contract reads to the Actor's selected rows and exposed columns. Agent
commands require their exact Agent grant. Agent and System evaluation use
canonical reads restricted by the contract's declared models. Direct external
commands are refused; exercise their continuations through emitted work and
`flush()`. Authentication and distributed admission need their runtime checks.

`query(owner, selection)` accepts the exact registered release and an existing
typed `QuerySelection`. Service reads need only `{ release }`. Aggregate reads
also require the Aggregate instance:

```ts
const userDb = sdk.makeQueryDbVersion({
  models: userAggregateReleaseV1.models,
});
const purchase =
  yield *
  harness.query(
    { release: userAggregateReleaseV1, aggregateId: 'user_one' },
    userDb.query.purchase.findFirst({
      where: { id: { eq: 'pur_one' } },
    }),
  );
```

Here `userAggregateReleaseV1` is Shopping's
[registered User release](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/aggregates/user/userAggregateReleaseV1.ts).
Query rows contain authored attributes and `id`, `createdAt` and `updatedAt`;
complete resource envelope identity is described in [models and IDs](/handbook/models-and-ids).

## Control time and external services

`flush()` runs queued operations and due wakes selected by the System's
`aggregateAgents` and `serviceAgents` until nothing is runnable at the
current time. It never advances the clock. Provide the same test Clock around
the complete program, advance it explicitly, then flush again. One flush is
limited to 1,000 executions; nonsettling application work reports
`system-harness-work-limit` with pending-work information.

Supply deterministic provider services through the optional Layer factory.
Shopping connects its existing API service to the harness's local execution
methods:

```ts
const harness =
  yield *
  makeSystemHarness({
    system,
    layer: api =>
      Layer.mergeAll(
        ShoppingProvidersLive,
        Layer.succeed(ShoppingSystemApi, Effect.succeed(api)),
      ),
  });
```

Import `Layer` from `effect` and the application services from their defining
modules. Read [Shopping's existing harness scenarios](https://github.com/morgs32/zerospin/blob/main/examples/shopping/tests/system.spec.ts)
for the complete setup. The Layer factory receives
`executeServiceCommand(release, { id, contractName, payload })` and
`executeServiceQuery`. The command method accepts only the exact registered
release's `system` grants and returns
`outcome: { result: Success | Failure, finalizedAt }` directly; business Failure
remains outcome data. It uses the same typed preparation as the administrative
SystemApi. These are local execution results, without retained Chain history. The provider request and
recorded continuation still use the real declared codecs and programs. A real
network provider supplied by an application retains its real side effects, so
choose deterministic services deliberately.

## Dispose the complete scope and retain proof limits

Keep construction, commands, queries and provider work inside `Effect.scoped`.
Scope exit closes every database and application Layer. Provide `NanoIdFactory`
for generated child commands and emitted work. A harness captures its own supplied application
services; constructing it does not provide those services to sibling Effects
outside that harness.

The harness assumes framework delivery and persistence work. It does not run
Workers, Durable Objects, Chains, browser sessions, SharedWorkers, Native hosts,
authentication, recovery or cross-release replay. It does not prove their
transaction, acknowledgement, restart or lifetime behavior. Model changes still
come from command execution, never query-side population or repair.

For this repository's existing runner and ownership rules, read the
[operational test instructions](https://github.com/morgs32/zerospin/blob/main/tests/README.md).
The [SDK reference](/reference/sdk#test-authored-behavior) links the public
entrypoint; [external work](/handbook/external-work) explains provider uncertainty
and continuation boundaries.
