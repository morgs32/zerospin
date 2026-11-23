# First AVR pass: authorizeAggregateSession

## Summary

Refactor only AggregateVersionRepo.authorizeAggregateSession, using value-based Match for optional capabilities and query bindings while preserving schema validation of claims. Review this method before changing another RPC procedure.

## Implementation

1. Keep aggregate/actor resolution and required authentication before branching.
2. Match actor.authorize: undefined returns Effect.void; the narrowed authorizer branch lazily builds owner-local queries, decodes claims, and invokes authorization with the original actor receiver.
3. Match each model query binding: retain the missing-binding failure and populate the restricted query object only when present.
4. Keep claims schema decoding, excess-property rejection, mapped errors, runtime context, and Effect.scoped unchanged. Add no schemas, casts, or public signature changes.
5. Presence checks use ordinary Match patterns because they distinguish optional capabilities/bindings; claims use a schema because they require data validation.

Planned files (+ create, ~ modify):

```text
zerospin/
├── packages/system-worker/src/AggregateVersionRepo/
│   └── authorizeAggregateSession/
│       └── ~ authorizeAggregateSession.ts
└── wiki/plans/
    └── + 065-plan-avr-authorization-match.md
```

## Verification

1. Review omitted-authorization laziness, required authentication, missing-binding failure precedence, claims error mapping, owner-local queries, and authored failure propagation.
2. Run system-worker:ts and system-worker:lint through Nx and formatting checks for changed files. Add no test infrastructure for this mechanical refactor.
3. Present the single-method diff, record results, and archive this plan. BackupDbApi and Explorer remain deferred.

## Outcome and verification

Completed 2026-10-08. Only the planned RPC procedure was changed; BackupDbApi and Explorer were not modified.

1. Source review confirmed authentication precedes branching. The omitted-authorizer branch returns Effect.void and never constructs model queries, obtains the authorization context, or decodes claims. The authorizer branch is an Effect.gen with a deferred body.
2. Source review confirmed missing bindings fail before context retrieval and claims decoding, using the original failure code/message/extra. The model loop retains its original order and only copies aggregate-owned query bindings into a null-prototype object.
3. Claims decoding retains the original schema, excess-property rejection, and error mapping. The narrowed authorizer is invoked with .call(actor, ...) to preserve the original method receiver; failures propagate unchanged. Effect.scoped and context provision are retained.
4. pnpm exec nx run system-worker:ts passed, including the system-worker declaration build and dependency tasks. The initial literal undefined query pattern failed typechecking because Drizzle declares bindings present; an ordinary binding === undefined predicate preserves the runtime guard without casts.
5. pnpm exec nx run system-worker:lint, changed-file oxfmt --check, and git diff --check passed. Nx reported a Cloud access warning (401), but local checks succeeded.
6. Behavioral scenarios were reviewed against source; no runtime behavior tests or test infrastructure were added, as agreed. No new domain terminology or architectural decision required a glossary update or ADR.

## Remaining work

None.
