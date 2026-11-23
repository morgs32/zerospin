# Handoff: Actor construction

**Date:** 2026-11-03
**Status:** Plan 292 implemented and verified. Remaining investigation is limited to predecessor imports and unmeasured startup impact.
**Focus:** Preserve predecessor-based authoring while assessing any remaining QRK composition cost from imports used only for configuration reuse.

## Agreed design — 2026-11-03

1. Keep deriving releases from predecessors. Inherit fixed captured selections when selection key/object, query database and Actor identity schema remain unchanged. A new selection object or context triggers fresh capture. Mutation of caller-owned configuration does not redefine an inherited selection.
2. [Plan 292](../archive/plans/292-plan-inherited-actor-selection-captures.md) records completed implementation and verification: all 15 focused Node scenarios and the complete test compiler passed; dependency builds and core lint passed with 18 unrelated existing warnings. No general memoizer or broad freezing was introduced. The predecessor-import investigation and unmeasured startup impact remain distinct.

## Current evidence

1. QRK's `system.ts` registers only `userAggregateV9`, canonical V9; that release registers `userActorV9`. Actor V9 imports V8, continuing through V3. Importing those objects does not register their releases.
2. V7 imports V6 only for identity, authentication and authorization, while defining its own database and selections. V5 imports V4 for configuration reuse. Shared authored configuration can be composed without constructing a predecessor Actor using the existing standalone constructor. This is a QRK composition option, not a chosen refactor.
3. `updateAggregateActorRelease` merges previous declaration fields and constructs a complete Actor release. `constructAggregateActorRelease` now supplies matching predecessor context to `captureSelections`, which reuses unchanged entries without invoking `QuerySelection.capture`. Contract-only derivations such as QRK V8/V9 can therefore avoid rebuilding SQL, bindings and row mappers after adopting the change. No consumer adoption or startup/retained-memory measurement occurred here.
4. Existing registration, canonical selection, authentication/authorization behavior and required Contract lineage must remain intact. An Actor import used for configuration reuse is distinct from a Contract predecessor needed for retained-command support.

## Remaining

1. If continuing the startup investigation, establish a matched current reproduction before claiming savings. QRK's backend manifest was observed at SDK 41.0.0 during the initial review; refresh installed/deployed evidence before measuring. Keep startup CPU, first invocation and retained memory distinct.
2. Measure whether imports used only for configuration reuse justify QRK composition work beyond Plan 292. Preserve required Contract lineage, registration and canonical selection. Do not reopen the settled predecessor-derivation and fixed-capture choices without new evidence.
3. Consumer edits, deployments, publication and storage operations remain outside this handoff. Reuse existing verification seams; no new test files, fixtures or runners are authorized. Never verify Explorer.

## Suggested skills

1. `$grill-me` — resolve material choices one at a time.
2. `$use-morgs32-wiki-patterns` — declaration ownership, coordination cost and scoped execution.
3. `$implement` — after implementation is approved.

## Pointers

1. [Archived combined handoff](../archive/handoffs/2026-11-03-handoff-startup-stack-capture-and-actor-construction.md) — historical research and stack-capture closure.
2. [Actor update](../../packages/core/src/aggregateActor/updateAggregateActorRelease.ts).
3. [Actor construction](../../packages/core/src/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease.ts).
4. [Selection capture](../../packages/core/src/models/make/makeQueryDbVersion.ts).
5. [QRK Actor declarations](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/actors/userActorV9.ts).
