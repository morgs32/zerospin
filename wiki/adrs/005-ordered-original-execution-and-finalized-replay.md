# Ordered original execution and finalized replay

**Date:** 2026-10-10
**Status:** Accepted
**Implementation:** [Plan 091](../archive/plans/091-plan-command-execution-and-replay.md).
**Partial supersession:** [ADR 014](014-synchronous-original-finalization.md) replaces only the split Aggregate dispatch/original-outcome protocol. This ADR's original/replay ordering remains governing; [ADR 015](015-service-delivery-history-and-projection-ownership.md) governs Service returned-outcome completion and physical ownership.

## Context

An aggregate or service has one admitted command order, while each authored
version owns its own state and program. A command's retained owner version
must execute the original exactly once and owns any external async work.
Delivering pending input to every version mixes original authority with replay
availability. It lets a later original observe state before an earlier original
has finalized and makes infrastructure interruptions ambiguous across versions.

## Decision

Each Chain uses its existing commands log as the ordered original outbox. It
delivers one oldest pending row to the command's retained aggregate or service
version. Before original n, that version replays through n - 1. Explicit
original and replay transaction entrypoints share atomic materialization. Aggregate
execution history and complete pending messages follow [ADR 013](./013-aggregate-delivery-history-and-projection-ownership.md); Service resource/history separation follows [ADR 015](./015-service-delivery-history-and-projection-ownership.md). Only original execution persists or runs external work.
Replay retains model changes without async-operation rows or replica async
descriptions, as settled by [ADR 012](./012-opaque-external-work-and-originating-chain-continuations.md).
That persistence change is implemented in [Plan 150](../archive/plans/150-plan-opaque-external-work.md).
This ADR's command ordering remains governing. [Plan 152](../archive/plans/152-plan-aggregate-chain-command-storage.md) replaces the outcome representation and makes the acknowledged Chain outcome the direct original-result receipt.

For Aggregate commands, the designated AggregateVersionRepo returns its exact
committed `commandOutcome` with command ID/position. AggregateChain retains it in
its acknowledgement transaction after identity and predecessor validation, as
governed by [ADR 014](014-synchronous-original-finalization.md). Service returns
its exact committed outcome with command ID and `serviceIndex`, governed by
[ADR 015](015-service-delivery-history-and-projection-ownership.md). Both
validate immutable identity and preserve durable replay recovery. Replay exposes only the contiguous finalized prefix and evaluates
each receiving version's own program. Lost receipts and duplicate delivery
recover retained output without reevaluation. `awaitCommandResult` requests
bounded original progress, catches up replay, and recovers the requested
version's result. Reading replay pages cannot execute originals.

VersionRepo activation awaits local `catchupMaterialization` inside the existing
constructor gate, consuming one captured finalized prefix through the shared
paginated subscriber. It does not execute pending admitted commands. Source Chains
retain authored release membership; `.catchup()` preserves a local checkpoint
already ahead of the finalized prefix after an interrupted original reply.
Publication/fanout and external recovery are armed independently, including when
there is no replay, and their remote completion does not gate activation. Ordinary
snapshots, queries and authorization read current committed materialization after
activation, without forcing source-tip replay or original backlog execution.
Explicit authorizer commands and command-specific predecessor/result waits retain
their normal execution requirements. [Plan 192](../archive/plans/192-plan-activation-materialization-catchup.md)
records this lifecycle cutover; no public progress or `flush` control is retained.

Direct aggregate execution recovers the acknowledged original `commandOutcome`
from AggregateChain. Its receipt retains admitted identity and aggregate position,
without the VersionRepo's disposition hash. Pending originals still progress
through the retained VersionRepo and existing delivery path.

## Alternatives

Parallel originals across versions allow later commands to run before earlier
state is available. A combined execution/replay entrypoint hides producer
authority and turns a page read into an execution trigger. A separate pending
work table duplicates the Chain's admitted order and finalization state.
Copying original outcomes into replay would suppress each version's own guards
and program rather than materializing that version's behavior.

## Consequences

Infrastructure failure blocks all later originals within the Chain until
recovery; this is the throughput cost of the shared state order. Business
failure finalizes a command and permits subsequent work. Pending external
requests do not block later originals because their async lifecycle runs after
the original transaction commits. Each version may produce a different local
outcome while consuming the same finalized shared inputs.

The fixed storage and transport contract is a flat `commandOutcome`:
`{ _tag: 'Success', success, recordedAt }` or
`{ _tag: 'Failure', failure, recordedAt }`, with null outside the union for pending.
Success contains the encoded command result; failure contains the encoded public
command refusal. The executing VersionRepo samples recording time alongside result
retention after evaluation or refusal in the same transaction. The Chain copies
it unchanged, retries recover it, and replay records its own outcome without
replacing the Chain's original. This is a wall-clock observation, not an exact
SQLite commit instant or an ordering cursor.
Browser projections redact completion details to null for other recipients.
Changing this ordering or reinterpreting retained replay as original authority
would alter durable history and external-effect ownership; affected storage
must be empty for the cutover.

Aggregate journal and selected-view physical ownership are governed by [ADR 013](./013-aggregate-delivery-history-and-projection-ownership.md), including its minimal resource checkpoint and complete pending messages. [ADR 015](./015-service-delivery-history-and-projection-ownership.md) governs Service physical ownership. This ADR's original/replay ordering remains governing.
