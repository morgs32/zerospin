# Handoff: concrete contracts and async operations

**Date:** 2026-10-12
**Focus:** Remove contract `ownerKind` and dissolve aggregate/service abstractions that require rediscovering scope, without introducing bindings.

**Status:** Reconciled into [Plan 140 — Effect contract evaluation and concrete async receivers](../plans/140-plan-effect-contract-evaluation-and-async-receivers.md) and archived on 2026-10-12. That single active plan owns the requirements, [reconciled design decisions](../plans/140-plan-effect-contract-evaluation-and-async-receivers.md#reconciled-design-decisions), implementation sequence and verification. The user's later same-owner scope answer supplies receiving identity through the owning workflow; concrete provenance mechanisms remain identified as implementation proposals. Archival records document reconciliation, not implementation completion. The sections below preserve historical handoff context.

## Goal

Continue the design discussion across this conversation and the linked thread. Establish concrete aggregate/service contract and async-operation interfaces, resolve where receiving release identity belongs, and prepare agreed work for implementation. This handoff records design and existing WIP; it does not report an implemented cutover.

## User requirements

1. Remove `ownerKind` from contracts. The user considers it evidence that the contract abstraction has generalized too much.
2. No bindings. The latest correction explicitly rejects the assistant's proposal to pass a separately authored contract/owner binding into async emission. Splitting or renaming that binding does not satisfy the request.
3. In the linked thread, the user said: "I abhor `kind` discriminators... whenever you see them, let's investigate" and suggested separate aggregate and service async operations. Investigate encountered discriminators and the abstraction behind them; this is not authorization for an unrelated repository-wide discriminator purge.

## Done

1. Read the linked thread, `codex://threads/01a130b4-0ee6-7a52-8e2e-5cdb3a3e8b7f`. It proposes `IAsyncAggregateOperation` / `IAsyncServiceOperation` and illustrates separate constructors with required aggregate instance scope. The user then asks "what bindings?"; the assistant explains the WIP pairing and questions whether the receiving release could supply ownership directly. That thread does not contain user approval of a binding design. The user's subsequent rejection in this conversation governs.
2. Traced the contract flag. Aggregate and service workflows already establish their execution context before calling shared invocation preparation, which reads `ownerKind` to require or omit `aggregateId`. The common `evaluateContract` implementation does not branch on `ownerKind`; guards, Channel collection, mapping, and output validation remain useful shared machinery.
3. Identified the meaningful scope difference: aggregate callback inputs and aggregate async operations require a nonempty framework `aggregateId`; service inputs have no framework aggregate instance ID. A payload field named `aggregateId` does not establish framework scope.
4. Identified a validation constraint: callbacks use `bivarianceHack`, and callbacks taking no arguments fit both scopes. Differing callback signatures alone cannot preserve the current runtime rejection of a declaration registered on the wrong owner family. Concrete declaration provenance is a possible solution at construction/registration; repeated classification inside shared execution would recreate the problem. The mechanism remains unsettled.
5. No implementation, build, typecheck, lint, or runtime verification was performed in this conversation. Existing source changes belong to ongoing WIP and must not be mistaken for this discussion's approved design.

## Design direction discussed

1. Concrete aggregate/service contract families and contract maps should express their scope at authoring, registration, mapping, version upgrades, and invocation preparation. An aggregate invocation carries a required instance ID. A service invocation exposes none. Exact exported names and runtime representation are not settled.
2. Concrete aggregate/service async operations should have honest required inputs. The linked thread's illustrative interface was:

   ```ts
   makeAsyncAggregateOperation({ contract, aggregateId, payload });
   makeAsyncServiceOperation({ contract, payload });
   ```

   These names describe the receiving domain. The sketch does not solve receiving release identification, establish final names, or approve new cross-owner capability.

3. Retain common payload/claims/response decoding and guard/program/mapping/output evaluation below the concrete workflows. Retain the common async production/retry/timeout/recorded-response lifecycle where it is already scope-neutral. Sharing these procedures does not require a tagged universal declaration or an optional aggregate ID at every public interface.
4. The assistant's recommendation to retain `owner.kind` on a generic binding/receiving-address abstraction is superseded by the user's rejection. Do not carry that recommendation forward as settled architecture.

## Current WIP

1. The tree is partway through the rejected binding design: `asyncOperation.ts` introduces `IAsyncOwner` / `IAsyncContractBinding`; `ContractMapping.ts` expects binding records; `makeAsyncOperation.ts` still takes a bare contract and derives instance-ID requirements from `ownerKind`. `AsyncReceivingOwnerSchema.ts` and `validateAsyncBindings.ts` are untracked, and `makeSystem` invokes the new validator. Actor/agent validation also dereferences binding contracts. Inspect the live diff instead of treating those edits as precedent.
2. Mapper constructors and `evaluateContractMapping` still use bare-contract catalogs and same-kind checks. Worker async preparation/reconstruction still assumes the emitting owner and does not retain the new receiving address. These are source-level inconsistencies; no compiler or runtime result has been measured here. Do not finish wiring rejected bindings merely to make the WIP compile.
3. Preserve unrelated dirty work, including `.vscode/settings.json`, `AGENTS.md`, and `AggregateVersionRepo/authorizeSession/authorizeSession.ts`. Re-read status before editing because another thread may be changing this area.
4. No active numbered plan governs this combined redesign. Plan 099 concerns Channel contract programs and has its own unfinished verification; do not reuse its number or archive it for this handoff.

## Remaining

1. Resolve the receiving-release identity question using actual aggregate/service callers and repository construction order. Produce one concrete interface consistent with both "remove `ownerKind`" and "no bindings". Do not use the emitting aggregate ID as the receiving ID without a proved same-instance rule.
2. Establish how concrete contract families enforce scope at declaration/registration and carry correct inputs through mapping and version lineage. Keep scope-neutral evaluation shared; do not invent forwarding wrappers or a disguised universal kind switch.
3. Reconcile the rejected WIP with the chosen design, including catalogs, actor/agent validation, construction, async retention, delivery, and recorded continuation admission. Preserve exact contract registration, model/claims checks, authority, transactional writes, and replay behavior. Reference the governing ADR rather than redesigning async production during replay.
4. Once the remaining design is agreed, write an executable plan under `wiki/plans/` and use `$implement` for the authorized cutover and verification. Replace superseded in-scope callers and docs outright. Follow `AGENTS.md`: fixed-schema changes require empty storage; no compatibility paths, new test files/fixtures/runners without explicit permission, or unauthorized `ALLOWED_CAST`.
5. Use existing scoped Nx checks appropriate to the eventual change and affected consumers. Record actual verification results and reconcile glossary/pattern documentation with the implemented design. Handoff completion alone does not complete or archive implementation work.

## Suggested skills

1. `$rubber-duck` — continue the unresolved interface and receiving-identity discussion.
2. `$spec` — settle remaining material decisions and write a plan; do not create a new spec file or re-approve removal of `ownerKind` and rejection of bindings.
3. `$patterns` / `use-morgs32-wiki-patterns` — consult the local pattern index and relevant shared guidance. Existing ownership-tag examples are current conventions under reconsideration, not constraints overriding this request.
4. `$implement` — carry approved implementation through required verification and documentation.
5. `$nx-workspace` and `$nx-run-tasks` — inspect and run the smallest appropriate existing check graph.

## Pointers

1. [Linked conversation](codex://threads/01a130b4-0ee6-7a52-8e2e-5cdb3a3e8b7f), [local transcript](/Users/morgs32/.codex/archived_sessions/rollout-2026-10-12T10-21-09-01a130b4-0ee6-7a52-8e2e-5cdb3a3e8b7f.jsonl)
2. [AGENTS.md](../../../AGENTS.md)
3. [Contract types](../../../packages/core/src/contracts/types.ts), [async operations](../../../packages/core/src/contracts/asyncOperation.ts), [mapper types](../../../packages/core/src/contracts/make/ContractMapping.ts)
4. [Aggregate version construction](../../../packages/core/src/contracts/make/makeAggregateContractVersion.ts), [service version construction](../../../packages/core/src/contracts/make/makeServiceContractVersion.ts), [canonical construction](../../../packages/core/src/contracts/make/constructContractVersion.ts)
5. [Ordinary preparation](../../../packages/core/src/contracts/prepare/prepareOrdinaryInvocation.ts), [external preparation](../../../packages/core/src/contracts/prepare/prepareExternalInvocation.ts), [shared evaluation](../../../packages/core/src/contracts/evaluateContract.ts)
6. [Aggregate command evaluation](../../../packages/system-worker/src/AggregateVersionRepo/utils/evaluateAggregateCommand.ts), [service command evaluation](../../../packages/system-worker/src/ServiceVersionRepo/utils/evaluateServiceCommand.ts)
7. [Async operation preparation](../../../packages/system-worker/src/asyncOperations/prepareAsyncOperation.ts), [recorded continuation reconstruction](../../../packages/system-worker/src/asyncOperations/readPreparedAsyncCommand.ts), [shared async lifecycle](../../../packages/system-worker/src/asyncOperations/makeAsyncOperations.ts)
8. [Tic-tac-toe declaration](../../../examples/tic-tac-toe/src/contracts/createGameV1.ts), [Shopping aggregate async callers](../../../examples/shopping/src/zerospin/aggregates/user/contracts/fulfillmentContracts.ts), [Shopping service async caller](../../../examples/shopping/src/zerospin/services/marketplace/contracts/checkout/mappedCheckoutV1.ts)
9. [Async replay ADR](../../adrs/001-async-replay-retains-output-without-production.md), [continuation authority ADR](../../adrs/008-ordinary-and-recorded-continuation-authority.md)
10. [Local patterns](../../patterns/index.md), [explicit domain methods](../../patterns/typescript/explicit-domain-methods-no-overloads.ts), [contract program emission](../../patterns/contracts/contract-program-emission-and-result.ts), [glossary](../../glossary.md)
11. [Superseded Plan 099](../plans/099-plan-channel-contract-programs.md), [combined Plan 140](../plans/140-plan-effect-contract-evaluation-and-async-receivers.md), [completed evaluation-phases plan](../plans/107-plan-contract-evaluation-phases.md)

## Open decisions

1. Where does a concrete async operation obtain the exact receiving aggregate/service release name and version without an authored binding? Can the receiving declaration/release supply it directly? Inspect construction order and settle this explicitly. Do not reintroduce a separately authored contract/owner pairing through renamed bindings or binding-shaped catalog entries.
2. What concrete contract representation preserves correct registration and callback scope without `ownerKind`? Separate modules/classes and nominal provenance were discussed; no final representation was approved.
3. What cross-owner async behavior is already required by the broader ongoing work? Current WIP attempts addressed cross-owner validation, while the worker remains same-owner. Neither the linked thread's assistant example nor the rejection of bindings settles that capability or its authority/claims rules. Inspect its originating requirements before choosing either restriction or expansion.
