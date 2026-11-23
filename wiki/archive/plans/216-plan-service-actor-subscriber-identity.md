# Service actor subscriber identity and acknowledged progress

**Date:** 2026-10-16

**Status:** Complete, 2026-10-22. Service actor subscriber identity, exact-release version binding and missing-code recovery verification passed under Plan 151. Archived after scoped checks and preservation review; parent Plan 151 remains active.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [ServiceVersionChain.actorVersionRepoFanoutSubscribers](../../reviews/storage-tables/service-version-chain-actor-version-repo-fanout-subscribers.md). **Architecture:** [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md), [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md). Completed [Plan 214](214-plan-service-ordered-operations-and-finalized-at.md) and [Plan 215](215-plan-service-commands-backed-actor-fanout.md) supply verified output/projection and direct-history delivery evidence. Plans 196/211/212/213 and other named parent obligations remain independent.

## Verification — 2026-10-22

Three coordinated cases extend the existing [Workerd spec](../../../packages/system-worker/tests/agent-runtime.spec.ts), [configuration](../../../packages/system-worker/tests/support/agentRuntimeConfig.ts) and [Worker fixture](../../../packages/system-worker/tests/support/agentRuntimeWorker.ts). Real ServiceVersionChain and ServiceActorVersionRepo classes use fresh disposable Miniflare SQLite:

1. Service release 1 binds `viewer@1`, release 2 binds `viewer@2`, and a shared `auditor@1` occupies the same path independently. Successful enrollment and actual projection confirm both release-local versions and distinct name/path Repo identities. Exactly three required SQL columns and the sole actor-pair unique index are inspected. A valid frozen no-op output with Actor Origin and producer coordinates creates private `commandResolution` only for matching actor name/version/path; it preserves full claims. Other names, paths and the parallel release's different Actor version retain public publication with null private resolution.
2. Supplied version 2 cannot enroll a new or existing release-1 Actor identity. Wrong source system, Service name and release fail with `fanout-subscriber-owner-mismatch`; all refusals leave the membership/cursor unchanged. The actual receiving capability refuses a mismatched source before receiving writes and rejects a noncanonical actor path with the precise production guard message. Existing receiver checkpoint, pending output and push-attempt log remain unchanged.
3. A pending member reconstructs first without its named release-1 Actor and then without Service release 1. Real drains and enrollment return `actor-version-unsupported` and `service-version-unsupported`, respectively. Membership, acknowledged index zero, retained commands and durable alarm survive. Available `viewer@2` elsewhere receives no fallback attempt. Restoring the original definitions reconstructs the original Service/Actor Repo; its attempt log has no hidden missing-code delivery. The native alarm then commits exactly one pending projection output, advances acknowledgement to one and clears the source alarm without deleting history.

`pnpm nx run zerospin:test` passes required library builds, compiler checks and all 54 current tests across eight files, including 26 Workerd cases and the Clock-scope case. System Worker lint passes with zero errors and the existing unrelated `prepareServiceProjectionOccurrence.ts` warning. Scoped formatting, whitespace and added/relocated documentation-link checks pass. Independent source/test review found no production defect. All 30 tracked production TypeScript modules in the affected source/receiver/projection/fanout/recovery paths match their pre-verification hashes. Only existing test/fixture files and documentation changed; no dependency, new test file, compatibility path, production schema change, existing-storage reset, deployment or commit was needed.

**Preservation review:** Reused immutable Git comparison of cutover `ff3ef7b82e21d6be568e0ac2cdfd8c91a5fe1495` against parent `90604844c4998ea46d82e0354c8604e6382226c3` verifies eighteen unaffected definition/codec modules and four outbox factory/interface modules. Its four Plan 216 module changes comprise subscriber representation, exact-release identity callbacks and typed callback-error unions; co-landed Plan 214 output/history and Plan 215 payload-copy removal remain separately attributed. The historical Service pending-request block/index is preserved at that boundary; later Plan 219 narrowing and Agent changes retain their own ownership. These are qualified source-preservation comparisons, not physical-database equivalence or reconstruction of missing temporary snapshots.

**Proof boundary:** The packet is a valid fixture-supplied frozen output, not proof of authenticated Actor admission. SystemRepo registration is substituted, and unavailable-code configurations inject missing callbacks; removing an Actor from the still-present release changes its immutable projected definition. This does not prove acceptance of such a production redeployment. Whole-release omission re-pins the fixture Agent to available release 2 so `makeSystem` remains valid; the retained release-1 Chain still refuses cross-release fallback. Full non-path-claims filtering belongs to later selected-Chain readers and is not established by the raw pending resolution assertion. Provider authentication, automatic activation, selected-Chain publication and browser/private-reader integration remain with Plans 196/218/219/221 and related parent work. Reuse Plan 215 for delivery/leases/paging/enrollment and Plan 214 for immutable output/projection rollback/time proof; no unrelated plan is closed here.

## Problem and agreed behavior

ServiceVersionChain stores a complete physical ServiceActorVersionRepo name that repeats its bound owner and encodes a receiving actor version already determined by that exact Service release. Its `currentIndex` column obscures that the source stores acknowledged receiving progress. Preserve membership and recovery with their domain fields directly.

1. Replace this physical subscriber row with exactly three required columns: `actorName` text, `actorPath` text and `acknowledgedServiceIndex` integer. Enforce unique `(actorName, actorPath)`. Remove `serviceActorVersionRepoName` and SQL `currentIndex`; add no stored `actorVersion`, surrogate ID or other field/index.
2. Keep the complete queue RPC key, including supplied `actorVersion`, and its transport `currentIndex`. Preserve current key/cursor decoding, source-owner comparison and source-tip bound before enrollment. At identity extraction, resolve the actor only from this Chain's exact configured Service release, compare the supplied version and reject a mismatch before extracting the stored actor pair or changing membership/progress.
3. At delivery reconstruction, resolve that same bound Service release's named actor and combine its exact version with this Chain's owner and the stored actor name/path. No latest-version lookup, other-release scan, command-original-release substitution or physical-name decoder is permitted. Perform lookups lazily within the callbacks; absent authored code fails reconstruction/delivery without deleting membership or advancing acknowledgement.
4. Preserve canonical actor-path validation at the receiving boundary, exact source/actor/claims/producer privacy, receiving resource/checkpoint/selected-publication transactions and complete ten-field output. This change does not move general path validation or add availability filtering, retirement, expiry or failure state.
5. Bind the existing shared structured identity API to both actor columns and the new acknowledgement column. Preserve exact identity matching for upsert, conflicts, acknowledgement, selection/order and failed/in-flight exclusion. The shared queue already supports this representation; introduce no new identity mode or callback hooks.
6. Keep synchronous monotonic SQL `max` enrollment/acknowledgement, actual receiving-head enrollment, receipt-before-acknowledgement, bounded fixed-tip commands delivery, late enrollment, lost-reply recovery, leases/revisions, drain semaphore and alarm behavior. Caught-up/dormant rows remain members, and acknowledgement never deletes commands. No unsubscribe or automatic cleanup is added.
7. Hard-cut the fixed ServiceVersionChain schema: require empty affected storage, with no migration, compatibility name/column, decoder, alias or packed replacement identity. Keep Aggregate/Agent and other Service physical storage unchanged. Perform no reset, deployment or commit.

## Decisions and rationale

1. Membership cannot derive from authored actor declarations: dynamic actor paths enroll independently and need distinct acknowledged prefixes. Keep the table and actor pair uniqueness.
2. The source owner supplies system/service/release; its exact release maps each actor name to one definition/version. Derive that association. This is a local authored lookup, not cross-object coordination or permission to select newer code.
3. Comparing supplied version before dropping it prevents an unsupported version from aliasing a valid name/path membership. Reconstructing the same bound version preserves complete receiving identity; missing code remains a failed recoverable delivery.
4. Keep acknowledgement separate from the receiving materialization head and later ServiceActorVersionChain publication. A source receipt proves the local ServiceActorVersionRepo projection commit, not browser/private completion.
5. Amend existing ADR 015 and affected guidance for this bounded Service representation. The earlier Aggregate subscriber models and Plan 215's direct commands delivery remain settled and unchanged.

## Implementation sequence

1. Replace the two-column declaration with the three required domain columns and unique actor pair using existing schema conventions.
2. Replace physical-name identity callbacks with named actor-pair bindings. Use focused lazy exact-release actor lookup for enrollment validation and full receiving-key reconstruction; remove the obsolete ServiceActorVersionRepo name-utils import. Widen shared callback/enrollment error types only for the existing Service/actor lookup errors; keep queue runtime and every production transaction/recovery boundary intact.
3. Update existing acceptance and Workerd assertions/callers in place for exact columns/uniqueness, derived version, rejected mismatched version without acknowledgement mutation, independent actor paths and monotonic reenrollment. Extend the existing `owners.worker.ts` projection enrollment seam with a Service mode using the complete RPC key. Reuse existing direct-history/late-enrollment/privacy scenarios. Create no test, fixture, runner or configuration files, and run no checks during deferral.
4. Reconcile affected module READMEs, local patterns, glossary and architecture clauses with implemented identity and failure behavior. Amend governing ADR wording in place. Record the approved implementation in the finding and Plan 151 without re-reviewing another table; the next table remains ServiceActorVersionRepo.materializationHead. Fixed table counts remain unchanged.
5. Record the actual source outcome and every deferred check. Keep this plan active. When the maintainer ends the deferral, run the required scoped checks, resolve failures, record evidence and archive this filename only after all required work passes.

## Planned file hierarchy

`+` creates; `~` modifies. Preserve all current uncommitted Plan 214/215 and unrelated work.

```text
zerospin/
  packages/system-worker/src/
    ServiceVersionChain/
      ~ serviceVersionChainDbConfig.ts
      ~ ServiceVersionChain.ts
      ~ README.md
    makeFanoutQueue/
      ~ makeFanoutQueue.ts (identity/enrollment error types only)
      ~ makeFanoutQueueStorage.ts (identity callback error type only)
      ~ README.md
  packages/system-worker/test/migratable-do-repo/
    ~ system-repo-activation.workerd.spec.ts
    ~ owners.worker.ts (existing projection enrollment seam)
  wiki/
    ~ glossary.md
    adrs/
      ~ 015-service-delivery-history-and-projection-ownership.md
    patterns/system-worker/
      ~ i-fanout-repo.ts
      ~ repo-lifecycle.md
      ~ identity-and-ownership.md
    architecture/
      ~ AuthoredSystem.md
      ~ server/admitServiceCommand.md
      ~ server/serviceExecution.md
    plans/
      + 216-plan-service-actor-subscriber-identity.md
      ~ 151-plan-storage-table-review.md
      ~ 215-plan-service-commands-backed-actor-fanout.md (subsequent amendment note)
    reviews/storage-tables/
      ~ service-version-chain-actor-version-repo-fanout-subscribers.md
```

## Original verification checklist — completed through the current seam

The historical Workerd/owner/acceptance runners below are absent. The completed current Nx compiler/runtime target and focused cases above replace those retired seams without adding a runner.

1. Existing acceptance/Workerd seams should assert exactly three required columns, actor-pair uniqueness and absence of stored version/Repo-name/old cursor. Preserve complete retained commands and all other storage responsibilities.
2. At existing fanout seams, cover correct-version enrollment/delivery, mismatched-version rejection before insert/upsert, monotonic reenrollment and independent path acknowledgement. Reuse existing direct-delivery/late-enrollment/lost-receipt cases; missing actor code must fail without deleting or advancing membership. Verify receiver source/privacy and projection transaction boundaries remain intact. Keep assertions concise.
3. Once deferral ends, inspect current Nx configuration once and run one scoped source/Workerd type/lint/test graph with required dependencies and the existing acceptance script. No Explorer verification is required or permitted.
4. Formatting/documentation/link/citation/whitespace checks, independent implementation review and unaffected-storage comparisons are also deferred. Distinguish results for this plan from earlier plans and unrelated WIP, resolve failures and record actual evidence before archival.

## Historical implementation outcome — before verification

ServiceVersionChain's fixed subscriber row now has exactly required `actorName`, `actorPath` and `acknowledgedServiceIndex`, with a unique actor pair. Its queue binds both identity columns and the new acknowledgement field. The full physical-name column/callbacks are removed; the complete RPC key and its `currentIndex` cursor remain.

`#resolveFanoutActor` lazily resolves only the containing Chain's exact Service release and named actor. Enrollment rejects a supplied actor version different from that declaration before returning the stored identity. Delivery uses the same lookup to reconstruct owner plus actor pair and exact version. Missing release fails `service-version-unsupported`; missing actor or mismatch fails `actor-version-unsupported`. There is no latest/global-registry selection, fallback or new availability/retirement policy. Shared callback/enrollment error types now include those existing domain failures without changing queue runtime logic.

Existing acceptance and Workerd assertions now use the three-column representation and unique pair. The existing `owners.worker.ts` projection seam accepts Service enrollment with the complete key and optional supplied actor version. Assertions cover existing/new-path mismatch without membership/progress mutation, independent failed/healthy paths, monotonic reenrollment and retained commands/receiving progress. Earlier Plan 214/215 assertions and distinct outbox completion hooks remain. No new test, fixture, runner or configuration files were created; all assertions are unrun.

ADR 015, affected module READMEs, local patterns, glossary and architecture clauses describe implemented identity derivation and failure behavior. Plan 215 records the subsequent subscriber amendment and its completed fanout/enrollment verification; Plan 216 retains its separate identity/version/availability checks. The finding and Plan 151 record implementation separately from the original source review. The next table remains ServiceActorVersionRepo.materializationHead, and fixed inventory counts remain 14 classes/48 owner-table occurrences.

At that implementation handoff, checks were deferred and the plan remained active. Completed verification is recorded above. Empty affected storage remains required by the original hard cut; no reset, deployment, commit, compatibility path or extra identity state was introduced.

## Remaining work

None. Implementation, required scoped runtime/compiler/lint checks, documentation/link checks, independent review and qualified Git source-preservation comparisons are complete. Parent Plan 151 and Plans 196/211/212/213/218/219/221 retain their independent obligations. No storage reset or deployment is authorized by completion.
