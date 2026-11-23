# Standalone parity with Node-owned views

**Date:** 2026-10-17

**Status:** Historical source research and recommendations; this research performed
no implementation or verification. Plan 234 subsequently completed implementation
and verification on 2026-10-27; its archived final closure record governs current status.
[Plan status](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#L3-L9).

## Direct answer

Standalone needs the same Node-owned optimistic view and minimal session replica
model, and the current implementation already wires it into that model. Plan 234
explicitly includes standalone and marks that migration written. Do not start
another standalone cutover based on the presence of `makeAsyncContractReadDb`:
that adapter belongs to standalone's separate authoritative execution path.
[Plan scope](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#L7-L15),
[standalone requirement](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#L264-L269),
[written migration](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#L341-L350),
[authoritative read adapter](../../packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts#L247-L281).

This is a source conclusion, not evidence that the new behavior passes its
required checks. Plan 234 explicitly says its checked implementation boxes are
not verification.
[Current verification limits](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#L398-L411).

## What the plans decided

The earlier [Plan 151 chat](codex://threads/01a14120-f664-72f2-b58a-4b2e61c9bd55)
contains approval for Plans 230–233's Node metadata/history reductions with
verification deferred. Plan 234 is the direct written record of the later
view/local-replica decision. Its original side-conversation turn was not located
in the available chat history; no separate conversation is inferred here.
[Plan 234 context](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#L5-L9).

The earlier standalone design moved authority into one SharedWorker while
preserving synchronous per-tab staging. Plan 072 deliberately allowed async
SQLite reads during authoritative execution, holding the Node gate and durable
transaction through evaluation, operation application and final retention. Its
historical completion record does not verify later Plan 234 changes.
[Plan 072 summary](../archive/plans/072-plan-standalone-sharedworker-execution.md#L3-L5),
[execution decisions](../archive/plans/072-plan-standalone-sharedworker-execution.md#L40-L50),
[historical outcome](../archive/plans/072-plan-standalone-sharedworker-execution.md#L88-L113).

Plan 234 later transferred shared pending optimism from each session to its
Node. It explicitly preserved standalone's local authority, original/final append
phases, pause/manual controls, storage lease and per-original claims. It required
the same view publication/local replica model, while keeping authoritative
execution distinct from optimistic replay. ADR 004 was amended to record that
combined design.
[Ownership equations](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#L13-L33),
[distinct execution roles](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#L99-L107),
[standalone requirements](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#L264-L269),
[amended ADR](../adrs/004-standalone-authority-and-storage-scope.md#L13-L23).

## What already applies to standalone

| Behavior                                             | Current standalone wiring                                                                                                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synchronous staging in a local session replica       | `createStandaloneBrowserSession` creates the ordinary Aggregate session and calls shared `bootstrapAggregateSession`, swapping only its Node connector.                                               |
| One Node-owned synchronous optimistic graph          | `makeStandaloneWorkerRuntime` creates `makeAggregateNodeOptimisticView` with its existing ManagedRuntime's `runSync`, and passes it into `AggregateNode`.                                             |
| Exact local-input coverage                           | `StandaloneBrowserSessionApi` registers command interests before retention; its subscription delegates to `AggregateNode.subscribe`.                                                                  |
| Atomic graph installation and own uncovered overlays | Shared bootstrap uses `makeAggregateReplicaReceiver`; that receiver calls `installAggregateNodeView`, which installs resources/coverage and replays only local rows beyond the installed Node prefix. |
| Per-original claims                                  | Node replay uses each retained original's claims; publication substitutes the receiving attachment's claims into its delivered identity.                                                              |

Sources:
[session construction and bootstrap](../../packages/browser/src/makeBrowserSession/createStandaloneBrowserSession.ts#L43-L49),
[standalone connector selection](../../packages/browser/src/makeBrowserSession/createStandaloneBrowserSession.ts#L103-L122),
[projection construction](../../packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts#L173-L199),
[input interests](../../packages/browser/src/StandaloneNode/StandaloneBrowserSessionApi.ts#L45-L78),
[Node subscription](../../packages/browser/src/StandaloneNode/subscribe/subscribe.ts#L41-L77),
[shared receiver wiring](../../packages/browser/src/bootstrapAggregateSession.ts#L179-L194),
[receiver installation](../../packages/browser/src/sessionReplica/makeAggregateReplicaReceiver.ts#L173-L197),
[atomic installer](../../packages/core/src/aggregateSession/installAggregateNodeView.ts#L94-L123),
[local overlay selection](../../packages/core/src/aggregateSession/replayLocalAggregateCommandsTx.ts#L28-L42),
[captured original claims](../../packages/core/src/AggregateNode/makeAggregateNodeOptimisticView.ts#L15-L21).

The session still has a synchronous SQLite replica for its resource view and own
command rows. Node ownership removes per-session reconstruction of other
attachments' history; it does not remove the session database or immediate local
staging. The Node graph contains authoritative resources plus all retained
pending originals in Node order.
[Replica allocation](../../packages/browser/src/sessionReplica/openAggregateReplica.ts#L16-L39),
[local staging transaction](../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts#L23-L79),
[Node projection](../../packages/core/src/AggregateNode/AggregateNode.ts#L457-L510).

## Why the authoritative async path remains

Standalone has no AggregateVersionRepo to execute commands elsewhere.
`executeStandaloneCommand` evaluates the next retained original against the
persistent authoritative resources, applies operations, and constructs its
`outcome`/`dispositionChainHash`. `AggregateNode.executeNext` retains the final in
the same outer transaction. `executeStandaloneCommand` uses a nested savepoint
to roll back resource changes for a business failure. This produces authority
rather than projecting optimism.
[Authoritative evaluation](../../packages/browser/src/StandaloneNode/executeStandaloneCommand.ts#L71-L95),
[failure and outcome handling](../../packages/browser/src/StandaloneNode/executeStandaloneCommand.ts#L131-L179),
[final retention boundary](../../packages/core/src/AggregateNode/AggregateNode.ts#L729-L780).

The durable SQLite callback really is asynchronous. The new Node optimistic
graph is a separate synchronous in-memory database; its replay uses
`makeContractReadDb`, not `makeAsyncContractReadDb`.
[Durable execution](https://github.com/morgs32/zerospin/blob/41b548a019ff1e08f65f60c9459e0908a80c64f5/packages/browser/src/Node/openNodeStorage.ts#L57-L82),
[memory graph](../../packages/core/src/Node/makeNodeOptimisticView.ts#L20-L56),
[synchronous replay reads](../../packages/core/src/sessionExecution/replayAggregateCommandTx.ts#L41-L50).

**Recommendation:** retain `makeAsyncContractReadDb` while authoritative execution
reads that durable database. Do not execute an authoritative command against the
shared optimistic graph: that graph already includes the command itself and
possibly later pending commands. For example, two pending increments over zero
produce an optimistic value of two; executing the first increment against that
value would apply it twice and observe future work. This is a consequence of the
two graphs' different responsibilities.
[Pending projection](../../packages/core/src/AggregateNode/AggregateNode.ts#L457-L510),
[authoritative original selection](../../packages/core/src/AggregateNode/AggregateNode.ts#L745-L765).

Making authoritative authored evaluation synchronous is a possible new design,
not an unfinished Plan 234 migration. It would need an authoritative-only memory
view captured under the same gate, followed by durable operation/final
commitment, preserving failure rollback and checkpoint ownership. The existing
optimistic view cannot supply that semantic boundary unchanged. The async suffix
alone supplies no reason to introduce this additional mechanism.
[Current transaction](../../packages/core/src/Node/makeNodeSqlGate.ts#L25-L50),
[required authority distinction](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#L264-L266).

## Separate source finding: pause is not enforced by automatic execution

The intended design preserves pause/manual controls, but the current automatic
standalone route does not inspect `pushPaused`: attachment and command reception
schedule `drain`; the runtime calls `executeNext`, which selects pending originals
without a pause condition. Handoff's active check and `AggregateNode.status().blockedWork`
also omit pause. Connected dispatch uses `nextPush(manual)`, which does check it.
This is a concrete source gap to address separately, not a reason to duplicate
the Node-view cutover. It was not exercised at runtime in this research.
[Intended controls](../adrs/004-standalone-authority-and-storage-scope.md#L17-L21),
[automatic command drain](../../packages/browser/src/StandaloneNode/receiveCommandRows.ts#L25-L35),
[automatic attachment drain](../../packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts#L304-L310),
[runtime drain](../../packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts#L76-L101),
[handoff active check](../../packages/browser/src/bootstrapAggregateSession.ts#L148-L151),
[blockedWork](../../packages/core/src/AggregateNode/AggregateNode.ts#L932-L949),
[standalone selection](../../packages/core/src/AggregateNode/AggregateNode.ts#L739-L760),
[connected pause check](../../packages/core/src/AggregateNode/AggregateNode.ts#L598-L605).
