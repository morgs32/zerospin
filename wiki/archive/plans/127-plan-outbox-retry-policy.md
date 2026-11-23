# Retry transport failures at the outbox attempt boundary

Status: Implemented and verified in the approved goal on 2026-10-11.

`makeOutboxDelivery` says only explicitly retryable platform failures enter its schedule, but its retry loop surrounds subscriber acquisition, receive, and readRpcEnvelope. Every sole typed FailReason reaches Schedule, including permanent receiver refusals, invalid envelopes and subscriber domain failures. Repeating those refusals can hide a durable bad command behind backoff and prevents callers seeing the actual failure promptly. Retry policy belongs to the transport attempt, not the entire typed failure channel.

Source: [shared delivery](../../../packages/core/src/outbox/makeOutboxDelivery.ts), [worker queue](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts), [browser queue](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/browser/src/outbox/makeSessionCommandOutbox.ts), [wire reader](../../../packages/core/src/utils/readRpcEnvelope.ts).

1. Keep one scoped transport attempt owning acquisition, native receive and release. Classify native rejected promises at this boundary. Only a native Error explicitly declaring retryable true and not overloaded true may enter the default platform retry schedule. Nonretryable native exceptions remain defects with full Cause as currently intended. Do not decide retryability merely because a remote public error happens to have the string `outbox-delivery-unavailable`.
2. Decode the returned RPC envelope after transport retry succeeds, outside that retry loop. Subscriber-selection typed refusals and encoded receiver typed refusals return immediately, preserving exact error/Cause. An invalid envelope returns immediately. Prepare, acknowledgement, afterAcknowledge and diagnostic writes also never enter transport retry. A subscriber lookup that itself performs transport should explicitly wrap only that transport attempt, not make all lookup failures retryable.
3. Extract meaningful attempt and page-delivery procedures so the parent reads read -> prepare -> receive -> require activity -> acknowledge -> completion, under the existing one-drain semaphore. Keep source page immutable and bounded by throughIndex, with no new result/history store.
4. Preserve scoped release on every attempt and release before retry sleep; disposed capabilities cannot leak across attempts. A release defect combined with a receive failure preserves the mixed Cause and stops retry. A transport attempt should return a locally distinguished retryable transport result or internal typed marker; it must never mistake a receiver's serialized failure for that marker. No ALLOWED_CAST or public error-registry aliases are required.
5. Worker alarm recovery may retry durable pending rows later, but an individual drain reports a definitive domain/data failure promptly. Pending durable rows remain until exact acknowledgement. Browser waiters likewise see definitive refusals instead of waiting for irrelevant transport backoff.

```ts
const deliverOutboxPage = Effect.fn(function* (
  page: OutboxPage,
  props: DeliveryProps,
) {
  const rows = yield* props.prepare(page.map(entry => entry.row));
  const envelope = yield* receiveOutboxTransport(rows, props);
  const receipt = yield* readRpcEnvelope(envelope);
  yield* requireOutboxActivity(props);
  yield* props.acknowledge(page, receipt);
  yield* props.afterAcknowledge?.() ?? Effect.void;
});

const drainOutbox = Effect.fn(function* (throughIndex?: number) {
  while (true) {
    yield* requireOutboxActivity(props);
    const page = yield* readOutboxPage(props, throughIndex);
    if (page.length === 0) return;
    const exit = yield* Effect.exit(deliverOutboxPage(page, props));
    yield* finishOutboxPageDelivery(page, exit, props);
  }
});
```

`finishOutboxPageDelivery` owns current diagnostic eligibility: only a sole typed FailReason is recorded and only while source is active. Mixed/defect/interruption Cause propagates intact. Current diagnostic write failure precedence must be preserved or deliberately improved by retaining both Causes; do not silently swallow it. `afterAcknowledge` may fail after durable acknowledgement; worker queue's empty-drain completion-hook recovery remains required. Source replacement/activity checks still precede acknowledgement, preventing stale attachment receipts from being imported.

The intentional behavior change is narrow: definitive typed receiver/subscriber/envelope refusals end this drain immediately rather than consuming transport retry budget. Explicit platform retry behavior, acknowledgement atomicity, alarm lease sequencing and browser source epochs are preserved. Default schedule semantics remain the existing schedule; no serialized schedule reconstruction or broad catchAll retry.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/core/src/outbox/
    ~ makeOutboxDelivery.ts
    + receiveOutboxTransport.ts
    + deliverOutboxPage.ts # create only if generic signature remains clearer split
  ~ packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts # modify only API/error-type adaptation
  ~ packages/browser/src/outbox/makeSessionCommandOutbox.ts # modify only API/error-type adaptation
```

Actual makeOutboxDelivery consumers are exactly worker makeOutboxQueue (two storage branches) and browser makeSessionCommandOutbox. All worker queues reach it through that factory. No changes to retained command/result schemas are necessary. No transaction contains receive, retry sleep or capability disposal. Worker acknowledge deletes rows and commits custom receipt state in one synchronous SQL transaction; failures leave pending rows intact. Core makeTx Cause preservation is mandatory for callbacks implemented with it.

Implementation order: isolate/classify native attempt and add exact internal transport disposition; move envelope decoding outside retry; extract page program without weakening generic inference; adapt both consumers; inspect all outbox queue producers/acks and browser source replacement; then run existing gates. No new tests/fixtures/runners/config.

Verification: `pnpm nx run-many -p core -t lib,lint,tsc:typecheck` followed by `pnpm nx run-many -p system-worker,browser -t lib,ts,lint` using normal project dependencies after checking resolved target names. Existing source/API seams should establish one encoded refusal results in one receive, retryable native rejection repeats and eventually uses the receipt, overloaded/nonretryable rejection does not retry, malformed envelope does not retry, release is called exactly once per acquired capability, stale browser source cannot acknowledge, failed SQL acknowledgement retains rows, failed completion after acknowledgement recovers on next empty drain. Runtime criteria remain unrun in this review. Current system-worker has no test target; source type/lint gates alone do not establish retry timing.

Postimplementation: update outbox delivery comments/README and reliability glossary to distinguish transport retry from durable alarm redelivery. One qualifying ADR may document the durable queue's definitive-failure versus retryable-transport policy if not already governed. Archive after both consumers and verification finish.

## Implementation progress — 2026-10-11

Outbox delivery uses a private local marker only for retryable non-overloaded native transport rejection. Receiver acquisition/typed refusal, invalid envelopes, release failure and mixed Causes do not enter transport retry. Capability release precedes delay; owner-active checks protect ACK and diagnostic writes. Source/caller audit and core/worker library compilation pass. No prohibited runtime probes were added.

### Final source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Bounded normal delivery and connection evidence — 2026-10-11

Real mounted browser/native gameplay delivers ordinary originals and real computer continuations, leaving empty server outboxes and continuously derived public hashes. The native app also preserves a pending original through an offline process restart and automatically finalizes it after backend recovery. The failed-connection self-interruption defect and repair belong to the shared aggregate/service synchronization owners, as recorded in [111](111-plan-connected-worker-ownership.md) and [114](114-plan-native-persistent-owner.md); outgoing authentication retries do not exercise this plan's receiver transport classifier, capability-release count or durable ACK-failure policy. No controlled refusal, malformed envelope, release or ACK result is claimed from normal gameplay.

### Authorized controlled transport and acknowledgement checks — 2026-10-11

The human authorized disposable `/tmp` verification fixtures/runners. `/tmp/zerospin-framework-goal-root-20261011/outbox.mjs` invokes the production delivery and worker queue owners with actual SQL.js/Drizzle transactions, canonical production RPC-envelope encoding and explicit receiver/release/SQL/completion faults. The eleven cases pass: an encoded transport-code refusal receives once; a retryable native rejection releases each capability before the next attempt and succeeds on attempt three; overloaded, nonretryable and non-Error rejections preserve their defects without retry; malformed wire refuses once; combined receive/release failure retains both Cause reasons; stale activity prevents ACK; a real worker ACK fault rolls deletion back and preserves exact payload bytes before recovery; a failed post-ACK completion recovers on the next empty drain without another receive and releases its recovery lease. Each acquired capability releases once. All SQLite clients and managed runtimes close; the runner exits0 (`/tmp/zerospin-framework-goal-root-20261011/outbox.log`). Alarm callbacks and faulting transport capabilities are explicit fixture dependencies, not real platform outage evidence.

The combined-failure case exposed `Effect.mapError` collapsing a mixed Cause into its typed transport reason. The transport owner now maps the local marker inside `Cause.map`, preserving release defects and interruptions and excluding mixed failures from ordinary diagnostic writes. A frozen acquisition case in the actual session handoff also exposed `acquireUseRelease` masking subscriber acquisition. An outer interruption mask now restores acquisition and use to the caller's interruption status while protecting release. Both repairs preserve the existing transport retry schedule and public failure channel; no compatibility path or additional lifetime owner was added. Independent source review found no sequencing or authority concern.

The actual browser handoff passes frozen receive disposal/late-receipt fencing, old-epoch rejection followed by recovery of the same original, failed receipt import followed by recovery, definitive empty receipt refusal, and prompt frozen-acquisition disposal with exactly one release of the late capability and zero receipt imports (`/tmp/zerospin-framework-goal-root-20261011/handoff.mjs`, `/tmp/zerospin-framework-goal-root-20261011/handoff.log`, exit0). Its pending-list fixture isolates handoff behavior; these cases do not claim browser storage or SharedWorker host proof, which remain owned by111/113/116. The final core/browser/system-worker library/type/lint graph and core's actual `tsc:typecheck` pass after both repairs (`/tmp/zerospin-framework-goal-root-20261011/outbox-gates-final.log`, `/tmp/zerospin-framework-goal-root-20261011/outbox-core-typecheck-final.log`).

## Remaining work

None.
