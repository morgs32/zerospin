# ServiceNode.nodeMetadata

**Current tracking — 2026-10-26:** The maintainer consolidated this finding’s surviving correctness and verification requirements into [Plan 234](../../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#consolidated-verification-obligations) and archived its earlier implementation plan. [Plan 151](../../plans/151-plan-storage-table-review.md#remaining-work) tracks the current review gate. Earlier representations, storage formats and implementation-status descriptions below are historical, not current declarations or passing verification.

**Implementation status (2026-10-16): written, unverified.** The maintainer
approved the six-column model in active
[Plan 232](../../archive/plans/232-plan-service-node-derived-progress-and-checkpoint.md).
The original eleven-column audit below remains the historical source review;
its line ranges and source hashes have not been refreshed. It does not describe
the post-implementation schema or prove runtime behavior. All verification remains
deferred, and Plan 232 stays active.

**Successor command cutover:** Active
[Plan 233](../../archive/plans/233-plan-service-node-normalized-command-history.md) now
normalizes ServiceNode.commands and advances the current ServiceNode guard to 17.
The six-column metadata/progress result below is unchanged. Its guard-16 statement
records Plan 232's original outcome, with no verification implied by either plan.

## Written implementation

ServiceNode now declares exactly nodeId, sessionKey, admittedThroughPushIndex,
nullable serviceIndex/dispositionChainHash and pushPaused. The administrative key,
initialized flag, nextNodeIndex, nextPushIndex and cached outcomeIndex are removed.
Dedicated singleton access rejects missing/ambiguous metadata and inconsistent
checkpoint pairs. Fresh provisioning durably creates producer identity with both
checkpoint fields null; authentication uses it before validated resources and a
present checkpoint commit atomically. A zero/genesis checkpoint is ready.

Append and producer maxima derive from retained commands inside the append
transaction. The private outcomeIndex derives the contiguous ordered original
push-position/same-ID-final prefix through the first gap. Snapshot nodeIndex,
pushIndex and outcomeIndex are top-level fields beside raw six-column metadata.
Exact retries precede new-allocation exhaustion checks. Independently retained
receipt-only admission, validated rewind, durable pause/manual bypass, full bound
identity and reset/close fences preserve their separate responsibilities.
Connected replacement rotates nodeId and replaces resources, history and checkpoint
atomically without rebinding sessionKey; cleared history naturally resets derived
progress. No extra Service owner field is introduced.

Browser synchronization/startup, core replica initialization, receiver and existing
assertion consumers read the actual checkpoint and derived progress directly.
The shared capture resolver uses owner checkpoint fields to select family; both
Node families use inclusive snapshot.nodeIndex, and shared top-level progress is
not a discriminator. ServiceNode guard advances from 15 to 16 and requires empty
affected storage. No migration, compatibility path, new reset mechanism or reset
invocation is introduced. Service commands, AggregateNode guard 17, Native replica
schema 5 and Agent storage retain their independent physical models.

Affected README, ADR 003, glossary and focused architecture/pattern prose are
updated. Typechecks, lint, tests, builds, acceptance, formatting, documentation,
link/citation/frontmatter/whitespace checks, source-range/hash refresh,
obsolete-reference checks, independent implementation verification and storage-
preservation comparisons remain deferred. No new test, fixture, runner or
configuration is created. Reading dependencies and implementing this approved
model do not complete the separate ServiceNode.commands review.

- [serviceNodeTables](../../../packages/core/src/ServiceNode/serviceNodeTables.ts) declares the six-column row.
- [readServiceNodeMetadata](../../../packages/core/src/ServiceNode/readServiceNodeMetadata.ts) and [hasServiceNodeCheckpoint](../../../packages/core/src/ServiceNode/hasServiceNodeCheckpoint.ts) own singleton/pair presence.
- [readServiceNodeIndexes](../../../packages/core/src/ServiceNode/readServiceNodeIndexes.ts) and [readServiceNodeOutcomeIndex](../../../packages/core/src/ServiceNode/readServiceNodeOutcomeIndex.ts) derive actual retained progress.
- [ServiceNode](../../../packages/core/src/ServiceNode/ServiceNode.ts) captures progress/resources and owns baseline, admission and replacement transactions.
- [validateNodeSnapshotReconciliation](../../../packages/core/src/Node/validateNodeSnapshotReconciliation.ts) resolves owner context before the named reconciliation invariants.

## Original review record

**Reviewed:** 2026-10-16 against then-current source, including uncommitted work, with independent lifecycle and column-design reviewers. Exactly this ServiceNode table occurrence is reviewed. Retained commands, session replicas, authenticated admission and the shared snapshot validator are dependencies, not additional completed table reviews. All verification remains deferred.

**Verdict: simplify eleven stored columns to six.** Retain nodeId, sessionKey, admittedThroughPushIndex, serviceIndex, dispositionChainHash and pushPaused. Remove id, initialized, nextNodeIndex, nextPushIndex and outcomeIndex. Represent an absent baseline with both checkpoint fields null; derive allocation and the contiguous private final prefix from retained commands.

```ts
{
  nodeId: string;
  sessionKey: string;
  admittedThroughPushIndex: number;
  serviceIndex: number | null;
  dispositionChainHash: string | null;
  pushPaused: boolean;
}
```

At original review time this was an unapproved recommendation and ServiceNode storage still had eleven required fields. The later approved implementation is recorded above. Add no replacement constant key, readiness flag, owner column, timestamp or derived counter. Preserve a durable producer row before baseline authentication, exact singleton access, real independent admission progress and the atomic resource/checkpoint boundary. The earlier AggregateNode seven-column finding does not justify an extra Service owner field: ServiceNode has no standalone replacement exception permitting definition drift while separately checking an Aggregate owner.

## Physical scope, row fact and lifecycle

[serviceNodeMetadata](../../../packages/core/src/ServiceNode/serviceNodeTables.ts#L13-L25) declares physical nodeMetadata within the ServiceNode database. One intended singleton row records producer generation, retained storage binding, ServiceChain admission progress, the materialized Service checkpoint and explicit submission-pause intent. It is mutable identity/checkpoint/control state, not retained command history, pending delivery payload, telemetry or an authorization grant.

The actual production construction path is the connected browser Service SharedWorker. Its named worker and namespace lease own persistent IndexedDB-backed SQLite; the runtime constructs ServiceNode over that storage. The constructor search found no ServiceNode host in Native or standalone browser code. Those AggregateNode contexts must not be imported into this review. Closing ServiceNode fences and drains admitted SQL work before the host closes storage; it does not delete the metadata or command journal. [SharedWorker ownership](../../../packages/browser/src/ServiceNode/makeServiceSharedWorker.ts#L9-L39), [persistent storage opening](https://github.com/morgs32/zerospin/blob/41b548a019ff1e08f65f60c9459e0908a80c64f5/packages/browser/src/Node/openNodeStorage.ts#L8-L54), [ServiceNode construction](../../../packages/browser/src/ServiceNode/makeServiceWorkerRuntime.ts#L166-L204), [close fence](../../../packages/core/src/ServiceNode/ServiceNode.ts#L143-L156).

The complete bound identity contains API URL, publishable key, System name, Service name/version, Actor name/version, session name, complete claims and definition hash. The Service definition checks session-name agreement and obtains Actor context from the full lock. sessionKey hashes this identity; its SQL text is an opaque fingerprint, not retained claims JSON or a tab session ID. The runtime checks storage binding at attachment, normal initialization and verified replacement. Host namespace selection alone cannot prove the contents of an opened database match the expected binding. [Identity shape](../../../packages/core/src/ServiceNode/types.ts#L15-L26), [bound definition](../../../packages/browser/src/ServiceNode/makeServiceNodeDefinition.ts#L7-L23), [identity hashing](../../../packages/core/src/Node/sessionKey.ts#L16-L29), [attachment and replacement identity](../../../packages/browser/src/ServiceNode/makeServiceWorkerRuntime.ts#L95-L143).

Fresh provisioning writes id=1, generated nodeId, the fingerprint, initialized=false, allocator values one, admission/private prefixes zero, serviceIndex=0 with genesis hash, and pushPaused=false. Baseline installation occurs later, atomically with selected resources. Authentication already needs the persisted nodeId before that installation. Ordinary reopening and reconnect retain this producer generation. Connected baseline replacement clears commands/resources, generates a new nodeId, installs captured resources/checkpoint and resets producer progress/pause in one transaction. It does not rebind sessionKey or the captured definition. [Provisioning and reopening](../../../packages/core/src/ServiceNode/ServiceNode.ts#L158-L220), [prebaseline authentication](../../../packages/browser/src/ServiceNode/makeServiceWorkerRuntime.ts#L206-L239), [initial baseline](../../../packages/core/src/ServiceNode/ServiceNode.ts#L236-L279), [replacement](../../../packages/core/src/ServiceNode/ServiceNode.ts#L641-L709).

## Every column and constraint at original review

There are eleven declared fields: id is the integer primary key and the ten others are explicitly required. initialized and pushPaused use integer boolean mode. There are no declared defaults, secondary indexes, foreign keys, expiry, timestamps, structured members or CHECK constraints on this table. Initialization supplies its values explicitly. The key neither restricts id to one nor enforces singleton cardinality, boolean values, safe ranges or checkpoint consistency. Current reads select id=1 and ignore other rows.

| Column                     | Current meaning, writers and readers                                                                                                                                                                                                                     | Finding and removal consequence                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | Integer primary key, seeded at 1 and repeated in metadata read/update predicates. It identifies no Service, producer generation or attachment.                                                                                                           | Remove. Require exactly one row before ordinary reads/mutations; reject missing or ambiguous metadata. Permit absence only during fresh provisioning. Do not replace the key with another constant, silently read the first row or update all rows without a prior cardinality check.                                                                 |
| `nodeId`                   | Required persistent producer generation, generated at provisioning and rotated with full connected baseline replacement. Authentication, original admission, receipts, snapshots and reconnect use it.                                                   | Retain. It must exist before baseline installation and while commands are empty. A stable storage fingerprint would reuse producer identity after reset; commands cannot reconstruct a generation with no rows.                                                                                                                                       |
| `sessionKey`               | Required full-identity fingerprint written at provisioning and compared on reopen. Attachment and replacement also require the same verified binding.                                                                                                    | Retain with its current name. The runtime definition supplies expected context; this stored fact proves the database was bound to that context. Removing it would allow a namespace or storage-opening mistake to reuse another identity's retained state. Keep complete claims and definition-lock sensitivity.                                      |
| `initialized`              | Required boolean, initially false, set true when resources and baseline checkpoint commit. Startup, new-original admission and final retention use readiness.                                                                                            | Remove only by representing checkpoint absence honestly. Both-null means no committed baseline; both-present means ready, including a valid zero/genesis baseline. Dropping only the flag while keeping the seeded zero/genesis pair would lose a real distinction. Preserve the prebaseline row/nodeId.                                              |
| `nextNodeIndex`            | Required allocator, initially one. Each original or final append consumes/increments it; publication and subscription capture subtract one. Reset clears history and restarts it.                                                                        | Remove the SQL copy. Derive greatest retained commands.nodeIndex, default zero; allocate maximum plus one inside the append transaction. Use the maximum itself for published append progress and inclusive capture bounds.                                                                                                                           |
| `nextPushIndex`            | Required producer allocator, initially one. New originals consume it; final rows do not. Admission rewind bounds and state publication read it. Reset restarts it with an empty journal.                                                                 | Remove the SQL copy. Derive the maximum nonnull commands.pushIndex, default zero, and allocate its successor inside original admission's transaction. Retained originals preserve allocations after acknowledgement and final exposure. Preserve exact retries before new-allocation exhaustion checks.                                               |
| `admittedThroughPushIndex` | Required independently known ServiceChain admission prefix, initially zero. Exact receipts and retained same-ID final proof promote it. Validated expectedPushIndex recovery can rewind it after contradiction checks. nextPush selects later originals. | Retain. Allocation does not prove admission, and retained final history cannot reconstruct receipt-only progress while a command awaits exposure. Preserve the distinction between ordinary promotion and a validated rewind without rewriting producer coordinates.                                                                                  |
| `outcomeIndex`             | Required cached contiguous private final prefix, initially zero. Final retention scans original producer positions, matches final evidence by canonical ID and stops at the first gap. Resume and replay completion consume it.                          | Remove the SQL cache; retain the derived protocol fact. Derive the same first-gap prefix from all retained current-generation originals/finals, starting at zero. Neither maximum completed pushIndex nor maximum final serviceIndex is equivalent. Baselines require resolvedThrough=0, so no earlier private prefix is hidden outside this journal. |
| `serviceIndex`             | Required actual materialized Service position, initialized to zero, installed from a baseline and advanced with contiguous final/resource application.                                                                                                   | Retain, nullable before baseline. A baseline can establish index 100 with no local final rows. Commands, allocation and private completion cannot reconstruct that checkpoint. Commit it with resources and its hash.                                                                                                                                 |
| `dispositionChainHash`     | Required hash paired with serviceIndex, supplied by baseline or validated final exposure. Final continuity/equal-position conflict handling, snapshots and resume consume it.                                                                            | Retain, null exactly when serviceIndex is null. Reject partial pairs; do not fabricate a valid checkpoint before baseline or derive it from incomplete local history. This review adds no further chain-hash validation requirement.                                                                                                                  |
| `pushPaused`               | Required durable user submission preference, initially false. setPushPaused changes it; automatic nextPush respects it, while manual nextPush bypasses it. Connected reset clears it.                                                                    | Retain. Queue contents and transient authentication/network/suspension/failure state cannot reconstruct this choice. Removing persistence would resume automatic submission after reopening despite the retained user preference.                                                                                                                     |

1. [Current metadata reader](../../../packages/core/src/ServiceNode/ServiceNode.ts#L225-L234), [original retry/readiness/identity/allocation](../../../packages/core/src/ServiceNode/acceptServiceOriginalTx.ts#L35-L119), [final/checkpoint/private-prefix commit](../../../packages/core/src/ServiceNode/retainServiceFinalTx.ts#L35-L152).
2. [Pause and automatic/manual push](../../../packages/core/src/ServiceNode/ServiceNode.ts#L473-L502), [browser pause control](../../../packages/browser/src/ServiceNode/setPushPaused/setPushPaused.ts#L8-L30), [admission rewind](../../../packages/core/src/ServiceNode/ServiceNode.ts#L505-L545), [exact receipt handling](../../../packages/core/src/ServiceNode/ServiceNode.ts#L547-L584).

## Derivation proof and required boundaries

ServiceNode retains originals and finals through ordinary operation. Admission receipts and subscriber acknowledgements do not delete them. Its command-deletion path is whole-generation connected baseline replacement, committed with a new nodeId and resource/checkpoint/progress replacement. There is no independent allocation reservation, individual refusal pruning or producer compaction to defeat maximum-based allocation. This is Service-specific source evidence, not an assumption inherited from AggregateNode. [Original append](../../../packages/core/src/ServiceNode/acceptServiceOriginalTx.ts#L101-L119), [final append and materialization](../../../packages/core/src/ServiceNode/retainServiceFinalTx.ts#L92-L152), [whole-generation reset](../../../packages/core/src/ServiceNode/ServiceNode.ts#L671-L700).

The distinct progress facts must remain visible:

- An original at nodeIndex=1/pushIndex=1, a foreign final at nodeIndex=2, and another original at nodeIndex=3/pushIndex=2 establish different append and producer maxima. Read those maxima within the owning serialized append transaction; never allocate from previously published state. Keep positive safe-integer and safe-successor limits, exact retained retries before readiness/allocation gates, and rollback on a failed commit.
- If push 2 has retained same-ID final evidence but push 1 does not, outcomeIndex remains zero. Derive the contiguous prefix by producer order and canonical-ID correlation, stopping on the first missing position or final. [Existing correlation](../../../packages/core/src/Node/hasNodeCommandFinal.ts#L4-L15), [current prefix scan](../../../packages/core/src/ServiceNode/retainServiceFinalTx.ts#L118-L144).
- An uncertain submission of allocated push 1 must be retryable; allocation alone cannot skip it. A ServiceChain admission receipt can permit push 2 before push 1 has any final exposure. Final evidence can prove admission, but it cannot replace that receipt-only fact. Rewind still rejects contradictions with retained finals and observes the current-attempt fence before changing the admission prefix.
- A baseline at serviceIndex=100 with no local finals still proves the materialized resource checkpoint. Keep it independently from local append progress, producer admission and private final coverage. Resume sends private outcomeIndex separately from serviceIndex/hash, and replay completion checks both. [Resume](../../../packages/browser/src/ServiceNode/ServiceNodeSynchronization.ts#L369-L378), [replay completion](../../../packages/browser/src/ServiceNode/ServiceNodeSynchronization.ts#L514-L523).

Nullable readiness requires coordinated consumers. Provision exactly one durable row with both checkpoint fields null; initial baseline installation requires absent checkpoint, an empty journal, zero admission progress and baseline resolvedThrough=0. Validate and commit resources plus both present checkpoint fields atomically. Reject partial pairs and preserve existing index/hash validity requirements. Ordinary new-original admission and final application require a present pair; initialize(create=false) must still reject incomplete storage. A prebaseline snapshot can expose producer identity, but must not present fabricated zero/genesis as a committed baseline.

Removing id requires explicit exact-singleton checks before every ordinary reader/mutator, including setPushPaused and replacement. Keep the check and mutation inside the admitted SQL program/transaction. Missing ordinary state must fail instead of silently creating a fresh producer. No additional Service owner field is necessary: verified replacement checks the complete identity fingerprint and reset does not change it. There is no Service standalone same-owner/definition-drift path requiring a separately stored owner comparison.

Capture resources, stored checkpoint and derived progress coherently under the existing SQL gate/transaction. Move state, subscription bounds, snapshots, initialization and reconnect consumers directly to derived progress/checkpoint presence; retain no obsolete metadata aliases. Current subscription capture uses nextNodeIndex as an exclusive bound and publishes its predecessor. [Snapshot capture](../../../packages/core/src/ServiceNode/ServiceNode.ts#L283-L392), [subscription capture](../../../packages/core/src/ServiceNode/ServiceNode.ts#L394-L425), [published state](../../../packages/core/src/ServiceNode/ServiceNode.ts#L107-L119).

The shared [readNodeSnapshotCapture](../../../packages/core/src/Node/validateNodeSnapshotReconciliation.ts#L41-L79), written under active Plan 231 and still unverified, currently recognizes Aggregate snapshots by the presence of top-level nodeIndex. If Service snapshots also expose derived nodeIndex, that selection must change to use the actual owner checkpoint context before applying the remaining domain invariants. Preserve one small public validator with internal capture/coverage/receipt/unresolved/known-retention procedures. This is a requirement of the proposed Service change, not a newly established defect in the current Service shape or a passing verification of Plan 231.

Preserve the serialized SQL gate, BEGIN IMMEDIATE/COMMIT/ROLLBACK, current-attempt/identity checks and close-before-drain fences. Connected recovery stops synchronization, obtains attachment reset acknowledgements outside the SQLite transaction, replaces one complete generation and resumes with the same verified identity. Retain connected reset's explicit pause clearing. [SQL gate](../../../packages/core/src/Node/makeNodeSqlGate.ts#L25-L49), [connected recovery orchestration](../../../packages/browser/src/ServiceNode/makeServiceWorkerRuntime.ts#L295-L325), [reset acknowledgement and replacement](../../../packages/core/src/ServiceNode/ServiceNode.ts#L613-L709).

## Reviewer reconciliation and limits

Both independent reviewers recommend the same six-column model. Both retain producer identity, full storage binding, receipt-only admission progress, the actual resource checkpoint and explicit pause. Both support removing the administrative key and three command-derived caches, and replacing initialized with checkpoint presence while keeping prebaseline identity durable. Service-specific host/replacement evidence supports omitting AggregateNode's separate owner field. No ordinary supported-path correctness defect was established; current readers and older ADRs explain usage without making these redundant representations necessary.

The original review changed only this finding and Plan 151. No implementation, implementation subplan, test, fixture, runner, configuration, storage reset, migration, deployment, live data deletion or commit was part of that review turn. Typechecks, lint, tests, builds, acceptance, formatting, documentation/link/citation/frontmatter/whitespace checks, source-range/hash refresh, obsolete-reference checks, independent implementation verification and storage-preservation comparisons remain deferred. Source reading and independent architectural review support this recommendation only; they do not verify Plans 230/231 or any earlier active implementation. Inventory totals and sibling table statuses are not revalidated.

**Next table:** ServiceNode.commands, declared by serviceNodeCommands in serviceNodeTables. It requires its own review; reading retained-command dependencies here does not complete that review.
