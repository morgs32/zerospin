# AggregateVersionRepo model operation storage

**Date:** 2026-10-15

**Status:** Completed and verified on 2026-10-15.

**Parent:** [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md).

**Evidence:** [AggregateVersionRepo.modelOperations review](../../reviews/storage-tables/aggregate-version-repo-model-operations.md).

## Problem and settled result

Each stored model mutation repeats its parent command's aggregate position, the model version fixed by its execution release, and a timestamp shared by every mutation in that execution. Store the mutation itself and retain the execution time once on its parent.

Keep physical `AggregateVersionRepo.modelOperations` with exactly six nonnullable columns:

```ts
{
  commandId: string;
  operationIndex: number;
  modelName: string;
  resourceId: string;
  operationName: 'create' | 'update' | 'delete' | 'move';
  body: string;
}
```

Preserve the unique `model_command_operation` index on `(commandId, operationIndex)`. Remove stored `aggregateIndex` and `modelVersion`. Move the exact value currently stored as per-operation `committedAt` to required `AggregateVersionRepo.executedCommands.executionStartedAt`, using `primitives.date()`.

`executionStartedAt` is the existing `occurrence.startedAt` sampled before evaluation. It is not commit time or `commandOutcome.recordedAt`. Retain it for every finalized execution occurrence, including refusals and zero-operation successes. Original execution and replay each retain their own local sample.

## Storage, transport and application

1. Remove `modelVersion` from shared `modelOperationShape`. Remove Aggregate-only `committedAt` and `aggregateIndex` from the Aggregate declaration. Keep the existing six mutation fields, body encoding and sparse authored `operationIndex` unchanged. External output slots remain omitted without renumbering model output.
2. Pass `occurrence.startedAt` to the journal writer and retain it in the same synchronous transaction as the final outcome, disposition and successful output. Keep source resource application using that exact sample as `appliedAt`. Duplicate recovery reads retained history and never samples a replacement time. An outer transaction failure retains neither output nor time.
3. Separate stored operation rows from complete portable operations. At Aggregate result assembly, reconstruct the existing seven-field `EncodedOperationSchema` representation by adding `modelVersion` from the exact model bound to this Repo's execution release. Fail a missing binding; do not look up the latest model or use the command's possibly different admitted `aggregateVersion`. Preserve canonical model identity, operation-leaf validation and body bytes; do not decode/re-encode bodies merely to remove envelope fields.
4. Carry `executionStartedAt` on the parent executed-command record in `IAggregateResult`, alongside its existing position. Send each model operation as the canonical seven-field operation. Do not repeat the parent time or `aggregateIndex` per operation on the Aggregate wire. Update both actor and agent result fanouts through their common result assembly.
5. At Aggregate projection intake, decode and preserve the required parent time **before** mapping through `AggregateFinalCommandSchema`, which discards execution-only metadata. Validate parent owner, execution release and position, successful outcome when operations exist, matching operation `commandId`, strictly increasing safe sparse operation indexes, exact model version and canonical body. Apply every operation with the retained parent `executionStartedAt` as `appliedAt`, within the existing projection transaction.
6. Propagate the shared model-version removal through Service consumers without extending the timestamp decision to an unreviewed owner. Service storage becomes eight fields: the shared six plus existing `serviceIndex` and `committedAt`. Reconstruct its outgoing explicit `modelVersion` from its own bound execution release and validate that wire field before or independently of the storage decoder that now omits it. Preserve Service's current index/time association and application checks. Do not add Service `executionStartedAt` or remove Service position/time in this child.

Keep core `EncodedOperationSchema`, model-specific operation codecs and `prepareBoundReplayAppliedOperation` semantics. Removing redundant storage does not remove portable model-version validation. Resource timestamps must remain identical after delayed delivery, cold activation and duplicate recovery; projection receipt time, original Chain outcome time and later `commandOutcome.recordedAt` are not substitutes.

## Required scope

- **Declarations/writers:** `modelOperationShape.ts`, Aggregate DB config, Aggregate model-output insertion and final journal retention. Thread the existing sample through `materializeCommandTx` without changing evaluation/savepoint sequencing. Propagate shared storage removal through Service output insertion.
- **Readers/results:** `readOperationOutput.ts`, Aggregate/Service result paging and result types, and their bound-release callers. Preserve result inspection and journal decoding, checkpoint reads and duplicate result recovery. Do not add execution metadata to the core final-command contract merely to carry journal context.
- **Projections:** Aggregate intake/application and necessary Service wire-version reconstruction/validation. Preserve private completion ownership, selected browser deltas and receiver-local inverse handling.
- **Documentation/inspection:** relevant module READMEs, architecture/glossary descriptions and Explorer purposes/schema capture. Preserve concurrent async-operation/outbox changes in shared files.

Other `executedCommands` removals or renames are proposals in its [separate review](../../reviews/storage-tables/aggregate-version-repo-executed-commands.md), not approved scope for this child. Do not add output hashes, inverse-operation columns, a second operation identity, new counters or new storage tables.

## Verification and completion

Use existing scoped Nx checks, `scripts/verify-plan140.mjs` and applicable existing Workerd activation/projection seams. Create no new tests, fixtures, runners or configuration. Update existing assertions only where they exercise this changed representation.

Prove the exact six-field Aggregate and eight-field Service storage shapes, unchanged operation uniqueness/order/body encoding, explicit outgoing model versions and missing/wrong-version refusal. Cover replay where admitted and executing releases differ. Verify retained parent time and identical source/projection resource timestamps for delayed delivery and recovery, including create/update/move; retain time for zero-operation success and refusal. Verify savepoint/outer rollback and unchanged Service index/time behavior. Report any unavailable evidence as unfinished work.

Changed fixed schemas require empty affected storage, including both owners of the shared model shape. Refuse the old physical shapes; add no compatibility aliases, fallback decoder, translation migration or automatic reset. This plan authorizes no storage reset.

Obtain independent lifecycle/transaction and wire/projection review, record actual checks and reconcile docs/Explorer. Archive this child only after implementation, required verification and review finish. Parent Plan 151 remains active.

## Completion evidence

1. Aggregate model storage now has exactly six nonnullable mutation columns and the unchanged unique `(commandId, operationIndex)` index. Every finalized Aggregate journal row retains the exact pre-evaluation `executionStartedAt`, including refusal and zero-operation success. Service stores the shared six plus its existing `serviceIndex` and `committedAt`.
2. Result readers restore explicit portable model versions from the bound executing release. Both Aggregate fanouts share the reader. Aggregate intake preserves parent time before core final-command decoding; both projection families validate portable versions and canonical bodies independently of narrowed storage codecs.
3. `pnpm nx run-many -t ts lint test-workerd-ts -p system-worker` passed. Lint reported five existing warnings in unchanged code.
4. `node scripts/verify-plan140.mjs` passed all eight groups after the final assertions. Existing assertions prove sparse output/body-byte preservation, exact physical declarations/indexes, missing/wrong model-version refusal, unsafe indexes and malformed canonical bodies, parent association/release/position/outcome refusal, admitted release 1/model 1 replayed by execution release 2/model 2, create/update/move timestamp equality, duplicate recovery, refusal/empty execution time, savepoint rollback and outer journal-write rollback. Service index/time behavior remains covered.
5. `pnpm nx run system-worker:test-workerd test/migratable-do-repo/system-repo-activation.workerd.spec.ts` passed all three existing tests. Physical SQL checks prove six/eight nonnullable columns, the unique operation index, required Aggregate parent time, Service's unchanged timestamp placement, old physical-shape refusal without migration-history changes, zero-operation/refusal retention and actual source Durable Object cold restart. Shopping create/update resource timestamps match their retained parent execution times before and after restart.
6. Projection recovery evidence uses the full production projection transaction and a receiver reopened from only persisted resource, browser-history and checkpoint rows, including create/update/move and duplicate prefix delivery. Workerd evidence covers actual source activation/restart; it does not claim a separate Workerd receiver-activation test.
7. Explorer schema capture refreshed successfully for nine concrete Repos and 50 table declarations. `pnpm nx run-many -t typecheck lint format:check -p explorer` passed typecheck/lint; its initial format failure was corrected and `pnpm nx run explorer:format:check` passed. Explorer lint reported six existing warnings. Nx Cloud access returned 401, while local checks completed successfully. Scoped formatting and `git diff --check` passed.
8. Independent lifecycle/transaction review and independent wire/projection review found no actionable issues. Module READMEs, architecture descriptions, glossary, fanout example and Explorer purposes/capture match the implementation. Concurrent async-operation/outbox work was preserved. No new tests, fixtures, runners or configuration were created, and no storage reset occurred. Parent Plan 151 remains active.

## Remaining work

None.
