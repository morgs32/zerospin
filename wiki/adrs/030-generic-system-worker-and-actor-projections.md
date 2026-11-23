# Ship a generic System Worker bundle

**Date:** 2026-11-20

**Status:** Accepted. Implementation pending.

## Context

The System Worker currently bundles the application configuration and hosts
Actor and Agent projection Repos. Those Repos use live declarations, native
queries, and model codecs to materialize the selected view. The System Worker
also hosts the gateway and the cross-release command Chains.

## Decision

Use the same Zerospin bundle for every self-hosted System. Give each serving
System Worker version its System identity, exact serving SystemSpec and
release bindings as deployment data. Publishing an owner release may activate
a System Worker version with updated bindings and the same bundle. The
System Worker hosts the gateway, SystemRepo, and root Chains.

Each Aggregate or Service release Worker owns its evaluated command VersionChain
and corresponding VersionArchives. These are separate Durable Objects from its
VersionRepo. The root Chain reads compacted history through the binding to the
release that retains it. Successor releases use that same history when replay
requires it.

The addressed Aggregate or Service release Worker owns its Actor projection
Repo and that Repo's SQLite state. The projection consumes evaluated command
history for its release and commits the selected rows, checkpoint, and pending
publication in its local transaction. The same release Worker hosts the Actor
VersionChains and their Archives as separate Durable Objects. The Actor
VersionChain serves retained selected history and owns the session socket.

AgentWorker owns the versioned Aggregate and Service Agent projection Repos
and their SQLite state. Each projection consumes evaluated history from the
owner release bound to its Agent version. The active Agent Node gets its
snapshot from that versioned projection. AgentWorker also hosts the Agent
VersionChains, which retain selected history and own the session sockets.

For each WebSocket upgrade, SystemRepo spends the matching single-use ticket
and forwards the upgrade with the retained session identity to its Worker.
The addressed VersionChain validates the session and accepts the socket.

The addressed release validates the exact submitted command before the root
Chain admits it. If validation rejects the command or the call to the release
fails, return an admission error before assigning a position. After validation
succeeds, the root Chain checks grants and producer progress and appends the
submitted command in its own transaction.

The pinned emitting release Worker runs authored operation continuation mappers.
[ADR 031](031-register-ordinary-continuation-contracts.md) defines follow-up
authority, contract registration, and ordinary command failure behavior.

### Owner Worker version acceptance

The first `SystemRepo` acceptance that includes an owner release freezes its
exact Worker version. The acceptance transaction stores the executing candidate's
owner pins on its existing `acceptedSystemSpecs` row and rejects conflicting pins
across all accepted snapshots. The portable `SystemSpec` still hashes authored
declarations. Its hash can match across builds with different Worker versions.

A new deploy reads accepted pins during preflight. It verifies and reuses an
accepted owner executable across changes to the rest of the System. A settled
upload for an owner release without an accepted pin can be rebuilt in place
before acceptance. An unresolved upload or acceptance blocks replacement. This
lets a retry deploy the working tree while preserving executables already
eligible to start their Repos, including when the accepting System Worker stayed
at 0% traffic.

Earlier catalogs lack owner pins and require a separately approved storage
upgrade before adopting this format.

## Trade-off

Keeping the Actor projection on the generic System Worker would require a
portable executor with equivalent query and codec behavior. Release ownership
reuses the existing materializer and keeps its queries and writes in one
transaction. It also changes the Worker that owns the projection namespaces.
Cutover for existing deployments must account for their existing projection
state and pending publications.

History reads from a release pause when its Worker is unavailable. If a release
stops accepting new sessions, its Worker must stay reachable while a root Chain
or a successor release still references its history.

AgentWorker receives evaluated history across a Worker binding. An Agent
release can change its selection while keeping the same owner release bound
and its Worker bundle pinned.

[Actor selection metadata](../../packages/core/src/declaration/makeActorSpecs.ts)
· [Aggregate projection transaction](../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts)
· [Release bindings](../../packages/cli/src/deploy/utils/prepareOwnerReleaseBindings.ts)
· [Compacted Service history reads](../../packages/system-worker/src/ServiceChain/readReplayCommandsPage.ts)
· [Session socket forwarding](../../packages/system-worker/src/SystemRepo/handleFetch/forwardSessionSocket.ts)
