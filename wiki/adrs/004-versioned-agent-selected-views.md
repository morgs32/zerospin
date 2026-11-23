# Versioned agent selected views

**Date:** 2026-10-09
**Status:** Superseded by [ADR 007](./007-canonical-results-and-selected-chain-ownership.md)
**Implementation:** [Plan 085](../archive/plans/085-plan-versioned-agent-views.md).

## Context

A shared administration replica omitted agent identity from its physical key and exposed the complete aggregate snapshot. It could not represent independently versioned selected agent views or isolate their durable history. Agents need the same selected snapshot and reconciliation behavior as actors while remaining Studio sessions without actor claims.

## Decision

Restore AggregateActorVersionRepo and AggregateActorVersionChain. Add their agent peers, AggregateAgentVersionRepo and AggregateAgentVersionChain, keyed by aggregate identity and exact agent name/version. Register authored releases as `agents[agentName][agentVersion]` and bind origin, locks, tickets, snapshots and recovery to that version.

SystemRepo accepts the complete agent release together with actor and owner releases in one transaction. The same agent name/version locks its models, selections and contract bindings permanently; identical acceptance is idempotent, while changed definitions require a new version. Removing an authored release does not remove its accepted lock. This prevents an existing durable view or retained command history from acquiring a different meaning under the same identity.

Snapshots and deltas contain only rows selected by the authored version, including selection entry and exit. Server view owners retain operations needed to evaluate selections; AggregateVersionRepo remains authoritative for full aggregate execution. Repo and Chain namespaces are distinct, and shared procedures retain synchronous transaction boundaries. Each owner has separate fanout subscription cursors and failures.

Agents have no actor authentication/authorization callbacks or claims. Studio's existing SystemApi credentials and single-use bound websocket tickets govern access; exact bindings, ordinary contract allowlists and authoritative guards remain required. Studio owns a transient browser session while its view is open. Direct system commands use AggregateChain admission and AggregateVersionRepo execution without a separate administration replica.

## Consequences

Agent versions cannot share a durable view, completion history or session lock. Switching versions creates a new producer; admission forbids changing an existing producer's provenance. Persisting full definition locks trades reuse of a version label for stable replay and view interpretation. This is a fixed-schema cutover requiring empty affected storage, with no compatibility tables or translation migrations.
