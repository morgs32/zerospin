# Queue lifecycle consistency

**Date:** 2026-10-15

**Status:** Complete — implemented and verified on 2026-10-15. Archived after required scoped verification.

**Related:** [queue-interface research](/Users/morgs32/GitHub/zerospin/wiki/research/external-operations-and-outbox-abstraction.md), [Plan 198](/Users/morgs32/GitHub/zerospin/wiki/archive/plans/198-plan-external-operation-queue-simplification.md), [ADR 016](/Users/morgs32/GitHub/zerospin/wiki/adrs/016-aggregate-original-operations-and-external-work.md), [Plan 196](196-plan-service-chain-original-operations-and-external-work.md).

## Problem and intended result

Local queue methods currently mix invocation and completion meanings. `makeExternalOperations.recover()` is an Effect that schedules independently running requests. `makeOutboxQueue.drain()` is an Effect that awaits delivery and acknowledgement. `makeFanoutQueue.drain()` starts immediately and returns a retained Promise. Normal external work uses a method named `recover`, while two methods named `drain` require different invocation styles.

Give callers a consistent lifecycle vocabulary without merging delivery and external execution into a general engine. Construction registers lazy recovery. A local `wake()` Effect ensures required durable recovery and schedules eligible work without waiting for request or delivery settlement. A local `drain(...)` Effect awaits requested delivery and acknowledgement where callers require that completion guarantee. Keep existing transactional ownership, live reservations, producer leases and alarm failure propagation.

Current source: [external module](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts:166), [outbox lifecycle](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts:264), [fanout interface](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts:52), [fanout implementation](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts:301).

## Naming and scope

1. Rename `makeExternalOperations` and its defining file to `makeExternalOperationQueue`. Rename each Chain's private instance to `#externalOperationQueue`. Replace the returned `recover` method with `wake`; remove the superseded export, method and import paths outright.
2. `makeExternalOperationQueue` names the durable work it owns. It knows frozen external declarations, portable payload/response codecs, external Success/Failure observation settlement and request recovery. `makeParallelQueue` would suggest a general concurrent scheduler while hiding those domain responsibilities. Concurrency remains part of this queue's documented behavior.
3. Automatic recovery is part of all three server queue modules' lifecycle contract. Explain it directly: each queue registers recovery, renews its durable wake while responsibility remains and releases its own lease after completion. Do not imply a permanently running loop, a surviving process-local reservation or provider exactly-once execution.
4. Standardize the local lifecycle interface of `makeExternalOperationQueue`, `makeOutboxQueue` and `makeFanoutQueue`. Keep `makeOutboxDelivery` as the existing portable ordered-delivery engine used by both browser and server callers. It has no Durable Object alarm or new `wake` responsibility.
5. This plan does not extract a shared queue engine, producer-lease module, generic queue base class or new runtime adapter. A common method contract does not require a new generic interface or policy-object framework.

## Lifecycle contract

| Operation           | Invocation and successful completion                                                                                                                                                                                        | Owner                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Construction        | Create local state and register lazy recovery Effects. Registration starts no database scan, request or delivery.                                                                                                           | Each queue factory; its internal constructor is an implementation detail.                              |
| `wake()`            | Return a lazy local Effect. When run, establish required durable recovery and schedule an eligible processing attempt, or reconcile an empty queue. Return without waiting for the resulting request or delivery to settle. | Each server queue module owns runtime invocation, rejection observation and host background retention. |
| `drain(...)`        | Return a lazy local Effect. When run, await the requested delivery/acknowledgement work or fail with its Cause. Respect the existing numeric bound or captured fanout tip.                                                  | Outbox and fanout retain their actual delivery procedures. External operations expose only `wake`.     |
| Producer completion | Preserve the producer's result and required pre-commit lease, then invoke queue-owned background scheduling on the existing completion paths.                                                                               | Existing `drainAfter` and fanout `producerLease` procedures.                                           |
| Alarm dispatch      | Run the registered recovery Effect and retain its current completion/error meaning.                                                                                                                                         | `makeAlarmRegistry` and the owning Repo's existing `alarm()` handler.                                  |

The contract describes scheduling and awaited progress, not admission or execution commit. A completed `wake()` proves neither a recorded external observation nor a retained `outcome`. A completed bounded original-command drain has the existing stronger acknowledgement guarantee; its caller still checks the durable domain fact it requires. [Bounded original execution](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateChain/executeCommandsThrough/executeCommandsThrough.ts:35), [bounded snapshot publication](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts:92).

## Module changes

1. **External-operation queue.** Keep table discovery, row decoding, per-`externalCommandId` reservation, exact declaration resolution, request/response validation, timeout/interruption settlement, recording and pending-state alarm reconciliation together. Rename `recover` to `wake` without awaiting running requests. Keep `{ wake }` as the returned interface. Align the renamed queue's lease/registration name and procedure spans consistently; update their exact callers and existing assertions. Frozen data field names and public error codes retain their current meanings.
2. **AggregateChain and ServiceChain.** Use the renamed factory and instance. Replace explicit external `recover()` calls in activation and original acknowledgement hooks with `wake()`. The observation recording callbacks remain wrapped in the existing admitted-command queue's `drainAfter`. Preserve original acknowledgement, replay lease and external wake ordering. Preserve the activation helpers' existing original/fanout alarm holds rather than starting remote delivery earlier in startup.
3. **Outbox.** Add a local `wake()` Effect that arms recovery before detaching a processing attempt and owns the existing managed-runtime invocation, invocation capture, rejection observation and host retention. Route producer-completion background scheduling through that operation. Keep `drain(throughIndex?)` as the awaited Effect and retain its error/service types. Keep active-producer/revision protection and the completion hook on an empty restarted drain. A post-producer host-retention failure must not replace the producer's Exit.
4. **Fanout.** Add the same local `wake()` scheduling contract. Replace the eager public Promise-valued `drain()` interface with a lazy Effect-valued awaited drain. Reuse the existing finite-tip processing procedure, semaphore, independent recipient settlement and producer/revision checks. Route producer-lease completion through queue-owned scheduling. Enrollment must still complete independently of a drain awaiting receiver activation.
5. **Fanout runtime ownership.** Preserve queue-owned delivery: interrupting a caller waiting on a fanout drain must not cancel the independently retained delivery. The lazy local drain Effect should start that owned attempt when run and await its Exit, preserving the original Cause. Reuse the captured managed runtime at this host-execution seam rather than introducing an eager public Promise method or erasing service requirements. Local methods return Effects; RPC methods continue using their existing Promise/envelope transport contract.
6. **Alarm registration.** Retain awaited outbox/fanout processing Effects as alarm registrations. External registration uses its nonwaiting `wake()` Effect. Do not replace every registered operation with background scheduling: that would stop the registry from observing delivery failures it currently awaits. Alarm-owned attempts retain their existing runtime/invocation capture and must not acquire a second outer invocation collector.
7. **Current callers and documentation.** Update defining-file imports, exact moved-file references, existing acceptance adapters, existing fanout callers and current module documentation. Repair links to the renamed source file, including historical documents that link to current source, without rewriting historical findings into claims about the new behavior. Keep unrelated concurrent source and active-plan work intact.

## Required invariants

1. Construction remains inert. A local Effect does not launch work until run. Normal production, activation and alarms reuse the same module-owned processing behavior.
2. `wake()` completes while a request or recipient is blocked. Outbox/fanout delivery retains its existing ordering, captured bounds and acknowledgement rules. External requests remain independent; repeated wakes cannot overlap the same live external operation.
3. SQL transactions still own local atomic facts. Both Chain observation transactions re-read pending work, admit the external command and delete the request atomically. Missing work makes a late callback a no-op. The live reservation still spans request finalizers, recording and alarm cleanup; no SQL transaction spans the external request.
4. Producer failure, interruption or a finished newer producer cannot let an older drain release the last required wake. Keep pre-commit alarm holding and active-producer/revision checks. `drainAfter` returns the producer result without awaiting delivery.
5. Original acknowledgement hooks and empty-drain recovery still establish replay/external responsibility before original delivery recovery releases. A completed external operation never waits for its newly admitted command to execute.
6. Failed recording leaves complete pending work recoverable. Terminal request Failure remains a recorded external observation. A failing registered delivery operation remains visible to `makeAlarmRegistry.run()` while other registered operations settle independently.
7. Preserve each module's existing interruption ownership, subscriber disposal, full Causes, fanout cursors and retained history. Background launch observes rejection and retains the real processing Promise through the supplied host callback.
8. Fixed schemas and durable row ownership do not change. No storage reset, persisted retry state, compatibility aliases, dual methods or generic parallel scheduler is part of this plan.

## Implementation sequence

1. Re-inspect the named files and current diffs before edits. This repository has concurrent uncommitted operation-packet and storage-review work. Preserve it and use current source for all assertions; do not resume other plans.
2. Rename the external factory/file and its returned method; update both Chain compositions and exact existing script imports/calls. Retain the queue's complete processing implementation and settled ownership.
3. Add queue-owned `wake()` to outbox and fanout, route their existing producer-exit launch paths through it and make fanout's awaited local drain lazy and Effect-valued. Remove the replaced eager public Promise interface. Keep the internal alarm registrations' existing completion meanings.
4. Adapt existing fanout verification calls from eager Promise invocation to explicit Effect execution. Where an existing concurrency scenario must start a drain before proceeding, run/fork the Effect explicitly through its existing test runtime. Modify existing supporting files only as required; create no test, fixture, runner or configuration file.
5. Add only missing concise assertions to existing scenarios for lazy construction/local invocation, nonwaiting `wake`, awaited drain, blocked external independence, queue-owned fanout settlement and alarm failure propagation. Reuse current gates, retained-promise flushes and real SQLite/Workerd seams.
6. Update the affected module READMEs and existing glossary after implementation. Define `wake` versus awaited `drain` by their observable meanings; document the external queue's independent processing and automatic recovery. This local naming/lifecycle change does not currently justify a new ADR; reassess only if implementation reveals a decision meeting all repository ADR criteria.
7. Run the scoped verification below, fix in-scope failures and record actual results. Keep this plan active while any required check remains unfinished. Archive with its filename and repaired links only after implementation and verification are complete.

## Planned file hierarchy

`+` creates this plan; `~` modifies existing files; `>` renames the existing factory file. No new test/check file or production module is planned.

```text
zerospin/
  packages/system-worker/
    src/
      externalOperations/
        > makeExternalOperations.ts -> makeExternalOperationQueue.ts
        ~ README.md
      makeOutboxQueue/
        ~ makeOutboxQueue.ts
      makeFanoutQueue/
        ~ makeFanoutQueue.ts
        ~ README.md
      AggregateChain/
        ~ AggregateChain.ts
        ~ README.md
      ServiceChain/
        ~ ServiceChain.ts
        ~ README.md
      makeMigratableDORepo/
        ~ README.md
    test/
      fanout-queue/
        ~ fanout-queue.workerd.spec.ts
        ~ fixture.ts (only existing interface/type adjustments)
      telemetry/
        ~ invocation-order.workerd.spec.ts (only missing lifecycle assertions)
      migratable-do-repo/
        ~ system-repo-activation.workerd.spec.ts (only missing activation assertions)
  scripts/
    ~ verify-plan140.mjs
  wiki/
    + plans/201-plan-queue-lifecycle-consistency.md
    ~ glossary.md
    ~ research/external-operations-and-outbox-abstraction.md
    ~ existing documents linking the renamed factory (path repair only)
```

`makeAlarmRegistry`, `makeOutboxDelivery`, queue storage procedures, both Chain observation/admission transactions and bounded execution/snapshot callers are dependencies to preserve. Adjust a type-only caller only when required by the standardized local interface. No change to their domain behavior is planned.

## Verification

1. Reuse the existing fanout Workerd suite for finite captured-tip delivery, independent failures, producer/revision races, enrollment during a blocked drain and automatic recovery. Prove lazy local controls and `wake()` returning before delivery settles through those existing scenarios. Keep the existing owned-delivery lifetime when an awaiting caller stops.
2. Reuse `scripts/verify-plan140.mjs` for external live reservations, independent completion, empty/pending alarm reconciliation, first observation/admission, rollback, late callbacks and timeout/interruption settlement. Preserve its blocked-request/other-queue-lease scenario under the renamed factory and `wake` method.
3. Reuse the existing telemetry and activation Workerd files for invocation capture, durable alarm renewal, full failure Causes, cold recovery and acknowledgement-to-replay/external handoff. Run the existing system-worker Workerd suite because the lifecycle factories serve every server queue owner.
4. Reuse known Nx project configuration, refreshing it only if task metadata changed. Run `pnpm nx run-many -t ts lint test-workerd-ts -p system-worker --nxBail`, then `pnpm nx run system-worker:test-workerd`. Rebuild the acceptance script's emitted dependencies with `pnpm nx run @zerospin/browser:lib`, then run `node scripts/verify-plan140.mjs`.
5. Check scoped formatting, whitespace, renamed imports/source links and absence of the superseded factory export, `recover` method and eager fanout Promise-valued local drain. Other domain methods named `recover` are unrelated. Verify that acknowledged command rows, fanout histories/cursors and external pending rows retain their existing owners and deletion conditions.

## Alternatives

1. **Rename everything to `drain`.** Rejected: external processing would still return after scheduling while ordered delivery returns after acknowledgement. Waiting for all external requests instead would change command-queue progress and the agreed independent-execution contract.
2. **Use `makeParallelQueue` or `makeRecoveringQueue`.** Rejected for this module: these names imply a general scheduler and omit exact external-declaration/response/observation responsibilities. Recovery belongs to the documented queue lifecycle; concurrency is its scheduling policy. A future generic queue would require a separately justified seam and real adapters.
3. **Add a shared queue engine or extract producer leases now.** Deferred outside this plan. The current request is a consistent local lifecycle interface. Existing scheduling and failure ownership stay within the modules that already implement them.

## Completion evidence

1. Renamed the external factory and file to `makeExternalOperationQueue`, renamed both Chain instances, replaced `recover` with `wake`, and aligned the queue's private alarm key and procedure spans. Both activation and original acknowledgement use `wake`; exact declaration resolution, live reservations and atomic observation/admission remain unchanged.
2. Added lazy queue-owned `wake()` to outbox and fanout and routed existing producer completion through it. Outbox `drain(throughIndex?)` remains awaited. Fanout `drain()` is now a lazy Effect that awaits an independently retained attempt and propagates its full Cause; stopping the waiter does not cancel delivery. Alarm registrations retain their awaited processing Effects.
3. Updated existing fanout and telemetry scenarios to exercise lazy construction/invocation, nonwaiting wake while work is blocked, awaited drain Causes, producer/revision races and the distinction between alarm interruption and local waiter interruption. Adapted the existing external acceptance script to the renamed factory and `wake`. Created no test, fixture, check runner or configuration file.
4. `pnpm nx run-many -t ts lint test-workerd-ts -p system-worker --nxBail` passed. Lint reported 13 existing warnings and no errors. `pnpm nx run system-worker:test-workerd` passed all 6 files and 27 tests.
5. `pnpm nx run @zerospin/browser:lib` passed to refresh emitted acceptance dependencies. `node scripts/verify-plan140.mjs` passed all 13 groups, including external first observation, rollback, timeout/interruption, independent requests and alarm ownership. Nx Cloud reported an access warning after successful local tasks; these checks completed successfully.
6. Updated current module documentation and the glossary's queue wake/drain meanings. Repaired links to the renamed source file while preserving historical findings. Scoped formatting, whitespace and 58 plan/renamed-factory link checks passed. No new ADR qualifies for this reversible local lifecycle change.
7. Preserved the concurrent admitted/evaluated-command, operation-packet and storage-review work. No schema, storage-reset, compatibility, deployment, commit or publication changes were introduced by this plan.

## Remaining work

**None.**
