---
title: Aggregate command staging and Node view installation
updated: 2026-11-05
sources:
  - path: packages/core/src/drizzle/SqliteSession.ts
    sha: 88f5a0e76390ee2fcccea93ea561a8c8ebaad369
    lines: 122-132
  - path: packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts
    sha: 2178c9038023be8425fce23ae14f290eca5b0b63
    lines: 44-86
  - path: packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts
    sha: 0f4dc4ad8b227e5c6cfbb9a2d9e91befb530c8cb
    lines: 43-117
  - path: packages/core/src/aggregateSession/evaluateAggregateSessionCommandTx.ts
    sha: a9ef7179b6233fb4ea4558aae075638070345248
    lines: 39-88
  - path: packages/browser/src/outbox/makeSessionCommandHandoff.ts
    sha: 4d29f96dccc60c7f28792c56b4981cbd31913614
    lines: 210-218
  - path: packages/core/src/serviceSession/stageServiceSessionCommandTx.ts
    sha: 9d0000ddadee4989290dc442af843a25f7b9c185
    lines: 40-99
  - path: packages/core/src/aggregateSession/stageCommand/makeAggregateSessionSubmission.ts
    sha: ddf495a0fe69366fe97254e8341a5c2979daf828
    lines: 47-53
  - path: packages/browser/src/stagedCommandJournal/makeStagedCommandJournal.ts
    sha: 9ddd46c2fafefff42dffc9e8c65fe824e70f271b
    lines: 29-122
  - path: packages/browser/src/stagedCommandJournal/recoverStagedCommands.ts
    sha: ae47fde6a6bdaa9359b7513b5c646b2b5f6ad7a8
    lines: 86-263
  - path: packages/browser/src/stagedCommandJournal/makeRecoveredCommandCoverage.ts
    sha: db8aa23219a274ff6c82bbc067567be2b68a4f24
    lines: 85-139
  - path: packages/browser/src/sessionReplica/makeAggregateReplicaReceiver.ts
    sha: fa6ef50c293d7da3069c2e7ef870ed0ed7780823
    lines: 241-257
  - path: packages/browser/src/sessionReplica/makeServiceReplicaReceiver.ts
    sha: 55e0f0acb53a372c6c0992bc75669b9271b559df
    lines: 246-262
  - path: packages/core/src/drizzle/makeCommitObservation.ts
    sha: 0ce43f5d8737045b284d3c17e1c5dc242540c890
    lines: 23-30
  - path: packages/browser/src/sessionReplica/openAggregateSessionReplica.ts
    sha: a31d782e9713d2ab9eab49f5107d4dac00069b14
    lines: 107-125
  - path: packages/browser/src/StandaloneNode/makeStandaloneAggregateConnection.ts
    sha: 3552f8169e911039620d98b3f9ade02814dde9e3
    lines: 229-230
  - path: packages/browser/src/sessionReplica/openServiceSessionReplica.ts
    sha: 149409b26016c361c2e42eb6a36cf5b30f50d97c
    lines: 87-104
  - path: packages/core/src/serviceSession/stageServiceSessionCommand.ts
    sha: aa52d8d43a124dce9f619e3a651280dfef4f6855
    lines: 40-69
  - path: packages/browser/src/sessionReplica/bindServiceReplicaCommands.ts
    sha: a2b06c79693468ec90a05b11671e13476f831151
    lines: 49-70
  - path: packages/core/src/aggregateSession/validateAggregateSessionCommand.ts
    sha: d122f53794837203ac80e044fb9b0d27bd2c6e11
    lines: 67-83
  - path: packages/browser/src/sessionReplica/makeServiceReplicaValidator.ts
    sha: f80dcb1e6625ba94b54099448123fffdcfd9de34
    lines: 45-69
  - path: packages/core/src/drizzle/make/makeTx.ts
    sha: a62ef32748a7c8c8ed784f0bb3104aba38f088bb
    lines: 116-169
  - path: packages/core/src/aggregateSession/make/makeAggregateSession.ts
    sha: 17841347904d6eecdd874834a4e32bebb22929ac
    lines: 38-90
  - path: packages/core/src/serviceSession/make/makeServiceSession.ts
    sha: 5ab03eb24d25adeff338256476137c6afd234556
    lines: 46-98
---

# Aggregate command staging and Node view installation

An attached Aggregate session stages immediate local optimism and retains one row per locally staged command. AggregateNode supplies shared pending optimism through coherent captured views. The Service path uses its own evaluation, installer and `serviceIndex`.

## Trigger

1. The application invokes a public command through the current initialized capability.
   - [`stageAggregateSessionCommand.ts:44-86`](../../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts#L44-L86) — checks readiness and returns the staged Aggregate command through the synchronous session boundary.

```mermaid
sequenceDiagram
    participant Application
    participant stageAggregateSessionCommand
    participant stageAggregateSessionCommandTx
    participant evaluateAggregateSessionCommandTx
    participant onCommandStaged
    participant journal as journal: IStagedCommandJournal
    participant makeSessionCommandHandoff
    participant AggregateNode
    Application->>stageAggregateSessionCommand: stageAggregateSessionCommand(...)
    stageAggregateSessionCommand->>stageAggregateSessionCommandTx: stageAggregateSessionCommandTx(...)
    stageAggregateSessionCommandTx->>evaluateAggregateSessionCommandTx: evaluateAggregateSessionCommandTx(...)
    evaluateAggregateSessionCommandTx-->>stageAggregateSessionCommandTx: checked result, operations, inverses, completedAt
    stageAggregateSessionCommandTx->>stageAggregateSessionCommandTx: SQL COMMIT; table observers may run
    stageAggregateSessionCommandTx->>onCommandStaged: onCommandStaged(...)
    onCommandStaged->>journal: journal.write(...)
    stageAggregateSessionCommandTx-->>stageAggregateSessionCommand: committed local command and stagingOutcome
    stageAggregateSessionCommand-->>Application: original staging result
    makeSessionCommandHandoff->>AggregateNode: node.accept(...)
```

## Annotated workflow steps

1. Check current initialization at the public staging entry.
   - [`stageAggregateSessionCommand.ts:49-66`](../../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts#L49-L66) — refuses staging when the session has no initialized capability.
2. Invoke staging with the initialized capability captured at entry.
   - [`stageAggregateSessionCommand.ts:69-79`](../../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts#L69-L79) — passes the entry capability, exact contract and optional callback into synchronous staging.
3. Evaluate and apply checked local operations inside the owning transaction.
   - [`stageAggregateSessionCommandTx.ts:43-55`](../../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts#L43-L55) — creates the transaction program and evaluates the command before retaining its Session index.
4. Return the original result, current inverses and captured staging time to retention.
   - [`evaluateAggregateSessionCommandTx.ts:39-88`](../../../packages/core/src/aggregateSession/evaluateAggregateSessionCommandTx.ts#L39-L88) — owns command construction, checked evaluation, result encoding and local application.
5. Commit optimistic resources and the local command; committed-table observers may run before the transaction call returns.
   - [`SqliteSession.ts:122-132`](../../../packages/core/src/drizzle/SqliteSession.ts#L122-L132) — settles SQL COMMIT or ROLLBACK before finishing table observation.
   - [`makeCommitObservation.ts:23-30`](../../../packages/core/src/drizzle/makeCommitObservation.ts#L23-L30) — publishes settled changes and isolates listener exceptions.
6. Outside the transaction, invoke the captured optional staging callback with the encoded original and null Node allocation fields.
   - [`stageAggregateSessionCommandTx.ts:106-115`](../../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts#L106-L115) — calls `onCommandStaged` only after transaction success and preserves the submission if it throws.
7. Attempt one synchronous browser journal write before returning from staging.
   - [`recoverStagedCommands.ts:86-95`](../../../packages/browser/src/stagedCommandJournal/recoverStagedCommands.ts#L86-L95) — binds the callback to the original Node incarnation's journal.
   - [`makeStagedCommandJournal.ts:41-53`](../../../packages/browser/src/stagedCommandJournal/makeStagedCommandJournal.ts#L41-L53) — writes the original with `localStorage.setItem` and contains storage/encoding failures.
8. Return the original typed local submission after the callback attempt.
   - [`stageAggregateSessionCommandTx.ts:106-117`](../../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts#L106-L117) — returns the committed submission independently of journal callback success.
9. Return local staging independently of subsequent Node retention, Chain admission and execution.
   - [`stageAggregateSessionCommand.ts:80-85`](../../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts#L80-L85) — returns the local result and reports recognized staging refusal at the public boundary.
10. Hand off immutable input without removing the local overlay on the retention reply.
    - [`makeSessionCommandHandoff.ts:210-218`](../../../packages/browser/src/outbox/makeSessionCommandHandoff.ts#L210-L218) — waits for an attachment, runs old-session recovery, then drains current-session delivery.

Aggregate command construction is Actor-specific. `evaluateAggregateSessionCommandTx` obtains Actor name/version from the bound session definition and full encoded claims from the initialized capability. `makeAggregateSessionSubmission` writes scalar `kind: 'actor'` and flat Actor fields into the original command. It creates no runtime Actor origin or Actor/Agent session union; the selected declaration lock keeps its separate authored shape.

- [`evaluateAggregateSessionCommandTx.ts:48-64`](../../../packages/core/src/aggregateSession/evaluateAggregateSessionCommandTx.ts#L48-L64) — supplies the definition's Actor name/version and initialized `encodedClaims` to command construction.
- [`makeAggregateSessionSubmission.ts:47-53`](../../../packages/core/src/aggregateSession/stageCommand/makeAggregateSessionSubmission.ts#L47-L53) — writes flat Actor fields and the scalar command kind.

## Synchronous staged-command journal

Connected Aggregate and Service replicas, and Standalone Aggregate replicas,
install the browser journal callback when their connection exposes a journal
identity. Mock and transient sessions leave it absent. The callback receives the
complete encoded original with its original `sessionId`, `sessionIndex`, payload,
claims and `stagingOutcome`; `id`, `nodeId`, `nodeIndex` and `pushIndex` remain null.
It runs after the staging transaction returns and before staging returns to its
caller. SQL commit and journal storage are independent: committed-table observers
may already have run, including staging another command. There is no guaranteed
journal-before-observers or outer-before-inner callback order. Rollback and replay
do not invoke the callback; callback failure cannot reverse the committed staging
result. Table-change observers still publish progress and wake handoff.

- [`stageAggregateSessionCommandTx.ts:106-115`](../../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts#L106-L115) — invokes the Aggregate callback after successful transaction return and catches its exceptions.
- [`stageServiceSessionCommandTx.ts:92-99`](../../../packages/core/src/serviceSession/stageServiceSessionCommandTx.ts#L92-L99) — attempts the Service callback after SQL success and returns the same staging result if it throws.
- [`openAggregateSessionReplica.ts:107-125`](../../../packages/browser/src/sessionReplica/openAggregateSessionReplica.ts#L107-L125) — enables the Aggregate journal only when the connection exposes its resolved journal identity key.
- [`makeStandaloneAggregateConnection.ts:229-230`](../../../packages/browser/src/StandaloneNode/makeStandaloneAggregateConnection.ts#L229-L230) — exposes the Standalone storage identity for journaling.
- [`openServiceSessionReplica.ts:87-104`](../../../packages/browser/src/sessionReplica/openServiceSessionReplica.ts#L87-L104) — configures the separate Service prefix, command schema and `serviceIndex` resolution accessor.

Each localStorage entry belongs to the exact authenticated identity hash,
original `nodeId` and original Session coordinates. Separate per-command keys
avoid a shared pending-array rewrite. Storage access, quota, encoding, reading
and deletion failures preserve ordinary staging and live handoff. The journal is
best effort; it does not establish server admission or canonical execution.

- [`makeStagedCommandJournal.ts:29-53`](../../../packages/browser/src/stagedCommandJournal/makeStagedCommandJournal.ts#L29-L53) — constructs the identity/Node/Session key and writes only an unallocated original.
- [`makeStagedCommandJournal.ts:53-80`](../../../packages/browser/src/stagedCommandJournal/makeStagedCommandJournal.ts#L53-L80) — keeps ordinary scanning and per-entry decoding best effort, independently of strict upgrade reads.
- [`makeStagedCommandJournal.ts:116-122`](../../../packages/browser/src/stagedCommandJournal/makeStagedCommandJournal.ts#L116-L122) — makes acknowledged-key deletion best effort so exact originals can be retried safely.

Validated durable Node retention permits entry deletion, while the local
overlay remains until a covering Node view installs. Cleanup does not wait for
canonical execution or retained `outcome`. If a retention response or deletion
is lost, later recovery submits the identical original to the same Node;
exact submission deduplication recovers its existing allocation.

- [`recoverStagedCommands.ts:96-121`](../../../packages/browser/src/stagedCommandJournal/recoverStagedCommands.ts#L96-L121) — removes acknowledged journal entries and pending work after direct retention or validated installed snapshot coverage.
- [`recoverStagedCommands.ts:241-263`](../../../packages/browser/src/stagedCommandJournal/recoverStagedCommands.ts#L241-L263) — validates the offered Session coordinates, attachment and retained allocation before acknowledging recovery delivery.

## Offline schema migration

A tab may close after it saved an original to its journal and before the Node
acknowledged retention. On return, the same authenticated session recovers the
move by its original producer and session coordinates. A meaning-preserving
SQL migration can complete while offline with that move still pending. Normal
synchronization sends it when connected and permitted, or recovers its existing
outcome if the Chain already admitted it. [Connected Node startup](./bootstrapBrowserSession.md#opening-a-connected-node-database) · [Journal recovery](../../../packages/browser/src/stagedCommandJournal/recoverStagedCommands.ts)

## Service staging and validation

Public staging checks the initialized capability at entry; the browser Service
binding also checks the current replica identity before calling its transaction.
`stageServiceSessionCommandTx` reads Service metadata, allocates `sessionIndex`,
evaluates the contract with decoded bound claims, and retains its checked result
and inverses in one synchronous transaction. A later observer withdrawing
readiness does not reclassify an already committed command as rejected. A staging
refusal rolls back resources and retention; no canonical command has yet been admitted.

- [`stageServiceSessionCommand.ts:40-69`](../../../packages/core/src/serviceSession/stageServiceSessionCommand.ts#L40-L69) — checks initialization and obtains the current bound command execution before staging.
- [`bindServiceReplicaCommands.ts:49-70`](../../../packages/browser/src/sessionReplica/bindServiceReplicaCommands.ts#L49-L70) — checks the current replica and exact contract before calling Service staging.
- [`stageServiceSessionCommandTx.ts:40-92`](../../../packages/core/src/serviceSession/stageServiceSessionCommandTx.ts#L40-L92) — retains Service optimism and its command in the owning transaction.

Aggregate validation and `makeServiceReplicaValidator` call
`rehearse(db, tx => effect)` directly. It returns `void` on success and always
rolls back temporary model operations; there is no transaction options bag or
successful program value returned to the caller. Disposable ID services avoid
consuming application IDs. Recognized validation refusals remain silent.

- [`validateAggregateSessionCommand.ts:67-83`](../../../packages/core/src/aggregateSession/validateAggregateSessionCommand.ts#L67-L83) — rehearses Aggregate evaluation with disposable IDs and maps its result.
- [`makeServiceReplicaValidator.ts:45-69`](../../../packages/browser/src/sessionReplica/makeServiceReplicaValidator.ts#L45-L69) — checks the current replica and exact Service contract, then rehearses with disposable IDs.
- [`makeTx.ts:116-169`](../../../packages/core/src/drizzle/make/makeTx.ts#L116-L169) — runs direct rehearsal, forces rollback, and propagates the complete failure Cause without returning a successful value.

## Telemetry publication

The Aggregate and Service collectors buffer spans, logs and links synchronously.
They coalesce the session store's telemetry snapshot publication into one queued
microtask; lifecycle and nontelemetry state publication keep their own semantics.
`flushOwn()` synchronously drains produced records only. `flush()` synchronously
returns and clears the complete buffer and the produced buffer. A queued
publication reads the latest buffer, so flushed records are not resurrected.

- [`makeAggregateSession.ts:38-90`](../../../packages/core/src/aggregateSession/make/makeAggregateSession.ts#L38-L90) — owns Aggregate telemetry buffers and clears the queued flag before publishing the latest snapshot.
- [`makeServiceSession.ts:46-98`](../../../packages/core/src/serviceSession/make/makeServiceSession.ts#L46-L98) — applies the same collector/flush contract to Service sessions.

## Node views and final exposure

Browser receivers first partition current-session coverage from explicitly
registered recovered-session coverage. Unknown foreign-session coverage rejects;
old Session coordinates are never installed into a new session's command rows.
The unchanged core installers receive only current-session coverage. Recovered
allocation/resolution validation commits after successful view installation;
normal command-derived resources still arrive through the complete Node snapshot.

- [`makeAggregateReplicaReceiver.ts:241-257`](../../../packages/browser/src/sessionReplica/makeAggregateReplicaReceiver.ts#L241-L257) — partitions Aggregate coverage before installation and commits recovery effects afterward.
- [`makeServiceReplicaReceiver.ts:246-262`](../../../packages/browser/src/sessionReplica/makeServiceReplicaReceiver.ts#L246-L262) — preserves the same Service boundary using the captured `serviceIndex` checkpoint.
- [`makeRecoveredCommandCoverage.ts:85-139`](../../../packages/browser/src/stagedCommandJournal/makeRecoveredCommandCoverage.ts#L85-L139) — rejects duplicate/unknown recovered keys and checks Node allocation, canonical resolution ID and checkpoint bounds.

The [Node view installer](./PushSequence.md#installing-a-captured-node-view) validates complete current-session coverage, replaces model resources and current inverses, enriches existing own rows with compact final resolutions, writes the captured checkpoint, then replays only uncovered local originals. The captured graph already contains covered pending optimism. A replica never reapplies an old selected delta over a newer graph.

Canonical `outcome` is `{ result: Success | Failure, finalizedAt }`. AggregateVersionRepo execution commit, AggregateVersionChain retention and Actor selected publication precede Node final retention and replica same-row resolution. A final position with null private failure still resolves the local command; it does not reveal canonical Success. See [Aggregate execution](../server/executeAggregateCommand.md) and [Service execution](../server/serviceExecution.md).

## Public observers and automatic execution

Agent browser sessions apply selected history and expose guarded `readSelection`; they do not stage commands. [Public Agent observation](./SessionWebSocket.md#public-agent-observation) covers snapshot, contiguous replay and reader invalidation. [AgentExecution](../server/AgentExecution.md) owns backend materialization, attempted wakes, frozen delivery, rebinding and recovery.

[Plan 249](../../archive/plans/249-plan-aggregate-agent-backend-node.md) retains its dated Workerd evidence and trusted-bootstrap proof limits. [Plan 151](../../plans/151-plan-storage-table-review.md) owns later storage/outbox evidence. Moving these descriptions establishes no new runtime acceptance and does not close Plan 234.

Session staging constructs no canonical ID. `lastSessionIndex` advances with successful staging in the owning transaction and survives local history discard for the same Session. Rejection restores the counter together with resources and inverses. Both Node families allocate the canonical producer identity during handoff, as described in [PushSequence](./PushSequence.md#submission-identity-and-admission-recovery).
