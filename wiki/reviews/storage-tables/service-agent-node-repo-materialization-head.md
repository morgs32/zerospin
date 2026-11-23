# ServiceAgentNodeRepo.materializationHead

**Reviewed:** 2026-10-21 against current uncommitted source, with independent lifecycle and column-design reviewers. This finding covers exactly SANR's physical occurrence; AANR's head remains separately unreviewed.

**Verdict: retain the three-field applied checkpoint and current singleton handling.** `serviceVersion`, `serviceIndex` and `dispositionChainHash` represent distinct facts. Absence means no installed baseline; a present checkpoint at index zero is initialized. No supported-path lifecycle defect or schema change was identified. The hash's limited comparison role is explicit below.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md). This source review does not rerun runtime verification or approve storage resets.

## Physical owner and row responsibility

ServiceAgentNodeRepo is an unversioned MigratableDO identified by `(systemId, serviceName, agentName)`. Its optional single head records the exact Service release and contiguous public Service position represented by its local selected resources and reconciled wakes. It is a **materialization checkpoint**, not retained history, an automatic command producer sequence, command admission progress, command execution completion or the source Chain's delivery acknowledgement.

The Service release belongs in the row because it is deliberately absent from SANR's physical identity. The currently registered Agent definition supplies the desired pin; the durable head records the already applied pin. Those can differ during an obstructed owner-pin change.

- [Physical identity](https://github.com/morgs32/zerospin/blob/8c8902ad35e81b33887d7fdad3d625da7f326ef2/packages/system-worker/src/ServiceAgentNodeRepo/serviceAgentNodeRepoMigratableDORepoConfig.ts#L9-L20), [complete table declaration](../../../packages/system-worker/src/ServiceAgentNodeRepo/serviceAgentNodeRepoDbConfig.ts#L19-L26), [governing Agent ownership](../../patterns/system-worker/identity-and-ownership.md).

## Every column and schema rule

There are exactly three required columns, without defaults: two INTEGERs and one TEXT. There are no structured subfields, declared primary key, foreign key, unique constraint, secondary index, synthesized ID or timestamp. The primitive declaration supplies NOT NULL, not SQL constraints on positive versions, safe index range or hash format. Supported writes receive those domain values from the bound source protocol.

| Column | Meaning, writer and reader | Derivability, removal consequence and disposition |
| --- | --- | --- |
| `serviceVersion` | Applied Service release. Snapshot installation writes the exact bound source version; page application preserves that source version. Initialization, page receipt, alarm passes and cursor reporting compare it with the desired definition pin. Required, never null; replaced only with an installed baseline or matching-source checkpoint. | Cannot derive from SANR's unversioned key, resource **Model** versions or a replacement definition. Pending delivery can be empty and selected rows can be empty. Removing it loses durable identification of the old selected baseline and the pin-change decision. **Retain.** |
| `serviceIndex` | Actual contiguous public Service position committed locally. Snapshot installation establishes it; each newly applied page position advances it. It can remain zero on a valid baseline, or advance while the selected delta is empty. Receipt uses it for duplicate/gap checks, subscription reports it and reconstruction resumes from it. | Not a selected-row count, timestamp, attempted marker, automatic command count or Chain acknowledgement. Empty selection and execution Failure can still represent later processed positions. Removing it loses exact local catch-up progress and contiguous application. **Retain.** |
| `dispositionChainHash` | Source-provided disposition prefix hash at that exact applied `serviceIndex`. Baseline installation copies the coherently captured hash; new page rows replace it. Receipt compares it only when a delivered row repeats the **current** position. Required, never null; not a new local hash computation. | Cannot derive from the index or current selected contents: the preimage includes prior hash, command ID and `outcome.result._tag`. Removing it retires the current-position conflict refusal across retries/reconstruction. It is not used to allocate progress, admit commands or calculate the next hash. **Retain for that bounded comparison.** |

`materializationHead` accurately names the current applied position. The fields use existing Service protocol names; no generic stream index, `initialized`, generation, command ID or local timestamp is needed.

- [SQL INTEGER/TEXT representation](../../../packages/shapes/src/primitiveMaps.ts#L123-L154), [all head readers and singleton guard](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L30-L74), [sole Service head writer](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L120-L130).
- [Actual hash preimage](../../../packages/core/src/contracts/dispositionChainHash.ts#L5-L18), [Service genesis and hash computation](../../../packages/system-worker/src/serviceDispositionChainHash/serviceDispositionChainHash.ts#L5-L44), [current-position comparison](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L201-L229).

## Singleton and initialization semantics

`readHead` reads the actual connection/transaction and accepts zero or one row. More than one row fails with `agent-node-checkpoint-ambiguous`; it never selects an arbitrary first row. The only writer deletes the old head and inserts exactly one replacement. Both callers read the old head before mutation and invoke this writer inside a synchronous transaction. They cannot expose the intermediate deletion or silently repair ambiguous state through an ordinary supported path.

No head means initialization must install a coherent selected baseline. It does **not** mean that the present local resource set represents Service position zero. Conversely, a present matching head with `serviceIndex: 0` is an installed baseline: reconstruction reuses it, including its existing attempted markers. A separate initialized boolean or constant singleton-ID column would add no current responsibility. The current no-key convention has guarded access and one transactional writer; missing SQL singleton enforcement alone is not a demonstrated recovery defect.

No supported operation deletes the checkpoint independently. The writer replaces it together with selected state/wakes; selection exit, an empty selected set, delivery acknowledgement and browser disconnection do not erase initialization or progress.

- [Absence/ambiguity reader](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L55-L71), [baseline decision and installation](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L329-L350), [synchronous transaction rollback](../../../packages/core/src/drizzle/make/makeTx.ts#L70-L120).

## Source, transaction and recovery boundaries

1. **Coherent public baseline:** SANR obtains the exact ServiceAgentVersionRepo selected snapshot under its bound owner-release/Agent key. Source capture validates the Service Agent session lock, reads selected resources and source checkpoint synchronously, publishes through the captured `serviceIndex` and compares the exact ServiceAgentVersionChain index/hash. SANR installs resources, this head and reconciled wakes together. The snapshot helper's existing comment calls this a private prefix; its implementation verifies **public** history, as this finding describes.
2. **Page application:** The subscriber fences the complete source key, and receipt checks the desired and applied release before mutation. It validates the page, skips older positions, checks a repeated current position's hash and requires each new position to follow the local `serviceIndex`. Resource deletions/upserts, wake reconciliation and the final head share one transaction. A failure rolls all of them back; page `lastIndex` does not advance the head beyond the last actually processed row.
3. **Reconstruction and alarms:** Matching-pin reconstruction keeps the durable head and selected baseline, then resumes subscription/catch-up. The alarm pass requires a present, matching head before synchronizing selected state and freezing new commands. Due attempt/outbox insertion does not manufacture a new `serviceIndex`. Schema initialization and activation gate normal alarm handling.
4. **Pin changes:** A different applied `serviceVersion` triggers baseline replacement, but pending command delivery refuses activation before capture or mutation. Delivery must drain under the old pin. A later successful installation replaces resources/head/wakes atomically and preserves matching attempted markers. Progress is contiguous within one applied source; a new owner pin is a new baseline, not an increment of this row's version or a new producer generation. Previous-source pages cannot update the new head.
5. **Delivery acknowledgement remains separate:** `getCurrentIndex` reports this head's actual `serviceIndex` only for the matching desired pin; absence or another pin reports zero without creating a head. Subscription catches up and rereads that committed cursor for enrollment. ServiceAgentVersionChain records its own acknowledgement after successful delivery; it can lag a committed SANR head when a reply is lost. Neither that cursor nor canonical command admission acknowledgement replaces the local checkpoint, and acknowledgement does not delete retained public Chain history.

- [Exact SANR source and snapshot fields](../../../packages/system-worker/src/ServiceAgentNodeRepo/ServiceAgentNodeRepo.ts#L82-L121), [source capture/public checkpoint verification](../../../packages/system-worker/src/serviceAgentProjection/captureServiceAgentSnapshot.ts#L48-L102), [obsolete comment](../../../packages/system-worker/src/serviceAgentProjection/captureServiceAgentSnapshot.ts#L30).
- [Page validation and atomic commit](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L176-L261), [bound source-key fence](../../../packages/system-worker/src/ServiceAgentNodeRepo/ServiceAgentNodeRepo.ts#L179-L203).
- [Alarm pass and baseline installation](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L299-L350), [reported committed cursor](../../../packages/system-worker/src/agentNodeRepo/makeAgentNodeRuntime.ts#L363-L367), [schema/activation gate](../../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts#L260-L308).
- [Catch-up followed by actual-cursor enrollment](../../../packages/system-worker/src/makeFanoutSubscriber/subscribe.ts#L34-L55), [source acknowledgement after delivery](../../../packages/system-worker/src/agentNodeFanout/makeAgentNodeFanout.ts#L101-L114).

## Hash scope and reconciled finding

The hash is a retained comparison witness for the current disposition prefix, not a digest of selected rows. Its preimage covers previous hash, `serviceIndex`, command ID and the Success/Failure tag. It does not cover payload, successful result, failure details, timestamps or resource delta, so matching hashes do not establish equality of those values.

SANR trusts the source's hash on a newly contiguous page row; it does not recompute a new hash or verify an entire incoming hash chain from selected deltas. It ignores older rows' hashes. Catch-up/enrollment sends an index, not this hash; an empty catch-up does not compare the remote checkpoint hash. Retain the direct current-position refusal without describing it as full materialization-integrity or recovery proof. Recomputing from remote retained history would add a remote dependency to a local checkpoint read; no such mechanism is recommended.

Both independent reviewers recommend retention. The lifecycle review checks the transactional singleton and local-progress responsibility; the column-design review challenges the narrow hash use and the derivability of each field. Retain the current three-field checkpoint for its actual applied-pin, progress and comparison roles, without adding a key, history, fingerprint or additional validation protocol. The source helper's obsolete private-prefix wording is a terminology issue, not evidence of current private outcome recovery.

## Verification limits and next occurrence

This review traces source declarations, all local head access and its source/acknowledgement boundaries. Earlier [Plan 249](../../archive/plans/249-plan-aggregate-agent-backend-node.md) and the [five-field outbox follow-up](service-agent-node-repo-command-delivery-outbox.md#approved-implementation-follow-up) record runtime evidence for checkpoint zero, reconstruction, acknowledgement loss and owner-pin obstruction/rebinding. None of those checks were rerun here; this turn adds no runtime proof of ambiguous storage or hash-conflict handling.

Only this finding and Plan 151 change. Local links/source-range bounds, queue markers, bounded source preservation and whitespace were checked. No production source/schema or existing storage changed; no runtime/type/lint/test/build checks, tests, fixtures, reset, publication or deployment ran. Generic command-operation durable delivery verification remains separate outstanding work.

**Next table:** AggregateAgentNodeRepo.materializationHead. Both wake occurrences also remain separately unreviewed.
