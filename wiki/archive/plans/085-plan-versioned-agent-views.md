# 085 — Versioned agent views aligned with actors

## Agreed behavior

1. Restore `AggregateActorVersionRepo` and `AggregateActorVersionChain` for actor sessions. Replace the generic AggregateProjection Repo/Chain and remove `projectionScope` outright.
2. Give agents independent `agentName` and `agentVersion`, versioned registrations, and dedicated `AggregateAgentVersionRepo` / `AggregateAgentVersionChain` namespaces. Bind command origin, snapshots, locks, tickets, and recovery to the exact version and aggregate release.
3. Agent snapshots and subsequent deltas contain only the rows selected by that agent version. Preserve actor-style atomic snapshot/checkpoint capture, selection entry/exit, optimistic staging, ordered outcomes, and reconnect recovery.
4. Studio owns transient agent browser sessions. Agents have no authentication/authorization callbacks or actor claims; Studio's existing SystemApi credential boundary, exact binding checks, contract allowlists, tickets, and authoritative contract guards remain.
5. Preserve concurrent session-release work. Share transaction and delivery procedures between the two explicit owners; do not introduce compatibility aliases or retain the administration replica. Direct system commands use existing authoritative chain admission/execution.

## Implementation

1. Add exact agent-version metadata and nested version registrations, adapting current session releases, executable declarations, SDK exports, schemas, and consumers.
2. Introduce separate actor/agent Repo and Chain classes/configurations, share lower-level behavior, and update fanout, routing, registration, inspection, deployment bindings, and direct commands.
3. Adapt browser and Studio bootstrap, socket checks, selected snapshot hydration, and version-private recovery.
4. Extend database-backed checks for selected snapshots and selection entry/exit, wrong-version rejection, version-private outcomes, durable staging/refusal/retry, actor parity, and direct commands.
5. Reconcile glossary, local patterns, architecture, and affected READMEs with the implemented behavior. Changed fixed schemas require empty affected storage; do not reset storage automatically.

```text
zerospin/
├─ ~ packages/core/src/{agent,contracts,aggregateSession,system}/
├─ ~ packages/system-worker/src/{aggregateSessionRepo,aggregateSessionChain}/
├─ + packages/system-worker/src/Aggregate{Actor,Agent}Version{Repo,Chain}/
├─ ~ packages/system-worker/{checks,wrangler.jsonc} and API/fanout/routing
├─ ~ packages/{browser,studio,sdk,dev-worker,production-worker}/
├─ ~ examples/shopping/ and relevant fixtures
└─ ~ wiki/{glossary.md,architecture,patterns}/
```

`+` creates, `~` modifies or moves existing implementation.

## Verification completed — 2026-10-09

- Scoped Nx `lib` and `ts` graphs passed for core, browser, System Worker, Studio, development Worker and production Worker, including their dependency libraries.
- Core node suite: 32 passed. Browser node suite: 67 passed.
- `system-worker:aggregate-administration:check` passed selected version snapshots, exact entry/exit deltas, private outcomes, wrong-version rejection, immutable producer provenance, durable staging/refusal/retry, actor authorization and direct authoritative admission. The shared-publication test retains both fanout recovery leases across concurrent empty drains.
- `system-worker:authorization-provisioning:check` passed real Workerd owner RPC reentry, provisioning/recovery, actor tickets, independently selected agent-version snapshots, membership entry/exit and single-use agent WebSocket tickets.
- `system-worker:outbox:check` passed synchronous acknowledgement/rollback, prefix redelivery, alarm leases, producer failure and restart recovery.
- Scoped lint tasks passed with warnings. Explorer typecheck/lint and all 16 diagram tests passed. Isolated reruns resolved missing build outputs during concurrent workspace builds.
- Regenerated Explorer's captured schema without executing Worker modules. Runtime and inspection source has no `AggregateProjectionRepo`, `AggregateProjectionChain`, `projectionScope`, or deleted direct-staging helper references. Source links and frontmatter provenance were refreshed; whitespace checks passed.
- Concurrent session-release and Explorer work was preserved. No commit, deployment, or existing-storage reset was performed.

## Remaining work

No repository implementation work remains in this plan. Existing environments require empty affected storage before using the new fixed schemas and Durable Object namespaces; that operational reset was outside this implementation.
