# Browser speculation and confirmed projections

**Date:** 2026-10-10
**Status:** Superseded by [ADR 007](./007-canonical-results-and-selected-chain-ownership.md)
**Implementation:** [Plan 101](../archive/plans/101-plan-remove-aggregate-server-staging.md).

## Context

Server session staging duplicated speculative command evaluation inside actor and agent view owners. Its failures were forwarded to the aggregate chain and could bypass canonical execution. A guard evaluated against a view's delayed state could therefore decide durable history. An embedded AggregateSessionRepo also obscured which Durable Object owned resources, pending delivery and lifecycle. Projection command tables duplicated histories already retained by canonical and browser chains.

## Decision

Browser sessions alone stage commands for immediate feedback and rebase their pending journal. Authenticated actor and agent sockets admit each original command directly to AggregateChain, which retains input, provenance and dense submission order. AggregateVersionRepo evaluates the command against canonical state; aggregate release policies own authoritative actor command checks. Aggregate actor declarations expose authentication and authorization without a second command guard surface. Service actor guards retain their existing meaning.

AggregateActorVersionRepo and AggregateAgentVersionRepo directly own confirmed resources, a projection checkpoint and durable pending browser output. Shared projection procedures are stateless. One synchronous transaction validates delivered results and operations, applies owned operations, computes selected deltas, advances the checkpoint and enqueues output. Canonical refusals advance without resource changes. AggregateVersionChain retains execution history; actor and agent version chains retain browser history. Snapshots capture resources and progress atomically before publication waits.

## Alternatives

Dropping failed server stages would make a stale speculative refusal suppress a valid canonical command and would complicate retained producer positions. Revalidating server stages before execution would retain duplicated execution machinery and still require the canonical check. Keeping a final-only projection command table would duplicate chain history without a reader requiring it. A replacement stateful projection repository would continue hiding ownership inside the existing Durable Objects.

## Consequences

Local browser feedback remains fast, while an accepted command can still fail against intervening canonical state. That final result clears browser optimism through the existing completion flow. Every admitted command participates in canonical execution or version replay, governed by [ADR 005](./005-ordered-original-execution-and-finalized-replay.md). Trusted async continuation admission remains separate from browser ingress.

Projection recovery depends on retained canonical history and browser delivery history rather than a local command journal. Full local resources remain necessary for relational selection membership, even when the browser receives a smaller graph. Removing fixed tables and guard declarations requires empty affected storage and an outright declaration cutover; no compatibility path is retained.
