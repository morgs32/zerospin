# 068 — Aggregate session authorization owned by the Repo

## Agreed behavior

Consolidate application session admission in `AggregateVersionRepo.authorizeSession`. Resolve and validate the actor once, always invoke its authorizer, and return only the checked session spec. Remove obsolete `authentication: 'system'` declarations and redundant authorization wrappers. Service authorization and historical provenance lookup remain outside scope. No persisted schema changes or compatibility paths are needed.

## Implementation

1. Keep actor-authoring `authorize` optional, but require it on constructed actors. Default to `() => Effect.void`; actor updates inherit omitted callbacks and replace supplied callbacks. Preserve claims typing and custom Effect requirements.
2. Move `validateAggregateSessionLock` beside Repo authorization. Supply the selected aggregate release; resolve its actor with `getByKeyOrThrow`, check the lock's actor version once, preserve all declaration checks, and return `{ actor, sessionSpec }` internally.
3. Expose `authorizeSession({ sessionName, claims, aggregateSessionLock })`, returning an RPC envelope containing only `IAggregateSessionSpec`. Bind aggregate identity and release from the Repo key. Validate the lock, always decode claims, check claims' aggregate ID, build the existing owner-local query surface, and invoke `actor.authorize` in the scoped system runtime.
4. Keep request decoding and admitted-actor/lock comparison in AggregateAccessApi. Call the Repo directly, then construct the session capability from retained admission context and the checked spec. Delete intermediate authorization and echo-comparison wrappers; preserve telemetry and error envelopes.
5. Remove `'system'` from aggregate authentication types and declaration validation, delete `requireApplicationActorAuthentication`, and update admission callers. Preserve actor-free administrative sessions and cross-release historical provenance lookup.
6. Extend the existing aggregate administration check with real actor declarations and SQLite. Cover defaults, custom authorization, inheritance/replacement, valid admission, missing/wrong actor version, changed locks, invalid claims, aggregate-ID mismatch, authorizer rejection, and obsolete policy rejection. Run scoped core/worker typecheck and lint plus aggregate administration checks.
7. Reconcile actor README, architecture references, and glossary after implementation. Create an ADR only for an implemented decision meeting repository criteria. Record verification, set Remaining work to None, and archive this plan.

## Planned hierarchy

`+` create, `~` modify, `-` delete; moved implementations replace old paths.

```text
zerospin/
├── packages/core/src/
│   ├── aggregateActor/
│   │   ├── ~ types.ts
│   │   ├── ~ updateAggregateActorVersion.ts
│   │   ├── ~ make/makeAggregateActorVersion/makeAggregateActorVersion.ts
│   │   ├── - requireApplicationActorAuthentication.ts
│   │   └── ~ README.md
│   └── identity/~ types.ts
├── packages/system-worker/
│   ├── checks/~ aggregate-administration.mjs
│   └── src/
│       ├── AggregateApi/admit/admitAggregate/~ admitAggregate.ts
│       ├── AggregateAccessApi/authorize/
│       │   ├── ~ authorize.ts
│       │   ├── - checkAggregateAuthorization/
│       │   └── - authorizeAggregateSession/
│       └── AggregateVersionRepo/
│           ├── ~ AggregateVersionRepo.ts
│           ├── - authorizeAggregateSession/
│           └── + authorizeSession/
│               ├── authorizeSession.ts
│               └── validateAggregateSessionLock.ts
└── wiki/
    ├── plans/+ 068-plan-aggregate-session-authorization.md
    ├── architecture/~ AuthoredSystem.md
    └── ~ glossary.md
```

## Outcome — completed 2026-10-08

1. Application session admission now runs in `AggregateVersionRepo.authorizeSession`, with aggregate identity and release supplied exclusively by the Repo key. Its lock validator returns the checked actor internally, and the RPC returns only the checked session spec.
2. Constructed actors always have callable authorization. Default authorization permits access after lock/claims validation; actor updates preserve inherited or replaced callback requirements. Aggregate `authentication: 'system'`, the rejection helper, and intermediate authorization wrappers were removed.
3. The existing administration harness now exercises real actor declarations, SQLite authorization queries, AccessApi capability/telemetry flow, rejection before authorizer invocation, and virtual TypeScript assertions for claims inference and default/custom/inherited/replacement Effect requirements.
4. Source-linked architecture, identity-admission workflow, glossary, actor README, and the existing validation pattern were reconciled. No new domain term or qualifying ADR was needed.

## Verification

1. Passed `pnpm nx run-many -p @zerospin/core system-worker -t ts lint aggregate-administration:check`, including required library dependencies. The administration check covers both application actor admission and existing actor-free administrative behavior.
2. Lint completed with zero errors. Existing unrelated warnings remain; newly introduced warnings were removed. Nx Cloud returned an access warning, without blocking successful local task execution.
3. Scoped source and documentation formatting passed, and `git diff --check` passed. Changed architecture source hashes and relevant links were verified.
4. No persisted schema changed; no storage migration or compatibility path was added.

## Remaining work

None.
