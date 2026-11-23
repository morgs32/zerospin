# Ten-column ServiceNode command history

**Date:** 2026-10-16

**Status:** Archived on 2026-10-26 by maintainer-approved consolidation into [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md). Its surviving correctness and verification requirements remain unfinished there. This is consolidation, not verified completion of this plan or its former storage representation.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [ServiceNode.commands](../../reviews/storage-tables/service-node-commands.md). Active [Plan 232](232-plan-service-node-derived-progress-and-checkpoint.md), [Plan 231](231-plan-aggregate-node-normalized-command-history.md) and earlier unfinished plans retain their separate verification status. [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md) supplies architectural context; old representations do not constrain the agreed cutover.

## Archival disposition — 2026-10-26

Maintainer-approved consolidation on 2026-10-26 retires this independent checklist. [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md#consolidated-verification-obligations) owns the surviving requirements under current Node/session-replica representations; [Plan 151](../../plans/151-plan-storage-table-review.md) tracks that work. Earlier implementation descriptions, storage formats and verification seams below are historical and do not authorize restoring removed representations or tooling.

## Problem and agreed behavior

ServiceNode commands repeats six original-input fields already fixed by the complete retained identity and selected contract lock. Unlike Aggregate standalone, ServiceNode never admits different per-command claims under one storage binding. Remove those SQL copies while preserving full reconstructed command input and both immutable append phases. Version derivation requires the missing exact selected-contract check; normalization must not silently change admitted input.

1. Keep exactly ten commands columns: nodeIndex, id, pushIndex, commandName, payload, stagingOutcome, failure, serviceIndex, dispositionChainHash and exposedDelta. Remove SQL contractVersion, serviceName, actorName, actorVersion, sessionName and claims. Rename physical delta to exposedDelta. Keep ServiceNode's six-field metadata, derived progress and top-level snapshot indexes unchanged.
2. Reconstruct complete original protocol input from definition.identity and its selected lock entry. Derive Service/Actor/session names, Actor version and complete claims from the captured identity; derive contractVersion from the exact selected contract. Retain canonical id, commandName, original payload bytes and stagingOutcome in SQL. Keep nodeId derived from the current retained generation and preserve all original input members in transport, dispatch, recovery and retry comparison.
3. For every new original require an own selected registry key at commandName, a defined entry with the same embedded canonical commandName, and exact equality between the entry version and incoming contractVersion. Validate before allocation/write. Keep full existing identity/claims/expected-Node checks. Original reconstruction requires that same own canonical selected entry; add no fallback version or compatibility alias.
4. Exact retained retries must still compare the complete incoming input against the complete reconstructed original before current readiness/blocked-work/new-allocation gates. Changed identity/claims/version/payload/staging evidence must conflict; do not discard incoming repeated context before comparison. Final-only IDs cannot become originals. Preserve retained positions and retry success at allocation exhaustion.
5. Insert explicit normalized original fields rather than spreading the complete input into SQL. Final writes encode the complete selected delta into exposedDelta, while final transport continues to expose delta. Use the encoded selected-delta type instead of an unknown storage shape. Keep original local stagingOutcome { result, completedAt } immutable and separate from canonical outcome or mutable replica inverseOperations.
6. Retain the original/final append distinction, primary nodeIndex, nullable unique pushIndex/serviceIndex and both partial canonical-ID indexes. Require positive safe append/phase coordinates and coherent phases at existing row readers: originals have payload/stagingOutcome and no final fields; finals have Service position/hash/exposedDelta and no original fields, allowing nullable privacy-filtered failure. Add no phase discriminator. Foreign final-only command names need not belong to the selected original-contract registry.
7. Preserve transactional derived allocation, canonical-ID private final correlation, original payload retention, exact final comparison, occupied ID/Service-position and name-conflict checks, old-final recovery at/below a baseline, and selected resource/checkpoint/admission settlement. Admission receipts and subscriber acknowledgement never prune commands. Whole-generation reset remains the deletion boundary, with producer rotation, fixed identity binding, pause behavior and resource/checkpoint replacement unchanged.
8. Update every original reconstruction caller directly: exact retry/return, subscription page delivery, pending-receipt/unresolved snapshots and nextPush. Retain full protocol input for browser dispatch and Service replica identity/privacy/retry checks. Update typed RPC failure propagation for the new selected-contract reconstruction failure and coherent final-row failures. Do not add wrappers or widen the protocol with duplicated context.
9. Advance only ServiceNode's fixed-schema guard from 16 to 17. Empty affected storage is required. Add no migration, fallback decoder, alias, dual path, automatic-reset mechanism or reset invocation. Keep Aggregate/Agent/replica/Native storage and independent guards outside this change; their preservation comparisons remain deferred.
10. Adapt actual existing raw-row assertions/seeds only when affected. Create no tests, fixtures, runners or configuration and run no verification. Reconcile module READMEs, glossary, ADR 003 and focused existing architecture/pattern prose after code writing. Record written/unverified status in the finding and Plan 151 without completing another table review. Shopping user AggregateVersionRepo.purchase remains next.

## Decisions and rationale

1. Derive complete Service claims rather than preserving AggregateNode's eleven-column pattern. Service admission unconditionally requires the complete claims identity to match; attachment, reopening, authentication and replacement retain that same binding. Aggregate standalone's cross-claims exception is an independent requirement and remains unchanged.
2. Reject an unselected/mismatched original contract instead of retaining arbitrary source versions or silently translating them. The fixed definition can reconstruct exactly one version per selected name; preserving an unchecked alternate version would invalidate normalization and exact retry semantics.
3. Retain two immutable append rows rather than merging by ID. A later final needs its own Node position so a subscriber already past the original receives it, while original input remains available for exact retry and recovery. Node append order, producer order and Service order remain independent.
4. Keep full selected final delta rather than reconstructing it from current resources or introducing a Node-only compressed resource envelope. Historical delivery must survive later mutations. SQL exposedDelta states its responsibility; unchanged wire delta preserves the existing complete browser command protocol without an alias.

## Implementation sequence

1. Normalize the schema, original/final writers and phase readers together. Add exact selected-contract validation at new-original admission, reconstruct from the bound definition and update all core callers while preserving transaction ordering.
2. Update actual direct consumer/error mappings and existing raw-row assertion/seed consumers where necessary. Leave complete original/final transport and independently owned replica storage unchanged.
3. Update relevant documentation/ADR/glossary and source-review implementation status. Keep Plan 151's next owner/table unchanged and all prior unfinished implementation evidence separate.
4. Record the written result and remaining checks. Verification, formatting, documentation validation, independent implementation review and preservation comparisons all stay deferred; archive only after required checks later pass.

## Planned file hierarchy

`~` modifies; `+` creates. Consumer discovery can adjust affected existing files within this scope.

```text
zerospin/
  packages/core/src/ServiceNode/
    ~ serviceNodeTables.ts
    ~ acceptServiceOriginalTx.ts
    ~ readServiceNodeRecord.ts
    ~ retainServiceFinalTx.ts
    ~ ServiceNode.ts
    ~ README.md
  packages/core/src/serviceSession/
    ~ README.md
  packages/browser/src/
    Node/
      ~ nodeRpcErrorFor.ts
    ServiceNode/
      ~ ServiceNodeSynchronization.ts
    makeBrowserSession/
      ~ README.md
    outbox/
      ~ makeOutboxSubscriber.ts
  scripts/
    ~ actual affected existing raw-row assertions/seeds, only if needed
  wiki/
    ~ glossary.md
    adrs/
      ~ 003-immutable-node-command-history-and-submission-order.md
    ~ affected existing architecture/pattern prose
    plans/
      + 233-plan-service-node-normalized-command-history.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ service-node-commands.md
```

## Verification seams — deferred

1. When verification resumes, inspect existing scoped Nx tasks and run the smallest relevant core/browser/direct-consumer seams with dependencies. Establish ten-field storage, removed SQL copies, exposedDelta encoding and guard 17 without compatibility paths. Check complete original reconstruction, every caller, full bound claims and exact selected contract name/version; preserve full transport and sibling storage/guards. Do not verify Explorer or create verification infrastructure.
2. Establish one representative valid original and meaningful selected-contract/input rejection paths using existing seams. Confirm exact retries preserve full input/positions before readiness and allocation exhaustion, and own registry membership plus canonical embedded name/version reject reinterpretation. Establish coherent original/final row decoding without imposing original-only membership on foreign finals.
3. Establish both immutable append phases, key/unique constraints, source payload/staging retention, private first-gap recovery, exact final equality and old-final recovery at/below baseline. Confirm atomic resource/final/admission/checkpoint commit, rollback, snapshot/subscription/resume, typed RPC failures, receipt-only admission/rewind and generation/reset/close/privacy fences. Keep Plan 232's independent verification outstanding.
4. Complete formatting/documentation/link/citation/frontmatter/whitespace/obsolete-reference checks, source-range/hash refresh, independent implementation review and scoped sibling storage/guard preservation comparisons. Code and documentation writing are not passing verification.

## Implementation outcome — unverified

ServiceNode.commands now declares exactly the ten agreed fields. SQL copies of contractVersion/serviceName/actorName/actorVersion/sessionName/claims are removed. Original insertion explicitly writes normalized fields; final insertion encodes selected output into exposedDelta. Both immutable append phases and all five key/unique constraints retain their responsibilities. The shared command input and final wire delta remain unchanged.

readServiceStagedCommand now receives the bound definition and reconstructs complete Service/Actor/session identity, full claims and the exact selected contract version. Original admission validates own registry membership, embedded canonical command name and exact incoming version before allocating/writing. Full reconstructed-input retry comparison still precedes current readiness/blocked-work and new-allocation checks. Every core reconstruction caller—retry/return, page delivery, pending/unresolved snapshots and nextPush—uses the bound definition directly. Final readers preserve foreign names outside the original registry.

Original/final readers now require positive safe Node/phase coordinates and coherent phase-specific fields without a stored discriminator. Original payload bytes and compact stagingOutcome remain immutable; finals retain nullable privacy-filtered failure, historical selected output and Service position/hash. Exact final equality, old-final recovery, private canonical-ID correlation, derived allocation, receipt-only admission/promotion/rewind and resource/checkpoint/generation/reset/close boundaries retain their roles. Six-column metadata and snapshot-level derived progress remain the Plan 232 model.

ServiceNode's fixed guard advances from 16 to 17, requiring empty affected storage. No migration, compatibility path, additional reset mechanism or reset invocation is added. Aggregate/Agent/replica/Native storage and independent guards remain outside the change; preservation comparisons are unrun.

Browser nodeRpcErrorFor snapshot failure declarations, ServiceNodeSynchronization push refusal handling and makeOutboxSubscriber now preserve contract/phase reconstruction failures without a duplicate final-row failure entry. Consumer discovery identified no existing raw ServiceNode command-row assertion/seed/schema expectation needing an edit; existing identity-script assertions and Service replica seeds remain unchanged and unrun. No test, fixture, runner or configuration file is created.

Affected READMEs, ADR 003, glossary and focused architecture/pattern prose are reconciled with the written model. The commands finding preserves its original sixteen-column audit and separately records this written/unverified outcome. Plan 151 tracks this active plan and still points to Shopping user AggregateVersionRepo.purchase; no additional table review is completed. The metadata finding retains its historical Plan 232 result with a successor guard-17 note.

No typecheck, lint, test, build, acceptance, formatting, documentation/link/citation/frontmatter/whitespace/obsolete-reference check, source-range/hash refresh, independent implementation verification or storage-preservation comparison ran. Code and documentation writing provide no passing verification. No plan is archived, and earlier active implementations retain their own outstanding checks.

## Remaining work

None under this archived plan.
