# Can external operations and outbox delivery share an abstraction?

**Interface update, 2026-10-18:** The source descriptions below record the earlier
`drainAfter` interface. Both queues now expose `producerLease` for durable
pre-production recovery and producer bookkeeping, with explicit caller `wake()`
after production. Lease release performs no scheduling. Awaited `drain()` retains
its acknowledgement contract. See the [implemented replacement](drain-after-explicit-queue-progress.md#implemented-replacement).

**Date:** 2026-10-15

**Scope:** Static research against the working tree after Plan 198, based on commit `6942dee5fef11bf39d05dab398c2ad104e43d3f8` plus concurrent uncommitted changes. Compared `makeExternalOperations`, `makeOutboxQueue`, `makeOutboxDelivery` and their callers; inspected `makeFanoutQueue` for recovery-lifecycle duplication and public lifecycle consistency. Checked first-party Cloudflare alarm documentation. No production changes or runtime verification were performed for this research.

**Implementation update, 2026-10-15:** [Plan 201](/Users/morgs32/GitHub/zerospin/wiki/archive/plans/201-plan-queue-lifecycle-consistency.md) implemented the lifecycle recommendation below. The factory is now `makeExternalOperationQueue`; external, outbox and fanout expose lazy local `wake()` Effects, and outbox/fanout retain awaited Effect-valued `drain`. Fanout delivery remains queue-owned when an awaiting caller stops. The comparison below records the preceding source and the reasoning behind this change. Verification passed all 27 existing Workerd tests, all 13 native contract groups and the scoped type/lint graph.

**Finding:** There is a real shared durable-work lifecycle, and `makeAlarmRegistry` already implements its common scheduling responsibility. The remaining overlap between external operations and ordered delivery does not currently justify one general queue engine. A narrower producer-lease abstraction has a stronger concrete case in `makeOutboxQueue` and `makeFanoutQueue`. These are design conclusions from the source comparison below, not an implemented or approved refactor.

## What is actually shared?

Both mechanisms discover durable pending work, prevent overlapping live processing at their chosen unit, attempt work and leave durable state available for recovery when completion fails. Both server-side mechanisms use a named alarm lease and register a recovery Effect. Plan 198 made pending-table ownership explicit inside `makeExternalOperations`; sharing `db` and `outboxTable` makes the composition more similar without making the completion protocol identical. [External recovery][external-recover], [external alarm reconciliation][external-alarm], [outbox storage][outbox-storage], [outbox recovery][outbox-recovery].

The shared scheduling module already has a substantive responsibility: maintain named deadlines, program the earliest Durable Object alarm, release one lease without deleting another operation's wake and run registered recoveries independently before reporting their combined failures. Cloudflare supplies one alarm per Durable Object, at-least-once alarm execution and bounded automatic failure retries. The registry multiplexes that platform facility; it is already the correct shared owner of physical alarm scheduling. [Alarm registry][registry], [Cloudflare alarms][cloudflare].

## Where the execution protocols differ

| Question                                          | `makeOutboxDelivery` / `makeOutboxQueue`                                                                                                                   | `makeExternalOperations`                                                                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is reserved?                                 | One drain at a time through a semaphore. The database adapter selects ordered numeric pages.                                                               | Each `externalCommandId` independently through a live Set; other requests can run concurrently.                                                             |
| What does the public operation await?             | `drain(throughIndex?)` awaits page delivery and acknowledgement until the selected range is empty or fails.                                                | `recover()` reserves eligible rows and retains background promises; it returns without awaiting request completion.                                         |
| What completes the pending responsibility?        | A subscriber's RPC receipt is decoded, acknowledgement commits, then the completion hook runs.                                                             | An authored request produces a Success or terminal Failure observation; the Chain atomically admits its external command and deletes the pending request.   |
| What happens after an operation failure?          | An unsuccessful page stops that drain without successful acknowledgement. Narrowly classified transport failures can retry during delivery.                | Request/response-codec failure becomes data in a committed external Failure observation. Declaration or recording failure leaves pending work for recovery. |
| Who owns removal or progress?                     | The default adapter deletes the selected rows and applies acknowledgement effects in one transaction. Custom storage can instead update retained commands. | The Chain's observation/admission transaction owns deletion together with admitted-command creation.                                                        |
| Is there a recovery handoff?                      | Completion hooks can establish another queue's wake before this queue releases recovery, including on an empty restarted drain.                            | Recording runs under the admitted-command queue's `drainAfter`; request completion does not await that command's execution.                                 |
| Does the execution core require a Durable Object? | No. The browser's staged-command handoff also uses `makeOutboxDelivery`.                                                                                   | The current module consumes Chain-local database, alarm and background-runtime dependencies.                                                                |

Sources: [delivery semaphore and page loop][delivery-loop], [transport and acknowledgement][delivery-transport], [database adapter][outbox-storage], [retained-command acknowledgement][retained-acknowledgement], [producer and drain lifecycle][outbox-lifecycle], [external settlement][external-execute], [external recovery][external-recover], [Aggregate composition][aggregate-composition], [Service composition][service-composition], [Aggregate transaction][aggregate-record], [Service transaction][service-record], [browser handoff][browser].

The concurrency difference alone is not a reason to reject an abstraction. A scheduler can support serial and independent work. The practical question is whether that scheduler would own enough common behavior after preserving all these differences. This source comparison supports a narrower conclusion: most execution behavior would still live in two separate procedures, with additional scheduling policies needed around them.

## What would a combined engine have to own?

A general engine could let each adapter supply a complete processing Effect. Ordered processing would contain preparation, subscriber acquisition/release, transport retry, receipt decoding, acknowledgement and the completion hook. External processing would contain exact declaration resolution, response validation, interruption settlement and atomic observation/admission. Keeping those responsibilities in the adapters is feasible; it also leaves the proposed common engine mostly responsible for scheduling and recovery. [Delivery processing][delivery-transport], [external processing][external-execute].

That smaller engine would still need answers to four separate questions:

1. **Scheduling:** reserve a whole drain or individual IDs; wait for an existing drain or skip an already live ID; consume successive pages or launch a snapshot independently. The current semaphore and Set express different useful contracts. [Delivery loop][delivery-loop], [external recovery][external-recover].
2. **Completion:** return after durable acknowledgement or after scheduling background work. Making both methods return the same Effect type would not make their completion meanings interchangeable. [Queue interface][queue-interface], [external recovery][external-recover].
3. **Release safety:** pending-table emptiness is sufficient only after any required handoff and producer protection. `makeOutboxQueue` tracks active producers and a producer revision because `drainAfter` permits asynchronous preparation before insertion. External requests are discovered after original acknowledgement; both Chains invoke external recovery from that original queue's completion hook. [Outbox producer/release logic][outbox-lifecycle], [Aggregate composition][aggregate-composition], [Service composition][service-composition].
4. **Failure meaning:** a failed external request can successfully complete its pending responsibility by committing an external Failure observation. A failed transport or recording procedure leaves work pending. A shared engine must not decide either from the presence of an exception without the domain procedure's settlement rules. [Delivery failure handling][delivery-transport], [external settlement][external-execute], [Aggregate transaction][aggregate-record].

**Assessment:** A small `{ read, key, process }` interface does not own those choices. Moving them into policy objects is possible, but would need to show a net simplification over the two existing loops. No such simplification is established by the current duplicated code. This is a maintainability judgment, not a claim that generic queues cannot support these semantics.

## The stronger extraction candidate

`makeOutboxQueue` and `makeFanoutQueue` duplicate something more specific: `activeProducers`, `producerRevision`, a pre-production alarm hold, producer-exit bookkeeping, a drain wake and a revision check before releasing recovery. This protects an observable invariant: a drain must not release the last wake while a concurrent producer can still create work. Both modules implement that invariant directly. [Outbox producer lifecycle][outbox-lifecycle], [fanout producer/release lifecycle][fanout-lifecycle].

A producer-lease abstraction could own that count/revision protocol and leave delivery to each queue. It would have to preserve the current differences: outbox producers may prepare asynchronously; fanout `drainAfter` requires synchronous callback execution; fanout exposes a scoped producer lease; drain completion and rearming differ. That is a bounded candidate for a future design comparison, not justification to merge their delivery protocols or add producer counters to external operations. [Outbox lifecycle][outbox-lifecycle], [fanout lifecycle][fanout-lifecycle].

## Recommendation

1. Keep `makeOutboxDelivery` as the ordered acknowledged-delivery mechanism and `makeExternalOperations` as independent external execution plus observation settlement.
2. Keep both composed with `makeAlarmRegistry`. Avoid extracting table-existence SQL or wrapping `register`/`hold`/`release` alone; the current comparison shows little additional behavior for those helpers to own.
3. If reducing recovery-lifecycle duplication becomes the next task, compare a producer-lease extraction across `makeOutboxQueue` and `makeFanoutQueue` first. Require the resulting code to preserve asynchronous versus synchronous producer behavior and all handoff ordering.
4. Reconsider a general pending-work engine when a concrete caller needs the same reservation, completion and recovery policy, or a source-level sketch demonstrably removes more lifecycle machinery than it introduces. The criterion is simpler ownership and fewer places encoding the same invariant, rather than the number of modules called queues.

These recommendations follow the source comparisons above and the repository's guidance to justify abstractions by a current caller and an observable invariant. [Coordination guidance][coordination].

## Follow-up: make lifecycle meanings consistent

The naming question exposes an interface problem independent of whether a shared engine is worthwhile:

1. `recover()` also starts ordinary newly pending external operations. AggregateChain and ServiceChain call it from original acknowledgement hooks as well as activation. Its name suggests a special failure path that callers do not actually select. [Aggregate composition][aggregate-composition], [Service composition][service-composition], [Aggregate activation][aggregate-activation], [Service activation][service-activation].
2. `makeOutboxQueue.drain()` returns an Effect that a caller must run. `makeFanoutQueue.drain()` immediately runs its internal Effect in the managed runtime and returns the retained Promise. `makeExternalOperations.recover()` returns an Effect whose completion means eligible requests have been scheduled, not settled. Matching only their names would hide these different completion contracts. [Outbox drain][outbox-drain], [fanout public interface and invocation][fanout-interface], [fanout runtime invocation][fanout-runtime], [external recovery][external-recover].
3. Construction is already substantially consistent. Each factory registers a lazy recovery Effect; registration itself neither reads pending work nor starts delivery. The internal constructor versus factory-body placement is packaging, not a different lifecycle. Owner activation occurs after schema/bootstrap setup. [Outbox registration][outbox-recovery], [fanout registration][fanout-runtime], [external registration][external-recover], [Repo activation and alarm dispatch][repo-lifecycle].

**Proposed convention:** distinguish scheduling from awaited progress explicitly, and use Effects for local lifecycle control. This table describes a recommendation, not the current interface.

| Operation    | Meaning callers can rely on                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Construction | Create local state and register a lazy recovery Effect. Owner initialization controls when processing can begin.                                                                 |
| `wake()`     | Run an Effect that ensures required recovery and schedules eligible background work. Successful completion does not mean the requests or deliveries have settled.                |
| `drain(...)` | Run an Effect that awaits the requested delivery/acknowledgement work, honoring a supplied bound where supported. Expose it where actual callers need that completion guarantee. |

For external operations, this would replace `recover` with `wake` while preserving its independent request behavior. For outbox and fanout, `wake` should own their existing managed-runtime invocation, rejection observation and host background retention, rather than wrap another public method without adding ownership. Their producer-exit paths already perform that scheduling. The existing awaited processing Effects remain available for delivery and alarm recovery. Old names would be removed in a hard cutover if implementation is approved. [External recovery][external-recover], [outbox producer scheduling][outbox-lifecycle], [fanout producer and runtime scheduling][fanout-runtime].

There are concrete callers that require awaited delivery. `AggregateChain.executeCommandsThrough` drains through a selected admitted-command position and then verifies no pending original remains. `AggregateActorVersionRepo.getSnapshot` supplies a bounded drain to publication capture. A uniform scheduling method must preserve these awaited procedures rather than redefine `drain` to return after background launch. [Execute through][execute-through], [snapshot publication][snapshot-publication].

Alarm dispatch also has a completion contract: `makeAlarmRegistry.run()` waits for its registered recovery Effects and combines their failures. Ordered delivery currently registers its awaited processing Effect, whereas external recovery schedules independently retained requests. A common public `wake()` does not imply replacing every registered alarm Effect with a background-launch wrapper; that would change which failures the registry observes. Preserve each module's recovery and handoff ordering while standardizing caller-facing names. [Alarm dispatch][registry], [outbox registration][outbox-recovery], [fanout registration][fanout-runtime], [external recovery][external-recover].

**Assessment:** Standardizing lifecycle meanings has a clearer payoff than introducing a universal queue engine. It gives callers a stable distinction between requesting progress and waiting for it, while keeping producer protection, numeric acknowledgement and per-operation settlement with the modules that own them. The maintainer subsequently requested a plan: [Plan 201](/Users/morgs32/GitHub/zerospin/wiki/archive/plans/201-plan-queue-lifecycle-consistency.md) records the implemented lifecycle contract and `makeExternalOperationQueue` factory name. Implementation and scoped verification are complete.

[external-alarm]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts:50
[external-execute]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts:63
[external-recover]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts:166
[registry]: https://github.com/morgs32/zerospin/blob/ece535eaf7f5d7fa5838347d45e490733c61bd5f/packages/system-worker/src/makeAlarmRegistry/makeAlarmRegistry.ts#L17
[cloudflare]: https://developers.cloudflare.com/durable-objects/api/alarms/
[outbox-storage]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts:185
[outbox-recovery]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts:307
[outbox-lifecycle]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts:267
[delivery-transport]: /Users/morgs32/GitHub/zerospin/packages/core/src/outbox/makeOutboxDelivery.ts:221
[delivery-loop]: /Users/morgs32/GitHub/zerospin/packages/core/src/outbox/makeOutboxDelivery.ts:316
[queue-interface]: /Users/morgs32/GitHub/zerospin/packages/core/src/outbox/IOutboxQueue.ts:4
[aggregate-composition]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateChain/AggregateChain.ts:121
[service-composition]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/ServiceChain/ServiceChain.ts:112
[aggregate-record]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateChain/recordExternalOutcomeAndAdmitCommandTx.ts:12
[retained-acknowledgement]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateChain/recordOriginalCommandOutcomeTx.ts:108
[service-record]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/ServiceChain/recordExternalOutcomeAndAdmitCommandTx.ts:12
[browser]: /Users/morgs32/GitHub/zerospin/packages/browser/src/outbox/makeSessionCommandHandoff.ts:97
[fanout-lifecycle]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts:255
[coordination]: /Users/morgs32/GitHub/wiki/skills/use-morgs32-wiki-patterns/references/patterns/runtime/yagni-before-coordination.md
[outbox-drain]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts:327
[fanout-interface]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts:52
[fanout-runtime]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts:306
[aggregate-activation]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateChain/AggregateChain.ts:263
[service-activation]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/ServiceChain/ServiceChain.ts:266
[repo-lifecycle]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts:324
[execute-through]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateChain/executeCommandsThrough/executeCommandsThrough.ts:35
[snapshot-publication]: /Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts:92
