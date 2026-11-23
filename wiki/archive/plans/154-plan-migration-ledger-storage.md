# Migration ledger storage

**Date:** 2026-10-14

**Status:** Implemented and verified on 2026-10-15. Independent integrity/recovery review complete.

**Parent:** [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md).

**Evidence:** [AggregateChain.applied_migrations review](../../reviews/storage-tables/aggregate-chain-applied-migrations.md).

## Problem and intended result

Before this implementation, the common `applied_migrations` ledger retained an authored label already bound by its checksum and a diagnostic timestamp that never controlled ordering or recovery. The timestamp was sampled while stamping, not at commit, and fresh provisioning recorded represented history without executing historical migration SQL.

Keep the common immutable forward-only history lifecycle and store only migration identity and definition integrity. This changes the shared ledger representation, not the ownership or migration policy adopted by [ADR 009](../../adrs/009-forward-only-framework-storage.md).

## Settled model

Retain the physical table name `applied_migrations` with exactly:

```ts
{
  migrationId: number; // integer primary key, baseline 0
  definitionChecksum: string;
}
```

1. Rename stored `id` to `migrationId` and stored `checksum` to `definitionChecksum`. Keep baseline zero and positive, safe, strictly increasing authored migration IDs; gaps are valid.
2. Remove persisted `name` and `appliedAt`. Add no replacement label, timestamp, diagnostic table or latest-revision singleton.
3. Preserve the definition checksum's exact preimage `[id, name, sqlStatements]` and SHA-256 encoding. Authored labels remain in declared history and continue to be bound by the checksum; removing their stored copy does not authorize mutable labels or weaker SQL integrity.
4. Retain every represented entry and exact ordered-prefix validation. Do not collapse the ledger to the latest ID or checksum.
5. Keep definition integrity separate from physical-schema validation. The baseline checksum is constant and is not a fingerprint of the installed database graph or retained data.
6. Fresh storage provisions the current graph and stamps its represented history atomically. Existing compatible storage applies pending SQL and stamps atomically. Preserve explicit durability confirmation and the activation gate.
7. Keep missing-ledger refusal for nonempty/bootstrapped storage. Add no automatic adoption or reset.

## Scope

The declaration and lifecycle are shared by all nine backend owners. Apply the representation once in the common module; do not create an AggregateChain-only ledger or an alternate initialization path. Necessary propagation to those owners does not mark their individual table contexts reviewed.

- `makeMigratableDORepo/migrationLedgerDbConfig.ts`: two physical columns and their row schema.
- `migrationLedger.ts`: retained row type, SELECT/INSERT fields and stamp parameters; remove the clock read.
- `migrationHistory.ts`: compare stored migration identity/checksum with the authored prefix; remove redundant saved-name and timestamp checks without changing the checksum contract.
- `provisionMigratableSchemaTx.ts`, `applyMigratableDORepoMigrationTx.ts` and `initializeMigratableSchema.ts`: propagate names and preserve atomicity, prefix/refusal rules, physical validation and `storage.sync()` ordering.
- Existing module documentation, glossary, architecture and Explorer schema/purpose descriptions: describe represented immutable history, definition checksum and durability confirmation accurately. Remove claims that a retained timestamp proves commit time.
- Existing verification and direct consumers that read ledger rows: propagate the new fields without compatibility aliases or deprecated-field fixtures.

Authored migration declarations can retain their current `id`, `name` and SQL interface. Keep the storage-to-declaration comparison explicit; do not add forwarding wrappers merely to rename properties.

## Implementation sequence

1. Cut the shared table/retained-row definition and raw SQL to the two settled columns.
2. Update prefix validation and lifecycle callers while preserving the complete definition checksum and baseline rules.
3. Reconcile current source documentation and Explorer consumers, including the distinction between represented history and executed historical SQL.
4. Run permitted existing checks, obtain an independent integrity/recovery review, and record actual evidence here.

## Verification and completion

Use existing scoped Nx build/typecheck/lint and migration acceptance/Workerd seams. Create no new tests, fixtures, check runners or configuration.

Required evidence:

- Fresh provisioning creates exactly the two-column ledger and records baseline/current represented history with the current graph in one transaction.
- Baseline-only AggregateChain reopens successfully with the supported receipt and validates its actual physical schema separately.
- IDs with valid gaps retain authored order; missing/reordered entries, edited names/SQL, changed checksums and unsupported longer histories remain refused.
- A failing migration remains unstamped and rolls back its writes; confirmed prior steps form the resumable prefix.
- Fresh current provisioning does not execute historical ALTER statements; retained pending migration execution and stamping remain atomic.
- `storage.sync()` confirms each committed step before activation/recovery proceeds. Timestamp removal must not weaken this actual durability evidence.
- Old four-column ledger storage is refused. This fixed-schema cutover requires empty affected storage; add no translation migration, decoder fallback or automatic reset.

Report unavailable existing verification seams as unfinished work rather than creating prohibited infrastructure. Archive this child only when implementation, checks and independent review finish; the parent review remains active.

## Implementation outcome

1. The shared ledger now declares and reads only `migrationId` and `definitionChecksum`. Stamping writes those two fields without a clock read. Stored prefix comparison explicitly matches them to the authored `id` and prepared checksum. All nine owners retain the same shared initialization path.
2. Authored declarations and the exact SHA-256 preimage/encoding remain unchanged. Provisioning, pending migration transactions, final physical-schema validation, missing-ledger refusal, explicit `storage.sync()` confirmation and the activation/alarm gate required no lifecycle changes.
3. The existing module README, glossary, architecture source citations, repository lifecycle pattern and Explorer purpose/schema descriptions now distinguish represented history, definition integrity, physical-schema integrity and durability confirmation. Explorer's regenerated snapshot contains exactly the two ledger columns for all nine owners.
4. Existing Workerd verification was updated in place. No test files, fixtures, check runners or configuration were created. No storage adoption, translation migration, decoder fallback, automatic reset or production storage change was introduced.

## Verification evidence

1. `pnpm nx run system-worker:test-workerd test/migratable-do-repo` passed both existing suites: **7 tests**, 29.14 seconds. Its declaration-build dependencies passed, including `system-worker:lib`.
2. Fresh provisioning asserts exactly the two physical columns and matches the complete ledger produced by cold pending upgrades with authored IDs `[1, 4]`. The current graph already includes the historical ALTER's added column, so successful fresh provisioning also proves historical ALTER SQL was not executed.
3. The existing refusal scenario covers edited names/SQL, duplicate/reordered declarations, unsupported longer retained histories, a changed retained checksum and a missing history entry. Refusals retain the stored history. A reconstructed four-column ledger is refused before owner activation and its rows remain unchanged; unstamped table/view storage also remains refused.
4. SQL and stamp failures roll back the failing migration's writes/stamp while retaining confirmed prefix `[0, 1]` across a cold constructor restart. Removing the transient failure resumes the identical pending migration. Bootstrap/activation failure cases preserve confirmed initialization and successful bootstrap; the retained-alarm scenario verifies failed migration blocks delivery recovery.
5. The production-owner suite asserts the exact baseline receipt, including the constant checksum, across all nine owners. Baseline-only AggregateChain reopens successfully. Adding a physical `commands` column then refuses activation while leaving that valid baseline receipt unchanged, demonstrating separate physical-schema validation. Actual aggregate/service command receipts also survive cold reopening.
6. Independent review traced the unchanged synchronous transaction boundaries and explicit awaited `storage.sync()` after provisioning and every committed migration, before later steps and activation. Existing cold failure/resume cases supply runtime durability evidence; no new sync-call instrumentation was introduced. Final review found no actionable integrity/recovery gaps.
7. `pnpm nx run-many -t ts lint test-workerd-ts typecheck format:check -p system-worker explorer` passed all selected package/Explorer checks and declaration dependencies. Lint reported zero errors; five warnings in unchanged System Worker files and six in unchanged Explorer UI files remain outside scope. Nx Cloud reported access error 401 after successful local tasks; it did not block verification.
8. `node explorer/scripts/capture-schema.mjs` captured 9 concrete Repos / 50 declarations. Its only schema changes are the nine shared ledgers. Scoped formatting, repaired local document links and `git diff --check` passed.

Changed fixed storage requires empty affected storage. The superseded ledger is refused; no existing storage was reset. Parent Plan 151 remains active and other owner/table occurrences have not been independently reviewed by this child implementation.

## Remaining work

None. Parent Plan 151 remains active independently.
