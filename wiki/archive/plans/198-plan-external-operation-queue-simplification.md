# External operation queue simplification

**Date:** 2026-10-15

**Status:** Complete — implemented and verified on 2026-10-15. Archived after scoped verification.

**Related:** [Plan 195](195-plan-aggregate-chain-original-operations-and-external-work.md), [Plan 196](196-plan-service-chain-original-operations-and-external-work.md), [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md), [storage review](../../plans/151-plan-storage-table-review.md).

## Problem and intended result

`externalOperationOutbox` is the durable backlog consumed by `makeExternalOperations`. AggregateChain and ServiceChain currently supply nearly identical pending-row scans and an overloaded `hasPending(externalCommandId?)` callback. The module owns in-flight reservations and alarm reconciliation but makes each caller assemble its storage mechanics.

The useful distinction from `makeOutboxQueue` is independent execution, not whether this is a queue. `makeOutboxQueue` drains numerically ordered pages through an RPC subscriber and waits for acknowledgement. External requests must progress independently and finish by recording a Success or terminal Failure observation locally. A slow request must not block unrelated requests.

Make `makeExternalOperations` a deeper module for that actual queue lifecycle. Remove unsupported checks and subsequent-command delivery coupling; move pending-table discovery inside it. Keep the domain-specific request/observation behavior and synchronous admission transaction explicit. This plan introduces no universal queue framework or second recovery scheduler.

## Current source and decisions

1. **Preserve existing progress.** At planning time, current source already removes the `deliver` callback and its delivery error/service generics, uses a Set for live IDs, and returns only `recover`. Retain those changes. Do not restore the old interface to replay earlier discussion. Re-inspect source before implementation because the parent conversation is active.
2. **One external operation finishes at observation/admission commit.** AggregateChain or ServiceChain records the first `externalOutcome`, admits its resulting command and deletes the pending operation in one synchronous transaction. Later execution of that admitted command belongs to `finalizeCommandOutbox` or `executeCommandOutbox`. The external-operation reservation must not wait for that command execution.
3. **Subsequent command delivery already has an owner.** Both Chain `record` callbacks use their command outbox's `drainAfter(...)`. That arms command recovery before admission and starts command delivery after the recording procedure returns. Activation also retains each command queue's own recovery. `makeExternalOperations` must not acquire a callback that separately drains those command queues.
4. **Remove the pre-request existence check.** Recovery synchronously decodes pending rows and reserves each ID before scheduling its request; that reservation remains until request finalizers, recording and cleanup settle. The only current production deletion path is that operation's recording transaction. No cancellation or independent consumer justifies a second `hasPending(id)` lookup before request execution.
5. **Retain the transaction's pending-row check.** Both `recordExternalOutcomeAndAdmitCommandTx` procedures re-read frozen work inside SQL and return without admission if it is absent. This is the atomic first-observation/admission guard. Removing a pre-request lookup does not remove this guard or authorize recreating deleted work.
6. **Pending-row existence still controls recovery.** In-flight memory cannot replace durable pending state. Declaration/storage failures can leave a row after a run ends; process loss clears live reservations. The module must renew its alarm while rows remain and release its lease when they do not. It should answer that storage question internally rather than expose another caller-supplied callback.
7. **Keep `alarmRegistry` shared.** It coordinates one Durable Object alarm across named recovery procedures. `makeExternalOperations` continues registering, renewing and releasing its own recovery through that registry. Preserve each Chain's existing pre-commit recovery hold and completion-hook ordering; do not invent another scheduler, producer protocol or persisted retry state.

Current evidence: [external runner](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts), [Aggregate composition](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts), [Service composition](../../../packages/system-worker/src/ServiceChain/ServiceChain.ts), [Aggregate observation transaction](../../../packages/system-worker/src/AggregateChain/recordExternalOutcomeAndAdmitCommandTx.ts), [Service observation transaction](../../../packages/system-worker/src/ServiceChain/recordExternalOutcomeAndAdmitCommandTx.ts), [alarm registry](https://github.com/morgs32/zerospin/blob/ece535eaf7f5d7fa5838347d45e490733c61bd5f/packages/system-worker/src/makeAlarmRegistry/makeAlarmRegistry.ts), [ordered outbox](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts).

## Module interface and ownership

1. Replace the `pendingRows` and `hasPending` callbacks with the existing database and physical table: `db` and `outboxTable`. Retain `workCodec`, supplied from the owner's existing table codec, to decode complete rows. Do not introduce another row schema, wrapper table declaration or fallback decoder.
2. Inside `makeExternalOperations`, select pending rows from `outboxTable` and use a bounded existence query for alarm reconciliation. The table needs stable `externalCommandId`; it does not need a numeric delivery index. Preserve the existing request identity and fixed schemas.
3. Keep `resolve(work)` and `record(work, externalOutcome)` as the real domain seams. Aggregate and Service differ in exact declaration ownership, retained version fields, Origin and admission position. Each Chain continues supplying its existing transactional recording procedure and its command queue's `drainAfter(...)` wrapper.
4. Keep the actual host dependencies `alarms`, `run`, `background` and optional `now`. They provide durable scheduling, the owner's runtime/invocation capture, promise retention and deterministic clock behavior. This plan does not add a generic runtime adapter or an RPC subscriber around local operation execution.
5. Keep public `recover()` non-blocking with respect to external request completion: it reconciles recovery, reserves eligible operations synchronously and retains independently running promises. Its observable completion does not mean requests or admitted commands have finished.
6. Remove the optional command-ID existence parameter, its pre-request call, obsolete caller SQL and any remaining old test-adapter properties. Remove a local variable only if it no longer serves the reservation or execution. Keep the in-flight Set and release it in the existing completion path.

This changes the module interface, not persisted ownership. No schema change or storage reset is intended.

## Execution, failure and recovery requirements

1. Original execution retention creates complete pending operations before any request starts. Replay never launches external requests. Resolve each operation's exact retained Aggregate/Service release and external contract version; do not substitute current or latest declarations.
2. One operation has at most one live execution within a constructed runner. Repeated `recover()` and alarm invocations must not overlap it. Independent operations can execute and record in completion order; a blocked operation must not serialize the backlog.
3. Request/response-codec failure becomes a recorded external Failure. Declaration resolution and recording/storage failure remain recoverable infrastructure failures. Preserve the full Cause, including combined producer and recording failure where applicable.
4. Interruption/timeout waits for request finalizers before recording and before releasing the live reservation. Reconcile the alarm on every execution exit. Recovery must remain available if work survives a failure.
5. Observation recording, external-command admission and pending-row deletion remain one transaction. Missing pending work makes a late recording callback a no-op. A failed transaction leaves pending work available for recovery; exact stable command identity and first recorded time remain unchanged.
6. A completed observation does not depend on subsequent command execution succeeding. A blocked command queue retains its own responsibility and alarm. External-operation recovery can release its lease once its pending rows drain, without deleting another queue's wake-up.
7. Preserve the existing crash limitation: an external effect can occur before its observation commits, so recovery may repeat the request. This plan adds no exactly-once claim, cancellation gate, persisted reservation, retry counter or provider coordination protocol.

## Implementation sequence

1. Re-read the named production files and their current diffs, preserving concurrent edits. Verify whether the already removed delivery coupling remains absent; update the plan's source status rather than restoring completed work.
2. Change `makeExternalOperations` to consume `db`, `outboxTable` and `workCodec`. Move the two real storage operations inside the module. Remove `hasPending(id)` and its now-unused interface/call-site machinery. Keep alarm reconciliation cohesive and keep request execution readable from top to bottom.
3. Update AggregateChain and ServiceChain composition to pass their existing pending table and database. Delete the duplicated SQL callbacks. Preserve `record`, declaration resolution, runtime capture, pre-commit alarm holding and command-outbox wake ordering.
4. Adapt existing verification callers to the same module interface. Add only the smallest assertions missing from the existing scenarios; do not create test files, fixtures, check runners or configuration.
5. Update the external-operation and Chain READMEs after implementation to explain independent request execution, observation completion and the separate admitted-command queue. Reconcile existing glossary wording only where the implementation changes it. No new terminology or ADR is required for this module simplification.
6. Run the scoped existing verification below, fix in-scope failures, and record evidence. Complete and archive this plan only when implementation and required verification are finished.

## Planned file hierarchy

`+` creates this plan; `~` modifies existing files. No new production module or test/check file is planned.

```text
zerospin/
  wiki/plans/
    + 198-plan-external-operation-queue-simplification.md
  packages/system-worker/src/
    externalOperations/
      ~ makeExternalOperations.ts
      ~ README.md
    AggregateChain/
      ~ AggregateChain.ts
      ~ README.md
    ServiceChain/
      ~ ServiceChain.ts
      ~ README.md
  scripts/
    ~ verify-plan140.mjs
  packages/system-worker/test/migratable-do-repo/
    ~ system-repo-activation.workerd.spec.ts  (only if existing coverage needs an assertion)
  wiki/
    ~ glossary.md                         (only affected existing wording)
```

`makeAlarmRegistry`, `makeOutboxQueue`, `makeOutboxDelivery` and both observation/admission transactions are dependencies to preserve, not planned refactor destinations. The existing Workerd supporting fixtures may be adjusted in place only when required by the changed production interface.

## Verification

1. Use the existing external-operation scenarios in verify-plan140 (`scripts/verify-plan140.mjs`, removed 2026-10-17). They already exercise both owner families, empty/pending alarm state, repeated recovery with a blocked request, first observation, JSON null, recording rollback, late callbacks, timeout/interruption and reservation lifetime. Adapt them to the production table-based interface rather than adding callback-only tests.
2. Keep one concise isolation scenario: block one request or subsequent command execution; another independent request can still record/admit, and completion of an external operation does not await the command queue. Confirm that command recovery remains armed after external pending rows drain. Reuse the existing scenarios wherever they already prove this behavior.
3. Inspect current Nx project configuration once. Run scoped system-worker type/lint and Workerd type checks through Nx with configured dependencies. Run the existing activation Workerd file (`packages/system-worker/test/migratable-do-repo/system-repo-activation.workerd.spec.ts`, removed 2026-10-17) for actual cold recovery, plus the existing acceptance script after rebuilding its required emitted dependencies. No whole-repository quality pass is needed.
4. Check scoped formatting, documentation links and absence of `pendingRows`, injected `hasPending` and `deliver` on the external-operation module/callers. Internal pending-row existence checks and the command outboxes' own `hasPending` remain legitimate.

## Alternatives and scope limits

1. Adapting external operations directly to today's ordered RPC outbox would impose ordering, page acknowledgement and transport assumptions on independent requests. Add no numeric allocator or serial execution merely to fit that interface.
2. A new shared queue engine would require a broader interface and more callers without first proving that the smaller feature module leaves worthwhile duplication. That extraction is not a task or completion gate in this plan. `makeAlarmRegistry` remains the existing shared scheduling module.
3. Do not modify ownership, schemas, contract evaluation, original/publication protocols, retained history, provider semantics or other repositories. No compatibility paths, storage reset, deployment, commit or publication are authorized.
4. Implementation followed the maintainer's explicit authorization after planning. Preserve unrelated source and active Plans 191/196.

## Planning snapshot

Planning base commit: `1a986f41af38cf50e16a6b122abf618fad8f1022`, with extensive concurrent uncommitted work. `makeExternalOperations.ts` SHA-256 at planning inspection: `7aae705ab38a9ba6d95d5a604f7a43bef4a7067bb100114319910792e75e36f9`. Runtime verification followed the later implementation authorization.

## Completion evidence

1. `makeExternalOperations` now consumes `db`, `outboxTable` and the existing complete table codec. It owns pending-row selection and a bounded existence query for alarm reconciliation. Removed the injected `pendingRows`/`hasPending` interface and per-ID pre-request lookup from the module and both Chain compositions. Preserved the already removed delivery callback/generics.
2. Kept independent live-ID reservations, interruption/finalizer settlement, exact declaration resolution and both atomic observation/admission transactions. Both command queues retain their existing `drainAfter` ownership. No schema, alarm-registry or generic outbox changes were needed.
3. Adapted the existing acceptance script and extended its blocked-request scenario: repeated recovery launches one live request; an independent request records before the blocked request completes; draining external pending rows releases only the external-operation lease and preserves the command queue's lease. Existing rollback, late-callback, timeout and interruption checks also pass.
4. `pnpm nx run-many -t ts lint test-workerd-ts -p system-worker --nxBail` passed. Lint reported 14 existing warnings and no errors. `pnpm nx run @zerospin/browser:lib` passed to refresh the acceptance script's emitted dependencies.
5. `pnpm nx run system-worker:test-workerd -- test/migratable-do-repo/system-repo-activation.workerd.spec.ts` passed: one file, three tests. `node scripts/verify-plan140.mjs` passed all 13 groups. Nx Cloud reported an access warning after successful local tasks; it did not block these checks.
6. Updated the external-operation, AggregateChain and ServiceChain READMEs. Existing glossary meanings remain unchanged; no new terminology or qualifying ADR was introduced. Scoped formatting, local documentation links and whitespace checks pass. Concurrent storage-review changes remain outside this implementation.

## Remaining work

**None.**
