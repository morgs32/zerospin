# Aggregate ordered operations union

**Date:** 2026-10-15

**Status:** Complete — implemented and verified on 2026-10-15.

**Related:** [Plan 151](../../plans/151-plan-storage-table-review.md), [outbox finding](../../reviews/storage-tables/aggregate-version-repo-aggregate-version-chain-outbox.md), [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md).

## Problem and agreed result

1. Aggregate execution packets currently split model mutations into `operations` and frozen external descriptions into `externalOperations`. Both arrays share one materialization commit, AggregateVersionChain publication, acknowledgement and deletion. They have no independent delivery lifecycle.
2. Replace the split with one non-null ordered `operations` union. AggregateVersionRepo's publication, AggregateVersionChain history/fanout and original finalization/recovery use that same complete representation. Their shared fixed packet shape changes from 12 columns to 11.
3. Preserve authored `operationIndex` on every member. Original output preserves mixed authored order. Replay omits external emissions before preparation/ID allocation, so its remaining model entries may have gaps. Do not replace operationIndex with array offset or renumber filtered output.
4. Model members retain their current `operationName` values (`create`, `update`, `delete`, `move`). Embedded external descriptions add the meaningful `operationName: 'external'` variant. Standalone pending-request rows retain their existing complete schema; AggregateChain removes the embedded discriminator when constructing those rows.
5. Aggregate projections apply model members only. AggregateChain selects external members for pending requests while atomically retaining exact original `commandOutcome`. AggregateVersionRepo, AggregateVersionChain and projections never invoke requests from history/publication.
6. Preserve resource/checkpoint/publication atomicity, public Failure as an empty operation union, full-packet AggregateVersionChain duplicate equality, exact-outcome AggregateChain retry semantics, stable external IDs, private completion filtering, timestamps and tag-only `dispositionChainHash`.
7. Keep Service packet/storage/consumers unchanged. Keep the review's four nested association-field normalization proposals out of scope; retain those fields in the new union. Preserve unrelated external-operation queue work from Plan 198 and other working-tree changes.

## Implementation

1. Define the Aggregate execution-operation schema and inferred type beside the shared packet. Replace both packet/SQL arrays with one ordered union; remove the superseded field directly, without aliases or fallback decoding.
2. Make AggregateVersionRepo retain encoded model and external members in the order already established by `prepareAggregateOutput`. Apply only model mutations inside the business savepoint and write the complete union with resources/refusal and checkpoint.
3. Update AggregateVersionChain validation to check one increasing operation-index sequence and each variant's existing identity/codec requirements. Preserve immutable full-packet equality and atomic history/fanout publication.
4. Update AggregateChain original acknowledgement and Aggregate projection mapping to select the members each owns. Preserve complete standalone pending work and all existing transaction/deletion boundaries.
5. Update existing fixtures, Workerd assertions and `verify-plan140.mjs` branches, explicitly preserving Service's split packet. Add concise assertions within existing scenarios for mixed order, sparse replay indexes, complete duplicate contradiction, rollback and external work recovery. Create no tests, fixtures, runners or configuration files.
6. Reconcile current module guidance, glossary, ADR 016, review finding and Plan 151 with the implemented Aggregate representation. Refresh schema metadata where appropriate without running any Explorer verification. Historical plans/results remain historical.
7. Run scoped Nx production/test typechecks, lint and existing Workerd runtime checks, plus existing contract acceptance. Fix in-scope failures, record evidence and archive only after required verification passes.

## Planned files

`+` creates a file; `~` edits an existing file. No new test/check files are planned.

```text
zerospin/
  wiki/plans/
    + 199-plan-aggregate-ordered-operations-union.md
    ~ 151-plan-storage-table-review.md
  packages/system-worker/src/
    ~ AggregateVersionChain/{aggregateExecutionPacket,appendExecutionPacketsTx}.ts
    ~ AggregateVersionRepo/materializeCommandTx.ts
    ~ AggregateVersionRepo/utils/{applyAggregateOutputTx,retainAggregateResultTx}.ts
    ~ AggregateChain/acknowledgeOriginalFinalization.ts
    ~ aggregateProjection/applyExecutionPackets/prepareProjectionOccurrence.ts
    ~ affected module README.md files
  packages/system-worker/test/
    ~ existing telemetry and real-owner Workerd assertions/fixtures
  scripts/
    ~ verify-plan140.mjs
  wiki/
    ~ glossary.md, adrs/016-aggregate-original-operations-and-external-work.md
    ~ affected current architecture/pattern guidance and outbox finding
  explorer/src/data/
    ~ schema-snapshot.json and affected descriptive metadata if needed
```

## Verification and constraints

1. Use the current resolved `system-worker` Nx graph for `lib`, `ts`, `lint`, `test-workerd-ts` and `test-workerd`. Run dependent builds through that one graph; do not overlap graph invocations that write shared outputs.
2. Run the existing `node scripts/verify-plan140.mjs` after required artifacts are current. Cover exact original reply recovery before/after publication deletion, first receipt rollback, frozen external IDs, mixed operation order, replay suppression with sparse indexes, projection model filtering and contradictory complete packet rejection.
3. Existing Workerd tests verify the physical 11-column Aggregate packet and the unchanged Service representation, activation/restart, publication, projection and Shopping external work. Keep fault-injection cleanup and actual production schema validation intact.
4. Check formatting, scoped whitespace, current documentation links and absence of the removed Aggregate packet field. No Explorer typecheck, lint, test, build, browser or visual verification is permitted or required.
5. Changed fixed Aggregate publication/history/fanout schemas require empty affected storage. Add no migration, compatibility decoder, dual representation or automatic reset. No commit, publication, deployment or provider action is authorized.

## Verified result

1. The Aggregate shared packet and fixed shape now have 11 columns and one ordered `operations` union. Canonical model operation names remain intact; embedded external descriptions use `operationName: 'external'`. All original nested association fields and `operationIndex` remain. Standalone pending request rows and Service split packets are unchanged.
2. Existing sparse-output acceptance proves original `[create@0, external@1, create@2, external@3]` ordering and replay `[create@0, create@2]` without renumbering. Existing synchronous-finalization scenarios reject reordered Aggregate unions at both AggregateChain and AggregateVersionChain, preserve atomic rollback, recover identical external IDs before/after pending publication deletion, and reject contradictory complete history packets. AggregateChain's exact-outcome duplicate policy and Service's full original-packet policy remain intact.
3. `pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p system-worker --nxBail` passed all **9 tasks** (4 cache hits), including **27 Workerd tests across 6 files**. Source and Workerd TypeScript pass; lint has 13 existing warnings and zero errors. The existing Workerd scenarios assert the physical 11-column Aggregate publication/history schema, unchanged 12-column Service history, real Shopping mixed-output projection/request recovery, and activation/restart. Log: `/tmp/plan199-quality-final.log`.
4. `node scripts/verify-plan140.mjs` passed all **13 groups** against the rebuilt artifacts. Log: `/tmp/plan199-plan140.log`. A first quality attempt stopped because a new Workerd test import crossed the private-source lint boundary; the assertion now decodes its inspected fields inline, and the complete graph rerun passed. Nx Cloud reported its existing workspace-access code 401 after successful local tasks.
5. Current module READMEs, glossary, ADR 016, relevant pattern/architecture text, recorded finding and Plan 151 describe the new representation. The existing schema capture regenerated metadata from declarations without executing source modules. No Explorer verification was performed. No second table was reviewed.
6. Scoped formatting, whitespace, local-link/source-range checks and the Aggregate old-field scan passed. No new tests, fixtures, runners, configuration, compatibility reader or translation migration was added. Concurrent materialization-head and external-operation-queue edits were preserved. No storage reset, commit, publication, deployment or live provider action occurred. Changed Aggregate fixed packet schemas require empty affected storage.

## Remaining work

None.
