# Author-owned external request retries

**Date:** 2026-10-13  
**Status:** Accepted  
**Implementation:** [Plan 147](../archive/plans/147-plan-author-owned-external-retries.md).

## Context

The external producer repeated all failures before response recording, including
exhausted authored retry policies and response validation failures after a provider
could already have acted. A new framework invocation restarted the author's retry
budget. Durable recovery of an unfinished request and permission to repeat a
recorded failure were conflated.

## Decision

Authors own request retryability, bounds, delays and provider idempotency or
reconciliation inside `external.request`. Retain configurable `timeoutMs` with its
30-second default around the complete invocation. Remove `retryDelayMs` and
`nextRunAt`; add no replacement retry configuration or persisted attempt state.

The emitting VersionRepo retains the first committed `externalOutcome`, whether
success or terminal request failure. Recording either branch and enqueueing its
continuation are one synchronous transaction. Both branches use the flat
`Success/success` or `Failure/failure` union with the first `recordedAt`; null
outside the union means unfinished work. JSON null remains an explicit success.
This failure-continuation policy replaces the earlier no-child policy under
[Plan 152](../archive/plans/152-plan-aggregate-chain-command-storage.md). Neither branch
can replace the other or alter the originating command's retained result.

The authored continuation receives the recorded observation and can handle an
external failure successfully. Request failure means no usable response was
obtained; it does not establish whether a remote side effect occurred. Authors
choose domain transitions and reconciliation. External request failures have
their own public type, separate from command refusals and private diagnostic Causes.

Shared alarms recover original production without a recorded response or failure.
In-memory reservations prevent overlap in one live Repo. Alarm ownership covers
active precommit execution, unfinished production and the recorded-child handoff.
Protect terminal settlement and alarm cleanup from interruption while leaving
request work and delivery interruptible. Preserve both Causes if failure recording
also fails; without a committed outcome the operation remains eligible.

[ADR 012](012-opaque-external-work-and-originating-chain-continuations.md) now governs
originating-chain delivery, source proof, original-only work and frozen authority.
Its implementation is recorded in [Plan 150](../archive/plans/150-plan-opaque-external-work.md);
this ADR's authored retry and terminal-outcome rules remain governing independently
of that routing change.

## Alternatives

Retaining the automatic loop would override an author's stopping condition and
repeat permanent or post-provider validation failures. Persisting arbitrary Effect
schedule progress would introduce a second retry framework. A started/unknown state
would require an additional recovery policy that the current requirement does not
need.

## Consequences

A captured failure or timeout stops production after recording and delivers the
failure observation to its continuation. A process lost
before either outcome records leaves an uncertain provider result and permits
blind recovery, including a fresh authored retry budget. Exactly-once remote
effects are not promised; authors determine safe repetition or reconciliation.
Recorded-child delivery retains its existing independent recovery semantics.

Changed fixed producer and accepted-definition schemas require empty affected
AggregateVersionRepo, ServiceVersionRepo and SystemRepo storage. No compatibility
decode, row translation or automatic reset is retained.
