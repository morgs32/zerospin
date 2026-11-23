# Service actor fanout from retained commands

**Date:** 2026-10-16

**Status:** Complete, 2026-10-22. Service retained-history fanout, enrollment, bounded delivery and recovery verification passed under Plan 151. Archived after the scoped checks and preservation review below; parent Plan 151 remains active.

**Subsequent amendment:** Completed [Plan 216](216-plan-service-actor-subscriber-identity.md) replaces the preserved two-column Service subscriber representation with `actorName`, `actorPath`, `acknowledgedServiceIndex`, deriving the exact actor version from the bound release and rejecting a supplied mismatch before identity extraction. Plan 215's two-column preservation descriptions below record its own earlier scope. Direct commands delivery remains intact. This plan verifies that delivery against the current three-column representation; Plan 216 subsequently completed its separate identity/version/availability verification on 2026-10-22. Do not restore the old subscriber shape.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [ServiceVersionChain.actorVersionRepoFanout](../../reviews/storage-tables/service-version-chain-actor-version-repo-fanout.md). **Governing ADRs:** [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md), [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md). [Plan 214](214-plan-service-ordered-operations-and-finalized-at.md)'s ten-field output/recovery/publication/projection amendment completed verification on 2026-10-22. Plan 215's fanout/enrollment/subscriber obligations and Plans 196/211/212/213 remain independent.

## Verification — 2026-10-22

Two coordinated cases extend the existing [Workerd spec](../../../packages/system-worker/tests/agent-runtime.spec.ts) and [Worker fixture](../../../packages/system-worker/tests/support/agentRuntimeWorker.ts); no file, framework, binding or dependency was added. Real ServiceVersionChain and ServiceActorVersionRepo classes run over fresh disposable Miniflare SQLite:

1. ServiceVersionChain retains complete mixed output during a no-Actor-subscriber period. A recipient that fails before projection commit keeps acknowledgement zero and empty resources/checkpoint/publication, while another actor path commits and advances independently. A later lost reply occurs only after the real receiver commits resources, checkpoint and `exposedCommandOutbox`; source acknowledgement stays zero and its recovery alarm remains armed. Actual object reconstruction changes both incarnation identifiers while preserving those durable facts. The native alarm retries the identical complete page; receiver state stays unchanged and only then does source acknowledgement advance. The healthy recipient receives no duplicate. Lower reenrollment cannot rewind progress, acknowledged history remains byte-for-byte unchanged, SQL has no physical `actorVersionRepoFanout`, and subscriber columns remain the current Plan 216 three-column representation.
2. With 65 retained outputs, pause the first 64-row push after the receiver commits but before its reply. Source enrollment at the receiver's actual cursor 64 completes while that drain awaits the reply. Append output 66, release the reply and observe push positions `1..64`, `65`, then `66`, with advertised tips `65`, `66`, `66`. This proves one captured drain boundary and acknowledgement of actual rows rather than the advertised tip. A second recipient's real `subscriber.subscribe()` catches up through 66; a one-shot fixture append commits 67 immediately before the real source enrollment. Its sole pushed page is 67, proving retained history closes the catch-up/enrollment gap. Finally, an actual producer lease overlapping an empty native-alarm drain preserves the durable wake; lease completion alone does not remove it, and the next settled alarm does.

`pnpm nx run zerospin:test` passes required library builds, compiler checks and all 51 current tests across eight files, including 23 Workerd cases and the Clock-scope case. The first runtime run encountered Core build output preceding a concurrent typed-SystemApi cutover; rebuilding the current graph resolves the existing-test failures without a source repair. The installed dependencies did not change; a process-local pnpm warning policy avoided reinstalling modules after workspace package-version updates. System Worker lint passes with zero errors and the existing unrelated `prepareServiceProjectionOccurrence.ts` warning. Scoped formatting, whitespace and added/relocated documentation-link checks pass. Independent source and test reviews found no production defect. All 31 production TypeScript files tracked in the affected history/projection/fanout/recovery/outbox modules match their pre-verification hashes.

**Preservation review:** Immutable Git comparison of co-landed cutover `ff3ef7b82e21d6be568e0ac2cdfd8c91a5fe1495` against parent `90604844c4998ea46d82e0354c8604e6382226c3` rechecks eighteen unaffected definition/codec modules, the then-eight-field Service pending-request block/index and four additional outbox factory/interface modules. The distinct `afterAcknowledge` original-completion hooks are byte-identical. Six production modules contain Plan 215 copy-removal/direct-reader/hook-removal changes; the same commit's Plan 214 output/history and Plan 216 subscriber changes are separately attributed. This is qualified source-boundary preservation, not reconstruction of missing temporary snapshots or physical-database equivalence. Later intentional schema changes retain their own ownership.

**Proof boundary:** Packet 1 comes from authored Service execution; later no-op packets exercise real immutable append/projection/delivery with valid canonical IDs and hashes. Fixture enrollment uses trusted Actor paths. Production automatic activation is omitted, selected-Chain publication is deliberately unavailable, and the gap append/faults/pauses are fixture-only. These cases establish source acknowledgement after local projection commit, not ServiceActorVersionChain publication, browser delivery, claims/private filtering, provider authentication or external request/continuation delivery. Plans 196/216/218/219/221 and related parent obligations remain independent. Full output equality/hash/union and projection rollback/time proof are reused from completed Plan 214. No production code/schema change, reset, deployment or commit was needed.

## Problem and agreed behavior

ServiceVersionChain stores identical complete output in permanent `commands` and a separately pruned/recreated `actorVersionRepoFanout` table. Subscriber cursors already identify pending delivery, and permanent commands already supply complete catch-up output. The second payload row and its backfill/pruning hooks represent no independent durable fact.

1. Remove the physical `ServiceVersionChain.actorVersionRepoFanout` table and its append insert. Retain permanent immutable `commands` and the existing `actorVersionRepoFanoutSubscribers` representation unchanged.
2. Keep the logical `actorVersionRepoFanout` queue/getter and receiving capability. Both ordinary delivery and catch-up read complete commands directly in bounded ascending `serviceIndex` pages through the drain's captured tip. Acknowledgement advances only the exact subscriber cursor; it never deletes commands.
3. Remove the alternate delivery reader, copy-only backfill/pruning, queue callbacks and two-table page-reader parameter. Remove the now-unused fanout `readDeliveryPage`, `onEnrollment`, `afterAcknowledge` and `afterDrain` API/plumbing from the shared queue/storage helper. Use one history reader for delivery and catch-up.
4. Preserve distinct `makeOutboxQueue`/`makeOutboxDelivery` original-completion hooks and their AggregateChain/ServiceChain consumers. Their matching callback name does not make their lifecycle obsolete.
5. Preserve the complete ten-field Service output, canonical admitted command ID, full Origin/producer privacy, `outcome: { result, finalizedAt }`, disposition hash validation, exact immutable duplicate equality and ordered operations with sparse `operationIndex`, exact versions and stable external IDs. Do not introduce another payload representation or expand Service into Aggregate's full admitted `IEvaluatedCommand` model.
6. Preserve synchronous history append and receiver resource/checkpoint/selected-publication transactions. A ServiceActorVersionRepo receipt proves its local projection commit, independently of later ServiceActorVersionChain publication or browser delivery. Source identity checks and exact actor/claims/producer ownership remain intact; projections apply model members only.
7. Preserve producer leases before append/enrollment, monotonic subscriber acknowledgement/enrollment, drain serialization, fixed-tip scheduling, independent failure handling and producer revision/alarm recovery. Retained commands cover the catch-up/enrollment interval and no-subscriber periods without backfill. Lost replies redeliver against the receiving materialization checkpoint.
8. This is a pre-release fixed-schema hard cut: empty affected ServiceVersionChain storage is required. Add no replacement pointer/marker/table, migration, fallback decoder, alias or dual path. This plan authorizes no reset, deployment or commit. Keep Agent, Aggregate and other Service physical storage unchanged.

## Decisions and alternatives

1. Read retained commands directly because the same database already preserves complete immutable output for every delivery position. Removing only some copied fields would retain redundant lifecycle machinery and create another representation.
2. A pointer table would still duplicate delivery eligibility already represented by subscriber progress. Retain the existing queue and subscriber state without replacement storage.
3. Resource-owning Repos still require complete pending publication because they own no retained command history. Removing the history-owning Chain's redundant payload copy does not weaken that rule.
4. Amend ADRs 015/016 in place for this bounded Service fanout decision. Their authority, resource/history separation, original outcome/external ownership and projection rules remain governing.

## Implementation sequence

1. Remove the ServiceVersionChain table declaration, second append insert and obsolete transaction comment. Delete its backfill/pruning procedures and callback bindings. Bind the logical queue to one complete commands reader and simplify the reader's signature/imports. Keep append validation, producer lease, queue identity/getter, result/checkpoint reads and all command fields intact.
2. Remove the shared queue's alternate-reader and optional copy-maintenance callbacks, their storage-helper declarations/invocations and unused imports. Reuse the existing history-reading Effect for delivery. Preserve receipt-before-acknowledgement, atomic monotonic progress, identity validation, leases/revisions, alarms and failure propagation.
3. Update existing callers and the smallest meaningful assertions in `system-repo-activation.workerd.spec.ts` as necessary. Remove physical-copy expectations and prove direct retained-history delivery/acknowledgement semantics through existing seams. Create no test files, fixtures, runners or configuration. Do not execute these checks while verification is deferred.
4. Reconcile module READMEs, local fanout guidance, relevant architecture clauses and existing glossary terminology with actual implementation. Amend ADR 015's independent-copy/deletion requirement and ADR 016's statement retaining Service pending-payload hooks. Record source changes versus deferred verification in this plan, the finding and Plan 151; preserve historical review evidence.
5. Update the fixed inventory from 49 to 48 owner/table occurrences (34 fixed tables plus 14 migration ledgers), with ServiceVersionChain now three occurrences including its ledger. Do not advance the next table beyond `ServiceVersionChain.actorVersionRepoFanoutSubscribers` or perform its separate review.
6. Keep this plan active and list every deferred check. Run verification only when the maintainer ends the deferral; resolve failures, record actual evidence and archive this filename only after all required work passes.

## Planned file hierarchy

`+` creates; `~` modifies. Existing files with unrelated or Plan 214 changes must be edited in place without reverting that work.

```text
zerospin/
  packages/system-worker/src/
    ServiceVersionChain/
      ~ serviceVersionChainDbConfig.ts
      ~ appendExecutionPacketsTx.ts
      ~ ServiceVersionChain.ts
      ~ serviceExecutionPacket.ts (shared-shape comment only)
      ~ README.md
    makeFanoutQueue/
      ~ makeFanoutQueue.ts
      ~ makeFanoutQueueStorage.ts
      ~ README.md
  packages/system-worker/test/migratable-do-repo/
    ~ system-repo-activation.workerd.spec.ts (existing assertions as needed)
  wiki/
    ~ glossary.md (only if its existing definition requires reconciliation)
    adrs/
      ~ 015-service-delivery-history-and-projection-ownership.md
      ~ 016-aggregate-original-operations-and-external-work.md
    patterns/system-worker/
      ~ i-fanout-repo.ts
      ~ repo-lifecycle.md
      ~ versioned-aggregate-actor-owned-projection.ts
    architecture/
      ~ AuthoredSystem.md
      ~ server/admitServiceCommand.md
      ~ server/serviceExecution.md
    plans/
      + 215-plan-service-commands-backed-actor-fanout.md
      ~ 151-plan-storage-table-review.md
      ~ 214-plan-service-ordered-operations-and-finalized-at.md (subsequent amendment note)
    reviews/storage-tables/
      ~ service-version-chain-actor-version-repo-fanout.md
      ~ service-version-chain-commands.md (subsequent amendment note)
```

## Original verification checklist — completed through the current seam

The retired `system-repo-activation.workerd.spec.ts` and acceptance runner named below are absent; the existing current Nx compiler/runtime target and the focused cases above replace them. The historical two-column subscriber preservation clause is superseded by Plan 216.

1. Existing acceptance/Workerd seams should establish absent physical fanout storage, preserved ten-field commands/constraints and unchanged subscriber schema; complete direct delivery, acknowledgement without history deletion and duplicate append equality remain meaningful behavioral assertions.
2. Reuse existing fanout scenarios for late enrollment/no-subscriber production, lost receipt/redelivery, fixed-tip paging and producer/alarm races. Keep checks concise and preserve exact source binding, private resolution, resource/checkpoint/publication commit boundaries, sparse operation positions and stable external IDs. Do not add a new harness or enumerate redundant permutations.
3. When deferral ends, inspect current Nx configuration once and run one scoped source/Workerd type/lint/test graph with required dependencies, followed by the existing acceptance script. Do not verify Explorer or broaden into unrelated work.
4. Formatting, documentation/link/citation/whitespace checks, independent implementation review and unaffected-storage comparisons are also deferred. Their later results must distinguish this plan from other active implementation plans and concurrent WIP.

## Historical implementation outcome — before verification

ServiceVersionChain now declares only retained commands and its unchanged two-column actor subscriber table, in addition to its migration ledger. Append inserts commands alone. The logical actor queue/getter remains and uses one bounded commands reader for delivery and catch-up; copy insertion, backfill/pruning and their callback bindings are removed. The complete ten-field protocol, producer lease and append equality/order/hash validation remain in place.

The shared fanout factory/storage helper no longer accept or invoke alternate delivery readers or copy-maintenance callbacks. Delivery reuses the existing history-reading Effect. Receipt-before-acknowledgement, transactional monotonic progress, identity validation, fixed-tip drains, producer/enrollment leases/revisions, semaphore and alarm/error behavior retain their responsibilities. The distinct outbox original-completion hooks remain untouched.

Existing acceptance/Workerd assertions are updated for absent physical copy, unchanged subscriber storage, direct projection acknowledgement, permanent commands after acknowledgement and late enrollment. No new test files, fixtures, runners or configuration were created. These assertions are unrun.

ADRs 015/016, module READMEs, local guidance, glossary and relevant architecture clauses describe direct history delivery. The finding and parent inventory record the cutover without completing the separate subscriber review. The fixed inventory is 14 classes/48 owner-table occurrences after removing one table. Plan 214 records this subsequent amendment and its own completed bounded verification; it does not verify Plan 215 fanout/enrollment/subscriber obligations.

At that historical implementation handoff, no required checks had run and the plan remained active. The completed verification above supersedes that deferral. No reset, deployment or commit was performed.

## Remaining work

None. Implementation, scoped runtime/compiler/lint checks, documentation/link checks, independent review and the qualified Git source-preservation audit are complete. Plans 196/211/212/213/216/218/219/221 and parent Plan 151 retain their independent obligations. No storage reset or deployment is authorized by completion.
