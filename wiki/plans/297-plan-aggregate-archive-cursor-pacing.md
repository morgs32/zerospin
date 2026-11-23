# Pace AggregateVersionRepo execution by the archive cursor

**Status:** Deferred, 2026-11-11. [Plan 298](./298-plan-avc-backpressure-and-bounded-replay.md) proceeds with AVC retry handling and isolated replay validation first. Framework change in Zerospin. Incident evidence: [QRK archive backpressure research](../../../qrk.sh/wiki/research/zerospin-avc-archive-backpressure.md).

## Problem and scope

1. AggregateVersionRepo (AVR) commits evaluated commands to its outbox with resource changes. AggregateVersionChain (AVC) acknowledges them after its own SQLite commit and archives them separately. Today AVC can retain only one full publication page awaiting archive acknowledgment. In QRK, V12 appended #1–64, then had to retry #65–124 before the Archive acknowledgment arrived.
2. Remove the total unarchived-command cap from AVC. Preserve the separate 64-new-command limit per append, contiguous append and exact-repeat validation, the local-commit publication acknowledgment, bounded archive pages, archive rollover, and pruning only after the Archive acknowledgment commits in AVC. Keep Service and Actor/Agent pacing out of scope.
3. Pace both replay and original execution in the exact AVR that would produce the evaluated command. Keep the existing AggregateChain admission bound and its source queues. The change uses the existing checkpoint, outbox, AVC cursor, and recovery alarms. No fixed schema or System registry changes are planned.

## Budget and commit boundary

1. Use an initial fixed AVR budget of **128 command positions per aggregate instance and evaluating release**, enough for two full publication pages. This is a proposed starting policy, independent of page size. For a genuinely new position `N`, permit materialization only if `N - archivedThrough <= 128`. The number of command positions ahead of the Archive spans AVR's outbox and AVC's local suffix. This is a count budget. The SQLite storage limit still applies.
2. Add a read-only, internal `AggregateVersionChain.getArchivedThrough()` RPC returning `IRpcEnvelope<number, IZerospinErrorJson>` for the addressed AVC, and include it in the internal `AggregateVersionChains` service. Read AVC's existing durable `archiveFanoutSubscribers.acknowledgedAggregateIndex` (zero at genesis). That field advances only after the Archive commits and AVC records the acknowledgment and prunes its local suffix. The RPC performs no drain or callback into AVR. Scope the lookup to AVR's exact AVC key, including the evaluating release. A successful append to AVC grants no additional budget by itself.
3. Keep the latest validated cursor sample in the AVR instance, initially zero. On successful refresh take the maximum of the sample and the new cursor. Validate a nonnegative safe integer and fail visibly on an invalid response or failed RPC. A stale lower cursor can delay execution. It cannot grant too much budget. Never make a network call under the execution permit or in SQL.
4. Pass the sampled cursor into the shared `materializeCommandTx` path used by replay and original finalization. After `readAggregateCommandTx` establishes a fresh contiguous position and before evaluating authored code or applying retained operations, check the prospective position. Return the internal retryable refusal `aggregate-archive-progress-required` before mutation when it exceeds the budget. Positions already archived pass the check during restoration. The existing committed-command lookup and exact-repeat handling remain eligible even when the budget is exhausted. Check inside the existing execution permit and synchronous transaction, so concurrent original execution and replay cannot spend the same capacity. Retain the existing producer lease across actual production to arm delivery recovery before writing.
5. Keep the outbox drain and AVC archive fanout eligible at every backlog size. An AVR reconstructed with preexisting work above the budget can still deliver all committed results and wait for the archive cursor to catch up. An AVC append retry compares retained commands through either local or archived history. An Archive reply lost before AVC records acknowledgment grants no new budget. Restoration of an already archived position can still create an AVR outbox row for exact-repeat publication. That row consumes no AVC archive capacity. This plan bounds positions awaiting archival and keeps the existing page delivery for restoration.

Proposed transaction excerpt (illustrative, inside the existing transaction):

```ts
const commandContext = yield * readAggregateCommandTx(tx, row, key, mode);
if (commandContext === undefined) return; // Already materialized; caller recovers the result.
if (row.aggregateIndex - archivedThrough > 128) {
  // Leave resource rows, the materialization head and the outbox unchanged.
  return yield * makeZerospinError('aggregate-archive-progress-required');
}
// Only now restore the retained result or evaluate and retain a new result.
```

## Pause and resume

1. **Normal replay.** Both the live fanout receiver and pull catch-up use AVR's replay loop. Process commands in order. When a command hits the budget, release the execution permit. Outside SQL, drain already-committed AVR outbox rows through the captured materialization head, refresh AVC's archive cursor, and retry the blocked command if it now fits. Use a single bounded drain/refresh attempt of up to one second for an ordinary delivery before deferring. The drain is allowed to publish pending results even while materialization is paused. After a timeout, leave the existing AVR outbox wake armed. Keep the canonical replay requirement to drain publication through the delivered prefix before acknowledging it.
2. **Replay stays paused.** If that attempt finds insufficient space, return the typed retryable refusal through the existing delivery envelope. A partially processed pushed page returns no success, so AggregateChain does not advance its subscriber cursor to the end of the page. AggregateChain's existing replay recovery hold schedules another delivery. On redelivery AVR validates the already committed prefix and resumes at the first missing command. For pull catch-up, propagate deferral to the invoking operation instead of returning a success with zero progress. A later invocation reads the durable cursor and continues. Treat the refusal as delivery pressure, never as an authored command outcome. Preserve real Archive/transport errors as their own failures.
3. **Original execution.** `finalizeCommand` first recovers an already committed result, then catches up through `N - 1` for fresh work as it does today. Apply the same budget to `N`. On pressure, release the execution permit, run the same bounded drain/refresh step and retry `N` if it fits. If it still cannot fit, the original delivery returns a retryable refusal. AggregateChain's single-command finalization outbox retains the original admitted row with no recorded outcome and re-drives it through its existing recovery alarm. The next attempt recovers any committed result before evaluating. Original execution, external operation publication, and command identity keep their existing commit order.
4. **Startup.** AVR's `onRepoStartup` runs inside `blockConcurrencyWhile` and still captures one finalized AggregateChain prefix. It finishes that prefix before reporting ready. On budget pressure, directly drain any previously committed AVR outbox rows and refresh AVC's cursor from inside the activation invocation. Once the drain has handed off the committed results, recheck the independent AVC cursor every 250 ms while blocked, for up to five seconds total of startup pressure handling and within the first 20 seconds of AVR's activation work. Include drain and status RPC time in that budget. Retry the same blocked command as soon as the cursor covers `N - 128`. Use the same deadline across pages and retain any progress. If publication already covers the current materialization head, proceed directly to refreshing the cursor. Archive delivery continues independently in AVC. AVR must not wait for its own alarm, a callback into AVR, AggregateChain fanout or finalization, or Actor/Agent delivery.
5. **Startup stays paused.** At the deadline, let the retryable refusal fail this activation through the existing startup failure path. Keep resource/checkpoint/output commits for completed commands. Keep AVR's publication recovery and AggregateChain's source replay/finalization recovery armed. A later independent AggregateChain delivery, or a caller retry with a fresh stub when required, reconstructs AVR and resumes from the committed prefix under a fresh activation deadline. A constructor failure must never look like readiness or a receipt for an unfinished page. Verify autonomous source re-drive after an activation refusal with the real Workers seam. AVR's blocked alarm handler cannot provide this guarantee by itself. [Durable Object concurrency gate](https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile) · [Alarm lifecycle](https://developers.cloudflare.com/durable-objects/api/alarms/) · [Stub recreation after exceptions](https://developers.cloudflare.com/durable-objects/best-practices/error-handling/#recreating-the-durableobjectstub-after-exceptions).

Examples for a budget of 128:

1. **Healthy replay.** Archive cursor 0 permits #1–128. QRK's #1–64 and #65–124 both reach AVC while archive delivery runs. The first AVC append no longer forces the second to retry.
2. **Warm stall.** With `materializedThrough = 128` and `archivedThrough = 0`, #129 waits. Draining pending results into AVC can empty AVR's outbox while the cursor stays at 0, so #129 stays paused. An Archive acknowledgment through #64 makes #129–192 eligible. If #129 is original work, AggregateChain still holds that exact admitted command until AVR returns its evaluated result.
3. **Cold stall.** Reconstructed parallel V12 AVR has committed through #128, #65–128 remain in the outbox, and its captured finalized prefix ends at #180. AVR directly sends #65–128, then checks AVC's archive cursor. If AVC records the Archive acknowledgment through #64 before the deadline, AVR finishes #129–180 and opens. If the cursor stays at 0, AVR fails this activation at #129. The next AggregateChain delivery or caller retry reconstructs it. #65–128 can be retried without duplicating the committed work, and readiness still requires the new activation's captured prefix.

## Implementation and verification

1. Add the internal AVC cursor read and remove only AVC's unarchived backlog check. Preserve its append-size guard and archive page size. Verify its history readers and archive drain accept a suffix spanning multiple pages.
2. Wire the AVR cursor sample, shared transaction check, and bounded pressure handling at replay and original execution call sites. Keep the normal path free of per-command RPCs. Install the startup deadline only for local activation catch-up. Use the existing recovery holds and producer leases, without adding stored pause state. Verify that one overdue RPC cannot create a second competing commit attempt after the caller has deferred.
3. Extend existing Workers coverage. In the aggregate history fanout suite, hold Archive delivery and exercise both accepted publication pages, the next refused AVR command, a partial pushed replay page, then archive progress and exact recovery. In the chain command delivery suite, demonstrate an admitted original held at budget and then finalized exactly once after archive progress. In the cold replay scenario, test both progress within the startup deadline and timeout followed by an independent source retry, using existing clock/eviction seams. Cover lost replies through existing idempotency assertions and an already-committed retry at budget. Use existing files and test tooling.
4. Run targeted Workers scenarios through the owning Zerospin test target and its type checks. Confirm mixed producer paths never exceed the budget for newly materialized positions, and that AVC still rejects an oversized append. Confirm the 124-result QRK incident shape with the framework fixture. Any local QRK smoke test should use the existing dev flow and current manual verification assignment.
5. Ship the AVR check and AVC cap removal together in the same Zerospin Worker revision. The old AVR would bypass the moved bound and the new AVR requires the new AVC cursor RPC. Verify deployed routing and storage compatibility before release or consumer adoption. Preserve all existing rows and registrations.
6. After implementation, update the archive and Repo lifecycle docs and the original execution workflow. Reconcile existing glossary and lifecycle pattern entries with implemented terminology. Amend governing ADR 024 to move the backlog bound to AVR, and qualify ADR 014's independent original finalization guarantee with the pressure-only wait. Record a new ADR only if an implemented decision independently meets the repository's ADR criteria. Follow the existing release and QRK adoption workflow separately.

## Planned file hierarchy

`+` creates a file. `~` modifies a file.

```text
zerospin/
├── packages/system-worker/
│   ├── src/
│   │   ├── AggregateVersionChain/
│   │   │   ├── ~ AggregateVersionChain.ts
│   │   │   └── ~ appendEvaluatedCommandsTx.ts
│   │   ├── AggregateVersionRepo/
│   │   │   ├── ~ AggregateVersionRepo.ts
│   │   │   ├── ~ materializeCommandTx.ts
│   │   │   ├── finalizeCommand/
│   │   │   │   └── ~ finalizeCommand.ts
│   │   │   └── replayCommands/
│   │   │       ├── ~ replayCommand.ts
│   │   │       └── ~ replayCommands.ts
│   │   └── repoServices/
│   │       └── ~ AggregateVersionChains.ts
│   └── tests/
│       ├── aggregate-history-fanout/
│       │   └── ~ aggregate-history-fanout.workerd.spec.ts
│       └── chain-command-delivery/
│           └── ~ chain-command-delivery.workerd.spec.ts
└── wiki/
    ├── adrs/
    │   ├── ~ 014-synchronous-original-finalization.md
    │   └── ~ 024-version-chain-sql-archives.md
    ├── architecture/server/
    │   ├── ~ VersionChainArchives.md
    │   ├── ~ RepoLifecycle.md
    │   └── ~ executeAggregateCommand.md
    ├── patterns/system-worker/
    │   └── ~ repo-lifecycle.md
    ├── ~ glossary.md
    └── plans/
        └── + 297-plan-aggregate-archive-cursor-pacing.md
```

## Source references

1. [AVC capacity and append transaction](../../packages/system-worker/src/AggregateVersionChain/appendEvaluatedCommandsTx.ts#L36), [archive cursor and delivery](../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L269), and [archive design](../archive/plans/274-plan-version-chain-archives.md).
2. [AVR replay and canonical publication](../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L172), [shared materialization](../../packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts#L37), [original finalization](../../packages/system-worker/src/AggregateVersionRepo/finalizeCommand/finalizeCommand.ts#L56), and [AggregateChain original delivery](../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L228).
3. [Governing archive ADR](../adrs/024-version-chain-sql-archives.md), [original finalization ADR](../adrs/014-synchronous-original-finalization.md), and [activation catch-up plan](../archive/plans/192-plan-activation-materialization-catchup.md).
4. [Push acknowledgment](../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L289), [pull catch-up](../../packages/system-worker/src/makeFanoutSubscriber/runFanoutCatchup.ts#L42), [activation gate](../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts#L292), and [existing recovery alarms](../../packages/system-worker/src/makeRecoveryRegistry/makeRecoveryRegistry.ts#L28).
