# Handoff: Opaque external work and originating-chain continuations

**Date:** 2026-10-14

**Status:** Incorporated into [Plan 150](../plans/150-plan-opaque-external-work.md). Completed and verified; the source cutover and documentation are reconciled.

**Focus:** Carry the agreed external-work boundary into a scoped plan and hard cutover.

## Goal

External work is an opaque authored Effect. Its durable operation belongs only to the VersionRepo that originally scheduled it. Once its response is recorded, Zerospin submits the continuation to that repo's associated admission chain. The chain handles normal command execution and version replay.

The user accepted this clarification with “ok” and requested this handoff, then asked to incorporate it into a plan and lock all decisions. [Plan 150](../plans/150-plan-opaque-external-work.md) and [ADR 012](../../adrs/012-opaque-external-work-and-originating-chain-continuations.md) govern the completed implementation and verification.

## Settled direction

1. **External work is totally opaque.** Provider endpoints, Slack recipients, remote API calls, and other request internals belong to the author. The framework retains invocation identity, frozen input, and outcome for durability; it does not interpret request destinations.
2. **Persist async work only in the original VersionRepo.** Replay should create no async-operation rows, and replicas should receive model changes without async-work descriptions. Current code still retains inert async emissions during version replay; those are distinct from runnable production work.
3. **Return the continuation to the originating admission chain.** An aggregate repo already knows its chain through system ID, aggregate name, and instance ID; a service repo knows its chain through system ID and service name. The external-operation API should not offer a separate continuation recipient.
4. **Do not require that only the originating AVR executes the continuation.** Earlier assistant answers incorrectly equated returning to the originating chain with executing exclusively in the originating VersionRepo. Normal admission, command version metadata, execution, and replay remain the chain's responsibility.
5. **Remove `receivingAddress` from external-operation descriptions and storage.** Today it selects a registered external declaration and an alternate Zerospin continuation destination. Resolve the declaration in the originating repo's release and derive chain routing from the repo context instead. Do not reintroduce the removed address under another name or inside a generic routing envelope.
6. **Remove redundant emitter identity fields.** `emissionOwnerKind`, `emissionOwnerName`, and `emissionOwnerVersion` duplicate the containing repo's identity. Aggregate and service storage is already physically separate; additional table names are not needed to establish that boundary.

## Done

1. Inspected current declaration resolution, original-only production eligibility, response/outbox recording, continuation reconstruction, admission-chain routing, and projection consumption. These already provide useful durable boundaries, but the settled design above is not implemented.
2. Existing research captures current source, Shopping's no-op external purchase-creation bridge, and existing backend command APIs. Reference it rather than repeat its investigation. **Its proposed wording about resuming in the exact emitting VersionRepo predates the correction in Settled direction item 4; this handoff records the later clarification.**
3. No source, schema or tests were changed in the side conversation or decision-locking turn. The research note existed as an untracked parent-thread artifact at handoff creation; preserve it and unrelated work.
4. Created Plan 150 and accepted ADR 012, superseding ADRs 001/010 and retaining the independent guarantees of ADRs 005/008/011. The plan records the implemented Shopping API/service seam, `externalFailure`, existing table names and sparse model operation indexes.

## Remaining

None. Plan 150 records the implemented cutover, eight acceptance groups, 20 Workerd tests, scoped build/type/lint checks and independent review. Application deployment/binding configuration and empty affected storage remain operator requirements; no local/live reset or deployment was performed.

## Suggested skills

1. `$use-morgs32-wiki-patterns` — consult the local pattern index and relevant shared ownership, transaction, and scoped-execution guidance.
2. `$implement` — carry approved work through implementation, existing verification, and plan completion; preserve unrelated WIP.
3. `$nx-workspace` and `$nx-run-tasks` — discover the relevant framework/consumer tasks and run scoped Nx verification.

## Pointers

1. [AGENTS.md](../../../AGENTS.md)
2. [wiki/research/external-work-and-continuation-addressing.md](../../research/external-work-and-continuation-addressing.md)
3. [wiki/adrs/001-async-replay-retains-output-without-production.md](../../adrs/001-async-replay-retains-output-without-production.md)
4. [wiki/adrs/010-source-owned-addressed-async-continuations.md](../../adrs/010-source-owned-addressed-async-continuations.md)
5. [wiki/adrs/011-author-owned-external-request-retries.md](../../adrs/011-author-owned-external-request-retries.md)
6. [packages/system-worker/src/asyncOperations/](../../../packages/system-worker/src/asyncOperations)
7. [packages/system-worker/src/AggregateChain/admitAsyncCommands/](../../../packages/system-worker/src/AggregateChain/admitAsyncCommands)
8. [packages/system-worker/src/ServiceChain/admitAsyncCommands/](../../../packages/system-worker/src/ServiceChain/admitAsyncCommands)
9. [packages/core/src/contracts/asyncAggregateOperationDescriptor.ts](../../../packages/core/src/contracts/asyncAggregateOperationDescriptor.ts)
10. [packages/core/src/contracts/asyncServiceOperationDescriptor.ts](../../../packages/core/src/contracts/asyncServiceOperationDescriptor.ts)
11. [examples/shopping/src/zerospin/services/marketplace/contracts/checkout/checkoutServerV1.ts](../../../examples/shopping/src/zerospin/services/marketplace/contracts/checkout/checkoutServerV1.ts)
12. [examples/shopping/src/zerospin/aggregates/user/contracts/createPurchaseV1.ts](../../../examples/shopping/src/zerospin/aggregates/user/contracts/createPurchaseV1.ts)
13. [Plan 150](../plans/150-plan-opaque-external-work.md)
14. [ADR 012](../../adrs/012-opaque-external-work-and-originating-chain-continuations.md)

## Open decisions

None. Plan 150 locks all choices, including the authored Shopping SystemApi capability, once-generated frozen remote command identity, `externalFailure`, existing `asyncOperations` table names and existing verification seams. No new test files, fixtures, test/check runners or configuration are authorized.
