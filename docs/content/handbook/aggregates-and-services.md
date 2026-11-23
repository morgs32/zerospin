---
title: Aggregates and services
description: Choose the data owner and command boundary before designing your application's screens.
order: 2
---

## Start with ownership

An aggregate describes a family of independently identified owners. A game aggregate release describes every game, but `aggregateId` selects one game's authoritative state. A user aggregate can own one user's purchases. Its commands run within that aggregate's boundary.

A service describes shared application state. Shopping's marketplace owns the product catalog; personal carts and purchases belong together in each user's aggregate. A service actor's selections determine which portion of that shared state its session receives.

| Question                        | Aggregate                                   | Service                                        |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| How do you select the owner?    | Name, version, and an aggregate instance ID | Service name and version                       |
| Typical data                    | One game or one account's private resources | Shared catalog and marketplace resources       |
| What scopes browser visibility? | Aggregate identity plus actor selections    | Actor identity and selections over shared data |
| Browser write helper            | `stageAggregateSessionCommand`              | `stageServiceSessionCommand`                   |
| Success return boundary         | Local journal and optimistic transaction    | Local journal and optimistic transaction       |

A resource ID identifies a row, not its aggregate. Tic Tac Toe retains an unprefixed game token as `aggregateId` and prefixes the same token to form the game resource ID. Keep the two fields distinct even if your application derives them from the same identity.

## Declare the owner explicitly

Call the Zerospin `make*` constructor directly in the file that defines each release. Write its configuration as an inline object literal so readers can see which models, actors, and grants that version selects. Never introduce an application factory such as `makeUserAggregateRelease(version, contracts)` to wrap `makeAggregateRelease`.

Reuse imported declarations as field values. Never pass a prebuilt configuration object, spread it into the literal, or generate it with a helper. The Tic Tac Toe release shows how to name each binding at the call site.

```ts title="src/gameAggregateReleaseV1.ts"
import { defineAggregate, makeAggregateRelease } from '@zerospin/sdk';

import { playExternalOMove } from './contracts/playExternalOMoveV1';
import { game } from './gameV1';
import { human } from './humanActorV1';

export const aggregateRelease = makeAggregateRelease(
  defineAggregate({ name: 'game' }),
  {
    version: 1,
    models: { game },
    external: { playExternalOMove },
    actors: { human },
  },
);
```

For the full example, retain the release's `guards` from [the source declaration](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/gameAggregateReleaseV1.ts). They independently check the move against authoritative state. The short example above demonstrates registry wiring, not a substitute for the game's business rules.

A service uses `defineService({ name })` and `makeServiceRelease(definition, { version, models, contracts, actors, system, external })`. Actor contract maps and separately declared Agent command references grant ordinary actions; `system` grants claims-free administrative/recorded actions, and `external` registers external implementations. The owner derives its execution-facing `contracts` inventory from those maps. The same exact ordinary release may be granted through several maps; invocation `command.kind` records which grant was used. List the models the owner actually owns. Do not flatten unrelated owners into one global model registry to make imports convenient.

## Keep commands inside their owner

A contract declares the exact models whose operations it may emit. An actor exposes contracts from that owner and query selections over its allowed models. A session definition selects the browser-visible declarations for that actor. These checks keep a cart command from silently becoming a purchase command in another owner.

Cross-owner work needs an explicit boundary. Shopping's user aggregate freezes checkout lines and schedules an external request for Marketplace's read-only quote. A guarded continuation records authoritative pricing before scheduling payment. Network work runs outside each local transaction. See [external work](/handbook/external-work).

## Choose the boundary for your app

Put data together when its commands need one coherent owner and atomic state transition. Separate owners when they have different identities, access rules, or lifetimes. For Red Rope Parking, fleet ownership must remain explicit when moving cars. For QRK, a page and its related content need a clear owner before deciding how they are shared. For Stackshirts, the guest draft should become account data through an import command rather than by changing the live session's identity.

Do not choose a service merely to avoid supplying an aggregate ID, or create one aggregate per screen. Screens can query several independently owned sessions. The [shared service guide](/guides/shared-services) shows the marketplace choice in executable code.
