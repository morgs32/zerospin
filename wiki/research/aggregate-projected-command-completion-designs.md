# Aggregate selected publication and private completion designs

**Interface update, 2026-10-18:** The source descriptions below record the earlier
`drainAfter` interface. Both queues now expose `producerLease` for durable
pre-production recovery and producer bookkeeping, with explicit caller `wake()`
after production. Lease release performs no scheduling. Awaited `drain()` retains
its acknowledgement contract. See the [implemented replacement](drain-after-explicit-queue-progress.md#implemented-replacement).

**Researched:** 2026-10-15 against the current working tree, including its existing uncommitted changes. Research/design only; no implementation, new tests or verification runners. This note distinguishes current behavior from alternatives. The original [table review](../reviews/storage-tables/aggregate-actor-version-repo-projected-command-outbox.md#L3-L7) recommends a nullable completion object only for AggregateActorVersionRepo's pending table; it does not settle the receiving Chain's physical schema.

## Finding

A separate completion table is a coherent design. The strongest place to normalize is **AggregateActorVersionChain**, where public selected history and private completion already have different indexed queries, disclosure rules and replay cursors. Keeping one complete publication envelope and one atomic receiving append does not require storing both facts in one physical row. Splitting the pending outbox is also possible, but its current reader only needs complete ordered deliveries; the pending table has no independent completion query to simplify. These are design conclusions from the source trace below, not a claim that another table is required.

The completion is not the canonical `outcome`. `outcome` is `{ result: Success | Failure, finalizedAt }`. The projected completion retains producing Node/session/full Origin plus nullable public failure, and the browser command exposes `id`, `commandName`, selected `delta`, position/hash and nullable failure. It does not contain the canonical success value or `finalizedAt`. A table named `commandCompletions` should retain exactly that private reconciliation fact rather than introduce a second canonical outcome store. Sources: [canonical outcome](../../packages/core/src/contracts/CommandOutcomeSchema.ts#L5-L16), [retained projection fields](../../packages/core/src/aggregateSession/aggregateProjectedCommandsTable.ts#L14-L30), [browser command construction](../../packages/core/src/aggregateSession/aggregateProjectedCommandsTable.ts#L42-L54).

## Current source trace

### 1. The projection commits complete pending publications

`AggregateActorVersionRepo` binds its outbox to its own database/key and wraps evaluated-command application in `projectedCommandOutbox.drainAfter`. The source receive operation returns after local application; selected-history append proceeds through the outbox. Recovery is armed before the producer callback and the producer's exit always wakes delivery. Sources: [bound outbox and receive](../../packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts#L44-L82), [recovery before production](../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L270-L295).

`applyEvaluatedCommandsTx` verifies a contiguous new `aggregateIndex`, applies model operations, verifies `dispositionChainHash`, calculates the selected transition and writes publication/head within its synchronous transaction. Repeated source positions cannot reapply resources. Refusals and commands with no selected change still advance the public position; an empty delta is meaningful. Sources: [source binding and producer validation](../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/bindProjectionCommand.ts#L21-L50), [application, hash and completion construction](../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L94-L157), [selected delta/outbox/head commit](../../packages/system-worker/src/aggregateProjection/commitProjectionTx/commitProjectionTx.ts#L65-L99), [synchronous transaction and rollback](../../packages/core/src/drizzle/make/makeTx.ts#L63-L98).

Private completion is emitted only when the source admitted command belongs to the precise actor version/path and has a complete producer tuple. Actor-path ownership uses encoded identity claims; disclosure later uses the entire original Origin. `failure` is copied only from an owned `outcome.result._tag === 'Failure'`. Null failure therefore has two meanings: owned success, or no owned completion. Sources: [identity and completion ownership](../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L69-L93), [tuple copied together](../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L128-L156), [canonical path identity](../../packages/system-worker/src/aggregateProjection/resolveActorIdentity/resolveActorIdentity.ts#L22-L65).

The pending table currently reuses only `aggregateProjectedCommandsTable.shape`; it does not inherit that table's canonical-ID or Node/push indexes. Publication reads by `aggregateIndex`, optionally bounded through a snapshot's captured position. Sources: [shape reuse](../../packages/system-worker/src/aggregateProjection/aggregateProjectionDbConfig.ts#L6-L18), [separate permanent indexes](../../packages/core/src/aggregateSession/aggregateProjectedCommandsTable.ts#L32-L39), [ordered bounded page](../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L192-L207).

### 2. AggregateActorVersionChain receives the whole message

`makeProjectedCommandOutbox` decodes each frozen pending row and invokes `appendProjectedCommands({ sourceKey: key, commands })` on the exact bound AggregateActorVersionChain. It does not recompute the delta or consult newer selected resources. `AggregateActorVersionChain` delegates to its `AggregateSessionChain` implementation. Sources: [frozen preparation and bound delivery](../../packages/system-worker/src/aggregateProjection/makeProjectedCommandOutbox.ts#L45-L79), [receiving wrapper](../../packages/system-worker/src/AggregateActorVersionChain/AggregateActorVersionChain.ts#L86-L103).

`appendProjectedCommands` is one synchronous transaction over the page. It requires structural equality of the complete source key, schema-valid messages, positive safe positions, contiguous new public positions, all-null or complete completion recipients, and an Origin kind/name/version matching the bound projection owner. A failure later in the page rolls back earlier inserts in the same page. Sources: [source key/decode](../../packages/system-worker/src/aggregateSessionChain/appendProjectedCommands.ts#L18-L61), [contiguity/recipient validation and insert](../../packages/system-worker/src/aggregateSessionChain/appendProjectedCommands.ts#L80-L124), [transaction failure rollback](../../packages/core/src/drizzle/make/makeTx.ts#L69-L98).

For a repeated `aggregateIndex`, receiving append decodes the retained row and compares **the entire message structurally**. A changed delta, failure, Node/push tuple, session or claims is a conflicting retry. Identical repeated messages succeed and do not produce another broadcast row. The permanent table also uniquely indexes admitted command `id` and `(completionNodeId, completionPushIndex)`. Sources: [immutable duplicate equality](../../packages/system-worker/src/aggregateSessionChain/appendProjectedCommands.ts#L63-L78), [new-row broadcast construction](../../packages/system-worker/src/aggregateSessionChain/appendProjectedCommands.ts#L115-L124), [permanent uniqueness](../../packages/core/src/aggregateSession/aggregateProjectedCommandsTable.ts#L32-L39).

### 3. Durable append precedes socket broadcast and local acknowledgement

`AggregateSessionChain.appendProjectedCommands` broadcasts the transaction's returned rows only after append commits. Socket delivery is best effort: it reads the durable connection lock, filters selected models, and sends one projected command; a per-connection exception closes that connection without undoing retained history. Live completion ownership requires equality of full Origin, session and Node. Only the owning connection sees the failure. Sources: [commit then broadcast](../../packages/system-worker/src/aggregateSessionChain/AggregateSessionChain.ts#L116-L121), [lock, ownership, filtering and per-connection error](../../packages/system-worker/src/aggregateSessionChain/AggregateSessionChain.ts#L56-L110), [explicit public model projection](../../packages/system-worker/src/filterAggregateBrowserCommand/filterAggregateBrowserCommand.ts#L14-L28).

The sender reads a successful RPC envelope before acknowledging the page; acknowledgement deletes exactly that delivered page's indices in a local transaction. Retained Chain rows survive deletion of pending Repo rows. Sources: [receipt before acknowledgement](../../packages/core/src/outbox/makeOutboxDelivery.ts#L286-L295), [exact page deletion](../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L216-L228).

Consequently, a lost append reply or failed local deletion retries the exact frozen envelope against immutable receiving equality. A socket send is not the durability condition for removing the Repo outbox. An identical append retry does not rebroadcast retained rows; recovery must use retained replay. These are consequences of the append/ack/broadcast code cited above, rather than three interchangeable meanings of completion.

### 4. Receiving history serves two independently moving cursors

`getBrowserCommands` selects the union of:

1. public commands with `aggregateIndex > afterAggregateIndex`; and
2. rows for the requested Node with `completionPushIndex > afterPushIndex`.

Both are bounded by `throughAggregateIndex` when supplied, ordered by public `aggregateIndex`, and collected until 64 selected outputs or end of history. SQL initially selects Node candidates; decoded session and full Origin equality decide ownership. Rejected historical candidates do not consume the output-page limit. Sources: [cursor contract](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L32-L77), [union candidate query](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L88-L142), [decoded ownership and historical candidate rejection](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L152-L178).

An old public history row may therefore be returned again **solely to recover private completion**. Its old public position does not advance public progress. New public positions must be contiguous; owned push positions advance independently and must be contiguous. The returned command carries the full old selected delta and nullable failure; no separate completion frame is constructed. Other callers' failures are redacted to null, while model deltas are filtered by the admitted lock. Sources: [public contiguity and browser construction](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L179-L218), [private contiguity/redaction](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L219-L237), [owned completion validation](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/validateNodeReplay.ts#L44-L50).

The returned `tip` is the maximum retained public position within the optional bound, independent of the 64 returned commands. Execution-only replay has no private Node context and cannot reveal a failure. Node recovery validates the requested private prefix before reading its page. Sources: [tip and replay modes](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L247-L325), [private-prefix validation](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/validateNodeReplay.ts#L14-L39).

### 5. `getResolvedThrough` needs private completion, not selected delta

`getResolvedThrough` queries rows for one Node through public position N, orders them by `completionPushIndex`, decodes each whole projected row, requires every row's session/full Origin to match the request, and validates `1, 2, ...` contiguity. It returns the contiguous count, never a maximum inferred from resource/public progress. It does not otherwise use the admitted command ID, name, selected delta or failure. This is the clearest current query supporting a separate retained completion relation. Source: [`getResolvedThrough`](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/aggregateSessionChain/getResolvedThrough.ts#L20-L63).

The current Node/push unique key is independent of session/claims, and `getResolvedThrough` treats a different session/Origin for that same Node as `node-recovery-caller-mismatch`. A split schema must preserve this identity rule unless the Node identity contract is deliberately redesigned. Sources: [uniqueness](../../packages/core/src/aggregateSession/aggregateProjectedCommandsTable.ts#L34-L38), [caller mismatch](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/aggregateSessionChain/getResolvedThrough.ts#L49-L59).

### 6. Snapshot correctness depends on both facts at the same position

`captureProjectionSnapshotTx` reads resources and the local materialization checkpoint together. `getSnapshot` then publishes pending rows through captured N, reads exactly Chain checkpoint N, compares its `dispositionChainHash`, and derives the requesting Node/session/Origin's private prefix only through N. Newer publication cannot relabel the captured graph. Sources: [local snapshot transaction](../../packages/system-worker/src/aggregateProjection/getSnapshot/captureProjectionSnapshotTx.ts#L10-L47), [publication/checkpoint/private-prefix ordering](../../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts#L80-L127), [exact checkpoint lookup](../../packages/system-worker/src/aggregateSessionChain/getCheckpoint.ts#L19-L37).

Because one append currently commits both facts, successful publication through N already proves private completion retention through N. If completions travel independently, a successful public checkpoint no longer proves that fact: `getResolvedThrough` might return a shorter prefix merely because the completion channel is late. That is a new acknowledgement/barrier problem, not an unavoidable consequence of using two SQL tables.

### 7. Reconnect closes the replay/live gap

Socket resume verifies the caller's public checkpoint/hash and, where present, issued Node identity. It replays bounded retained segments using both cursors, advances them independently, then performs the last read/send/live-state transition synchronously so append/broadcast cannot interleave between final replay and live enrollment. Sources: [resume identity/checkpoint](../../packages/system-worker/src/aggregateSessionChain/onMessage/replayAggregateSocketCommands.ts#L53-L96), [two-cursor replay](../../packages/system-worker/src/aggregateSessionChain/onMessage/replayAggregateSocketCommands.ts#L97-L138), [synchronous transition to live](../../packages/system-worker/src/aggregateSessionChain/onMessage/replayAggregateSocketCommands.ts#L162-L195).

Physical table normalization can remain hidden behind this interface. Splitting delivery protocols would have to reproduce the current public/private coverage guarantee at that synchronous transition.

### 8. Browser final-command identity includes the private failure

The downstream ownership path is concrete: `AggregateNodeSynchronization` decodes serialized socket commands and serially invokes the SharedWorker's `AggregateNode.receiveCommand`; that method commits Node journal retention, resource changes, local settlement and cursors in one transaction before publishing subscriptions. The Node subscription reads retained command pages; the tab's `makeAggregateReplicaReceiver.importRecords` invokes `importAggregateNodeCommands`, which applies ordered occurrences, rewinds optimism once, installs new confirmed deltas/checkpoints and replays remaining pending commands inside the tab transaction. Only after the import commits does the receiver publish progress and call the failure observer. Sources: [socket decode/serial delivery](../../packages/browser/src/AggregateNode/AggregateNodeSynchronization.ts#L384-L401), [Node receive and blocked error state](../../packages/core/src/AggregateNode/AggregateNode.ts#L649-L672), [Node subscription reader](../../packages/core/src/AggregateNode/AggregateNode.ts#L108-L143), [tab import and observation](../../packages/browser/src/sessionReplica/makeAggregateReplicaReceiver.ts#L81-L145), [transaction and pending replay](../../packages/core/src/aggregateSession/importAggregateNodeCommands.ts#L55-L118), [confirmed resource application](../../packages/core/src/aggregateSession/applyOrderedAggregateOccurrencesTx.ts#L227-L294), [single rewind for ordered page](../../packages/core/src/aggregateSession/applyOrderedAggregateOccurrencesTx.ts#L328-L354).

An owned projected command reaches `retainAggregateFinalTx`, which looks up an existing final occurrence by public position or admitted command ID and requires structural equality of the entire retained browser command, including `failure`. A previously retained command with `failure: null` and a later version with the real refusal are conflicting final commands. New final retention writes the command and can advance `outcomeIndex` by finding contiguous local submissions whose admitted command IDs already have finals. Sources: [exact final equality](../../packages/core/src/AggregateNode/retainAggregateFinalTx.ts#L50-L65), [final insert](../../packages/core/src/AggregateNode/retainAggregateFinalTx.ts#L99-L109), [private prefix advancement](../../packages/core/src/AggregateNode/retainAggregateFinalTx.ts#L118-L145).

The tab's `applyOrderedAggregateOccurrencesTx` separately compares retained failure and selected delta for duplicate commands. `makeSessionFailureObserver.observeCommand` removes the originating-command association when the first observed final has null failure. A later separate refusal would therefore require a deliberate protocol/state redesign even if duplicate equality were relaxed. Sources: [tab duplicate equality](../../packages/core/src/aggregateSession/applyOrderedAggregateOccurrencesTx.ts#L120-L141), [failure observation](../../packages/browser/src/Node/makeSessionFailureObserver.ts#L49-L62).

Concrete counterexample for an independently delivered completion stream: a submitted command fails; public delivery first supplies the owning Node a final with `failure: null`; Node retention settles its admitted command ID and may advance the private cursor; the tab discards failure-observation association. Later delivery of that same public command with the private failure conflicts with the already immutable final. Separate SQL tables under one append do not create this counterexample because the owning frame is still constructed from one complete committed logical publication.

`dispositionChainHash` cannot replace complete-envelope equality here. Its preimage includes only previous hash, position, admitted command ID and `outcome.result._tag`; it excludes failure body, selected delta, recipient and claims. Source: [disposition tuple](../../packages/core/src/contracts/dispositionChainHash.ts#L5-L17).

### 9. Fresh browser baseline and agent recovery are different consumers

A fresh AggregateNode baseline requires `resolvedThrough === 0`, and browser replacement capture requests `.snapshot(null)`. Existing browser reconnect instead resumes retained Node command rows using its public/private cursors. A nonzero snapshot private prefix must not be described as the ordinary browser-baseline restoration mechanism. Sources: [baseline requirement](../../packages/core/src/AggregateNode/AggregateNode.ts#L286-L305), [fresh/replacement snapshot request](../../packages/browser/src/AggregateNode/makeAggregateWorkerRuntime.ts#L124-L150), [socket resume cursors](../../packages/system-worker/src/aggregateSessionChain/onMessage/replayAggregateSocketCommands.ts#L97-L138).

Agent bootstrap is a concrete consumer of the snapshot's private prefix. `getAgentBootstrap` captures the snapshot, then requests only historical owned completions through the snapshot's public position until its `resolvedThrough` is recovered; the `outcomes` array still contains projected commands, not canonical outcome objects. `connectAgentSession` uses `nodeId: sessionId`, checks that recovery length equals the snapshot prefix, initializes the replica with those commands and observes them before connecting its socket. Sources: [bounded bootstrap recovery](../../packages/system-worker/src/aggregateProjection/getSnapshot/getAgentBootstrap.ts#L33-L65), [agent request and prefix check](../../packages/browser/src/agentSession/connectAgentSession.ts#L100-L135), [initialize and observe](../../packages/browser/src/agentSession/connectAgentSession.ts#L150-L161).

## Design A: one pending envelope with nullable completion

This is the original review's modest option: keep one pending row per public position, with five required public columns and one nullable completion object. The object groups Node, push position, session, full claims and nullable failure. Derive actor kind/name/version from the actor-bound owner. Receiving history and browser transport can remain unchanged. Source for the existing proposal: [review's recommended model and expansion](../reviews/storage-tables/aggregate-actor-version-repo-projected-command-outbox.md#L50-L88).

**Interface and invariant:** producers deliver one complete message per public position, one local resource/outbox/head transaction, one remote append/ack. A null object means no private completion; a present object contains a complete recipient and owned failure or owned success. These are already the producer's supported branches, and grouping makes the conditional fact explicit. Sources for current producer branches: [owned failure construction](../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L79-L102), [private fields copied together](../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L128-L156).

**Depth/locality:** good for pending publication because preparation does not query private fields. It removes invalid mixed-null combinations in that table without creating a second lifecycle. It does not simplify permanent private-history scans; putting the same JSON object into Chain history would obscure fields that currently have a real index and query responsibility. Sources for that difference: [outbox read](../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L192-L207), [history index](../../packages/core/src/aggregateSession/aggregateProjectedCommandsTable.ts#L34-L38), [private history query](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/aggregateSessionChain/getResolvedThrough.ts#L26-L37).

The repository's table-index declaration accepts named shape columns, not JSON expressions; `makeTable` verifies that each indexed name exists in the shape. Extending nullable completion JSON to retained history therefore does not preserve the current Node/push index by itself. It would need expression-index support or repeated indexed scalar fields. This is a reason to keep the pending and retained representations independently designed, not a proposal to expand index infrastructure. Sources: [index declaration](../../packages/shapes/src/types.ts#L247-L258), [column-name validation](../../packages/shapes/src/makeTable.ts#L83-L98).

## Design B: one publication interface, two retained relations

This alternative normalizes storage while preserving a small external interface. Keep one complete pending publication envelope in AggregateActorVersionRepo. Inside AggregateActorVersionChain, atomically retain:

```ts
// Conceptual schema only; no implementation or migration is proposed here.
projectedCommands = {
  aggregateIndex, // primary key, contiguous public order
  dispositionChainHash,
  id, // unique canonical admitted command ID
  commandName,
  delta,
};

commandCompletions = {
  aggregateIndex, // primary key; exactly one existing public row
  nodeId,
  pushIndex,
  sessionName,
  claims, // complete original actor claims, not path-only claims
  failure, // nullable; present completion + null means success
};
// Unique (nodeId, pushIndex); actor kind/name/version come from bound owner.
```

No admitted command ID/name/hash/delta is repeated in the completion relation. `aggregateIndex` links a completion to the immutable public command. A present completion row replaces four coupled nullable recipient columns; absent row means no completion owned by this view. This is a proposed representation of the current identity and uniqueness facts, grounded in [current fields/indexes](../../packages/core/src/aggregateSession/aggregateProjectedCommandsTable.ts#L14-L39) and [bound owner validation](../../packages/system-worker/src/aggregateSessionChain/appendProjectedCommands.ts#L102-L113).

The caller still knows only a complete publication and the existing recovery operations:

```ts
yield * history.appendProjectedCommands({ sourceKey: key, commands });
const checkpoint = yield * history.getCheckpoint({ aggregateIndex: capturedN });
const resolvedThrough =
  yield *
  history.getResolvedThrough({
    nodeId,
    sessionName,
    origin,
    throughAggregateIndex: capturedN,
  });
const replay =
  yield *
  history.getBrowserCommands({
    afterAggregateIndex,
    nodeId,
    afterPushIndex,
    definition: { name: sessionName, origin, lock },
  });
```

These are existing operations; the sketch does not add a port, factory or forwarding layer. Their implementations change as follows:

- **Atomic append:** validate one logical envelope; insert its public row and optional private row in the same synchronous transaction; return success only after both commit. Broadcast follows commit. The caller never sequences separate public/completion writes.
- **Sealed absence:** successful public-row append seals either its one completion or its absence in that same transaction. There is no later `insertCompletion` operation, `hasCompletion` flag or separate completion-publication watermark. Absent completion is a final property of that immutable logical publication, not evidence of an unfinished second channel.
- **Immutable retries:** read/reconstruct the public row plus optional completion and compare the entire logical envelope. Comparing only the public row would permit a retry to alter/erase a private refusal or recipient. An absent completion and a present successful completion remain different facts.
- **Private prefix:** query only `commandCompletions`, bounded by its `aggregateIndex`, ordered by `pushIndex`; preserve complete session/claims checks and contiguous validation. It no longer decodes selected resource payloads merely to count a private prefix.
- **Replay:** select the union of missing public positions and owned completion positions, ordered by public `aggregateIndex`; join the immutable public row when a completion alone qualifies. Emit the existing browser command and redact private failure unless the full recipient matches. The browser still receives one command stream.
- **Snapshot and live join:** retain the existing captured N, exact checkpoint/hash verification, through-N private prefix and synchronous replay/live transition. Two local relations create no remote interleaving when their append is one transaction.

These requirements follow from [current append equality/order](../../packages/system-worker/src/aggregateSessionChain/appendProjectedCommands.ts#L63-L124), [private prefix](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/aggregateSessionChain/getResolvedThrough.ts#L26-L61), [union replay](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L95-L141), [snapshot coverage](../../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts#L80-L116) and [live join](../../packages/system-worker/src/aggregateSessionChain/onMessage/replayAggregateSocketCommands.ts#L162-L195).

**Error modes:** source mismatch, malformed message, public gap, immutable-message conflict, duplicate admitted ID, reused Node/push position, private identity mismatch and private-prefix gap retain their current meanings. New internal corruption to detect is an orphan completion or a completion missing from a supposedly retained complete envelope. A foreign-key/primary-key relation and atomic append should make ordinary writes unable to create the former; complete-envelope retry equality detects the latter. There is no new user-visible partial-publication state.

**Dependencies:** delta filtering, claims comparison and envelope validation are in-process; the two SQLite relations and transaction are local durable storage; AggregateActorVersionRepo -> AggregateActorVersionChain RPC is remote but owned. Existing invocation/RPC envelopes provide the production adapter. WebSocket connections are a separate best-effort delivery adapter after durable commit. No true external dependency is introduced. Evidence: [bound RPC](../../packages/system-worker/src/aggregateProjection/makeProjectedCommandOutbox.ts#L65-L79), [local append](../../packages/system-worker/src/aggregateSessionChain/appendProjectedCommands.ts#L18-L26), [post-commit socket loop](../../packages/system-worker/src/aggregateSessionChain/AggregateSessionChain.ts#L56-L121).

**Depth/locality:** the argument for this design is explicit relational ownership of the indexed private fact. Callers retain one append and the recovery operations they already need; only AggregateSessionChain learns the two-table representation, joins and duplicate reconstruction. Private-prefix code becomes independent of resource-delta encoding. The deletion test favors keeping normalization inside the history module: removing that module would spread atomic append, duplicate equality, disclosure and replay merging across callers. A separate generic completion abstraction with one concrete use would add indirection without demonstrated variation.

The counterargument is substantial: private completion remains an immutable optional extension of the same public publication, with the same append order and retention lifetime. One row has legitimate locality: one insertion, one complete-row equality check and the existing ordered OR scan. Two tables add writes, joins and an absence/presence relationship that must remain sealed. Favoring the separate relation is a data-model judgment based on the independent indexed reader, not a correctness requirement or measured performance result. Sources for the one-row advantages: [append and equality](../../packages/system-worker/src/aggregateSessionChain/appendProjectedCommands.ts#L63-L124), [ordered OR scan](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L95-L141).

## Design C: split the pending tables but keep one publication/ack

AggregateActorVersionRepo could instead have `projectedCommandOutbox` for public rows and `commandCompletionOutbox` for optional recipient/failure rows, both keyed by `aggregateIndex`. The resource transaction writes both plus the materialization head; queue preparation joins them into one frozen message; receiving append remains atomic; local acknowledgement deletes both exact page sets in one transaction.

This preserves crash semantics if those requirements hold. The benefit is relational absence/presence instead of nullable JSON. The cost is a second producer/acknowledgement relation and joined pending reads without an existing independent completion query. Current pending-table operations use only public order; the private-indexed workload occurs after delivery. Sources establishing that distinction: [pending shape](../../packages/system-worker/src/aggregateProjection/aggregateProjectionDbConfig.ts#L8-L11), [pending read/delete](../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L192-L228), [receiving private query](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/aggregateSessionChain/getResolvedThrough.ts#L26-L37).

If private completion normalization is the objective, Design B earns its extra relation where the responsibilities actually diverge. Design C can accompany it if relational storage is preferred consistently, but a second outbox queue/RPC is not implied by a second local table.

## Separate completion delivery or owner: a materially different protocol

A completion-only channel could reduce retransmission of old selected deltas and give private completion an independent retention policy. Those benefits are prospective: current recovery returns full projected commands for both reasons and no completion TTL/consumer-acknowledged deletion mechanism exists in the inspected AggregateSessionChain schema/readers. Sources: [same replay command construction](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L190-L237), [current retained tables](../../packages/system-worker/src/aggregateSessionChain/aggregateSessionChainDbConfig.ts#L7-L24).

It also creates real work: prove completion coverage through a captured public N; handle public delivery preceding completion, completion preceding required resources, and reconnect joining both streams; define whether a failure event may settle an optimistic command before its public checkpoint is installed. An independent completion Durable Object cannot participate in the current synchronous history transaction. The requirement to solve those races follows from the current [snapshot ordering](../../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts#L80-L116) and [replay/live join](../../packages/system-worker/src/aggregateSessionChain/onMessage/replayAggregateSocketCommands.ts#L162-L195). This alternative should be evaluated only for a concrete independent lifetime or routing requirement, not as a prerequisite for normalization.

## Alternative: recover private completion from AggregateVersionChain

Another design can remove local private completion copies entirely: derive them on demand from the exact evaluating release's AggregateVersionChain. Current `IEvaluatedCommand` history retains canonical admitted `id`, full Origin, Node/session/push tuple, release-local `outcome`, `dispositionChainHash` and operations before projection delivery. AggregateVersionChain can read one evaluated command by public position and has bounded ordered pages used by its fanout. Sources: [complete retained evaluated fields](../../packages/system-worker/src/AggregateVersionChain/evaluatedAggregateCommand.ts#L45-L67), [append before fanout delivery](../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L185-L218), [bounded source pages](../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L164-L182), [single-position read](../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L222-L245).

This is feasible without a distributed transaction: the source fact is already immutable when the projection receives it. A proposed reader could recover only the immutable prefix through captured N, verify the same release/position/hash, reproduce actor-path ownership and compare full claims/session before disclosure. It would still join the locally retained selected delta to construct the current owning browser command, or deliberately redesign that command protocol. Duplicate equality for private facts removed locally would likewise require source validation. These are design inferences from the existing source authority and consumers, not current behavior.

The tradeoff is locality and availability. Private replay, snapshot prefix recovery and failure recovery become dependent on upstream reads rather than the receiving Chain's self-contained history. The current source table has no Node/push index: a working design could scan bounded source pages, or add a purpose-built bounded reader/index for efficient private recovery. No performance claim is made. Source: [source table/index declaration](../../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts#L5-L10).

The source must be the exact **AggregateVersionChain**, not AggregateChain's original `outcome`. Replay materializes the receiving release's own program and constructs that release's result/hash; AggregateChain records the original outcome separately. Replacing release-local failures with the original outcome would change behavior when releases evaluate the same admitted command differently. Sources: [receiving-release replay](../../packages/system-worker/src/AggregateVersionRepo/replayCommands/replayCommand.ts#L31-L43), [release-local outcome construction](../../packages/system-worker/src/AggregateVersionRepo/utils/makeEvaluatedAggregateCommand.ts#L21-L42), [original outcome retention](../../packages/system-worker/src/AggregateChain/recordOriginalCommandOutcomeTx.ts#L96-L103).

## Invariants a redesign must retain

| Fact                       | Required ownership/ordering                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| Public selected transition | Frozen for each contiguous `aggregateIndex`; empty deltas retain individual positions.                    |
| Admitted command identity  | Canonical `id` survives projection and reconciles with the same immutable public position.                |
| Private completion         | Zero or one per public position; a complete Node/session/push/claims tuple with nullable owned failure.   |
| Full claims                | Preserve values outside actor-path identity; structural equality controls disclosure.                     |
| Receiving acknowledgement  | Proves both selected history and owned completion durably retained, before deleting pending delivery.     |
| Duplicate publication      | Same complete envelope succeeds; any public or private change conflicts.                                  |
| Snapshot                   | Graph/checkpoint captured together at N; exact history hash and private prefix read through N.            |
| Browser replay             | Public and private cursors advance independently; missing completion can require an older public command. |
| Storage responsibility     | Repos delete acknowledged pending rows; Chains retain history. Table normalization changes neither owner. |

Sources for these constraints are the source trace above. The intended ownership and exact-snapshot rules are also recorded in [ADR 013](../adrs/013-aggregate-delivery-history-and-projection-ownership.md#L93-L110) and [ADR 016](../adrs/016-aggregate-original-operations-and-external-work.md#L99-L118). Those ADRs govern ownership and ordering; neither establishes that the two facts must occupy one physical receiving-history row.

## Precise uncertainties and follow-up questions

- No performance comparison was run. Two-table normalization simplifies private-prefix decoding and separates indexes, but total write/read cost depends on selected-delta size, completion density, replay patterns and SQLite plans.
- Current receiving append validates complete recipient tuples but does not explicitly reject `failure !== null` when all recipient fields are null; the sole inspected producer emits null in that case. A new domain envelope should encode the producer invariant rather than preserve a malformed unsupported combination. Sources: [receiving recipient validation](../../packages/system-worker/src/aggregateSessionChain/appendProjectedCommands.ts#L83-L113), [producer failure branch](../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L79-L93).
- `getResolvedThrough` decodes the entire public row even though it needs private fields only. That coupling is observed; whether it is currently costly has not been measured. Source: [whole-row decode](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/aggregateSessionChain/getResolvedThrough.ts#L26-L47).
- Full Origin claims can differ while the actor path remains the same. Dropping non-path claims would change disclosure/recovery identity. Whether the product wants that identity rule changed is a separate design question; normalization can preserve it exactly. Sources: [path identity](../../packages/system-worker/src/aggregateProjection/resolveActorIdentity/resolveActorIdentity.ts#L22-L65), [full Origin equality](../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L163-L172).
- The proposal above is actor-specific. AggregateAgentVersionChain shares AggregateSessionChain implementation but has different Origin shape and no actor claims. Shared code does not authorize changing that separately scoped physical occurrence. Sources: [actor/agent owner union](../../packages/system-worker/src/aggregateProjection/resolveAggregateProjectionView.ts#L15-L26), [Actor versus Agent Origin](../../packages/core/src/contracts/OriginSchema.ts#L3-L13).
