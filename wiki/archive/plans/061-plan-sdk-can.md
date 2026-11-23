# Make aggregate guard checks `sdk.can`

Status: Implementation complete — 2026-10-07. Validation commands and browser checks are excluded by the user.

## Problem and agreed behavior

1. Aggregate guard checking currently returns a deferred Effect whose value is a recognized failure or `null`. Callers must provide an Effect runner and translate that value into an outcome.
2. Replace that entrypoint outright with synchronous `sdk.can({ session, contractName, payload })`, exported by both SDK entrypoints. Return the settled `Success<void>` or `Failure<IRecognizedFailure<InferFailure<CONTRACT>>>` directly.
3. Preserve current-session checks, canonical contract and input preparation, private admitted claims, and guard-only execution in the session runtime. Unexpected defects continue to throw separately from returned failures.
4. The Explorer button calls `sdk.can` directly and retains the native result. Delete its guard-call wrapper and custom result envelope; keep unexpected defects separate and update the displayed call and source provenance.
5. Aggregate guards are the scope. Service-session `can` retains its existing full rehearsal behavior. No compatibility alias or storage change is needed.

## Implementation

1. Replace the core guard-check file with `can.ts`, remove the deferred outer Effect, and return the existing settlement without translating it to failure-or-null.
2. Replace the export in the main and browser SDK entrypoints.
3. Update the Explorer control, snippet, source links, and README; remove `checkMessageGuards.ts`.
4. Reconcile the glossary and current aggregate lifecycle documentation, including the changed source path, line references, and source hash. Archived plans remain historical records.
5. Review the source and diff at the SDK, session-runtime, and Explorer seams. Validation commands and browser checks are explicitly excluded by the user and are not deferred requirements of this phase.

## File hierarchy

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
├── packages/
│   ├── core/src/aggregateSession/
│   │   ├── can.ts +
│   │   └── checkGuards.ts -
│   └── sdk/src/
│       ├── index.ts ~
│       └── browser/index.ts ~
├── explorer/
│   ├── README.md ~
│   └── src/
│       ├── data/invocation.ts ~
│       ├── views/invocation/GuardExampleNode.tsx ~
│       └── zerospin/checkMessageGuards.ts -
└── wiki/
    ├── glossary.md ~
    └── architecture/browser/AggregateCommandLifecycle.md ~
```

## Acceptance and review seams

1. Text passes the existing `sendMessage` guard and returns `Success<void>`; whitespace returns the recognized `empty-message` failure.
2. An unavailable or noncurrent session returns its existing framework failure.
3. Guard checking never enters command-program evaluation, command creation, ID allocation, or resource/command writes.
4. The button branches on native `Success`/`Failure`; thrown defects remain separate.
5. Both SDK entrypoints expose `can`; active code and documentation no longer reference the superseded entrypoint or Explorer wrapper.

## Outcome

1. [Core `can`](../../../packages/core/src/aggregateSession/can.ts) reads the current session immediately and returns its typed settled result through the owned runtime. Unavailable sessions return a framework `Failure`; currentness, canonical input preparation, and guard evaluation retain their existing behavior. The superseded core entrypoint is removed.
2. Both the [main SDK](../../../packages/sdk/src/index.ts) and [browser SDK](../../../packages/sdk/src/browser/index.ts) export `can`.
3. [Explorer's button](https://github.com/morgs32/zerospin/blob/244afdddd87d457a5c7d6cb78da5d9ad87b62469/explorer/src/views/invocation/GuardExampleNode.tsx) invokes `sdk.can` directly, stores the native result, and keeps thrown defects in separate state. The displayed snippet matches that call. The guard-call wrapper and custom outcome envelope are removed; the README and invocation source references are updated.
4. The [glossary](../../glossary.md) and [aggregate lifecycle documentation](../../architecture/browser/AggregateCommandLifecycle.md) describe synchronous guard checking and the separate service rehearsal boundary. The lifecycle page cites the new source path, line range, and hash. No storage schema changed and no qualifying ADR was introduced.
5. Source and diff review, including an independent audit, found no command program, operation collector, ID allocator, or persistence path in `can`. The existing authored guard and settlement path support text success and the whitespace `empty-message` failure; runtime acceptance was not executed.
6. No build, typecheck, lint, formatting checks, tests, or browser verification ran, as requested. Service-session behavior remains outside this aggregate phase.

## Remaining work

None. Validation commands and browser checks are excluded by request.
