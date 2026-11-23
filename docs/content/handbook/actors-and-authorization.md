---
title: Actors and authorization
description: Bind verified identity, query visibility, and command authority without trusting browser claims.
order: 5
---

## An actor is a capability

An actor release describes authentication, identity, selected resources, and exposed contracts. A shopper and a catalog reader can connect to the same marketplace service with different capabilities. A human player connects to one game aggregate. Names such as `shopper@1` identify authored actor releases, not individual users.

An actor declaration supplies `exposedModels` separately from its canonical `db` and row `selections`. Use `makeLimitedModelVersion` for only public top-level attributes, sharing descriptors with the complete server model and retaining model identity/version. Public references bind visible destination schemas; indexes use visible columns. A model without a selection exposes no existing rows. Actor releases govern visibility changes.

The canonical database uses `makeQueryDbVersion({ models })`, `makeActorIdentity({ claims, actorPath })`, and either `makeAggregateActorRelease` or `makeServiceActorRelease`. The `actorPath` is a parsed `RoutePattern` over identity fields. Its SQL placeholders let selections bind to verified claims without assembling SQL strings.

## Authenticate credentials on the server

Credentials are the input to authentication; claims are the output. Shopping receives Clerk credentials and verifies them before deriving `clerkUserId`. It does not accept a user ID supplied by a browser as proof of identity.

An authenticated browser session provides `getCredentials: () => Effect<Credentials>`. The callback can obtain a fresh token on each request. `expectedClaims` expresses the identity the UI expects; it cannot grant that identity. Aggregate inputs also provide the fixed `aggregateId`.

At the Gateway, the browser calls the selected Aggregate Actor in two steps:

```ts
const authenticatedActor = await gateway
  .aggregate(selection)
  .authenticate({ aggregateId, credentials });
const session = await authenticatedActor.openSession({
  sessionName,
  aggregateSessionLock,
});
```

Opening the session checks the session definition against the running Aggregate release and invokes the authored Actor's `authorize` policy. The returned session handle can read the shopper's snapshot.

Tic Tac Toe's credentials contain only an instance ID for its demonstration identity. That is appropriate for the sample game's access model and is not a production account authentication recipe. Follow [the authentication guide](/guides/authenticate) and [Shopping's verifier](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/verifyClerkIdentity.ts) for an authenticated application.

An unauthenticated service explicitly declares `authentication: 'none'` and initializes with `claims`. Treat those claims as public selection inputs, never as verified account authority. Standalone sessions use local claims and have no server admission.

## Selections define the projection

An actor's selections are typed queries over its query database:

```ts
// These fields appear in Shopping's user aggregate actor declaration.
selections: {
  cart: db.query.cart.findMany({}),
  cartItem: db.query.cartItem.findMany({}),
  purchase: db.query.purchase.findMany({}),
  purchaseItem: db.query.purchaseItem.findMany({}),
}
```

The browser receives the resulting actor projection, scoped to the authenticated user's aggregate. Read the complete [user actor](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/aggregates/user/actors/userActorV1.ts) for its identity and authorization checks. Catalog products remain in a separate service projection.

Selections alone do not authorize commands. The admission path verifies that the aggregate belongs to the authenticated Clerk subject, and contract guards enforce state-dependent rules such as the checkout cart lock.

## Apply guards where authority lives

Use three distinct checks:

1. A contract guard validates its own command and declares expected business failures.
2. An actor's authorization and command rules restrict what the verified identity may do.
3. Aggregate release guards enforce the owner policy against authoritative state.

Shopping verifies that `aggregateId` equals the authenticated Clerk subject. Personal cart and purchase commands then execute only within that user aggregate. Checking a browser-hidden row, a disabled button, or `expectedClaims` cannot replace those rules.

Declare scoped error schemas at their actual use sites: `ContractError` for contract failures, `ActorError` for actor policy, and `AggregateError` for aggregate policy. The runtime transports public failure data and recognizes it with the matching contract codecs; see [failures and recovery](/handbook/failures-and-recovery).

## Keep exact release capabilities explicit

Register the completed Actor release on its Aggregate or Service release. The
owner derives ordinary support from that Actor's explicit contracts and other
Actor, Agent and `system` grants. A contract appearing only in historical
SystemSpec metadata grants no fresh invocation. Public contracts bind the Actor's
exposed model declarations and compatible claims. Actor maps accept ordinary
contracts; external implementations belong in the owner's `external` map.

Reusing the same claims-free canonical contract in an Actor, Agent and System map
is allowed. Each map grants only its own invocation path: an Actor grant alone
cannot authorize Agent or System execution. Changing an unrelated owner
`system` or `external` grant does not change the Actor's selected session lock.

The full claims object governs authenticated capability and private failure
disclosure; the
`actorPath` subset supplies selection identity, not a replacement claims codec.
Aggregate identity includes the Aggregate instance; Service identity includes
its exact Service release and Actor/session binding.

Constructors validate declarations and capture selections eagerly. Callbacks and
caller-owned codecs retain their identity. `makeSystem` validates declaration
relationships; `makeSystemSpec` projects portable metadata. Constructors do not
freeze declarations or attach `.spec` fields. `updateAggregateActorRelease` and
`updateServiceActorRelease` inherit omitted fields and merge selections and
contracts by key; supplied capability fields replace their predecessors.
Service updates also merge guards by key. Each update constructs a distinct
release. These are declaration operations and open no runtime or transaction.

Aggregate Actor updates inherit fixed captured selections. An entry reuses its
predecessor's capture when its key, query object, query database and Actor
`identitySchema` are unchanged, including when the same query object is supplied
explicitly. Contract-only updates therefore do not compile selection SQL again.
Mutating the original query options or a callback's closed-over values does not
redefine an inherited selection: supply a new `db.query.model.findMany(...)`
query to change it. Replacing the query database or identity schema recaptures all
entries and rejects queries incompatible with that context. Standalone Actor
construction captures the supplied queries afresh; Service Actor updates still
capture their completed selections afresh.

## Provision through an owner command during authorization

Aggregate `authorize({ claims, aggregateId, sessionName, db, executeCommand })`
can read owner models with synchronous `db.query...sync()` calls, then execute
a claims-free ordinary command in the bound Aggregate release's explicit
`system` map. Pass `{ commandName, contractVersion, payload }` using that exact
grant; `executeCommand` allocates a fresh command `id`, supplies the bound Aggregate coordinates and
`kind: 'system'`, then returns
`outcome: { result: Success | Failure, finalizedAt }`. Check
`outcome.result._tag` before granting access; authorization itself returns `void`.
Authentication only verifies credentials and returns claims; it has no command
execution capability.

For create-if-absent provisioning, derive the identity from verified claims,
read first, execute the owner's creation command when absent, handle its
recognized existing-row result, and read again. The command transaction owns
uniqueness. A later authorization refusal does not undo a creation that already
committed. Keep that internal command outside the browser Actor catalogue;
creating another Actor solely to issue the command adds no authority.

Authorization runs outside the owner's execution transaction so the command can
reenter canonical execution. State-dependent command policy still belongs to
[owner guards](/handbook/contracts-and-operations#put-business-checks-at-the-right-boundary).

## Replace the session when identity changes

A live session binds one owner and identity. In React, update the managed hook's
options when the selected account/resource changes and return an inactive value
on sign-out. The hook replaces its internal generation and revokes stale
capabilities while the public provider subtree remains mounted. Refreshing the
credential callback for the same identity does not replace that generation.
Manual browser sessions retain fixed identity and must be replaced explicitly.

The [React reference](/reference/react#managed-sessions-and-stable-ui) explains initialization, explicit readiness gating, UI context, and cleanup. The [browser reference](/reference/browser#session-instance) covers manual ownership outside React.
