# Make fanout history and subscriber delivery explicit

Status: Implemented and verified in the approved goal on 2026-10-11.

The fanout implementation carries generic schema/table-name/index-column parameters, introspects the subscriber primary key, copies any matching name fragments into row columns and offers an unused default history reader. Every current queue supplies a custom reader. The scheduler also retains a shared suffix reuse cache with three boundary states inside one long refill/delivery loop. Its real model is simpler: immutable owner history, durable subscriber progress/failure, scoped bounded concurrent deliveries and a recovery lease.

Source: [queue](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts), [storage](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts), [catchup](../../../packages/system-worker/src/makeFanoutSubscriber/runFanoutCatchup.ts). Actual five factory call sites: AggregateChain, ServiceChain, AggregateVersionChain's actor and agent result queues, ServiceVersionChain's result queue.

1. Require one typed immutable history reader returning `{rows: {row,index}[], lastIndex}`; remove the optional default raw-table path and `InferSelectModel | ADAPTED_ROW` result union. Owners already know how to read original/replay/result rows; that knowledge belongs to those readers. Cursor bounds remain afterIndex/maxIndex at the RPC boundary.
2. Bind exact subscriber table columns/row encoding at construction. Supply the primary ID column explicitly instead of runtime `getTableConfig` reflection. The storage module owns subscriber enrollment, monotonic acknowledgement, final failure persistence and explicit resume; the scheduler never issues subscriber-table SQL. Remove speculative record-fragment copying and unused ownerKeyFields options. The bound subscriber identity encoder proves exact source-owner fields before enrollment/resume and supplies typed row values. Do not weaken owner validation while removing incidental schema reflection.
3. Split scheduler into meaningful refill and subscriber delivery procedures. Each delivery acquires a native scoped receiver capability, sends one immutable bounded suffix, disposes the receiver, then commits acknowledgement or sole typed final failure. Mixed/defect/interruption Causes abort the drain intact and are not persisted as permanent subscriber failures. A diagnostic SQL failure remains retryable via the retained alarm and prevents pretending a subscriber is settled.
4. Remove the shared suffix reuse cache. Read each selected subscriber's suffix through the required owner reader. This deliberately trades more local bounded reads for one obvious per-delivery cursor; no fetched page's maxIndex/unavailableAfter may be reused under another subscriber's cursor. Preserve bounded refill concurrency and pending-subscriber exclusion, not serialized rounds that make fast subscribers wait behind a slow receiver. Do not replace the scheduler with one giant renamed utility.
5. Keep one drain semaphore, active producer count/revision, recovery alarm hold before producer commit, finalizer wake on all producer exits, and guarded lease release after all eligible work settles. Scope owns pending deliveries/completion queue; no pending/cache state survives a drain. Recheck committed source tip through the explicit history reader, including producers that commit while a drain is in flight. Only release when no active producer and revision unchanged, with the existing no-yield guard.

```ts
const deliverFanoutSubscriber = Effect.fn(function* (
  subscriber: PendingSubscriber,
  boundary: number,
) {
  const page = yield* history.readPage({
    afterIndex: subscriber.currentIndex,
    maxIndex: boundary,
  });
  yield* sendFanoutPage(subscriber, page);
  const deliveredThrough = page.rows.at(-1)?.index ?? subscriber.currentIndex;
  yield* subscribers.acknowledge(subscriber.id, deliveredThrough);
});

const drainFanoutQueue = Effect.fn(function* () {
  const lease = yield* acquireFanoutRecoveryLease();
  yield* runBoundedFanoutDeliveries(
    history,
    subscribers,
    deliverFanoutSubscriber,
  );
  yield* releaseIdleFanoutRecoveryLease(lease);
});

const runBoundedFanoutDeliveries = Effect.fn(function* (
  history: FanoutHistory,
  subscribers: FanoutSubscribers,
  deliver: FanoutDelivery,
) {
  const pending = new Set<string>();
  const completions = yield* Queue.unbounded<FanoutCompletion>();
  while (true) {
    const refill = yield* refillFanoutDeliveries(
      history,
      subscribers,
      pending,
      completions,
      deliver,
    );
    if (pending.size === 0 && refill.exhausted) return;
    const completed = yield* awaitFanoutCompletions(completions);
    yield* settleFanoutCompletions(completed, pending, subscribers);
  }
});
```

`sendFanoutPage` owns acquireUseRelease and exact native RPC envelope semantics; `settleFanoutCompletions` owns first typed failure reporting after healthy work finishes and propagation of nonfinal Causes. These are complete responsibilities, not wrappers. The acknowledged cursor is the final row index actually delivered, not the unbounded source tip returned alongside an empty page. Bind actual current names/types during implementation.

Observable behavior stays: stale enrolment cannot decrease a cursor; retained final failure blocks reenrollment until explicit resume; resume preserves cursor; source owner mismatch is refused; healthy subscribers progress even if one subscriber refuses; acknowledgement never skips rows beyond the delivered suffix; source tip is not restricted to the maxIndex page bound; cold catchup uses a captured first tip and re-reads durable receiver cursor after remote calls. Do not hold receiver execution permits across catchup/enrollment RPC, preserving the cold receiver/source-activation deadlock avoidance. RPC argument decoding already belongs to queue boundary (completed Plan069), not the internal scheduler.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/makeFanoutQueue/
    ~ makeFanoutQueue.ts
    ~ makeFanoutQueueStorage.ts # modify subscriber operations only
    + runFanoutDeliveries.ts
    + deliverFanoutSubscriber.ts
    ~ README.md
  packages/system-worker/src/
    ~ AggregateChain/AggregateChain.ts # modify explicit history/subscriber binding
    ~ ServiceChain/ServiceChain.ts # modify explicit history/subscriber binding
    ~ AggregateVersionChain/AggregateVersionChain.ts # modify or related merger deletes
    ~ ServiceVersionChain/ServiceVersionChain.ts # modify or related merger deletes
```

No fixed subscriber schema change is required if existing exact columns can be bound directly. If the journal/owner merger changes those tables, fresh-storage cutover belongs to that plan. Enroll/ack/failure writes are short synchronous local transactions/statements; no transaction contains remote receive or async page preparation. Current makeTx full Cause preservation and suspended-work fencing remain mandatory.

Implementation order: settle surviving source queue owners; make owner reader required and remove default row path; make subscriber identity/columns explicit; move subscriber SQL behind four meaningful operations; split per-subscriber delivery/refill; remove suffix cache; verify exact lease/ack/failure invariants before removing imports/type parameters. Outbox retry plan is independent; do not retry definitive fanout receiver refusals as transport.

Verification: current system-worker existing `lib`, `ts`, `lint` targets, no test target. Run `pnpm nx run-many -p system-worker -t lib,ts,lint` after owner consolidation integration. Existing source/receiver DO workflow must establish stale enrollment monotonicity, owner mismatch, two subscribers with unequal cursors, one slow/one fast receiver, final failure plus healthy progress, resume from same cursor, concurrent producer commit during drain, callback suspension rollback/alarm lease, acknowledgement SQL failure recovery, cold catchup without deadlock, and receiver disposal. Runtime criteria are unrun in this review. No new tests/fixtures/check runners/config are authorized; graph/type gates alone do not establish scheduler liveness.

Postimplementation: update fanout README and reliable delivery/workflow citations; glossary should describe immutable owner history plus durable subscriber cursor, not the removed suffix cache. A qualifying ADR is warranted only for the shared delivery ownership/model simplification, not routine helper extraction. Archive after every surviving queue construction and required verification completes.

## Implementation progress — 2026-10-11

Fanout owners provide explicit typed bounded suffix readers and unbounded tips. Subscriber storage owns key identity, eligibility, monotone ACKs and diagnostics without raw-history reconstruction. Concurrency refills from completed deliveries; ACK uses the last row sent; healthy subscribers continue after a sole typed refusal. Producer count/revision and durable alarm holds prevent stale drain release. Source/caller audit and worker library compilation pass; prohibited new probes were not added.

### Actual normal aggregate delivery — 2026-10-11

The existing mounted TicTacToe workflow at `http://127.0.0.1:53020/` established ordinary delivery to an aggregate actor selected owner and both same-origin browser tabs. A move in the second tab appeared in the original tab; after closing only the second tab, another move in the survivor completed, and the reopened second tab displayed the same current board. Both reached `XOO.X...X`/`X wins!`. The second tab then selected and played a new game with board `O...X....`, while the original terminal game remained unchanged.

Read-only server inspection found six retained source/results and six selected-history rows for original game `06538c4b-3fe5-44c4-9ef9-3e61b5a38e77`, selected public tip6/hash `b9752804fa90a13212c937aa017b75483f66f57a0d27f82d87f1e3da6ef3f016`, and server private prefix4 for `node_1fdsGFACy-lSB8DH5MM-Q`. New game `d2d47ddb-86f6-4fe7-be5a-3c7e56c9a082` had three retained source/results and three selected-history rows, selected public tip3/hash `610500ccdada23900c757fd85d76fb1943e1bc9c3a479728ded77e3038b9c940`, and private prefix2 for distinct `node_3O4Qh7bjNzMeQl6Kzl1vE`. Each owner's selected resources/checkpoint matched its journal, and all nine hashes independently derived from genesis. Evidence is in `/tmp/zerospin-goal-mounted-retry-browser-baseline.log`, `/tmp/zerospin-goal-mounted-retry-browser-private-baseline.log` and `/tmp/zerospin-goal-mounted-retry-browser-independent-owners.log`; [Plan118](118-plan-version-result-owner.md) records the full row counts.

This is normal source-to-selected-owner catch-up and mounted convergence with independent current game identities. The two same-game tabs shared one producer and do not establish two durable queue subscribers with unequal cursors or slow/fast receiver scheduling. No receiver refusal, suspended callback, ACK SQL failure, commit/drain race, full SharedWorker destruction, offline or lost-acknowledgement recovery was induced. Native receiver capability disposal was not observed by the rendered board.

### Actual native aggregate recovery delivery — 2026-10-11

The existing native app retained its exact offline winning original at push4/node9 through OS process close/reopen and an app update. After the shared connection retirement repair, automatic authentication retries continued while offline; restoring the backend yielded one retained final success at public6/node10, Node outcomeIndex4/admittedThroughPushIndex4 and matching local/selected-owner graph `XOO.X...X`. All prior local journal rows and immutable server source/result/model-operation/async/selected-history entries for the first five occurrences stayed exact, while resources/checkpoints legitimately advanced. A second actual owner reached `O...X....` at public3/private2 without changing any old winner rowset. [Plan118](118-plan-version-result-owner.md#actual-native-offline-recovery-and-independent-owner--2026-10-11) records exact IDs, hashes, counts and host evidence.

This adds real native offline pending delivery and current-owner isolation to normal fanout observations. It does not suspend a fanout receiver, fail an ACK write, measure independent slow/fast subscribers, interrupt a commit/drain boundary or establish receiver-capability disposal.

### Final source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Authorized controlled fanout verification — 2026-10-11

The human authorized disposable `/tmp` verification. `/tmp/zerospin-framework-goal-root-20261011/fanout.mjs` exercises the actual production queue, subscriber store, bounded scheduler, subscriber/catch-up factory, name codec and transaction engine against real SQL.js/Drizzle. Its nine cases pass (exit0, `fanout-final.log`), including a fresh post-repair run that asserts a nested synchronous suspension retains exactly one Cause reason. History rows keep exact immutable raw bytes; controlled dependencies supply alarm observation and receiver timing/faults rather than fabricated owner receipts.

Stale enrollment cannot lower the durable cursor; another owner refuses without inserting; a retained refusal blocks enrollment and explicit resume clears only failure while preserving the cursor. With concurrency2, two fast subscribers reach tip3 while a third receiver is held at cursor0. Each reads its own suffix, and every receiver capability releases once per page. Bounded page1 retains the true tip3, while ACK advances only through the delivered row. A sole typed refusal persists once and leaves healthy progress intact; explicit resume completes its retained suffix.

A producer commits position2 while position1 is in flight, under the preheld recovery lease. Both rows deliver exactly once before the eventual idle drain releases that lease. A suspending synchronous transaction rolls its first row back, cancels the actual fiber and prevents its late continuation from writing. An actual SQLite trigger refuses ACK: cursor0 and the alarm remain, and the next drain redelivers the exact immutable page then settles cursor1. A second trigger refuses diagnostic persistence: the subscriber remains eligible and recovery remains armed until the actual refusal can be recorded. A typed receive refusal combined with a throwing capability release retains both Cause reasons without permanent failure SQL or ACK.

The actual cold catch-up/subscriber factories capture first tip2 while the source commits tip3, pull only through2, dispose the acquired source capability, then enroll the same durable cursor and receive3. The receiver's real semaphore is acquired only by its receive procedure, allowing catch-up to finish without a held execution permit. Every temporary SQLite client, Effect runtime and background drain is joined/closed. This bounded Node scheduler matrix complements the actual Durable Object/app delivery above; it does not claim a new browser or OS test.

The shared synchronous runner now joins cancellation before reading the terminal Cause, preserving cleanup failures while excluding only its own induced interruption. The post-repair admission, catalogue and fanout matrices pass, as do the focused five-project library/type/lint graph (20 tasks) and actual core typecheck (4 tasks). An independent completion audit found every listed fanout criterion covered by the controlled matrix and the actual host delivery above.

## Remaining work

None.
