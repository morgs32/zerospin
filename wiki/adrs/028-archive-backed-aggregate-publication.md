# Acknowledge Aggregate publication after Archive persistence

**Date:** 2026-11-11
**Status:** Accepted for fresh storage
**Partially supersedes:** [ADR 024](024-version-chain-sql-archives.md) for AggregateVersionChain publication, and [ADR 025](025-canonical-published-history-handoff.md) for the Aggregate publication proof.

## Context

AggregateVersionRepo and AggregateVersionChain both held the same evaluated
commands pending different acknowledgements. A full AggregateVersionChain local
suffix caused retries even though AggregateVersionRepo already held a complete
durable page. Plan 299 compared this design with writing directly to
AggregateVersionArchive.

## Decision

1. AggregateVersionRepo owns the pending evaluated commands.
   AggregateVersionArchive retains evaluated history. AggregateVersionChain owns
   the Archive directory, published head and Actor and Agent subscriber cursors.
2. AggregateVersionChain serializes append and rollover. It validates the page,
   awaits each Archive write, and commits the published head once the entire
   offered page is durable. A definite capacity response with a valid durable
   shard head permits rollover after committing the successor route.
3. AggregateVersionRepo deletes its pending page after AggregateVersionChain
   acknowledges it. An interrupted attempt can leave durable rows above the
   published head. The next attempt verifies exact repeats and completes the page.
   Reads and fanout remain bounded by the published head. Canonical replay
   continues to await the pending publication drain.
4. Start this layout with fresh storage. SystemRepo checks its retained catalog
   and registrations before schema writes when establishing the layout. A staged
   SystemApi requires the addressed SystemRepo to attest that layout before
   accepting the candidate SystemSpec. Existing histories and pending commands
   stay with their serving deployment until a history-preserving upgrade is
   available.

## Consequences

Archive availability now affects Aggregate publication and canonical replay
acknowledgement. Original execution and resource commitment retain their own
acknowledgements. The local comparison sustained about 224 commands/s in both
healthy runs. During the controlled one-second Archive stall, the archive-backed
append held its permit for roughly one second and recovered without the 17
publication failures observed on the reverted baseline.

[Plan 299](../archive/plans/299-plan-avc-archive-backed-acknowledgment.md) records the
comparison and failure-path evidence. [Version Chain Archives](../architecture/server/VersionChainArchives.md)
describes the runtime workflow.
