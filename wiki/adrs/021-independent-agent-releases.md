# Independent agent releases and persistent execution ownership

**Date:** 2026-10-25
**Status:** Superseded by [ADR 022](022-owner-local-agents-and-explicit-node-selection.md). The earlier implementation and verification are recorded in [Plan 262](../archive/plans/262-plan-independent-agent-releases.md).
**Supersedes:** Agent declaration/version identity, scheduling transition and observer
binding clauses in ADRs [007](007-canonical-results-and-selected-chain-ownership.md),
[013](013-aggregate-delivery-history-and-projection-ownership.md) and
[015](015-service-delivery-history-and-projection-ownership.md). Their separate
materialization/history ownership decisions remain governing.

## Decision

An authored Agent release has an independent positive safe-integer `agentVersion`.
Register retained releases at `system.agents[agentName][agentVersion]` and select
exactly one with `system.agentVersions[agentName]`. A release binds an exact
Aggregate or Service version; releases under one Agent name retain the same owner
family and name. Changing callback behavior requires a release bump even when the
portable spec cannot compare executable function bodies.

SystemRepo accepts an immutable `agentRelease` identity `(agentName, agentVersion)`
and compares the complete portable spec, including its owner binding. The running
pin is mutable configuration, not another immutable catalogue identity.

Agent Version Repos/Chains and fanout subscriber cursors include agentVersion.
Only the configured release consumes new owner history and schedules commands.
Inactive releases retain committed resources and history and finish complete
pending selected publication, without resuming business scheduling.

AggregateAgentNodeRepo and ServiceAgentNodeRepo retain their unversioned stable
identities. Their checkpoint records the applied agentVersion and owner version.
Their outbox retains the producing agentVersion, exact command ID, payload and
owner/contract versions. Agent Origin is `{ kind: 'agent', agentName, agentVersion }`.
The producer version is independent of the receiving projection's release.

Constructor activation arms the existing WakeRegistry after schema validation.
Explicit initialization and alarms share one advancement procedure outside the
constructor gate. On release mismatch, deliver existing outbox commands until
exact admission receipts allow deletion. Then capture the configured projection's
command-derived snapshot outside a transaction and atomically commit resources,
checkpoint and wake reconciliation. Subscription retries after restart without
reinstalling a matching baseline. No persisted transition phase or agent-state
up/down callback is introduced.

Wake-attempt identity is `(behaviorKey, modelName, resourceId)` and matching selected
attempts survive upgrades. A new behavior key deliberately establishes another
one-shot responsibility. Existing Nodes can transition to a release without wake
behavior and become dormant after delivery; new observer-only Agents do not need
eager execution Node Repos.

Observer requests, locks, tickets and Chain routing bind an exact configured Agent
release. Inactive observer reconnect/resume/message fails rather than acquiring a
new release's capabilities. Ticket spending preserves the stored routing identity.

## Alternatives and consequences

Versioning Agents only through their Aggregate/Service release prevents independent
selection and scheduling evolution. Reusing one versioned projection identity
would reinterpret retained selected history and share acknowledgement cursors.
Independent release identities preserve the stable executor while keeping those
meanings separate.

Agent release changes do not make old SQLite schemas or row encodings readable.
Framework SQL migrations and contract payload adapters remain separate mechanisms.
This pre-release fixed-format cutover requires empty affected storage under current
policy; no persistent reset is authorized by this ADR or Plan 262. Worker code
rollback does not reverse storage changes or admitted command effects.
