# Agent Node and runtime machinery audit

**Date:** 2026-10-18. **Status:** Source audit and recommendations; recommendations are not implemented. Examines the current working tree after Plan 244. No builds, tests, runtime checks, storage changes or application startup were performed. Explorer was excluded.

## Read publication: required boundary, unnecessary database proxy

`fenceAgentNodeRead` is unnecessary in the current Agent API. The necessary rule is that a read cannot observe the interval between committing authoritative data and rebuilding the optimistic models, or use a disposed Node. A generic recursive proxy over Drizzle and SQLite is not required to enforce that rule.

Both Node families already own a synchronous `readSelection` method. It checks the Node lifetime/publication and checks that the selection is declared by the Agent release, then calls the selection. Studio uses this method exclusively. An exhaustive search of the authored `packages/` TypeScript source found no consumer of the accompanying public `view.db` property. [Aggregate publication](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L1030), [Service publication](../../packages/core/src/ServiceAgentNode/ServiceAgentNode.ts#L1017), [Studio consumer](../../packages/studio/src/AgentSelectionBrowser.tsx#L85).

The real API problem is the unused `db` property. `IAgentNodeView` exposes `IModelQueryDb`, which includes both relational queries and `$client`. `$client` is a native SQLite connection capability, including execution, statement access, connection closure and mutable observation hooks. The proxy then tries to turn that large capability into a read-only expiring one by recognizing method/property names at runtime. [View type](../../packages/core/src/AggregateAgentNode/types.ts#L16), [query DB type](../../packages/core/src/drizzle/types.ts#L225), [native client type](../../packages/core/src/drizzle/types.ts#L20), [proxy implementation](../../packages/core/src/AggregateAgentNode/fenceAgentNodeRead.ts#L8).

### What must remain

The visibility boundary before authoritative commitment is justified by actual synchronous callbacks. `SqliteSession.transaction` commits, publishes captured transactions and flushes table observations before returning. `flushTableChanges` calls listeners directly. A retained read function could otherwise run from one of these listeners after the authoritative transaction but before the separate optimistic rebuild. The Node must make the view unavailable before the first transaction and restore it only after a successful rebuild. Rebuild failure must leave the view unavailable. [Transaction settlement](../../packages/core/src/drizzle/SqliteSession.ts#L117), [synchronous table listeners](../../packages/core/src/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts#L226), [Aggregate reconciliation](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L969), [Service reconciliation](../../packages/core/src/ServiceAgentNode/ServiceAgentNode.ts#L956).

The authored selection path itself is synchronous: `selection.all` prepares a query, calls `.all()`, then synchronously decodes and encodes its results. The Node can pass its private database to this method after checking availability. It does not need to publish a database handle or recursively wrap prepared queries to execute this path. [Selection execution](../../packages/core/src/models/make/makeQueryDbVersion.ts#L298).

Terminal revocation and disposal also need to revoke reads immediately. They already set the view to null and change the guard state. These facts are independent of the proxy's implementation. [Aggregate revocation/disposal](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L177), [Service revocation/disposal](../../packages/core/src/ServiceAgentNode/ServiceAgentNode.ts#L168).

### The proxy does not establish its advertised general guarantee

1. **Property reflection bypasses it.** The only trap is `get`. `Object.getOwnPropertyDescriptor(view.db, '$client')?.value` retrieves the original client because `makeSqliteDrizzle` installs `$client` as an own property and the proxy does not implement `getOwnPropertyDescriptor`. This route avoids the lifetime check and the write-name denylist. Likewise, writes to properties are not trapped. This is an implementation defect in the claimed capability, not evidence that current Studio code takes this route. [Proxy traps](../../packages/core/src/AggregateAgentNode/fenceAgentNodeRead.ts#L54), [client installation](../../packages/core/src/drizzle/make/makeSqliteDrizzle.ts#L58).
2. **Promise-returning relational execution escapes its recursive wrapping.** The proxy invokes methods with the original object as `this`. Drizzle's relational `async execute()` internally creates a prepared query execution thenable and returns a native Promise. Native Promises have none of the query methods in the proxy's recognition list and leave `wrap` unchanged. The prepared query's synchronous SQL callback can consequently execute during later Promise assimilation without another Node guard. This follows from the installed dependency's source; it was not exercised in a runtime check. [Original-object invocation and recognition](../../packages/core/src/AggregateAgentNode/fenceAgentNodeRead.ts#L33), [installed relational execution](../../packages/core/node_modules/drizzle-orm/sqlite-core/async/query.js#L25), [deferred prepared execution](../../packages/core/node_modules/drizzle-orm/sqlite-core/async/session.js#L140), [thenable callback](../../packages/core/node_modules/drizzle-orm/sqlite-core/async/session.js#L13).
3. **Its documentation overstates publication isolation.** The file says reads expire with one Node publication, but `stage` and admission updates call `publish()` without creating another view/epoch. The database is mutable within one exposed view; it is not a snapshot of one publication. A guard against unavailable/disposed state is useful. Claiming snapshot-like per-publication isolation is misleading. [Header](../../packages/core/src/AggregateAgentNode/fenceAgentNodeRead.ts#L3), [staging publication](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L567), [submission publication](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L366), [view epoch allocation](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L1030).

### Recommended change

Remove `IAgentNodeView.db`, delete `fenceAgentNodeRead`, and execute `selection.all(this.props.db, identity)` behind the existing synchronous `readSelection` availability and declared-selection checks. Keep the reconciliation/disposal guard and synchronous withdrawal before authoritative commit. This removes the unused database capability, its method denylist, its recursive WeakMap/Proxy graph and its dependency on Drizzle/native implementation details. The `MODELS` generic on `IAgentNodeView` would also become unnecessary because only `db` currently uses it. [View type](../../packages/core/src/AggregateAgentNode/types.ts#L16), [Aggregate narrow adapter](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L1030), [Service narrow adapter](../../packages/core/src/ServiceAgentNode/ServiceAgentNode.ts#L1017).

Keep the current small epoch/lifetime check so a retained selection reader stays invalid after replacement. Removing the unused database capability does not require relaxing that behavior or redesigning read identity. Describe this as a guarded live view, rather than an immutable snapshot of each store publication.

## Audit limits

This section traces `fenceAgentNodeRead`, both Agent Node view lifecycles, the sole Studio selection consumer, authored selection execution and SQLite commit observation. It does not conclude that transaction-lifetime fencing or connection-generation guards elsewhere are unnecessary; those mechanisms protect different ownership intervals and must be judged against their own callers. Findings about the wider Agent implementation are added separately below.


## Other concrete removal and simplification candidates

The wider scan covered the Agent browser stack, shared Node/SQLite runtime and Worker queue/subscriber helpers. Application behavior and Explorer were not verified. The following are current source findings, not implemented changes.

### 1. Orphaned committed-SQL statement capture — remove

`onCommittedTransaction` has no callback assignment or subscriber in authored package source. Both browser memory SQLite and Native SQLite initialize it to null. Nevertheless, the connection tracks statement-capture stacks and publication queues, transaction/savepoint capture lifecycle, parameter cloning/freezing and SQL classification for this observer.

- [makeCommitObservation.ts:3-75](../../packages/core/src/drizzle/makeCommitObservation.ts#L3-L75) — defines statement batches, capture stacks, queued observer delivery and parameter copies.
- [executeStatementRows.ts:26-32](../../packages/core/src/drizzle/executeStatementRows.ts#L26-L32) and [43-71](../../packages/core/src/drizzle/executeStatementRows.ts#L43-L71) — classify SQL for capture, allocate captured batches and dispatch them.
- [SqliteSession.ts:115-131](../../packages/core/src/drizzle/SqliteSession.ts#L115-L131) and [186-201](../../packages/core/src/drizzle/SqliteSession.ts#L186-L201) — maintain capture lifecycle across transactions/savepoints.
- [browser initializer](../../packages/core/src/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts#L252) and [Native initializer](../../packages/native/src/openNativeSqlite.ts#L138) — set the callback to null.

Delete the statement-capture feature, its callback/types and capture plumbing. Preserve execution/transaction depth and postcommit table-change flushing: current live queries use those notifications. [flushWhenSettled](../../packages/core/src/drizzle/makeCommitObservation.ts#L76-L83) is a separate responsibility from retained SQL batches.

### 2. Agent transport context and extra classification state — simplify

`synchronizeAgentNode` takes the full Session execution capability only to obtain an application Context and provide it to its socket-owner Effect. Its socket work reads no application service; it uses injected JavaScript callbacks, Queue/Deferred, timers and WebSocket. The opener/Node evaluator still need application execution context, but this transport does not need to capture it again. [Context capture](../../packages/browser/src/agentNodeBrowser/synchronizeAgentNode.ts#L36-L40), [provision](../../packages/browser/src/agentNodeBrowser/synchronizeAgentNode.ts#L226).

The transport's `generation`/`epoch` is redundant in this particular serial loop. Each `connect` is scoped; its finalization awaits `attempt.stop()` before the next connection attempt begins. `makeSocketAttempt` already retires itself, and the parent AbortSignal invalidates the owner. Preserve those controls and remove this extra generation mechanism. This does not establish that ordinary Node generations are redundant; their attachment/reset lifetimes differ. [serial attempts](../../packages/browser/src/agentNodeBrowser/synchronizeAgentNode.ts#L200-L223), [attempt ownership](../../packages/browser/src/agentNodeBrowser/synchronizeAgentNode.ts#L59-L80), [makeSocketAttempt](../../packages/browser/src/Node/makeSocketAttempt.ts).

`terminal` is also redundant under the current execution paths: synchronous protocol/Node exceptions become defects, already rejected by `Cause.hasDies`; every typed retryable transport failure explicitly occurs with `terminal = false`. Keep the explicit failure-code/offline policy and Cause classification; remove the toggled flag. [retry classification](../../packages/browser/src/agentNodeBrowser/synchronizeAgentNode.ts#L42-L57), [event handling and sends](../../packages/browser/src/agentNodeBrowser/synchronizeAgentNode.ts#L143-L195).

### 3. A one-method startup handle — inline its wait

Synchronization returns `{ awaitFirstUsableReplay() }`, and both bootstraps immediately invoke it. Await that Deferred inside synchronization after starting its scoped socket owner and return void. This preserves the exact resource scope without another returned-handle concept. [return](../../packages/browser/src/agentNodeBrowser/synchronizeAgentNode.ts#L226-L227), [Aggregate caller](../../packages/browser/src/bootstrapAggregateAgentSession.ts#L46-L50), [Service caller](../../packages/browser/src/bootstrapServiceAgentSession.ts#L46-L50).

### 4. Session readiness mirroring — remove the duplicated live state

Both bootstraps subscribe to `Node.writable` solely to republish Session `status` as `ready` or `initializing`. A synchronous reconciliation consequently withdraws readiness in two stores even though the Session owns no command/resource availability facts. Studio already reads Node writable/connection/view and reads Session state for its Node and terminal failure.

Set lifecycle readiness after the first usable replay; keep subsequent connection and write availability in Node state. This explicitly makes Agent Session status describe initialized lifecycle, while `Node.writable` describes current command availability. It is a small API-semantic clarification, so update documentation and consumers during that cleanup. [Aggregate mirroring](../../packages/browser/src/bootstrapAggregateAgentSession.ts#L30-L45), [Service mirroring](../../packages/browser/src/bootstrapServiceAgentSession.ts#L30-L45), [Studio Node state](../../packages/studio/src/AgentSelectionBrowser.tsx#L85-L93), [Session lifecycle/failure observation](../../packages/studio/src/AgentPreview.tsx#L18-L34).

### 5. Duplicate caller-supplied Agent identity — derive it from the declaration

Agent Session inputs require `agentName`, but factories use it only to check equality with the release's `agentName`. Bootstrap uses the declaration's identity, and Studio passes that same name again. Drop the redundant construction input; retain all actual declaration/backend identity checks. [input types](../../packages/core/src/agent/types.ts#L82-L93), [Service inputs](../../packages/core/src/agent/types.ts#L133-L142), [Aggregate factory check](../../packages/browser/src/makeAggregateAgentSession.ts#L20-L23), [Service factory check](../../packages/browser/src/makeServiceAgentSession.ts#L20-L22), [derived bootstrap identity](../../packages/browser/src/AggregateAgentNode/AggregateAgentNodeSynchronization.ts#L41-L48).

### 6. Duplicate names and empty factory layers — remove

`makeNodeSubscriptions.replaceSnapshot()` and `publish()` have identical bodies. Replace callers of the former with `publish` and delete the alias. Keep reset pausing, cancellation and captured-view consistency. [identical methods](../../packages/core/src/Node/makeNodeSubscriptions.ts#L161-L166).

The fanout subscriber's `catchup` factory captures nothing and only forwards reconstructed props to `runFanoutCatchup`. `subscribe` has another empty factory layer. Their parent repeats a long generic argument list merely to construct those wrappers. Call `runFanoutCatchup` directly and make subscription a normal procedure accepting the bound options. [catchup](../../packages/system-worker/src/makeFanoutSubscriber/catchup.ts#L6), [subscribe](../../packages/system-worker/src/makeFanoutSubscriber/subscribe.ts#L8), [parent construction](../../packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts#L133-L154).

### 7. Unused alternate Worker invocation policies — intentional API cleanup

Every actual in-repository Repo/queue construction supplies `runWorkerInvocation` and `makeWorkerRpcEnvelope`, yet queue/Repo factories still support missing policies and maintain fallback execution/encoding branches. Bind or require the one Worker policy and remove those branches. This is an intentional public API cutover for `makeMigratableDORepo`, not an incidental edit hidden in the Agent cleanup.

- [makeFanoutQueue optional policies](../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L132-L134), [alternate recovery execution](../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L349-L362), [optional encoding](../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L425-L427).
- [makeOutboxQueue props](../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L44-L45), [alternate execution](../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L312-L331).
- [makeMigratableDORepo options](../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts#L121-L122), [fallback invocation/encoding](../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts#L353-L370).

## Extra work hidden inside shared helpers

`rebuildOptimisticResourcesTx` always rereads and serializes the entire rebuilt graph into an array. Both Agent Nodes discard that return value; ordinary `makeNodeOptimisticView` needs it for publication. Separate rebuilding from graph capture so Agents do not pay to construct an unused graph. Preserve any model validation currently performed by that scan when relocating it; this is not authorization to remove codec checks. [capture loop](../../packages/core/src/Node/rebuildOptimisticResourcesTx.ts#L38-L44), [Aggregate discards return](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L907-L962), [Service discards return](../../packages/core/src/ServiceAgentNode/ServiceAgentNode.ts#L895-L949), [ordinary caller uses return](../../packages/core/src/Node/makeNodeOptimisticView.ts#L35-L49).

Both Nodes' `publish()` reread/decode complete command rows, including retained payloads and exposed deltas, although public command state needs only ID/name/session index/final presence/failure. `outcomeIndex()` then rereads all rows and repeatedly calls `some` through the finalized producer prefix, producing quadratic work as lifetime history grows. Read the required projection and compute first-gap completion from one retained row set, without inventing another stored cursor or cache. [Aggregate publication/progress](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L1058-L1099), [Service publication/progress](../../packages/core/src/ServiceAgentNode/ServiceAgentNode.ts#L1045-L1086).

## Mechanisms with concrete current responsibilities

Do not indiscriminately delete every guard or journal-like table:

- **Authoritative baseline before optimistic reconstruction:** a later replay defect must not undo committed final evidence. Keep the separate transactions and publication withdrawal.
- **Exact input and producer positions:** an admission reply can fail after Chain admission committed. Uncertain transmission must retain the same ID/payload/position; a failure string alone cannot authorize deletion.
- **Distinct resource revocation and private SQL retirement:** a synchronous terminal observer may run while reconciliation still needs to publish newly committed command facts. `revoke()` leaves that internal opportunity; immediate `dispose()` would make `publish()` return early and forbid SQL reads. Removing it indiscriminately would recreate the previous failure-publication defect. [revoke/dispose](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L177-L197), [reconciliation catch](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L969-L1007), [publication disposal check](../../packages/core/src/AggregateAgentNode/AggregateAgentNode.ts#L1058-L1065).
- **Transaction lifetime fencing:** `makeTx`/`withSavepoint` execute authored Effects that can suspend and clean up after rollback. Retained transaction builders must not write afterward. `fenceTransaction` protects this real boundary, though its implementation can be reviewed separately. [fenceTransaction](../../packages/core/src/drizzle/fenceTransaction.ts#L23), [makeTx use](../../packages/core/src/drizzle/make/makeTx.ts#L72), [savepoint use](../../packages/core/src/drizzle/withSavepoint.ts#L42).
- **Scoped cancellation, ordered socket events, one in-flight admission, timeout ownership, durable recovery holds, and shared Node serialization/drain** have identified active callers and failure cases. The current evidence does not justify deleting them.

The common problem is supporting a larger capability or multiple state owners than current callers need, then adding machinery to keep them aligned. Start with removing the unused database capability, orphaned statement capture and Agent transport scaffolding. Keep Aggregate and Service entrypoints explicit; none of these recommendations needs overloaded APIs or an Actor refactor.
