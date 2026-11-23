# Retain VersionChain and Actor Chain history in SQL Archives

**Canonical input-history amendment — Plan 277 (2026-10-27):** [ADR 025](025-canonical-published-history-handoff.md) replaces permanent local admission-input retention and arbitrary-ID retry lookup with one adopted canonical publication prefix, source/Agent producer checkpoints and fresh-ID direct System calls. AggregateChain/ServiceChain retain original delivery and pending-work ownership; first external observations survive admission backpressure on those pending rows. VersionChain local publication acknowledgement permits source adoption before independent Archive acknowledgement. Only these placement/retry/observation clauses are replaced; resource/history separation, exact release interpretation, request ownership, projection/private history and physical Archive rules remain governing. Behavioral verification is recorded in [Plan 277](../archive/plans/277-plan-canonical-chain-history-handoff.md).

**Date:** 2026-10-26
**Status:** Accepted; implemented and verified under [Plan 274](../archive/plans/274-plan-version-chain-archives.md).
**Actor history amendment:** [Plan 275](../archive/plans/275-plan-actor-version-chain-archives.md) extends the same physical archival ownership to AggregateActorVersionChain and ServiceActorVersionChain; its verification evidence remains in that plan.
**Actor publication/recovery amendment:** [Plan 278](../archive/plans/278-plan-actor-publication-coverage-and-recovery.md) replaces Actor publication retry equality with position coverage, bounds Actor resource-owner pending publication, and makes fixed Actor history independent of current authored declarations. Physical Archive equality and permanent paired retention remain governing; implementation and verification status are recorded in that plan.
**Amends:** physical evaluated-history retention in [ADR 013](013-aggregate-delivery-history-and-projection-ownership.md) and [ADR 015](015-service-delivery-history-and-projection-ownership.md). Their resource, publication and projection ownership decisions remain governing.

**Aggregate publication supersession:** [ADR 028](028-archive-backed-aggregate-publication.md) replaces the AggregateVersionChain local suffix, Archive subscriber and local publication acknowledgement. The Service and Actor workflows and the physical Archive rules below remain governing.

## Context

AggregateVersionChain and ServiceVersionChain cannot retain an indefinitely growing
evaluated history in one finite SQL database. Complete evaluated commands must
remain readable for publication retries, original-release restoration and slow or
new projection subscribers. An input-only archive or a resource snapshot cannot
replace the originating release's immutable evaluated output.

## Decision

1. Retain complete evaluated commands in explicit AggregateVersionArchive and
   ServiceVersionArchive Repos. Each physical identity includes the source
   identity, evaluating release and first domain index. Archive rows are immutable;
   source domain positions and disposition hashes do not reset.
2. Each VersionChain owns its logical head, Archive range directory and one
   logical Archive subscriber. Its acknowledgement cursor is the archived prefix;
   allocating a successor does not advance that cursor.
3. Commit new evaluated commands and the logical head locally before acknowledging
   VersionRepo publication. Archive delivery runs asynchronously. Archive
   acknowledgement advances the source cursor and removes covered local copies
   in one synchronous transaction. Projection acknowledgement remains independent;
   retained history stays readable from Archives after local relocation.
4. On definite native SQLITE_FULL, record a successor after the old Archive's
   durable head. The next append activates it through the existing Repo lifecycle.
   Timeout retries stay on the same Archive. The full Archive needs no seal write;
   the source directory bounds its authoritative range. A whole delivery page must
   be durable before source acknowledgement.
5. Trust the corresponding VersionRepo's committed publication. VersionChains
   preserve structural, operation, continuity and complete per-position equality
   checks, including archived retries. Canonical identity and admission remain
   AC/SC responsibilities; evaluated storage adds no independent historical ID
   directory or per-publication canonical-input RPC.
6. Bound the unarchived suffix and reject new publication retryably when it is
   full. VersionRepo retains its complete pending publication for recovery without
   reevaluation. Preserve projection recovery holds during cold activation before
   an already-caught-up Archive queue can release its own alarm responsibility.
7. Actor Chains archive complete exposed publications in
   AggregateActorVersionArchive and ServiceActorVersionArchive. Each Archive key
   retains the complete source Actor projection identity and first domain index.
   Keep the public `exposedCommands` parent and optional `commandResolutions`
   child together, including their foreign key and exact retry identity. Archive
   acknowledgement permits deleting both covered local copies atomically.
   Complete public and private history remains retained permanently, so this
   storage move adds no live Node acknowledgement or snapshot-replacement protocol.
8. Actor publication acknowledgement proves complete offered-position coverage
   from AAVC/SAVC's durable logical head. The single bound AAVR/SAVR producer
   freezes each publication with resource changes. After structural/source/order
   validation, covered positions are ignored without comparing retry bytes or
   reading an old Archive. Only the fresh contiguous suffix commits and produces
   broadcasts. This changes logical publication retries only; physical Archive
   appends retain exact complete-pair equality.
9. Bound each AAVR/SAVR pending publication outbox at 64 positions inside its
   resource/checkpoint/publication transaction. Repeated committed positions use
   no fresh capacity. Activation drains existing publication through its captured
   materialization head before source catch-up/subscription. Keep source
   acknowledgement at materialization plus complete pending publication; no
   additional remote publication prerequisite is needed to bound pending work.
   On the specific capacity refusal, drain prior committed publication outside
   SQL and retry the same page once. Preserve the capacity refusal if delivery
   fails; leave a second race to normal recovery. This allows multi-page startup
   catch-up while successful first attempts still avoid publication waits.
10. Initialize fixed Actor history schemas independently of authored release
    availability. Keep retained public/private reads and Archive recovery after
    deregistration while preserving current authored authority at new connection
    admission and retained-socket capability checks. Resource materialization and
    pending authored execution still require their exact code.

Actor prefix reads capture the archived prefix and local suffix before Archive
awaits, then validate contiguous per-Node push intervals and historical full
session/claims ownership. Replay reads immutable pages asynchronously; retained
connection capabilities are revalidated after awaits and before disclosure. The
final logical-head check, replay completion and transition to live remain in one
synchronous turn.

## Alternatives and consequences

Keeping all evaluated commands in the VersionChain preserves simple local reads
but eventually exhausts its database. R2 would provide different storage and
request trade-offs; SQL Archives reuse indexed reads, native Repo acquisition and
existing queue recovery. Snapshot-only storage would discard required evaluated
history and is not equivalent.

Historical reads now depend on the relevant Archive's availability. Backpressure
can delay pending publication when archival stalls. Physical Archive identity and
source directory state must survive restart; returning to local-only storage would
require moving archived data back and may exceed one database's capacity.

Actor coverage acknowledgement deliberately trusts the producer's frozen position
instead of detecting changed bytes in a covered retry. The first retained pair
cannot change. This removes an old Archive availability dependency from settling
lost publication replies; historical replay and private recovery still depend on
the relevant Archive. Pending-publication bounds propagate stalled delivery before
resource owners accumulate unbounded work, and activation's early drain preserves
recovery when that queue is already full.

Changed AVC/SVC fixed schemas require separately authorized empty affected storage
before rollout. The Archive implementation resets no runtime storage; ADR 025
separately governs the later AC/SC history and canonical-release cutover.

The Actor extension likewise requires separately authorized empty affected
AAVC/SAVC storage. It preserves the Node protocol and leaves Agent archival outside
the milestone. Private prefix reads traverse relevant Archive segments sequentially;
an additional per-Node routing index is deferred until an actual requirement
justifies its retained metadata and lifecycle.
