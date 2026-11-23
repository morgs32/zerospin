---
title: Models and IDs
description: Declare versioned resource shapes, references, and typed IDs used by commands and local queries.
order: 3
---

## A model describes a resource

Use `defineModel` for the stable model name and abbreviation, and `makeModelVersion` for its versioned attributes. A model is an executable declaration shared by contracts, the server, and browser sessions.

```ts title="src/gameV1.ts"
import {
  defineModel,
  makeModelVersion,
  primitives,
} from '@zerospin/sdk/browser';

export const game = makeModelVersion(
  defineModel({ name: 'game', abbreviation: 'gam' }),
  {
    version: 1,
    attributes: {
      board: primitives.text(),
      turn: primitives.enum({ values: ['X', 'O'] }),
      outcome: primitives.enum({ values: ['playing', 'X', 'O', 'draw'] }),
    },
    indexes: [],
  },
);
```

The framework reserves `id`, `modelName`, `version`, `createdAt` and `updatedAt`;
do not redeclare them as authored attributes. Stored model rows and relational
query results contain authored attributes plus `id`, `createdAt` and `updatedAt`.
`modelName` and `version` belong to the bound model and complete resource
envelopes used by seeds, snapshots, backups and operation inverses. They are not
SQL columns and cannot appear in row filters, ordering or indexes. Resource
codecs validate that complete identity before installation and reconstruct it
for export. Create operations provide attributes and a resource ID.

Primitive descriptors determine runtime validation and storage encoding, not just TypeScript autocomplete. Declare nullability and defaults using the actual primitive's options. Use `modelId({ model })` for a stable model ID value, or `primitives.id({ abbreviation })` for other prefixed IDs; when a model relation is required, follow the model-backed form in [Shopping's cart item](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/aggregates/user/models/cartItem/CartItemV1.ts).

## Generate and retain IDs

Resource IDs start with the model abbreviation, for example `gam_...`. Generate one using the initialized session's ID helper when the user creates a new resource:

```ts
import { makeAggregateSessionModelId } from '@zerospin/sdk/browser';
import { useSession } from '@zerospin/react';
import { gameSessionDefinition } from './gameSessionDefinition';
import { game } from './gameV1';

export function useNewGameId() {
  const session = useSession(gameSessionDefinition);
  return () => makeAggregateSessionModelId({ session, model: game });
}
```

The helper uses the session's private runtime and returns the typed ID synchronously. A service uses `makeServiceSessionModelId({ session, model })`. Generate an ID once for the user's intended creation and retain it through retries; generating a fresh ID on every retry can create a second resource.

If your domain already has a stable unprefixed identifier, use `prefixId(model, suffix)`:

```ts
import { prefixId } from '@zerospin/sdk/browser';
import { game } from './gameV1';

const gameId = prefixId(game, 'example-game'); // gam_example-game
```

It throws when the suffix already starts with that model's prefix. `makeId(model)` is an Effect for backend or general Effect code and requires `CuidFactory`; a live session can run it through `runSync` when appropriate. Do not obtain IDs by reaching into an exposed runtime: sessions do not expose one.

## Query against model declarations

`makeQueryDbVersion({ models })` builds the typed query database used by actor selections. Contract programs read through their supplied read-only `db` using `findFirst({ db, model, ...options })` or `findMany(...)`. These return Effects; `findFirst` returns `undefined` when no matching resource exists, and `findMany` returns an array.

React reads the initialized session's projection using [`useLiveQuery`](/reference/react#uselivequery). That projection contains the actor's selected data, so a row absent in the browser may be outside its selection rather than globally absent. Authoritative guards must consult authoritative data for ownership or uniqueness decisions.

## Evolve a shape deliberately

`upgradeModelVersion(previous, props)` declares a new version with an attribute patch and optional index changes. A `null` patch entry removes an existing attribute; it is not a nullable column declaration. Keep one authored version per file and import the exact declaration at use sites.

Model upgrades are domain version declarations. They do not give application permission to preserve deprecated framework tables or bypass storage resets during this pre-release period. See [versioning and deployment](/handbook/versioning-and-deployment) before changing persisted schemas.

Use `IInferResource<typeof game>` for a resource type rather than hand-writing an interface that can drift from the declaration. The [SDK reference](/reference/sdk#model-and-query-authoring) describes the related inference helpers.
