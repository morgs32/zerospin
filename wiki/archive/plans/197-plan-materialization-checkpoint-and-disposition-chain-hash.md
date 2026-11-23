# Materialization checkpoint and disposition chain hash

**Date:** 2026-10-15

**Status:** Complete. Implemented and verified on 2026-10-15.

**Related:** [Plan 151](../../plans/151-plan-storage-table-review.md), [checkpoint finding](../../reviews/storage-tables/aggregate-version-repo-execution-checkpoint.md), [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md), [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md).

## Agreed change

1. Remove unused `commandId` from AggregateVersionRepo's local checkpoint, including its write, selection and synthetic genesis result. Exact identity stays in admitted input and complete execution packets; duplicate validation remains intact.
2. Rename AggregateVersionRepo's physical table and schema property from `executionCheckpoint` to `materializationCheckpoint`. Its row is exactly `{ singletonId, aggregateIndex, dispositionChainHash }`. ServiceVersionRepo's independently owned checkpoint keeps its table name and command ID.
3. Rename `dispositionHash` to `dispositionChainHash` throughout the shared Aggregate/Service/server/browser/native protocol, persistent schemas, helpers, consumers, inspection and current documentation. Remove superseded names directly, without aliases or fallback decoders.
4. Change the shared disposition preimage to `[previousHash, index, commandId, commandOutcome._tag]`. Previous chain hash, command position and ID remain inputs. The outcome contributes only its `Success` or `Failure` tag: no successful value, failure code/details, timestamp, payload or operation body. Current canonical `commandOutcome` exposes that tag directly. Both server families and browser/standalone callers use this same encoder.
5. Keep complete command/outcome/packet equality checks. `dispositionChainHash` establishes disposition-prefix alignment, not complete-output identity. Different failure details with the same tag intentionally yield the same next hash when predecessor, position and ID match.
6. Preserve synchronous resource/checkpoint/output transactions, refusals, rollback, duplicate recovery, replay ordering and activation with local materialization ahead of retained original output. Preserve existing unrelated Plan 195/196 and Explorer work.

## Implementation

1. Rename shared fields, helper modules/imports and related error names across current source. Update the shared tuple encoder to the four agreed values; retain existing genesis seed strings and SHA-256 implementations.
2. Reduce and rename only AggregateVersionRepo's checkpoint. Update existing SQL/schema assertions and mixed Aggregate/Service verification branches explicitly.
3. Reconcile existing acceptance scripts for the new field/table and preimage. Use concise existing assertions to prove same-tag success/failure contents do not change the hash, opposite tags do, and predecessor/position/ID still matter. Create no tests, fixtures, runners or configuration.
4. Refresh Explorer's schema metadata and current documentation/glossary/pattern terminology. Record the implemented checkpoint finding and advance Plan 151 without reviewing another table. Preserve archived historical completion evidence.
5. Run appropriate existing Nx dependency/build/type/lint checks, scoped Workerd runtime coverage and existing `verify-plan140` / `verify-session-identity` scripts. Resolve in-scope failures, record results, then archive this plan with repaired links.

## Planned files

`+` creates this plan; `~` edits current files; `→` renames an existing helper module. No new test or check files are planned.

```text
zerospin/
  wiki/plans/
    + 197-plan-materialization-checkpoint-and-disposition-chain-hash.md
    ~ 151-plan-storage-table-review.md
  packages/core/src/
    contracts/dispositionHash.ts → contracts/dispositionChainHash.ts
    ~ contracts/CommandSchema.ts and shared command/Node/session codecs
  packages/system-worker/src/
    aggregateDispositionHash/ → aggregateDispositionChainHash/
    serviceDispositionHash/ → serviceDispositionChainHash/
    ~ AggregateVersionRepo/{aggregateVersionRepoDbConfig,readAggregateCheckpoint}.ts
    ~ AggregateVersionRepo/utils/{retainAggregateResultTx,finalizeAggregateOccurrence}.ts
    ~ Aggregate/Service execution, history, projection and session protocol consumers
  packages/browser/src/
    ~ Node, session, standalone and mock protocol consumers
  packages/devtools/src/
    ~ command table columns
  packages/error/src/
    ~ defaultErrorMessages.ts
  packages/system-worker/test/
    ~ existing Workerd assertions and fixtures
  scripts/
    ~ verify-plan140.mjs
    ~ verify-session-identity.mjs
  explorer/
    ~ current architecture, table purposes and schema capture
  wiki/
    ~ glossary.md, active architecture/patterns/ADRs and checkpoint finding
  ~ AGENTS.md canonical hash term
```

## Verification and constraints

1. Build shared emitted declarations before checking consumers through Nx's configured dependencies. Use explicit affected projects so unrelated WIP does not enlarge verification.
2. Run existing Workerd activation/storage coverage for the three-column physical Aggregate table, original/replay/refusal progress, duplicate recovery and rollback. Keep Service's existing table representation intact apart from the approved shared hash field rename.
3. Run both existing acceptance scripts to cover shared server/browser hash construction and retained input/output recovery. A changed failure body must not change the disposition chain hash; complete packet comparisons must still reject contradictory data.
4. Refresh/check/build Explorer where its source and generated schema change. Check scoped formatting, active links and removal of superseded protocol names.
5. Changed fixed schemas and changed chain preimages require empty affected storage. No conversion, compatibility path, automatic reset, deployment, publication or commit is authorized.

## Approved recovery investigation

The maintainer approved a deep investigation of external request recovery after real-owner activation verification exposed a pre-existing loop. Independent reviews traced both admission Chains, request recording, original and replay queues, alarms, cold activation and historical ownership. Record the source evidence and crash boundaries in [the research finding](../../research/chain-external-recovery-and-delivery-ownership.md).

Remove the shared external runtime's recursive `deliver` callback and public pre-subscriber `arm` API. Original delivery already retains its wake until receipt and completion hooks finish; local external observation uses original queue `drainAfter` before its atomic admission/delete transaction. Keep empty-queue completion hooks, private pending-request alarm reconciliation, per-ID live reservations and producer leases. Store reservations in a Set because no caller reads promise values. Update existing acceptance assertions and the runtime README. Broader queue API/codec simplifications remain separate findings.

## Concurrent ownership update

While verification was running, separate working-tree edits simplified only AggregateChain to retain `commands.commandOutcome` and pending requests; ServiceChain still retains full `originalExecutions`. This plan preserves those edits. Aggregate duplicate receipts compare exact outcome; AVC/SVC retain full packet equality. The external recovery handoff is unchanged. Earlier passing logs describe the preceding source snapshot; fresh checks below verify the settled source. The first recovery Workerd rerun was cancelled after 3m09s because its source snapshot changed during execution; it supplies no completion evidence.

## Verified outcome

1. AggregateVersionRepo stores exactly `materializationCheckpoint(singletonId, aggregateIndex, dispositionChainHash)`. Command ID remains in admitted input and complete execution packets; no checkpoint consumer required its redundant copy. Existing Workerd schema assertions verify the physical columns and absence of the old Aggregate table. ServiceVersionRepo retains its independently owned checkpoint representation.
2. The shared encoder is exactly `[previousHash, index, commandId, commandOutcome._tag]`. Existing assertions prove Success/Failure tag behavior, same-tag content/time independence and dependence on predecessor/position/ID. Aggregate and Service server hashes match the shared browser SHA-256 preimage. Full packet/history and exact-outcome guards remain at their respective owners.
3. The external runtime no longer owns original command delivery or pre-subscriber alarm coordination. Both Chain callbacks record observation/admission under their original queue's `drainAfter`; private pending-request alarms and Set reservations remain. Independent audits confirmed the crash-boundary ownership. The complete [research finding](../../research/chain-external-recovery-and-delivery-ownership.md) records the removed cycle, historical rationale, required hooks and stale-document inventory.
4. The scoped 32-task framework/browser/native/Explorer graph passed after the recovery cleanup (`/tmp/plan197-quality-recovery.log`). Following concurrent Aggregate-only changes, the current backend `lib`, `ts`, `lint`, `test-workerd-ts` graph passed all 8 tasks (`/tmp/plan197-current-backend.log`). Frontend/Explorer executable code did not change during that concurrent ownership simplification; no additional Explorer verification was run.
5. The concurrent Aggregate implementation chat's fresh `ts`, `lint`, `test-workerd-ts`, `test-workerd` graph passed all 9 tasks, with **27 Workerd tests across 6 files** (`/tmp/ac-outcome-final-quality.log`). This chat inspected the log and current assertions directly. All former activation timeouts are resolved. The existing Shopping fixture removes its fault-injection triggers through the inspection Worker before production reactivation; production schema validation remains intact.
6. Both existing acceptance scripts passed again against current source: `verify-plan140.mjs` **13 groups** (`/tmp/plan197-plan140-current.log`), `verify-session-identity.mjs` **6 groups** (`/tmp/plan197-session-current.log`). The backend retains 14 lint warnings with zero errors; the earlier frontend graph retained its existing devtools warnings. Nx Cloud reported workspace access code 401 after successful local tasks.
7. Source-name, scoped formatting, relative-link and whitespace checks passed. Explorer schema metadata reflects the current three-column Aggregate checkpoint. No new tests, fixtures, runners or configuration were created; no storage reset, migration, compatibility path, commit, publication or deployment occurred. Fixed-schema and chain-preimage changes require empty affected storage.

## Remaining work

None.
