---
title: Query reactive application data
description: Read the actor's local selected view with typed relational queries and explicit reactive keys.
order: 5
---

## Prerequisites

Use an initialized React session from [React and Next.js](/guides/react-and-nextjs). Its release must declare the queried model versions, and its backend actor must select the rows your UI needs. Zerospin queries run against the local SQLite projection, not an HTTP endpoint on each render.

For the following component, use the `gameSessionDefinition` and `game` definitions from `examples/tic-tac-toe/src`. This component receives the current game's resource ID from its owner.

## Read one row and present the outcome

```tsx title="src/GameStatus.tsx — in the Tic Tac Toe app"
import { useLiveQuery } from '@zerospin/react';
import { useSession } from '@zerospin/react';
import { gameSessionDefinition } from './gameSessionDefinition';
import { outcome, turn } from './gameV1';

export function GameStatus(props: { gameId: `gam_${string}` }) {
  const { gameId } = props;
  const session = useSession(gameSessionDefinition);
  const { data: game } = useLiveQuery({
    session,
    key: gameId,
    query: (db, gameId) =>
      db.query.game.findFirst({ where: { id: { eq: gameId } } }),
  });
  if (game === undefined) return <p>Start a game to create the board.</p>;
  const result = outcome(game.board);
  return <p>{result === 'playing' ? `${turn(game.board)}'s turn` : result}</p>;
}
```

`findFirst` produces a row or `undefined`; `findMany` produces a collection.
Rows contain authored attributes and `id`, `createdAt` and `updatedAt`, without
`modelName` or `version`. JSON attributes are decoded through their authored
codecs, including selected columns and nested relations; invalid selected JSON
fails the query. Use stored row fields in filters and ordering. Contract reads
and portable read requests also validate column/filter/order names against the
bound model table, including relations. Projection selection capture is a
different interface: it requires complete model rows and refuses partial
`columns`, `with` or `extras` capture. Published selected resources reconstruct
the bound `modelName` and `version`.
`findFirstOrThrow` accepts the same options as `findFirst`, but missing data
throws `No row found for <model>` and terminates a session live query. Prefer
`findFirst` when absence is an ordinary empty state. An initialized empty view is different from an initialization failure. Mount this component inside `SessionReady definition={gameSessionDefinition}`.
Its fallback handles loading; required `renderError(error, retry)` handles terminal
query and runtime failures locally. Ordinary UI render exceptions reach the
enclosing React error boundary. Other public content remains mounted.
The query hook returns `{ data, updatedAt }` and has no `error` field. Committed
reread failures report session origin and fence execution before React rerenders.

## Type a row with selected relations

Use `ISessionModelRow` to describe a row passed to another component. The
session definition supplies the model versions, and the options match the
query's selected columns and relations.

```ts title="Shopping cart with items"
import type { ISessionModelRow } from '@zerospin/browser/ISessionModelRow';
import type { shopperSessionDefinition } from './shopperSessionDefinition';

type ICartWithItems = ISessionModelRow<
  typeof shopperSessionDefinition,
  'cart',
  { with: { items: true } }
>;
```

Omit the options for the base row. When using `findFirst`, handle a missing row
before passing it to a component. Relation filters retain query nullability.

## Use keys when the query input changes

The callback's identity is not the query invalidation contract. Supply `key` for a changing filter, search term, resource ID, or sort choice. `useLiveQuery` compares key values and rebuilds the query when that value or its initialized database changes. Capturing a changing prop in a new callback alone does not rebuild it.

For multiple values, use a small key object with the values the query actually consumes. Avoid including unrelated UI state; it rebuilds the query unnecessarily. For a fixed query, omit `key`:

```tsx title="Shopping ProductList — inside the component"
const catalogSession = useSession(catalogSessionDefinition);
const { data: products } = useLiveQuery({
  session: catalogSession,
  query: db => db.query.product.findMany(),
});
```

Here `catalogSessionDefinition` is imported directly from `src/zerospin/catalogSessionDefinition.ts` in Shopping. The [full product list](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/components/ProductList.tsx) shows its route and component context.

## Let committed data drive the UI

The query observes committed SQLite table changes and reruns when relevant data changes. Aggregate optimism, confirmed server changes, rollback/rebase, and service projection updates can all change the local view. This removes the need to poll a server just to refresh data already synchronized into the session.

SQLite automatically records the tables the query reads in browser and native sessions, including nested relations, joins, subqueries and views. An empty result still retains those dependencies. Changes to unrelated tables do not rerun the query, and writes rolled back to a savepoint do not trigger a reread. The lower-level `useLiveQueryOnDb`, exported at its package subpath, uses the same dependency tracking and remains available for diagnostic database reads with local error display and recovery when no terminal reporter is configured. Prefer the ordinary session hook for model queries.

The returned `updatedAt` is a query update timestamp. For canonical execution, inspect the authoritative domain state your actor exposes; browser history supplies no complete command `outcome`. See [synchronization boundaries](/handbook/sessions-and-synchronization#know-what-success-means).

## Query only the actor's selected data

A typed model in the release does not imply that every server row exists locally. Shopping's catalog actor selects all products and exposes no writes. Its shopper actor selects that user's cart, items, and the products referenced by those items. Removing the last item reference removes that product from the shopper view while leaving the catalog view intact.

Likewise, a QRK account view should select that account's pages, and a Red Rope Parking member view should select that member's allowed data. A missing row can mean it is outside the selected view, rather than absent from the whole backend. Broaden the actor's explicit selection when the product needs more data; a browser query cannot bypass authorization.

## Check the behavior

Use the existing example checks, then verify that a command updates the matching query, a changed key reads the new row, and an empty selection renders an intentional empty state. Test identity/selection boundaries with existing backend or contract checks. Shopping prohibits browser-driven verification; exercise its SQLite/contract/Workerd seams.

Continue with [Write commands](/guides/write-commands), [Shared services](/guides/shared-services), and the [React reference](/reference/react).
