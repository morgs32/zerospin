# Handoff: Startup stack capture and Actor construction

**Date:** 2026-11-03
**Focus:** The two remaining startup leads requested for Zerospin: (1) function stack diagnostics and (2) unnecessary predecessor Actor construction.

## Relevance review — 2026-11-03

1. **Close the old custom stack-capture proposal.** Current `makeFn` delegates to `Effect.fn`, `makeTx` has no extra definition-stack parser, and `rpcMethod` constructs its annotated function at method definition. PR #123 already supplies that architectural change. Further startup optimization is a measurement question; this handoff does not establish a remaining diagnostics defect or justify changing the tracing policy.
2. **Keep Actor construction as an unmeasured lead.** QRK now registers only aggregate release V9 with Actor V9. Its import chain still constructs V8, V7, V6, V5, V4 and V3. In particular, V7 imports V6 for identity/authentication/authorization while defining a fresh database and selections. V5 likewise imports V4 for configuration reuse. These are actual declaration dependencies, not evidence that those predecessor Actors are registered in the System.
3. **Separate application composition from constructor work.** `updateAggregateActorRelease` merges declarations and calls `constructAggregateActorRelease`, which unconditionally captures the completed selections. V8 and V9 change contracts without supplying new selections, so selection capture is repeated. This establishes repeated work, not its performance significance or the correctness of reusing captured objects. Measure before choosing a framework change. Extracting QRK's shared configuration could remove imports used only for reuse without introducing a new framework API, but consumer edits remain outside this review.
4. **Refresh the reproduction before measuring.** Zerospin is now `b6d8992956`; QRK is `6b40773cb` and its backend manifest pins SDK `41.0.0`. That manifest is not proof of the installed bundle or deployed SDK. The old branch/SHA and SDK 39 measurements below are historical context. No startup profile, first-call measurement, retained-memory measurement or deployment verification was performed in this review.
5. **Keep the document active with narrower remaining work.** The custom capture implementation is complete; the remaining startup investigation needs current measurements and an ownership decision. Neither a new diagnostic policy nor a new Actor abstraction is warranted by source inspection alone. The unrelated tooling-install note below is historical and is not a prerequisite for this investigation.

**Status:** Archived on 2026-11-03 at the maintainer's request. PR #123 completed the custom stack-capture replacement. The remaining Actor investigation continues in the [active Actor handoff](../../handoffs/2026-11-03-handoff-actor-construction.md). Further diagnostics optimization is not active work; any reopening needs fresh evidence. Sections below retain historical pickup context.

## Goal

1. Reconcile these leads against current Zerospin source, measure what remains, and produce a concrete next change where the evidence supports one.
2. Start with the existing diagnostics implementation and the QRK Actor case. Resolve material diagnostic-policy or API decisions before implementation; this handoff does not approve an unchosen design.
3. Keep framework fixes in Zerospin. Treat QRK as a reproduction/consumer case, and distinguish a framework ownership problem from application declaration composition.

## Done and current baseline

1. At handoff time, Zerospin is on `main` at `df74bc83a9`, the 41.0.0 release-source commit. It already includes PR #123 / `5c57309681`, “Let Effect own function stack diagnostics.” That materially supersedes the older SDK 39 research's proposed custom lazy stack formatting.
2. Current `makeFn` delegates tracing to `Effect.fn`. `makeTx` no longer captures/parses an extra definition stack, and `rpcMethod` constructs its annotated function when the RPC method is defined. Read current diagnostics docs and tests before deciding what remains.
3. QRK's catalog separation and metadata naming work is merged as PR #58. Its recorded measurements concern a matched SDK 39 System and cannot establish 41.0.0 startup performance.
4. QRK preview-state separation has an active Plan 052. It is separate work: do not fold it into either of these Zerospin investigations or assume it is implemented.
5. The current QRK checkout is `codex/zerospin-41` at `8fa3fbe39`. Refresh consumer pin/adoption and deployment evidence before treating the previous 39.0.0 results as current.

## Remaining

1. **Rebaseline diagnostics on 41.0.0.** Confirm the actual installed/published SDK used by the reproduction, then capture repeated matched startup profiles. Attribute the remaining `Effect.fn` / `makeFn` / transaction / RPC construction work. The older combined frame total was attribution, not isolated stack cost or promised savings.
2. **Finish item 1 against PR #123.** First determine whether that merged change already satisfies the custom-capture optimization. Do not implement the obsolete lazy-`functionSpanSource` proposal, reintroduce removed source plumbing, or rebuild the former custom stack-frame mechanism. Any further change must preserve the current tracing/outcome contract unless the user explicitly chooses a diagnostic-policy change. Compare first invocation and retained memory as well as startup; moving work later is not the same as removing it.
3. **Investigate item 2 using QRK's Actor chain.** The catalog PR's Actor V8 imports/upgrades V7; V7 constructs a fresh Actor while importing V6 to reuse identity, authentication, and authorization. Trace the remaining predecessors and measure the construction/selection-capture cost. Check `updateAggregateActorRelease`, `constructAggregateActorRelease`, and `captureSelections` in current source.
4. **Separate required history from incidental imports.** Determine which predecessor objects are required by registered releases and which exist only for configuration reuse. Preserve every existing System registration, canonical selection, and required Contract lineage. No agent may alter a canonical selection or omit a registered release. Import evaluation and registration are different facts.
5. **Choose the owning fix.** If the Actor API or constructor forces repeated work, propose the smallest upstream correction and its actual call sites. If direct application composition suffices, report the concrete QRK recommendation rather than adding a framework abstraction. QRK-specific authentication/identity behavior stays QRK-owned; do not move it into Zerospin or edit consumer code as part of this documentation handoff.
6. **Verify an approved change at existing seams.** Reuse relevant logger/core/system-worker tests and method-profile infrastructure. Exercise success/failure spans, nesting, outcomes, error stacks, transactions/RPCs, and declarations/selections as applicable. Follow the current guarantee that successful profiles do not promise authored source fields. Use scoped Nx targets. Zerospin forbids creating new test files, fixtures, runners, or test configuration without explicit user instruction, and forbids Explorer verification.
7. **Report the measured boundary.** Keep local startup CPU, first-call latency, retained memory, Cloudflare upload startup CPU, and request cold-start latency distinct. A fresh Cloudflare upload/deployment requires its own authorization; this handoff authorizes no deployment or storage operation. If a framework fix is approved, use clean committed release inputs and exact consumer pins; never modify installed SDK files.

## Suggested skills

1. `$research` — refresh conclusions from current Effect/Zerospin source and existing measurements.
2. `$grill-me` — settle any remaining diagnostic-policy or Actor API decision and write a plan only for the chosen change.
3. `$use-morgs32-wiki-patterns` — consult the local index first, especially annotated functions, diagnostics/profiles, and scoped execution.
4. `$implement` — execute approved work through its required verification and documentation.
5. `nx-workspace` and `nx-run-tasks` — discover and run only the relevant existing checks.

## Pointers

1. [Zerospin PR #123](https://github.com/morgs32/zerospin/pull/123)
2. [AGENTS.md](../../../AGENTS.md)
3. [makeFn.ts](../../../packages/logger/src/makeFn.ts)
4. [makeTx.ts](../../../packages/core/src/drizzle/make/makeTx.ts)
5. [makeRpcApi.ts](../../../packages/system-worker/src/makeRpcApi/makeRpcApi.ts)
6. [Logger README](../../../packages/logger/README.md)
7. [annotated-functions.ts](../../patterns/runtime/annotated-functions.ts)
8. [codes-only-explorers.md](../../patterns/testing/codes-only-explorers.md)
9. [updateAggregateActorRelease.ts](../../../packages/core/src/aggregateActor/updateAggregateActorRelease.ts)
10. [makeAggregateActorRelease.ts](../../../packages/core/src/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease.ts)
11. [Historical stack-capture research, pinned to its SDK 39 investigation](https://github.com/morgs32/qrk.sh/blob/8e1e587afc6f0ff059d638f44c597cad6d6ce3c6/wiki/research/definition-stack-capture-startup.md)
12. [Historical startup/Actor investigation, same pinned revision](https://github.com/morgs32/qrk.sh/blob/8e1e587afc6f0ff059d638f44c597cad6d6ce3c6/wiki/research/worker-startup-and-cold-start-latency.md)
13. [QRK Actor V8, pinned catalog PR revision](https://github.com/morgs32/qrk.sh/blob/8df60e66add55fdb312f7370d866d0601893fa13/apps/zerospin/src/aggregates/user/actors/userActorV8.ts)
14. [QRK Actor V7, same pinned revision](https://github.com/morgs32/qrk.sh/blob/8df60e66add55fdb312f7370d866d0601893fa13/apps/zerospin/src/aggregates/user/actors/userActorV7.ts)
15. [QRK PR #58](https://github.com/morgs32/qrk.sh/pull/58)
16. [QRK Plan 052](/Users/morgs32/GitHub/qrk.sh/wiki/plans/052-plan-module-preview-state.md)

## Open decisions and pickup notes

1. Which part of item 1 remains after #123? Measure before proposing more machinery. Removal of Effect's definition/invocation information or a new production capture policy is not approved by this handoff.
2. Is item 2 a framework construction defect, an API design problem, or a QRK-only import/composition choice? No measured saving or specific Actor refactor is approved yet.
3. Recheck current source and release state before using historical line numbers, guarantees, timings, or Actor versions. The pinned research intentionally records older behavior.
4. Zerospin had no installed Intent executable or `@tanstack/intent` package in this session. `pnpm exec intent list` attempted the checkout's automatic dependency install and was blocked by filesystem permissions. No replacement was downloaded; the handoff was written using current source and repo guidance. Resolve tooling only within the next session's authorized scope.
5. Preserve the checkout's existing unrelated documentation WIP. This pickup document is standalone dated work, not Plan 052 or a newly allocated Zerospin plan. Creating it does not archive or advance another plan.
