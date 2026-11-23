# Plan 292: Inherited Actor selection captures

**Date:** 2026-11-03
**Status:** Complete; implemented and verified on 2026-11-03.

## Problem and agreed behavior

1. Keep deriving Aggregate Actor releases from predecessors as a preferred authoring style. Today `updateAggregateActorRelease` constructs the merged release and recaptures every selection, rebuilding SQL, parameter bindings and row mappers even for contract-only changes.
2. Treat an inherited captured selection as a fixed declaration. For each key, reuse its predecessor capture when the query database, Actor `identitySchema` and `QuerySelection` object retain their identities. Supplying the same selection object explicitly still denotes the inherited declaration. Adding a key or supplying a different selection object captures that entry again. A different database or identity schema requires fresh capture of all entries, preserving context validation and existing rejection behavior.
3. Mutating caller-owned configuration after capture does not redefine an inherited selection. To change the selection in a derived release with the same database and identity schema, construct a new `QuerySelection`. Fresh standalone Actor construction still captures the supplied queries eagerly; no process-wide first-capture rule is introduced.
4. Keep each derived Actor release distinct and validate its completed declaration normally. Authentication, authorization, exposed models and contracts do not independently invalidate SQL capture; their own existing validation remains required. `makeSystem` retains relationship validation and `makeSystemSpec` retains portable projection.

## Evidence, terminology and alternatives

1. `QuerySelection` extends Drizzle's relational query. The installed Drizzle implementation stores the supplied configuration by reference; nested options can mutate. `captureSelectionDefinition` also evaluates `RAW` and `orderBy` callbacks, whose closed-over values cannot be secured by freezing an options object. Object identity is therefore insufficient to claim unchanged live configuration. The agreed rule deliberately inherits the prior captured declaration instead.
2. A captured selection consists of its authored definition, compiled query/bindings and executable binding/row-reading functions. Reuse that coherent capture; never combine a fresh definition with previously compiled SQL.
3. Rejected: a general memoizer keyed only by live object identities, content comparison on every derivation, and recursive freezing of caller-owned configuration. These either obscure mutation semantics, repeat definition traversal/callback execution, or fail to freeze callback closure state. No global cache or lazy first-request compilation is needed.
4. [Plan 289](289-plan-declaration-construction.md) removed declaration freezing and eager portable specs. Preserve that implementation boundary; this work does not restore `.spec` fields or broadly freeze declarations.

## Scope

1. Change Aggregate Actor predecessor derivation and its internal construction/capture plumbing. No public caller-supplied captured-selection field, compatibility path, new declaration abstraction or general cache.
2. Service Actor derivation, QRK composition edits, omission of registered releases, canonical selection, deployment, publication and storage operations are outside this plan. QRK's contract-only V8/V9 derivations motivate the behavior but provide no measured saving yet.
3. Do not create test files, fixtures, runners or configuration. Extend existing scenarios only. Never verify Explorer.

## Planned files

Legend: `+` create; `~` modify. All entries below this root are repository relative.

```text
zerospin/
├── packages/core/src/
│   ├── aggregateActor/
│   │   ├── ~ updateAggregateActorRelease.ts
│   │   └── make/makeAggregateActorRelease/
│   │       └── ~ makeAggregateActorRelease.ts
│   └── models/make/
│       └── ~ makeQueryDbVersion.ts
├── packages/system-worker/tests/repo-names/
│   └── ~ repo-names.spec.ts
├── fragment/content/handbook/
│   └── ~ actors-and-authorization.md
└── wiki/
    ├── ~ glossary.md
    ├── handoffs/
    │   └── ~ 2026-11-03-handoff-actor-construction.md
    └── plans/
        └── + 292-plan-inherited-actor-selection-captures.md
```

## Implementation steps

1. Keep the existing merge and constructor validation order. Pass predecessor capture context through internal construction plumbing, separately from authored props. Derive context from the validated predecessor declaration; do not accept an arbitrary authored capture that bypasses validation.
2. During completed selection traversal, verify valid keys and selection objects. Reuse the predecessor capture only for the agreed identity/context match; otherwise call the existing capture procedure. Build a fresh selections map for the new release without recompiling inherited entries. Keep this a focused domain procedure, using `mapValues` for record traversal.
3. Preserve the predecessor's capture contents while constructing the derived release. Audit shared capture consumers for writes and ensure mutable query-definition/parameter pieces are detached where the capture currently retains caller-owned containers. Do not add broad deep freezing or claim arbitrary mutation of framework declarations is supported. Existing byte/placeholder detachment and per-invocation parameter binding must remain intact.
4. Extend the existing Actor Release scenarios in `repo-names.spec.ts` with the minimal meaningful assertions: unchanged capture reuse after caller configuration mutation; replacement of one selection while retaining another capture; context changes requiring recapture and rejecting incompatible queries. Include new release identity and unchanged predecessor assertions in those cases. Use existing declarations and inline setup in the existing file; add no fixture files or test runner.
5. Discover the current resolved Nx tasks before execution. Run the focused existing test file through `pnpm nx run zerospin:test -- packages/system-worker/tests/repo-names/repo-names.spec.ts`, including its compiler/dependency checks, and scoped core lint/build tasks appropriate to the changed files. Report actual checks and unrelated blockers precisely. Capture-reference assertions prove eliminated compilation for inherited entries; do not translate that into a startup CPU or memory claim without matched measurements.
6. After implementation, update the handbook's Actor update explanation and remove its stale claims that constructors freeze metadata and retain `.spec`. Reconcile implemented terminology with the existing glossary. Create an ADR only if the implemented decision is hard to reverse, surprising without context and reflects a real trade-off; do not create one during planning. Reconcile the Actor handoff: close the capture work only after verification and retain any unmeasured predecessor-import investigation separately. Archive this plan with its actual outcome when no in-scope work remains.

## Completion criteria

1. Contract-only Aggregate Actor derivation reuses prior captures; selection/context changes follow the agreed recapture rules and preserve rejection behavior.
2. Inherited definitions and compiled behavior remain coherent after mutation of the original caller-owned query options.
3. Existing focused checks pass, public documentation describes the implemented behavior, and no deployment, publication, consumer edits or storage operations occur.

## Remaining work

None.

## Outcome and verification

1. Aggregate Actor updates pass their validated predecessor into construction. Database and identity-schema identity gate inheritance; selection key/object identity gates each reused capture. The new release and selection maps remain distinct. Complete declaration validation and context rejection remain in place.
2. Capture audit found existing detachment sufficient: SQL text chunks contain immutable strings, and dates, bytes, SQL-fragment arrays and ordinary option containers are already captured as values. No broad freeze, extra copy, global memoizer or lazy compilation was introduced. Existing consumers read the shared captures without changing them.
3. Extended the existing Actor Release scenarios in `repo-names.spec.ts`. All 15 Node scenarios passed, including option/SQL-fragment mutation with fixed capture inheritance, no callback execution on reuse, selective replacement, changed identity recapture, incompatible identity/database rejection and valid database rebinding. The same Nx invocation compiled the complete test program and successfully ran all 11 dependency build tasks. This was a focused file run, not a full runtime-suite run.
4. `@zerospin/core:lint` and its four library dependencies passed, with 18 existing warnings outside changed files and no errors. Direct lint of the changed existing test file passed. Formatting and `git diff --check` passed. PnPM's dependency verification was disabled only for these command invocations to avoid its attempted dependency reinstall; no dependency configuration or lockfile changed. Nx Cloud reported DNS failures while local checks completed successfully.
5. Updated the handbook and glossary to describe implemented fixed-capture inheritance; corrected the handbook's stale declaration-freezing and `.spec` claims. No ADR was created: this local reuse decision is readily reversible and does not meet all three ADR criteria. The [Actor handoff](../../handoffs/2026-11-03-handoff-actor-construction.md) retains the separate predecessor-import investigation and unmeasured performance questions.
6. No consumer adoption, package publication, deployment, storage operation or Explorer verification occurred. Capture reuse is proven; startup CPU and retained-memory savings have not been measured.
