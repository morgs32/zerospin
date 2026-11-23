# Synchronous original finalization

**Date:** 2026-10-15
**Status:** Accepted; implemented and verified on 2026-10-15.
**Partial supersession:** [ADR 016](016-aggregate-original-operations-and-external-work.md) supersedes the Aggregate original-output, external-request ownership and duplicate-recovery portions below. AggregateChain now retains original `outcome` on `commands` plus complete pending external requests and runs those requests; Service and all other governing rules remain unchanged.
**Implementation:** [Plan 193](../archive/plans/193-plan-synchronous-original-finalization.md).
**Supersedes:** Only the split Aggregate original-dispatch/original-outcome protocol in [ADR 005](005-ordered-original-execution-and-finalized-replay.md) and [ADR 013](013-aggregate-delivery-history-and-projection-ownership.md). Their ordering, resource/history separation, complete independent publication/fanout messages, projections, privacy and external-work ownership remain governing. Service adopts the corresponding exact returned-outcome protocol under [ADR 015](015-service-delivery-history-and-projection-ownership.md).

## Decision

AggregateChain sends its oldest admitted command with null `outcome` to the
AggregateVersionRepo selected by the retained `aggregateVersion`. Finalization
returns the complete `IEvaluatedAggregateCommand` with canonical `id` after committing or
recovering the exact original evaluation. AggregateChain decodes that complete reply and
synchronously validates selected identity, designated original release and finalized
predecessor before retaining the first outcome, including `outcome.finalizedAt`. An identical
retry is idempotent; a contradiction cannot replace the retained value. Public
Failure completes original delivery. Transport failure, interruption, malformed
reply and failed acknowledgement leave the admitted command pending.

The bound finalization RPC establishes original-executor authority. Remove
`originalDispatchAcknowledged`, `finalizedOutcomeOutbox`, reverse outcome delivery
and remote pending-outcome proof. Add no replacement result cache, queue, history,
acknowledgement field, fingerprint or retry counter. AggregateChain retains admitted
history and original outcomes after completion.

AggregateVersionRepo atomically commits resources or public refusal, its existing
`materializationHead`, the complete `aggregateVersionChainOutbox` evaluated command, with frozen
external descriptions for AggregateChain. Business-savepoint rollback and transactional
checkpoint/contiguity checks remain intact. Original outcome return does not await
AVC publication, projection delivery or external work. Replay uses its receiving
release's program and never produces original external work.

Before predecessor catch-up or fresh declaration lookup, finalization reads the
checkpoint. A committed position recovers the exact pending publication evaluated command or,
after its acknowledged deletion, permanent AggregateVersionChain history. Validate
command ID, position and exact retained admitted-input association. The current
materializationHead retains position/hash, with no copied command ID. Missing or conflicting history
fails explicitly and never permits execution again. For a fresh position, catch up
through N−1 outside the execution permit, then recheck the checkpoint under the
permit before fresh declaration resolution. Concurrently committed requests leave
the permit and recover their outcome. All identity/history RPCs remain outside SQL
transactions and execution permits.

The existing finalization-outbox alarm stays armed through outcome acknowledgement
and its completion hook. That hook acquires/releases the replay fanout producer
lease before original-delivery recovery is released. Queue recovery reruns the hook
even with no pending originals, covering interruption after Chain outcome commit
but before replay wake. Replay still exposes only the contiguous finalized prefix.

## Consequences

Original delivery has one completion fact: AggregateChain's retained non-null
`outcome`. It no longer needs a weaker dispatch receipt or a reverse result
message. A lost original reply recovers exact committed output without resampling
time, changing resources or reproducing external requests.

After local publication deletion, duplicate recovery depends on AggregateVersionChain
availability. Unavailability keeps AggregateChain pending while preserving the
committed AggregateVersionRepo checkpoint; retries recover when history is available.
This dependency is intentional. Publication deletion requires durable AVC
acknowledgement, and AVC never deletes permanent history to acknowledge publication.
A fresh execution can return its committed evaluated command while AVC is unavailable.

Activation-owned replay preserves a local execution checkpoint ahead of
AggregateChain's finalized prefix after a lost original reply. Startup consumes
only available finalized history and opens without forcing that reply or awaiting
AVC publication. Ordinary reads observe current committed materialization;
command-specific finalization and recovery keep the protocol above.

This decision does not enable activation of a removed authored release:
AggregateVersionRepo still needs that release to construct its resource schema.
The early duplicate path removes execution-time lookups, not that constructor
requirement. Changed fixed schemas require empty affected AggregateChain and
AggregateVersionRepo storage; no translation, fallback reader, dual protocol or
automatic reset is permitted.

The current shared outcome shape is `outcome: { result: Success | Failure, finalizedAt }`.
The timestamp sits outside both result branches. Aggregate source and projection
resource writes use that single finalization sample; no separate Aggregate
execution-start timestamp remains. [Plan 200](../archive/plans/200-plan-aggregate-operation-context.md)
records this model and naming amendment.
