# AggregateVersionRepo async command outbox head

**Date:** 2026-10-15

**Status:** Complete. Shared field rename, consumer propagation, scoped verification and independent allocation/transaction review finished on 2026-10-15.

**Parent:** [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md).

**Evidence:** [AggregateVersionRepo.asyncCommandOutboxHead review](../../reviews/storage-tables/aggregate-version-repo-async-command-outbox-head.md).

## Problem and settled result

`lastIndex` is the last committed allocated enqueue position, but its name can be confused with a page tip or delivery acknowledgement. Preserve the existing allocator and give its value an exact domain/event name.

Keep the physical table `asyncCommandOutboxHead` with exactly:

```ts
{
  singletonId: number; // integer primary key; allocator slot 1
  lastAllocatedOutboxIndex: number; // nonnullable integer
}
```

1. Keep `singletonId` and its fixed production slot 1. It is a structural SQL row address, not a new business identity.
2. Rename stored `lastIndex` to `lastAllocatedOutboxIndex`, including its declaration, read, insert and conflict-update fields. Retain its value and existing allocation semantics.
3. Preserve lazy initialization: fresh storage has no allocator row, absence means logical zero, and the first successful enqueue inserts slot 1 with allocated position 1. Add no eager seed row.
4. Preserve lifetime allocation history after acknowledged pending rows are deleted. Do not reset it when the outbox empties or derive it from the current pending maximum.

## Scope

- **Shared schema:** rename the field in `asyncOperationsDbConfig.tables.asyncCommandOutboxHead`. Both VersionRepo owners inherit it; apply the shared representation once without an aggregate-only copy. Required propagation does not mark the service owner occurrence reviewed.
- **Sole runtime consumer:** update `recordExternalOutcome` in `makeAsyncOperations.ts`: read the renamed value, calculate the next position, insert it and update it on conflict. Preserve the synchronous transaction and existing guard order.
- **Documentation/schema consumers:** update relevant module READMEs, glossary/architecture descriptions, both Explorer head purposes/schema capture and existing verification referring to this specific table/field.
- **Concurrent work:** preserve Plan 186's selected two-column pending outbox and diagnostic removal in the same shared files. Its [review record](../../reviews/storage-tables/aggregate-version-repo-async-command-outbox.md) tracks that separate scope. Do not restore deleted diagnostic code while renaming the head.

Do not rename unrelated page-envelope `lastIndex` values, queue APIs, pending `outboxIndex`, command positions, the table itself or alarm names. Add no allocator wrapper, replacement sequence, new lock/counter, singleton constraint, head-row repair/decoder or corruption policy. This is the selected field rename, not a new allocation design.

## Required invariants

1. Work with an existing observation returns before reading/advancing the allocator. Both first Success and first Failure observations allocate exactly once.
2. Observation storage, pending continuation insertion and allocator upsert commit together. Encoding/insertion/transaction failure leaves all three unchanged; failed attempts consume no position.
3. Allocate `(head?.lastAllocatedOutboxIndex ?? 0) + 1` and retain the current `Number.isSafeInteger` refusal before new recording writes. At exhaustion, do not wrap, reset or record a false observation.
4. Acknowledgement deletes only pending delivery rows. The allocator survives an empty queue and cold activation. Neither field becomes acknowledged/executed progress.
5. Preserve current slot/positive-value writer conventions without claiming SQL `CHECK` enforcement or automatic repair. Rename does not change which retained states the allocator validates.

## Verification and completion

Use permitted existing scoped Nx checks and existing acceptance/Workerd seams. Create no new tests, fixtures, runners or configuration.

Verify the exact renamed physical shape, absent initial head/first position 1, subsequent allocations after pending-row deletion, duplicate first-observation recording, rollback and safe-integer exhaustion. Preserve the preceding outbox cleanup, work/observation identity, alarm behavior and required shared consumers. Use existing inspection/rollback assertions where they already exercise this state; report unavailable evidence as unfinished work.

Changed fixed schemas require empty affected storage. Refuse the old column shape; add no compatibility alias, fallback decoder, translation migration or automatic reset. This plan authorizes no storage reset.

Reconcile documentation/Explorer and obtain independent allocation/transaction review. Record actual checks, then archive this child only when implementation, verification and review finish. Parent Plan 151 remains active.

## Outcome and verification

1. Renamed the shared schema field and its sole runtime reader, insert and conflict update to `lastAllocatedOutboxIndex`. Both VersionRepo owners inherit the declaration. Slot 1, lazy initialization, guard order and the synchronous observation/pending-row/head transaction remain unchanged. Plan 186's two-column pending outbox and diagnostic removal are preserved.
2. Updated module READMEs, glossary and architecture descriptions, both Explorer head purposes and the existing schema capture. `node explorer/scripts/capture-schema.mjs` captured nine Repos and fifty tables with the renamed head in both owners. Shared propagation does not mark the ServiceVersionRepo table occurrence reviewed.
3. Passed `node scripts/verify-plan140.mjs` (eight groups). Existing assertions verify both owners' exact declared head shape, absent initial row and first position 1, retained history after pending deletion, subsequent Failure allocation at position 4, duplicate no-op, safe-integer exhaustion with unchanged work/pending/head, and insertion rollback followed by reuse of unconsumed position 1.
4. Passed `pnpm nx run-many --targets=ts,lint,test-workerd-ts,check --projects=system-worker,explorer --parallel=1 --outputStyle=static`, including dependency compilation, system-worker typechecking/test typechecking and Explorer checks. After the final existing fixture change, passed `pnpm nx run-many --targets=lint,test-workerd-ts --projects=system-worker --parallel=1 --outputStyle=static`. Existing unrelated lint warnings remain; Nx Cloud reported access code 401 after successful local tasks.
5. Passed `pnpm nx run system-worker:test-workerd -- test/migratable-do-repo/system-repo-activation.workerd.spec.ts test/telemetry/invocation-order.workerd.spec.ts`: two files and nine tests. Existing inspections verify both owners' exact integer/primary-key/nonnullable physical head columns and absent initial row. Real Shopping continuations retain heads 2 and 1 after pending delivery empties and explicit cold `ready()` activation. Both owners refuse the old `lastIndex` physical column without translation, reset or migration-ledger changes. Existing invocation, Cause and alarm recovery scenarios pass.
6. Independent allocation/transaction review found no actionable defects. It confirmed duplicate return before allocator reads, both outcome branches, safe-integer refusal before writes, atomic rollback, acknowledgement-only pending deletion, explicit cold activation and old-shape refusal. Scoped formatting and diff checks passed. No new test files, fixtures, runners or configuration were created, and no application storage was reset.

## Remaining work

None. Parent Plan 151 remains active.
