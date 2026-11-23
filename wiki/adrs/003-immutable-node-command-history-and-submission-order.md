# Immutable Node history and Node-owned optimistic views

**Date:** 2026-10-06; amended 2026-10-27 and 2026-11-05
**Status:** Accepted; the connected browser storage identity clause is **Superseded** by [ADR 027](027-connected-browser-node-storage-upgrades.md). All other command-history and view-ownership decisions remain governing.
**Supersedes:** [ADR 002](002-browser-node-journals-and-worker-routing.md).
**Implementation:** [Plan 043](../archive/plans/043-plan-node-command-history.md); ordinary Node ownership cutover and its runtime verification in [Plan 234](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md). [Plan 244](../archive/plans/244-plan-transient-agent-nodes.md) replaces the direct Agent exception with transient AgentNodes; its scoped evidence does not independently verify ordinary Node behavior or earlier work.

## Context

Node append order, producer admission order and authoritative exposure order describe different facts. Rewriting a retained original after admission can reorder history and create false gaps. Copying every Node original/final phase into every attached replica additionally duplicates history, evaluation and reconciliation ownership.

## Decision

Ordinary AggregateNode and ServiceNode retain immutable original/final rows with distinct nodeIndex positions. An original retains its local sessionId/sessionIndex and allocated pushIndex; its canonical ID derives from nodeId/pushIndex, and a corresponding final retains that ID explicitly. Only originating originals allocate dense pushIndex; authoritative source continuity uses aggregateIndex or serviceIndex plus dispositionChainHash. Complete input equality governs original retries, and complete final equality governs redelivery. Exact retries allocate nothing. Both phases remain for the producer generation.

Keep AggregateNode's thirteen command columns, including local submission identity and each original's full claims. Keep ServiceNode's twelve command columns; complete claims reconstruct from its bound identity. Original rows retain sessionId/sessionIndex and leave the physical id column null; final rows retain id and leave the local submission columns null. Exact selected contract names/versions are validated before new original retention. Bound release/lock supplies repeated identity and contract facts. Aggregate standalone may contain different valid per-original claims and must never reconstruct those from the current attachment.

Keep seven-column Aggregate nodeMetadata and six-column Service nodeMetadata, exact singleton reads, nullable checkpoint pairs, command-derived append/producer maxima and first-gap outcomeIndex. Durable producer identity exists before a baseline. Resources and a present authoritative checkpoint commit atomically. Admission advances admittedThroughPushIndex independently; final evidence can establish private completion. A greater final position cannot skip an unresolved original.

Each Node additionally owns one rebuildable in-memory optimistic resource graph: authoritative resources plus its pending retained originals in Node order. Checked synchronous replay uses captured claims and staging time. Expected refusal leaves the original pending without speculative writes. The derived graph is neither a second durable history nor an authoritative outcome. A reconstruction defect withholds publication but cannot undo an already committed final/baseline.

An application-owned SharedWorker imports the same pure checked session definition used by tab staging and supplies independent projection dependencies. Exact release/lock and executable artifact identity are fenced before attachment. Connected executable worker names retain the library's sharedWorkerVersion and declaration/backend routing key. As amended by [ADR 027](027-connected-browser-node-storage-upgrades.md), migration-aware connected database and lease names instead use the complete authenticated sessionKey independently of the runtime hash, with Node-owned forward schema upgrades before readiness. Standalone's durable namespace depends on its bound key independently of sharedWorkerVersion. An exclusive namespace lease covers storage ownership. Native supplies the equivalent executable session definition and host-memory SQLite adapter. Standalone reuses its existing authoritative execution runtime.

Publish a coherent view containing optimistic resources, authoritative checkpoint, captured inclusive nodeIndex, exact owned-input coverage and compact applicable final resolutions. Recovery supplies the complete original with nullable known coordinates; the Node compares retained input and rejects conflicting or impossible evidence. Sample attachment interests inside the SQL capture gate. Deliver outside that gate and coalesce intermediate views while keeping unresolved interests. Duplicate handoff wakes publication even when no append position changed.

Return only sessionId/sessionIndex/nodeId/nodeIndex/pushIndex from local retention. A session records the Node allocation against its local submission to stop retries; this alone cannot remove its overlay. Canonical ID derives from nodeId/pushIndex once those coordinates are known. Atomic view installation transfers projection ownership, updates the matching local submission with final evidence, replaces metadata and replays only local uncovered originals. Empty delta and null private failure still resolve a command when final evidence exists.

Aggregate and Service session commands each have ten columns and one row per locally staged sessionIndex. They retain original payload/stagingOutcome, nullable nodeId/nodeIndex/pushIndex allocation, current inverseOperations and nullable final position/failure. They contain no foreign history, second phase, exposedDelta, per-final hash or repeated bound identity/version fields. Full input reconstructs from immutable local binding. Original payload/result/time survive final exposure for the replica lifetime.

Keep five-column Aggregate sessionMetadata and four-column Service serviceSessionMetadata. lastSessionIndex allocates local submissions transactionally; Aggregate additionally retains its durable sessionId, while the transient Service capability owns its sessionId. afterNodeIndex labels the installed Node view prefix; the authoritative checkpoint labels the baseline beneath optimism. Full reset clears local history; normal view replacement retains it.

### Transient Agent observers — Plans 249/151

AggregateAgentNode and ServiceAgentNode are explicit single-lifetime observation
owners. Each owns one main-thread memory SQLite connection, selected model rows,
a nullable owner-index/hash checkpoint pair and guarded read publication. Snapshot
and contiguous public delta application commit resources/checkpoint together in
one synchronous transaction. A checkpoint of zero is a valid installed baseline.
There is no originating journal, producer coordinate, duplicate baseline, local
optimism, behavior timer or private completion history.

Thin Agent Sessions own application execution/lifecycle and observe their current
Node, without another replica. readSelection validates lifetime, current view and
declared selection before reading the private database. Reconciliation withdraws
the old view before committing and publishes the replacement afterward. Reconnect
retains the same Node/checkpoint and observer ticket/resume identity; allowed
retries can retain a stale view. First validated replay publishes ready. Disposal
retires readers before joining transport and releasing the sole connection.

Automatic execution belongs to separate unversioned AggregateAgentNodeRepo and
ServiceAgentNodeRepo. ADRs 013/015 govern their materialization, one-shot attempts
and complete command delivery. Plan 151 supersedes Plan 244's Agent originating
input, optimism, producer/private-prefix and definitive-refusal reclamation rules.
Ordinary Actor/Standalone Node history, speculation and recovery remain unchanged.

## Consequences

For ordinary attached sessions, shared pending evaluation moves from every replica to one Node projection. Sessions remain immediately synchronous and can stage uncovered local work. Full view copying is the chosen initial publication mechanism; no performance improvement is claimed without measurement. Ordinary Node history remains explicitly readable on Node.history rather than hidden in replicas. AgentNodes publish guarded selected views for their mounted lifetime.

Remove phase-page subscriptions, full Node history import, old recovery partition arrays, shared reconciliation validator, per-tab shared-history replay, Aggregate/Service rewind modules and the generic non-executable connected worker. Preserve real network retry, identity/privacy, explicit replacement and close/drain boundaries.

Historical Plan 234 drafts used Node schema 17 and Native schema 6. The current hard cutover uses Node schema 22 and Native replica schema 11. Other changed fixed schemas retain their empty-storage policy; migration-aware connected browser Nodes have the scoped forward-upgrade lifecycle in [ADR 027](027-connected-browser-node-storage-upgrades.md). Its first adoption does not migrate pre-baseline runtime-hash stores. Browser local replicas are transient. Backend Repo/Chain storage and delivery remain unchanged by this ownership decision. Plan 234 records its current source, host and recovery evidence; this decision record does not replace those checks or close independent verification in earlier plans.

Historically, Plan 244 changed only transient Agent schemas and removed their direct-only pipelines and overloaded Agent branches. Its explicit Aggregate/Service Agent factories and staging helpers preserved exact release/application requirements. Backend wire/storage, broker credentials and ordinary Actor/Standalone APIs were unchanged by that amendment. Dedicated AgentNode runtime coverage was not added in that amendment under the no-new-tests boundary; source review and existing regressions were distinct evidence. That dated cleanup evidence did not independently verify Plans 227–234 or Shopping Plan 239; their own records govern current status.

[Plan 245](../archive/plans/245-plan-remove-unnecessary-agent-and-runtime-machinery.md) removes
unused Agent read and transport capabilities. Agent Sessions publish `ready` once after
first validated replay; Node `view` and `connection` own current observer availability
through reconnect and reconciliation. The SQL execution/outer-transaction settlement
barrier remains after dead statement capture is removed. No fixed schema changes or
ordinary Actor refactor result from this cleanup. Earlier deferred verification stays
with its original plans.
