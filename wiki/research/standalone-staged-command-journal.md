# Standalone staged-command journal

**Date:** 2026-10-27.
**Status:** Historical source research at the inspected revision. [Plan 281](../archive/plans/281-plan-standalone-staged-command-journal.md) records the subsequent implementation and runtime evidence.
**Inspected revision:** `c89b31a27` (Plan 279 branch).

## Direct answer

Extend the same best-effort journal to Standalone. Its browser session still
stages into the ordinary Aggregate replica and hands commands to `AggregateNode`
asynchronously. Being the local authority removes backend transport from later
execution; it does not make the page-to-Node handoff synchronous.
[`makeStandaloneAggregateSession.ts:145-168`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/makeStandaloneAggregateSession.ts#L145-L168),
[`makeStandaloneAggregateConnection.ts:230-254`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/makeStandaloneAggregateConnection.ts#L230-L254),
[`StandaloneBrowserSessionApi.ts:64-89`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/StandaloneBrowserSessionApi.ts#L64-L89).

Plan 279's core post-commit seam already applies to Aggregate staging, but the
shared replica enables journaling only when its connection supplies
`journalIdentityKey`. Standalone's connection currently omits that method, so it
has the same pre-retention closure gap without the new journal protection.
[`stageSessionCommandTx.ts:48-56`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/core/src/aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx.ts#L48-L56),
[`openAggregateSessionReplica.ts:107-139`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/sessionReplica/openAggregateSessionReplica.ts#L107-L139),
[`makeStandaloneAggregateConnection.ts:229-256`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/makeStandaloneAggregateConnection.ts#L229-L256).

## The durable fact that permits cleanup

`receiveCommandRows` first checks the attachment and complete command claims,
then awaits `AggregateNode.accept` for each original. Only afterward does it
schedule authoritative execution with `void drain()` and return retention
coordinates. `AggregateNode.accept` commits the original through its SQL gate
before publishing a view and returning those coordinates.
[`receiveCommandRows.ts:14-30`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/receiveCommandRows.ts#L14-L30),
[`AggregateNode.ts:536-555`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/core/src/AggregateNode/AggregateNode.ts#L536-L555).

**Recommendation:** delete the localStorage entry after validated durable
original retention, exactly as for connected sessions. Do not retain the entry
until authoritative execution. On attachment, `makeStandaloneWorkerRuntime`
already schedules a drain; `AggregateNode.executeNext` selects a retained original
without a final, evaluates it, and commits its final in the same transaction as
its resource changes. Automatic execution respects the persisted pause setting.
[`makeStandaloneWorkerRuntime.ts:303-314`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts#L303-L314),
[`makeStandaloneWorkerRuntime.ts:346-349`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts#L346-L349),
[`AggregateNode.ts:746-788`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/core/src/AggregateNode/AggregateNode.ts#L746-L788),
[`executeStandaloneCommand.ts:64-92`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/executeStandaloneCommand.ts#L64-L92).

Retried delivery keeps the original `{ sessionId, sessionIndex }`; existing
retention compares complete immutable command input and returns the existing
Node allocation. It must not call public staging again. This remains valid when
execution has subsequently appended a final, because the original lookup is by
Session coordinates and selects its retained original allocation.
[`acceptAggregateOriginalTx.ts:41-69`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/core/src/AggregateNode/acceptAggregateOriginalTx.ts#L41-L69).

## The identity distinction to preserve

Standalone's durable storage key is the authored Aggregate/Actor/session scope,
resolved `backupPath`, and complete session lock. It intentionally excludes
non-path claims and build identity. Its stable storage namespace is
`/zerospin/standalone/<key>`, opened through `openNodeStorage` with
`IDBBatchAtomicVFS`; the current implementation is IndexedDB-backed SQLite, not
the historical OPFS backup lane.
[`standaloneIdentity.ts:17-55`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/standaloneIdentity.ts#L17-L55),
[`makeStandaloneSharedWorker.ts:18-34`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/makeStandaloneSharedWorker.ts#L18-L34),
[`openNodeStorage.ts:39-56`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/Node/openNodeStorage.ts#L39-L56).

A durable Node can therefore serve attachments whose non-path claims differ.
Each delivered view substitutes that attachment's claims. The current
`receiveCommandRows` ingress additionally requires incoming commands to match
those complete attachment claims. The journal must not recover
an earlier attachment's command by replacing its claims with the current ones.
[`subscribe.ts:61-73`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/subscribe/subscribe.ts#L61-L73),
[`receiveCommandRows.ts:15-20`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/receiveCommandRows.ts#L15-L20),
[`makeStandaloneWorkerRuntime.ts:330-349`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts#L330-L349).

**Revised recommendation after first-principles discussion:** scope journal
recovery by the stable Standalone storage key and `nodeId`, retaining original
Session coordinates for deduplication. Preserve every original command's complete
claims unchanged. Remove the ingress equality check between the original's claims
and the recovering attachment's claims; continue schema, Aggregate/Actor/session,
registered contract, and Node-incarnation validation.

This is a proposed behavior change, not current behavior. The Node already
validates original claims against the authored claims schema, checks command
ownership/contract identity, and executes retained originals with their own
claims. Standalone attachment claims are supplied by the local attachment
request. **Inference:** equality with those caller-supplied attachment claims
provides invocation consistency, rather than independent authentication of the
original command's authority.
[`makeStandaloneWorkerRuntime.ts:140-156`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts#L140-L156),
[`makeStandaloneWorkerRuntime.ts:238-253`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts#L238-L253),
[`acceptAggregateOriginalTx.ts:68-99`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/core/src/AggregateNode/acceptAggregateOriginalTx.ts#L68-L99),
[`executeStandaloneCommand.ts:64-83`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/executeStandaloneCommand.ts#L64-L83).

Keeping exact-claims recovery would make survival across a claims change depend
on whether the original reached durable Node retention before document closure:
already-retained originals execute under captured claims, while a journal-only
original would remain stranded. That timing distinction is not a demonstrated
Standalone requirement. The journal should preserve the same original execution
context across the page-to-Node handoff.

## Restart, replacement, and reuse

1. Preserve `nodeId` across ordinary restart. Existing initialization returns
   without replacing metadata when stored identity matches. Explicit Standalone
   reset instead generates a new `nodeId`, clears retained commands/resources,
   and installs its new baseline atomically. Journal recovery must remain scoped
   to the original incarnation so stale entries cannot resurrect reset work.
   [`AggregateNode.ts:186-205`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/core/src/AggregateNode/AggregateNode.ts#L186-L205),
   [`AggregateNode.ts:872-897`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/core/src/AggregateNode/AggregateNode.ts#L872-L897).
2. Reuse Plan 279's generic journal, old-session delivery, coverage validation,
   and cancellation logic; these independently match the Standalone handoff's
   command and acknowledgement shapes. Keep explicit Standalone identity binding
   at construction rather than introduce a connected/Standalone domain switch.
   The existing Aggregate journal prefix already matches the shared command
   schema; the Standalone storage key supplies isolation without another public
   option or journal module.
   Recovered commands already enter the same subscriber interest collection, so
   the shared receiver's foreign-session coverage partition remains necessary.
   [`StandaloneBrowserSessionApi.ts:64-89`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/StandaloneBrowserSessionApi.ts#L64-L89),
   [`openAggregateSessionReplica.ts:107-124`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/sessionReplica/openAggregateSessionReplica.ts#L107-L124),
   [`replicaConnection.ts:8-13`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/sessionReplica/replicaConnection.ts#L8-L13),
   [`makeAggregateReplicaReceiver.ts:243-270`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/sessionReplica/makeAggregateReplicaReceiver.ts#L243-L270).
3. Retain the post-SQL-COMMIT/pre-observer write ordering introduced in Plan 279.
   That placement prevents reentrant staging from exposing a later journal entry
   before an earlier one. Storage failures should keep today's Standalone staging
   and handoff behavior, following the user's already chosen best-effort policy.
   [`SqliteSession.ts:122-136`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/core/src/drizzle/SqliteSession.ts#L122-L136),
   [`recoverStagedCommands.ts:86-120`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/stagedCommandJournal/recoverStagedCommands.ts#L86-L120).

No second resource backup or alternate authoritative execution mechanism is needed
for this requirement. Replay originals through the existing Standalone retention
and command executor; never restore model rows directly from a localStorage
entry. `executeStandaloneCommand` already owns command evaluation and operation
application using the original claims, while `AggregateNode.executeNext` owns its
outer durable transaction and final retention.
[`executeStandaloneCommand.ts:64-92`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/executeStandaloneCommand.ts#L64-L92),
[`AggregateNode.ts:746-788`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/core/src/AggregateNode/AggregateNode.ts#L746-L788).

A requirement to revoke pending work when claims change would need an explicit
rule covering both journal-only originals and already-retained originals. It
should not arise accidentally from which side of Node retention a document closed.
No revocation requirement is established by the inspected source or this request.
