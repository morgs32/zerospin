# Keep AVC backpressure retryable and validate bounded background replay

> Relevant remaining work is tracked in [MOR-465](https://linear.app/morganatwork/issue/MOR-465/keep-avc-backpressure-retryable-and-validate-bounded-replay). This file preserves the source plan and its evidence.

**Status:** Proposed implementation plan, 2026-11-11. This is the narrower follow-up to [deferred Plan 297](./297-plan-aggregate-archive-cursor-pacing.md). See the [QRK incident and replay pacing research](../../../qrk.sh/wiki/research/zerospin-replay-only-archive-backpressure.md).

## Scope and outcome

1. Stage 1 changes AggregateVersionChain (AVC) publication. The 64-new-command append limit and 64-unarchived-command cap stay in AVC. A briefly full AVC waits for actual Archive progress and then retries the same append. Prolonged saturation defers the page, keeps recovery armed, and is reported as expected pressure.
2. Stage 2 evaluates a one-page AggregateVersionRepo (AVR) outbox limit on an isolated historical replay. The experiment must prove the bound and autonomous recovery at 100,000 commands. It does not enable a runtime pacing policy for production AVR startup, foreground catch-up, or original execution.
3. Preserve the two acknowledgment boundaries. AVC acknowledges the AVR publication after its local append transaction. AVC prunes the local suffix only after applying the Archive acknowledgment. The AVR outbox and AggregateChain replay source advance only on their existing successful receipts. No registry, fixed storage schema, public outcome, or production rollout change is in this plan.

## Stage 1 — Wait for room in AVC

1. Keep `appendEvaluatedCommands` as a whole-page append. Decode the request once. On each append attempt, under the existing append permit, read the current local head, validate order and exact repeats, and count only genuinely new commands. Validate fresh contiguity and existing input/append-size constraints. Malformed pages, conflicting repeats, gaps, and oversized pages return their existing failure kinds. The transaction computes the required archive position from the current head and genuinely new count. Exact retries still consume zero new capacity.
2. If the transaction reports `aggregate-archive-backlog-full`, leave SQL and release the append permit. Keep AVC's existing Archive wake/recovery in force. Observe AVC's existing durable archive cursor locally, using a first-cut wait of **up to 250 ms per append RPC**, sampled every 25 ms only while full. Make the first check immediately after arming recovery. Use a single deadline across checks and retries. Retake the append permit and rerun validation/capacity against the current head when there is room or a concurrent append can have covered the offered page. An observed cursor gives no reservation. The wait must neither hold the permit nor await all Archive fanout work. The Archive does not need an AVR callback to progress.
3. Once the append commits, return the same success envelope as today. If the deadline expires, propagate the same exact typed `aggregate-archive-backlog-full` failure to the sender. The failure leaves the whole page in AVR and the existing alarm retries it. At the AggregateVersionChain publication and its replay delivery reporting boundaries classify only a sole failure of this exact kind as expected deferral, after recovery is held. Preserve the failed result for an explicitly awaited drain or subscriber RPC. Do not return success for deferral or silence a mixed cause, an Archive write error, or a transport error. Where a rejected promise passed to the background host also creates noisy logs, let the background observer settle normally for this exact expected deferral while the awaited operation keeps its original result. Use the existing telemetry path for a low-severity deferral diagnostic and elapsed wait.
4. Use the existing local append and Archive recovery seams. Test the 124-command shape with the Archive acknowledgment held briefly. Confirm #65–124 waits, then succeeds inside the window. Hold the Archive beyond the deadline and confirm the page stays pending and retries successfully. Exercise a concurrent append or lost reply, an exact repeat at capacity, and a genuine Archive failure that remains visible. Run a healthy replay longer than two full pages so verification reaches repeated saturation.
5. Preserve the existing canonical replay publication rule. Canonical AVR may await the same publication drain it awaits today. The bounded wait can add up to its deadline on a saturated append. An already committed original may still be recovered through the existing retained-result path. Stage 1 adds no Archive budget check before original evaluation.

Illustrative calculation after validation:

```ts
// Head = 64, genuinely new rows = 60, backlog cap = 64.
const requiredArchivedThrough = localTip + newCommandCount - 64;
// Archive acknowledgment through 60 leaves room for all 60 new rows.
// Recheck the current head and exact duplicates under the append permit before committing.
```

## Stage 2 — Isolated 100,000-command replay

1. Reuse the existing Account V1/V2 fixture in the Zerospin chain-command-delivery Workers suite with a dedicated local aggregate identity. V1 supplies originals and V2 is the replay candidate. Build or seed a representative finalized history of 100,000 commands in the fixture. Prove that neither live traffic nor pending originals are routed to the candidate in this scenario. Merely selecting a noncanonical release does not establish that. Keep the candidate pacing patch and scale driver in an isolated experiment using the existing test seams. The experiment must use the actual replay, outbox, AVC, and Archive paths. Do not ship a generic pacing flag or a new production readiness policy as part of it.
2. In the candidate replay transaction, first validate the next contiguous position and recover already materialized repeats. Before evaluation or restoration could add a new publication row, check the actual AVR outbox for a 64th pending row using its index. The check and insertion share the same synchronous transaction under AVR's existing execution permit. This counts republished, previously archived results too. A full queue leaves the next command and its resources unchanged. The count is a row bound for the isolated replay producer. Measure bytes separately.
3. On a full queue, leave SQL and release the execution permit. Drain through AVR's already committed head using its existing outbox. Retry the blocked command when the queue drops below 64. If the bounded attempt cannot make progress, keep publication recovery armed and return the candidate replay deferral. Live AggregateChain fanout leaves the entire page unacknowledged and re-drives it on its next recovery wake. Already materialized positions are checked against retained results and the next missing position is applied once. A late publication acknowledgment may race with a retry. Verify idempotent publication and no lost outbox rows.
4. For the isolated cold test, drive the committed outbox drain directly inside AVR activation, since its own alarm cannot run while the constructor gate is closed. Use one deadline for the startup pressure path inside the platform's constructor deadline. If AVC stays full, let the activation fail with the durable prefix intact. Require an independent AggregateChain replay retry to reconstruct the candidate using a fresh stub and resume after the Archive recovers. Keep the existing fixed-prefix readiness requirement. A 100,000-command replay need not complete in one activation. Verify durable progress across attempts. [Durable Object startup gate](https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile).
5. Run the healthy scale case and a stall that fills both queues, followed by recovery and a cold restart. Record peak AVR pending rows and serialized bytes, peak AVC unarchived positions, number and duration of deferrals, activation attempts, and final contiguous positions. The pass criteria are at most 64 pending rows in the isolated paced AVR, at most 64 unarchived positions in AVC, all 100,000 positions processed after recovery, and one materialization per position. Verify partial-page redelivery, lost publication reply, and cold re-drive with focused existing tests. Report actual performance separately from functional success.
6. Review the experiment before considering any production replay pacing. A call to original finalization can itself require replay through a predecessor, and production startup uses the same replay path. A separate decision is needed to extend pacing there without silently changing availability or the behavior of an already admitted command.

Illustrative experiment:

1. Pause Archive delivery after AVC commits #1–64. Let candidate AVR replay and retain #65–128 in its outbox.
2. Attempt #129. The AVR transaction sees the 64th pending row and leaves #129 uncommitted. AggregateChain still owns delivery of the unfinished replay page.
3. Release the Archive. AVC records its Archive acknowledgment, AVR publishes the queued rows, and the source retry resumes at #129. Kill and reconstruct AVR during the stall in the cold variant. Recovery must finish without a browser request.

## Implementation and verification

1. Implement and verify Stage 1 first using existing aggregate-history Workers coverage. Run the relevant owning test target and type checks. Keep Stage 2 candidate code out of the Stage 1 change.
2. Run the isolated experiment and attach measurements and the tested startup/recovery conditions to this plan. Use existing Workers fixtures and test files. Keep the 100,000-command run explicitly selected so routine checks retain their normal scope.
3. Reconcile [Version Chain Archives](../architecture/server/VersionChainArchives.md) and [ADR 024](../adrs/024-version-chain-sql-archives.md) with implemented AVC behavior. Update terminology only if the implementation changes it. Record any distinct production pacing decision separately. Stage 1 release/adoption and any local QRK verification follow the repository's existing authorization and verification workflow.

## Planned file hierarchy

`+` creates a file. `~` modifies a file. Stage 2 entries describe isolated experiment changes.

```text
zerospin/
├── packages/system-worker/
│   ├── src/
│   │   ├── AggregateVersionChain/
│   │   │   ├── ~ AggregateVersionChain.ts
│   │   │   └── ~ appendEvaluatedCommandsTx.ts
│   │   ├── makeOutboxQueue/
│   │   │   └── ~ makeOutboxQueue.ts
│   │   ├── makeFanoutQueue/
│   │   │   └── ~ makeFanoutQueue.ts
│   │   ├── reportWorkerFailure/
│   │   │   └── ~ reportWorkerFailure.ts
│   │   └── AggregateVersionRepo/                 (Stage 2 experiment)
│   │       ├── ~ AggregateVersionRepo.ts
│   │       ├── ~ materializeCommandTx.ts
│   │       └── replayCommands/
│   │           ├── ~ replayCommand.ts
│   │           └── ~ replayCommands.ts
│   └── tests/
│       ├── aggregate-history-fanout/
│       │   └── ~ aggregate-history-fanout.workerd.spec.ts
│       └── chain-command-delivery/              (Stage 2 experiment)
│           └── ~ chain-command-delivery.workerd.spec.ts
└── wiki/
    ├── adrs/
    │   └── ~ 024-version-chain-sql-archives.md
    ├── architecture/server/
    │   └── ~ VersionChainArchives.md
    └── plans/
        ├── ~ 297-plan-aggregate-archive-cursor-pacing.md
        └── + 298-plan-avc-backpressure-and-bounded-replay.md
```

## Source references

1. [AVC append and wake](../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L558), [AVC cap and transaction](../../packages/system-worker/src/AggregateVersionChain/appendEvaluatedCommandsTx.ts#L36), and [AVR outbox acknowledgment](../../packages/core/src/outbox/makeOutboxDelivery.ts#L298).
2. [Replay receiver and canonical acknowledgment](../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L217), [shared transaction](../../packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts#L37), and [source acknowledgment](../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L309).
3. [Existing Archive handoff and rollover tests](../../packages/system-worker/tests/aggregate-history-fanout/aggregate-history-fanout.workerd.spec.ts#L39), [startup gate](../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts#L292), and [Actor replay recovery precedent](../../packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts#L67).
