# AggregateVersionRepo async command outbox

**Date:** 2026-10-15

**Status:** Complete. Implementation, scoped verification, documentation/schema consumers and independent admission, acknowledgement, Cause and recovery review finished on 2026-10-15.

**Parent:** [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md).

**Evidence:** [AggregateVersionRepo.asyncCommandOutbox review](../../reviews/storage-tables/aggregate-version-repo-async-command-outbox.md).

## Problem and intended result

Pending continuation delivery stores a diagnostic that neither selects work nor controls retry. Its coverage excludes several failure modes, and a failed diagnostic write can replace the original delivery failure. Keep pending membership and enqueue order without coupling recovery to diagnostic persistence.

[Plan 159](159-plan-aggregate-version-repo-async-operation-storage.md) already implemented the stable `continuationCommandId` reference name. Build on that source and preserve its frozen-work boundaries.

## Settled model

Retain the physical table name `asyncCommandOutbox` with exactly:

```ts
{
  outboxIndex: number; // integer primary key; local enqueue order
  continuationCommandId: string; // unique stable recorded continuation
}
```

1. Keep numeric FIFO selection and the existing retained allocator. Positions reflect local outcome-recording/enqueue order, independent of initiating command order or authored operation positions.
2. Keep unique `continuationCommandId` for preparation and exact-child redelivery. Store no copied payload, Origin, observation, receiver identity or extra work ID.
3. Remove `lastDeliveryFailure`, its enqueue initializer and SQL writer. Add no replacement field, table, attempt counter, timestamp, pause gate or retry state. Preserve failures through the existing invocation/logging path; configuring future alerts is separate work.
4. Successful admission removes pending membership. Frozen work/observation evidence stays retained. Keep the current successful-admission acknowledgement contract; this is not acknowledgement of authored continuation execution or success.

## Scope and smallest queue adaptation

- **Shared declaration:** remove the diagnostic from `asyncOperationsDbConfig.tables.asyncCommandOutbox` and its unused public-failure import. Both VersionRepo families include this same table; propagate once rather than introduce a service-specific duplicate. Necessary service propagation does not mark its table context reviewed.
- **Atomic enqueue:** remove only the diagnostic initializer in `recordExternalOutcome`. Preserve first-outcome storage, outbox insertion and head advance in one synchronous transaction; keep exact IDs, safe-index exhaustion and both external outcome branches.
- **Default SQL queue path:** the two VersionRepo continuation outboxes are its only production callers. Remove this path's diagnostic-column type requirement and installed `recordFailure` callback. Keep existing page selection, preparation and transactional deletion. This is deletion of unnecessary behavior, not a new queue configuration feature.
- **Custom storage:** preserve its existing optional diagnostic hook and encoder. AggregateChain still deliberately supplies a real writer; ServiceChain already omits it after its own cleanup. Do not change their diagnostic policy or add a no-op writer, runtime column detection, diagnostic flag, copied page loop or async-outbox adapter.
- **Consumers and docs:** update existing acceptance/Workerd assertions, asyncOperations/VersionRepo documentation, affected architecture/pattern wording and both Explorer outbox purposes/schema capture. Remove claims of durable diagnostic inspection for these outboxes, without claiming every queue diagnostic has been removed.

Keep queue/alarm names, paging protocol, head allocation and the independently reviewed `asyncOperations` fields unchanged. The head's naming recommendation has its own [review](../../reviews/storage-tables/aggregate-version-repo-async-command-outbox-head.md); this child does not select that rename or another allocator design.

## Required recovery behavior

1. First external outcome, its pending continuation and allocator advance commit together. Repeated recording of an existing observation allocates nothing and enqueues nothing. Failure rolls all new writes back.
2. Preparation loads recorded work by continuation ID and reconstructs the complete frozen child. Receiving Chain proof and its atomic admission transaction remain intact; sender success means the whole page was admitted or recovered identically.
3. Delete only the selected pending rows after successful receiver admission, in one local transaction. A lost reply preserves rows for exact-child recovery; removing pending membership never removes recorded work or causes another request invocation.
4. Typed errors, defects and interruption preserve pending membership until acknowledged. Keep narrowly scoped immediate transport retry and later durable recovery, single-lane ordering and semaphore serialization. Remove the diagnostic-write dependency while preserving the original complete Cause; do not swallow it or substitute logging for failure propagation.
5. Keep durable queue/async alarm holds, renewal, producer fencing and cleanup behavior. Delivery recovery continues independently of blocked external requests. A consumed alarm must be scheduled again while recovery remains necessary.

## Verification and completion

Use permitted existing scoped Nx checks and existing acceptance/Workerd seams only. Create no new tests, fixtures, runners or configuration.

Required evidence:

- Exact two-column outbox in both shared owners and no diagnostic SQL writes/initializers on this path.
- Preserved FIFO enqueue order, retained allocator after an empty queue and safe-index exhaustion.
- Atomic outcome/enqueue/head rollback, both outcome branches, and no second enqueue for an existing observation.
- Frozen child preparation, complete receiver proof, atomic admission and exact retained retries.
- Successful admission deletes only pending delivery; lost replies, typed refusals, defects and interruption preserve recovery and the original Cause.
- Other custom-storage diagnostic policies remain unchanged, and retained work/observations survive acknowledgement.
- Current schema consumers and relevant documentation reflect the selected behavior.

Changed fixed storage requires empty affected storage. Refuse superseded shapes; add no alias, fallback decoder, translation migration, compatibility-only fixture or automatic reset. This plan authorizes no storage reset.

Obtain independent admission/acknowledgement/Cause/recovery review and record actual checks here. Missing existing verification evidence remains unfinished work. Archive this child only after implementation, checks and review finish; the parent table review remains active.

## Implementation outcome

1. Shared `asyncCommandOutbox` now contains exactly primary-key `outboxIndex` and unique `continuationCommandId` in both VersionRepo families. Removed the diagnostic declaration/import and enqueue initializer. The retained head, safe-index guard, first-observation rule and synchronous outcome/enqueue/head transaction are unchanged.
2. Default SQL `makeOutboxQueue` no longer requires a diagnostic column or installs a failure writer. Ordered page selection, frozen preparation, receiver proof/atomic admission and transactional deletion of selected pending rows retain their existing boundaries. Custom storage's optional diagnostic hook/encoder, AggregateChain's real writer and ServiceChain's omitted writer are unchanged.
3. Updated existing acceptance and Workerd assertions, module READMEs, architecture/pattern/glossary wording, and both Explorer outbox purposes/schema captures. The parent table review remains active; the head naming recommendation and service-specific table reviews remain separate.

## Verification evidence

1. Ran `pnpm nx run-many --targets=ts,lint,test-workerd-ts,check --projects=system-worker,explorer --parallel=1 --outputStyle=static`. Dependency compilation, system-worker typechecking/test typechecking and Explorer check/lint passed. The first system-worker lint attempt found a formatter-moved import suppression boundary in the edited test; fixed it and passed `pnpm nx run system-worker:lint`. After the final assertion correction, `pnpm nx run-many --targets=lint,test-workerd-ts --projects=system-worker --parallel=1 --outputStyle=static` passed. Existing unrelated lint warnings remain; Nx Cloud reported an access warning after successful local tasks.
2. Ran `pnpm nx run system-worker:test-workerd -- test/migratable-do-repo/system-repo-activation.workerd.spec.ts test/telemetry/invocation-order.workerd.spec.ts`. All three activation/Shopping/cold-restart scenarios passed, including physical two-column schemas in both owners. The new Cause test initially compared Effect-added stack annotations; corrected it to assert every original failure reason, identity and defect while allowing annotations, then passed all six invocation-order tests with `pnpm nx run system-worker:test-workerd -- test/telemetry/invocation-order.workerd.spec.ts`. Nine relevant tests pass across the two files. These exercise diagnostic-free default SQL delivery, pending membership on typed/compound/defect/real-interruption outcomes, invocation reporting, consumed-alarm renewal, successful recovery, producer cleanup and custom ServiceChain omission.
3. Passed `node scripts/verify-plan140.mjs` (eight groups). Existing async seams now exercise both owners' exact outbox shapes; FIFO by reverse outcome-recording order; frozen preparation and complete-child proof; whole-page proof rejection and late admission rollback; committed receiver admission with a lost reply; identical retained retries without current declarations; bounded deletion of selected pending rows; retained work/observations and head after acknowledgement; no request reinvocation; both outcome branches; no second enqueue/allocation for an existing observation; safe-index exhaustion with unchanged rows/head; and observation/enqueue/head rollback. Existing reservation, blocked-request, timeout, interruption and durable recovery scenarios also pass.
4. Independent production and verification review found no actionable admission, acknowledgement, Cause or recovery defects. Source comparison confirms the custom AggregateChain writer/encoder, narrow immediate transport retry, single-lane semaphore, producer fencing and async/queue alarm lifecycle are unchanged. Explorer's regenerated capture covers nine Repos and fifty tables, with two columns in each continuation outbox and AggregateChain's diagnostic retained. Scoped formatting, lint and diff checks passed.

Changed affected fixed storage requires empty storage. No compatibility path, translation migration, automatic reset or existing application storage reset was introduced or performed. No test files, fixtures, runners or configuration were created. Unrelated work was preserved.

## Remaining work

None.
