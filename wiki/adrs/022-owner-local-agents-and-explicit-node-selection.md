# Owner-local Agents and explicit Node selection

**Date:** 2026-10-25
**Status:** Superseded by [ADR 029](029-independent-agent-command-callbacks.md). Historical implementation evidence remains in [Plan 264](../archive/plans/264-plan-owner-local-agents-and-node-selection.md).
**Supersedes:** [ADR 021](021-independent-agent-releases.md).

## Decision

Aggregate and Service releases declare named `agents` beside `actors`. Agent
factories describe an immutable version's queries, capabilities and behaviors;
the enclosing release supplies owner context and validates canonical models and
contracts. Agent declarations contain no System or owner name/version.

Complete owner specs include complete Agent specs. Changing the Agent registered
in a release requires a new owner composition version. Unchanged Agent versions
may be reused across owner releases. Their independent catalogue identities are
`(aggregateAgentRelease, aggregateName, agentName, agentVersion)` and the explicit
Service counterpart; owner release version is excluded. This preserves
cross-release spec immutability without a global Agent-name namespace or owner scan.
Executable functions remain outside portable-spec comparison; callback changes
require an authored Agent version bump.

System declares separate `aggregateAgentNodes[aggregateName][agentName]` and
`serviceAgentNodes[serviceName][agentName]` maps. Each value is the canonical
registered enclosing release supplying that Agent. Omitted maps are empty.
SystemSpec projects owner-local release-version references. Node selection is
mutable configuration and is not an immutable catalogue lock.

Every declared Agent projection can materialize and serve exact-release observers
independently of Node selection. Only the selected binding drives the stable
AgentNodeRepo. Node removal stops production, drains frozen commands and becomes
dormant. Rebinding also drains before replacing the command-derived baseline.

Node Repo identities, checkpoint/outbox formats and one WakeRegistry per object
remain unchanged. Resources, checkpoint, attempted-wake reconciliation and new
frozen commands commit synchronously together. Pending commands retain canonical
ID, exact encoded payload, owner/contract versions and original Agent Origin.
Only an exact durable admission receipt permits deleting a pending delivery row;
execution commit and retained `outcome` remain separate facts. Recovery needs no
persisted transition phase or Agent-state migration callbacks.

Browser sessions receive explicit enclosing name/version beside their Agent.
`openAggregateAgentSession` and `openServiceAgentSession` separately validate full
requested identities, snapshot the exact projection and issue a bound ticket.
Node selection never substitutes for declared observation capabilities. Ticket
spending preserves the stored admission without checking fresh specs.

## Consequences

The public model follows one composition rule for Actors and Agents. It gives up
Agent-only composition upgrades at an unchanged owner release: a new owner
version entails its own materialization and replay, even when models are reused.
This cost is explicit rather than hidden in a global catalogue/activation model.

Accepted-spec keys/content require empty affected SystemRepo storage. There are
no compatibility aliases, readers or translation migrations. Persistent resets,
publication and deployment require separate authorization.
