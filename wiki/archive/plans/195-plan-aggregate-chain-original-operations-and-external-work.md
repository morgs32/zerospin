# AggregateChain original outcomes and external execution

**Date:** 2026-10-15

**Status:** Complete; implemented and verified 2026-10-15.

**Related:** [Plan 151](../../plans/151-plan-storage-table-review.md), [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md), [Service Plan 196](196-plan-service-chain-original-operations-and-external-work.md), [checkpoint/hash Plan 197](197-plan-materialization-checkpoint-and-disposition-chain-hash.md).

## 1. Agreed ownership

1. AggregateChain retains eleven immutable admitted input/position fields plus nullable `commands.commandOutcome`. It has no `originalExecutions`, retained operation arrays, execution-start timestamp or `dispositionChainHash`. A null outcome means pending original finalization.
2. AggregateChain owns complete pending `externalOperationOutbox` rows and alone invokes Aggregate `external.request({ payload })`. First observation admits its stable-ID external command and deletes pending work in one synchronous transaction. Missing pending work makes late callbacks no-ops.
3. AggregateVersionRepo retains resources, its compact `materializationCheckpoint` and one complete `aggregateVersionChainOutbox` publication, committed together. AggregateVersionChain retains complete immutable model/external execution packets and pending fanout payloads. Original finalization still returns that same complete packet.
4. Lost original replies recover from AVR pending publication, then AVC history, without reevaluation. Missing/unavailable committed history fails recovery. Neither a second AVR queue nor reverse AC confirmation is introduced.
5. AVC owns its release's execution-history `dispositionChainHash`; AVR/projection checkpoints, pending packets, selected session histories and browser consumers retain the corresponding hash where needed. Future comparison can use AVC `getInputCheckpoint` for the same aggregate and exact `aggregateIndex`. Matching hashes establish the command-ID and Success/Failure prefix only; they do not establish equal results, operation bodies or resources. No comparison feature is added.
6. This simplification is Aggregate-only. ServiceChain retains `originalExecutions`, complete-packet duplicate comparison and `serviceIndex` ordering under Plan 196. Public interfaces and complete finalization reply shapes remain unchanged.

## 2. Receipt transaction and readers

1. Admission initializes `commands.commandOutcome` to null. Immutable-input admission retry comparisons exclude that retained output, and admission receipt shape stays unchanged.
2. First receipt preserves selected command identity/provenance, pinned release, finalized predecessor and operation association/position checks. One synchronous transaction updates the exact commandOutcome and inserts complete pending external rows; rollback exposes neither change.
3. A repeated receipt validates command identity/provenance and compares the exact retained commandOutcome, including recordedAt. Differences keep `aggregate-original-output-mismatch`; equality returns before pending insertion. AC intentionally stops comparing repeated packets' operation bodies, executionStartedAt or dispositionChainHash. AVC still rejects contradictory complete packets.
4. Pending-original reads select the oldest `commandOutcome IS NULL` within any requested bound. Replay exposes only the contiguous finalized prefix. Point reads, direct execution and replay read the outcome directly from commands without output joins or packet reconstruction.
5. Preserve complete external request descriptions until observation/admission commits. Deleted requests cannot be recreated by repeated original receipts. Retained operation lineage remains in AVC history.

## 3. Implementation and documentation

1. Remove AggregateChain's original-output table, reconstruction helper and obsolete joins/imports. Keep complete packet validation and recovery interfaces; do not change AVC/AVR, projection or selected-history schemas for this simplification.
2. Adapt existing acceptance branches, fanout fixture and Workerd assertions to commands.commandOutcome. Keep Service-specific storage and contradiction checks unchanged; create no test files, fixtures, runners or configuration.
3. Reconcile ADR 016, glossary, current Aggregate storage findings, Plan 151 inventory, local patterns, workflow docs and module READMEs. Update only affected Explorer schema metadata and table purposes; do not run Explorer verification. Preserve unrelated concurrent edits and archived historical evidence.
4. Changed AggregateChain fixed storage must be empty. No migration, compatibility alias/decoder, automatic reset, commit or publication is authorized. Existing changed AVC/SVC schemas belong to their prior cutovers, not this simplification.

## 4. Verification

1. Run scoped system-worker source type/lint and existing Workerd type/runtime tasks through Nx with their declared dependencies. Run the existing native verify-plan140 acceptance script; use existing cases rather than new runners.
2. Prove atomic first-receipt outcome/pending insertion, exact outcome conflict rejection, predecessor blocking, contiguous replay progress, business rollback and lost-reply recovery before/after AVC publication deletion.
3. Prove a valid repeated Aggregate receipt with unchanged outcome but changed operation bodies/timestamp/hash is a no-op after pending deletion. Preserve AVC complete-packet contradiction rejection and unchanged Service receipt checks.
4. Record concrete results and diagnose in-scope failures; do not increase historical Workerd timeouts as a substitute for diagnosis. Keep this plan active until required verification and documentation are complete, then archive with repaired links.

## Completion — 2026-10-15

1. AggregateChain now stores only admitted input and nullable commands.commandOutcome, with complete pending external requests retained separately. Its originalExecutions table, reconstruction helper and output joins are removed. No AggregateChain dispositionChainHash remains. ServiceChain and all existing release/projection/session hash consumers retain their independent representation.
2. `pnpm nx run-many -t ts lint test-workerd-ts test-workerd -p system-worker` passed with declared dependencies. All 27 runtime tests across six files passed; source and Workerd TypeScript passed. Lint had no errors and 14 existing curly-brace warnings outside changed AC code; the changed acknowledgement method has no lint warnings. Nx Cloud reported a non-blocking access warning after successful local tasks.
3. `node scripts/verify-plan140.mjs` passed all 13 groups. Existing cases cover atomic receipt rollback, predecessor/finalized-prefix progress, complete lost-reply recovery, exact-outcome contradictions, AC duplicate operation/timestamp/hash no-ops without request resurrection, unchanged Service equality and AVC complete-packet contradictions.
4. The initial Workerd run had 26 passing tests and one Shopping fixture failure: its injected hold_external_observation trigger persisted into cold production schema validation. The existing test now restarts through its existing inspection-only classes, proves pending requests survive, removes both test triggers, and resumes production activation. The final full suite passed without timeout increases or production schema changes.
5. Scoped formatting and diff whitespace checks passed. Governing/current docs, storage findings, module guidance and AC Explorer metadata were reconciled. No Explorer verification, storage reset, migration, commit or publication was performed. Logs are `/tmp/ac-outcome-final-quality.log` and `/tmp/ac-outcome-acceptance.log`.
6. Plan 195 is complete. Plan 196 and Plan 197 retain their independent status and work; this completion does not archive or certify those plans.

## Earlier verification snapshot — before the full AVC packet correction

The following records the earlier implementation only. Its separate AC output queue and confirmation design was subsequently rejected by the maintainer and removed; these results do not verify the current source.

### Saved state — 2026-10-15

1. Production changes are present: AggregateChain retains `originalExecutions`, owns pending external operations and records observations/admission atomically; AVR freezes full original output into `aggregateChainOutbox`, publishes model output independently and has no Aggregate external runtime or external-command queues. Complete original duplicate recovery uses pending original output, then AggregateChain history. Service's existing two-stage lifecycle remains in place except the necessary shared runtime callback adaptation.
2. Before verification was deferred, `pnpm nx run system-worker:ts` passed. The existing native `node scripts/verify-plan140.mjs` passed all 13 groups, including original packet recovery after AVC publication deletion, full-output contradictions despite equal hash, no recreation of deleted pending external work, observation/admission rollback and successful JSON null. Later edits to the existing Workerd fixtures were not covered by another native run.
3. `pnpm nx run-many -t test-workerd-ts test-workerd -p system-worker` completed before the deferral request: Workerd TypeScript passed; runtime had 24 passing tests and three 45-second timeouts, all in `test/migratable-do-repo/system-repo-activation.workerd.spec.ts`. The failing tests were configured Shopping checkout, fourteen-owner activation/restart, and cold originals/administrative-refusal replay. Their root cause is uninvestigated. Some existing fixture/assertion changes were made while that run was already in progress, so its result is not verification of the final working-tree snapshot. Do not describe Workerd as passing or solve the failure by merely increasing timeouts.
4. The earlier lint run had no errors and two warnings in the changed source (inline type import and named-import order). Those were edited afterward; a final lint pass remains pending. Existing method profile assertions passed in the completed Workerd run; no new test files, fixtures, runners or configuration were created.
5. Explorer schema capture completed (14 concrete Repos, 63 table declarations). Explorer build and typecheck passed; `explorer:check` failed formatting for `src/data/schema-snapshot.json` and concurrently created `src/views/overview/flow.ts`, and lint reported six warnings. The overview work belongs to another ongoing task; preserve it. Do not silently format or repair that task's files. Scope the later rerun after reconciling concurrent work.
6. Logs are outside the repository: `/tmp/plan195-ts.log`, `/tmp/plan195-native.log`, `/tmp/plan195-workerd.log`, `/tmp/plan195-checks.log`, `/tmp/plan195-explorer.log` and `/tmp/plan195-capture.log`. These are transient logs; the outcomes above are the durable handoff. No Plan 195 verification process remained running when the deferral request was handled. No more verification was started after that request.
7. Module READMEs, Explorer ownership/purpose data and snapshot, the current command-table finding, Plan 151 inventory, local patterns, glossary and partial ADR supersession were edited. ADR 016 records the implemented ownership boundary with verification still pending. The two active Aggregate architecture workflow documents have not yet been reconciled; inspect the other changed docs for drift before declaring completion. Do not rewrite archived completion evidence.
8. Preserve original unrelated changes in `scripts/verify-plan140.mjs` and `wiki/research/external-outcomes-and-failure-continuations.md`, plus concurrent Explorer overview edits. Original planning-snapshot copies of those two files are under `/var/folders/5w/pbjzxh114jd6swz5wdmm3b4r0000gn/T/plan195-baseline-0xbb8tc6/`; do not restore them over the shared working tree.

## Remaining work

None.
