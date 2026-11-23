# Activation-owned materialization catch-up

**Date:** 2026-10-15

**Status:** Completed and verified on 2026-10-15.

**Implementing-chat authorization (2026-10-15):** The maintainer requested implementation of this plan after completed Plan 193. The earlier planning-only authorization is superseded for this work. Preserve the existing Plan 193 changes and unrelated WIP.

**Research:** [Activation catch-up and subscription](../../research/activation-catchup-and-subscription.md).

**Related:** [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md), [completed Plans 189](189-plan-aggregate-command-execution-resolution.md) and [190](190-plan-aggregate-delivery-history-and-projection-ownership.md), [ADR 005 — original execution and finalized replay](../../adrs/005-ordered-original-execution-and-finalized-replay.md), [ADR 013 — Aggregate delivery/history ownership](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md), [ADR 014 — synchronous original finalization](../../adrs/014-synchronous-original-finalization.md), and [Plan 193](193-plan-synchronous-original-finalization.md).

Plan 191 is already allocated to [result and outcome types](191-plan-zerospin-result-and-outcome-types.md). The earlier Service ownership proposal supplied in this conversation is separate work; its proposed owners are not implemented by this plan.

## 1. Required outcome

**Refactor `catchupMaterialization()` and await it from AggregateVersionRepo and ServiceVersionRepo `onDOActivation()`, inside the existing constructor `blockConcurrencyWhile`.** The procedure must actually replay and commit the already-finalized upstream prefix before activation completes. Moving a differently named operation there while keeping materialization request-driven does not satisfy this plan.

The procedure consumes available history. It does not ask the Chain to execute pending admitted commands, await remote delivery of its outgoing rows, or call its own Repo through an RPC stub. Ordinary snapshots, queries and session authorization read their owner's current committed state after activation; opening a session does not require finishing the admitted-command backlog.

The proposed lifecycle is:

```text
makeMigratableDORepo constructor: blockConcurrencyWhile
  register owner; initialize schema; run optional one-time bootstrap
  onDOActivation
    reestablish recovery for retained pending output and external work
    await local catchupMaterialization
      read the local execution checkpoint
      capture the Chain's available finalized prefix
      pull and replay its remaining pages in order
      commit resources, checkpoint and required outgoing rows
  activation completes; incoming requests and deliveries may run
```

No new concurrency gate or public readiness interface is needed. The factory already awaits `onDOActivation()` inside its gate: [current lifecycle](../../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts#L281).

## 2. Settled semantics

1. **Finalized history defines startup work.** Capture one deliverable finishing position and stop there. New admitted commands and later source progress do not extend this activation's catch-up. Reuse the existing paginated subscriber loop and finalized-prefix reader: [page loop](../../../packages/system-worker/src/makeFanoutSubscriber/runFanoutCatchup.ts), [Aggregate source page](../../../packages/system-worker/src/AggregateChain/readReplayPage.ts), [Service source page](../../../packages/system-worker/src/ServiceChain/readReplayCommandsPage.ts).
2. **Original execution retains its authority.** Chain-owned dispatch still routes each original to its retained release. Replay runs the receiving release's implementation against its resources, retaining that release's own `commandOutcome` and `dispositionHash`. Replay does not produce external work. Keep the historical contract/actor resolution and refusal behavior implemented by Plan 189.
3. **Local completion and remote delivery remain separate.** A successful startup catch-up has durably committed resources, execution checkpoint and complete pending output. It need not have delivered that output to history Chains or projections. Arm recovery before commit, preserve each queue's acknowledgement/deletion rules, and let its background/alarm recovery proceed independently.
4. **Source-owned VersionRepo membership stays source-owned.** AggregateChain and ServiceChain already enroll authored releases in `replaySubscribers`. VersionRepo activation uses the existing subscriber `.catchup()` and retains that subscription. Dynamic actor/agent projection activation continues to use `.subscribe()`, which catches up and then enrolls/resumes its individual identity. Add no parallel membership mechanism.
5. **A local execution checkpoint can exceed the replayable source prefix.** If original command 10 committed locally while its finalization reply is lost or AggregateChain acknowledgement is pending, the Repo can be at 10 while the Chain exposes finalized prefix 9. Startup succeeds without rewinding state or forcing command 10 to finish delivery. Do not replace VersionRepo `.catchup()` with generic projection `.subscribe()`, whose enrollment rejects a cursor above the deliverable source tip. [Checkpoint/outcome commit](../../../packages/system-worker/src/AggregateVersionRepo/utils/retainEvaluatedCommandTx.ts), [source prefix](../../../packages/system-worker/src/AggregateChain/readReplayPage.ts#L14), [enrollment restriction](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L473).
6. **Command-specific waits remain.** Direct execution may await its own command result. Before original command N executes, its receiving release replays through N-1. These execution requirements are independent of session startup and do not require public `flush(N)`. [Result wait](../../../packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts#L59), [predecessor ordering](../../../packages/system-worker/src/AggregateVersionRepo/finalizeCommand/finalizeCommand.ts#L69).
7. **Snapshots remain internally exact.** Capture resources and checkpoint N together. Where projection history is separate, publish the captured pending projected output through N, compare the history checkpoint exactly at N, and recover private completion only through N. Preserve full claims, actor/agent identity, private outcome ownership, relational/reference closure and ServiceSessionLock model filtering. Source: [Aggregate snapshot publication](../../../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts#L105).

## 3. Implementation sequence

### 3.1 Move VersionRepo materialization into activation

- Refactor [Aggregate catchupMaterialization](../../../packages/system-worker/src/AggregateVersionRepo/catchupMaterialization/catchupMaterialization.ts) into the local named Effect procedure for paginated finalized replay. Remove `chain.executeCommandsThrough()` and the awaited `drainExecutionHistory()` from this startup procedure. Return the local checkpoint only if an internal caller actually uses it; do not retain a public result contract solely because it previously existed.
- Await that procedure from [AggregateVersionRepo.onDOActivation](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L298-L306), after recovery is established. Bind the actual receiving Effect's existing Repo services, including duplicate-result recovery. Reuse the configured shared runtime and existing subscriber/transaction implementation.
- Give [ServiceVersionRepo.onDOActivation](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts#L154-L162) the same responsibility using Service's finalized command stream and existing materialization procedure. Replace its current request-driven `#progress`/`catchupMaterialization` orchestration with a local activation procedure. Do not carry `executeCommandsThrough()` into startup via `progressServiceVersion`.
- Leave source-authored release enrollment and dynamic projection pull-then-enroll ownership intact. Keep fanout page reads and subscription enrollment outside delivery-drain locks, SQL transactions and execution permits. No base-factory lifecycle rewrite is required.

### 3.2 Preserve recovery without a startup callback cycle

- Reestablish existing recovery for retained pending execution publication, external operation and external command delivery, including when startup has no new replay rows to produce. Use the existing alarm/queue owners; add no recovery tables, persisted retry counters or parallel scheduler.
- Keep [Aggregate's publication producer lease](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts) around replay and preserve the existing Service result-production lease until Service's separate ownership cutover. Every resource transaction retains its complete required pending output before upstream acknowledgement.
- Do not await original finalization, AVC publication, external request completion or downstream fanout as a condition of opening the receiver's activation gate. A source drain may already be waiting for this cold receiver. Plan 193 removed reverse original-outcome proof and its callback into AggregateVersionRepo; startup must not introduce another callback into its own activation gate. Original finalization returns its committed outcome independently of publication.
- Preserve synchronous business-savepoint rollback, outer transaction atomicity, complete infrastructure Causes and duplicate identity/equality checks. Failed startup must not report readiness or erase earlier committed replay progress. Pending messages survive until their own durable acknowledgement.

### 3.3 Convert ordinary request paths to local committed reads

- Remove VersionRepo progress RPCs and forced source-tip replay from [Aggregate projection snapshot orchestration](../../../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts). Read the projection already materialized during activation and advanced by its subscription. Preserve the local capture/publication/private-completion workflow at its captured N.
- Remove the equivalent VersionRepo progress call from [Service snapshot capture](../../../packages/system-worker/src/serviceProjection/captureServiceSnapshot.ts). Preserve Service's current combined projection/history transaction and session-lock filtering; this plan does not introduce ServiceVersionChain or ServiceActorVersionRepo.
- Remove the unconditional catch-up callback from [Aggregate queries](../../../packages/system-worker/src/AggregateVersionRepo/executeAggregateQuery/executeAggregateQuery.ts) and [Aggregate authorization](../../../packages/system-worker/src/AggregateVersionRepo/authorizeAggregateSession/authorizeAggregateSession.ts), and the corresponding `progress` dependency from [Service queries](../../../packages/core/src/service/executeServiceQuery.ts) and [Service authorization](../../../packages/system-worker/src/ServiceVersionRepo/authorizeServiceSession/authorizeServiceSession.ts).
- Preserve named Service query behavior, query parameter/result codecs, actor policies, complete claims/lock validation and the authored authorizer. An explicit command executed by that authorizer still uses the normal command-result workflow. These reads now observe current local committed materialization; do not claim that they include every command admitted before the request.
- Remove the unused caller-supplied `minimumAggregateIndex` snapshot option and scaffolding that serves only the removed request-driven progress path. Keep real captured-checkpoint/history comparisons and command/socket replay bounds. Introduce no replacement minimum-position request or hidden force-progress fallback.

### 3.4 Remove superseded public controls

- Delete Aggregate and Service public `catchupMaterialization` RPC wrappers after converting their callers. Keep the meaningful local procedure named `catchupMaterialization` and call it directly from activation.
- Delete both unused `flush(N)` implementations, class methods, capability exposure and dedicated unused errors. Repository caller searches found no production or verification consumer of these methods. Telemetry, SQLite, Effect dispatcher and test-cleanup `flush` operations remain outside this change.
- Remove obsolete `progressServiceVersion`, callback types, imports, unused publication-drain RPC exposure and forwarding wrappers once their actual callers are gone. Preserve queue-owned publication/recovery and `awaitCommandResult`; do not infer that all bounded execution or delivery procedures are obsolete.
- Reconcile [AggregateVersionRepos](../../../packages/system-worker/src/repoServices/AggregateVersionRepos.ts), [ServiceVersionRepos](../../../packages/system-worker/src/repoServices/ServiceVersionRepos.ts), receiving service bindings and directly affected package consumers against the final interfaces.

### 3.5 Reconcile governing documentation

Update the affected VersionRepo/projection/lifecycle READMEs, `wiki/glossary.md`, activation/materialization/projection patterns, and relevant architecture workflows/citations to describe activation-owned readiness and current committed reads. Reconcile the readiness/freshness statements in governing ADRs without changing their resource/history ownership decisions. The [research note](../../research/activation-catchup-and-subscription.md) remains the evidence record; link implementation completion evidence from it when complete.

Preserve archived Plans 189/190 and unrelated Plan 191. Keep parent Plan 151 active. Coordinate with the separate Service ownership proposal so that it adopts this new Aggregate lifecycle instead of copying the superseded request-driven method.

## 4. Scope and runtime constraints

This is an Aggregate/Service lifecycle and caller cutover. No new durable owners, tables, fields, public readiness states or compatibility paths are required. Preserve current storage ownership, command schemas, disposition-hash algorithms, source membership, external-work authority and wire snapshot/socket fields. Remove superseded in-scope paths outright; do not retain aliases or dual startup modes.

Cloudflare imposes a 30-second timeout on `blockConcurrencyWhile`. A fixed source finishing position bounds history followed, not total duration. Keep per-page/occurrence progress durable so interrupted or timed-out startup can resume from committed state; do not return success before the captured available prefix is materialized, chase later source tips within the same pass, or claim arbitrarily large backlogs fit within one activation. This plan adds no second readiness system or timeout workaround. [Official runtime contract](https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile).

No storage reset, deployment, vendor propagation, new test files, new test fixtures, new runners or test configuration is authorized. No persisted representation change is intended; if implementation discovers one is necessary, follow the pre-release empty-storage policy and obtain authorization before any reset. Preserve unrelated dirty working-tree changes and recheck current source before editing, including any concurrent result/outcome work.

## 5. Verification and acceptance

Extend only existing permitted verification seams, using the smallest assertions that prove the changed lifecycle. Existing entrypoints include Workerd activation coverage (`packages/system-worker/test/migratable-do-repo/system-repo-activation.workerd.spec.ts`, removed 2026-10-17), Repo lifecycle coverage (`packages/system-worker/test/migratable-do-repo/migratable-do-repo.workerd.spec.ts`, removed 2026-10-17), verify-plan140 (`scripts/verify-plan140.mjs`, removed 2026-10-17) and verify-session-identity (`scripts/verify-session-identity.mjs`, removed 2026-10-17). Do not create new test/check files or runners.

- [x] Cold activation awaits the actual local `catchupMaterialization()` inside the constructor gate. Incoming reads/deliveries do not observe the pre-catch-up resource state, and initialization failure is not reported as ready.
- [x] Catch-up follows multiple pages to one fixed finalized position, preserves empty/refusal progress and stops there even when source history advances. It never calls `executeCommandsThrough()` or produces replay external work.
- [x] A Chain original-delivery drain can awaken its cold VersionRepo and complete without a startup circular wait. Existing authored subscriber membership and dynamic projection enrollment resume without cursor rewind or a delivery gap.
- [x] Local execution checkpoint 10 with Chain finalized prefix 9 activates successfully, preserves local resources/pending publication, and later finalization reply recovery settles through existing immutable retry behavior.
- [x] A later-page failure/interruption preserves earlier committed resources/checkpoints and complete pending output. Reopening resumes from that checkpoint; failed SQL/evaluation commits no false progress, and complete infrastructure Causes survive.
- [x] Blocked downstream publication does not hold the activation gate open, and startup does not await pending original finalization. Recovery remains armed when there are pending rows but no new startup replay; delivery proceeds after the gate opens, and pending rows are deleted only after their own acknowledgement.
- [x] Ordinary snapshots, queries and authorization do not force pending admitted commands to execute. Snapshot resources/checkpoint and bounded private completion remain consistent; ServiceSessionLock filtering and full claims checks remain intact. Authored explicit authorization commands and direct command-result waits still work.
- [x] Original N still replays predecessors through N-1. Source/replay outcome authority, model/timestamp preservation, duplicate/conflicting delivery behavior and external-work production rules are unchanged.
- [x] No remaining in-scope caller uses public VersionRepo `flush`, public `catchupMaterialization`, obsolete request-progress callbacks or the unused caller-supplied snapshot minimum. Unrelated `flush` operations and necessary internal position bounds remain correct.
- [x] Resolve the current Nx graph, then run existing scoped type/lint checks for system-worker and directly affected packages, Workerd typechecks and the relevant existing Workerd files. Build required current artifacts through Nx before running the existing verification scripts. Record exact commands/results and any evidence that remains unavailable.
- [x] Reconcile docs and perform an independent source review of activation, source lock ownership, recovery and request freshness. Fix confirmed defects and rerun only the affected checks. Archive this plan only after implementation and all required verification/review are complete.

## Implementation and verification outcome

- AggregateVersionRepo and ServiceVersionRepo await their real local `catchupMaterialization` procedures from `onDOActivation`, inside the existing factory gate. Startup replays one captured finalized prefix, preserves a local checkpoint ahead of that prefix, and arms independent publication/fanout and external recovery even with no new replay. No persisted representation changed.
- Ordinary snapshots, queries and authorization now use current local committed materialization. Captured resource/checkpoint N, publication/hash comparison at N, bounded private completion, full claims, authored authorization and ServiceSessionLock model filtering remain intact. Explicit authorization commands and command-specific predecessor/result waits retain their normal execution paths.
- Removed public VersionRepo catch-up, flush and unused publication-drain controls; request-progress callbacks, snapshot minimums and their dedicated errors; obsolete progress/readiness wrappers and unused capability exposure. No replacement readiness state, scheduler, durable owner, table or compatibility path was added. Plan 193 and unrelated work remain intact; parent Plan 151 stays active.
- `pnpm nx run-many -t ts lint test-workerd-ts test-workerd -p system-worker,@zerospin/error` passed. The six existing Workerd/profile files passed all 27 tests. Existing Workerd coverage now starts original execution with cold VersionRepos and inspects new-release materialization immediately after readiness, before command-result/query/snapshot calls. The existing factory suite covers failed activation and genuine persisted cold reopening.
- Built current script artifacts with `pnpm nx run @zerospin/browser:lib`. `node scripts/verify-plan140.mjs` passed all eleven groups, including a two-family activation scenario using production finalized readers, subscribers, replay and publication/fanout queues. It proves multi-page replay, public refusal/empty progress, later-page infrastructure failure, durable local replay resume with a re-created SQLite handle/permit, exact retained output/resource timestamps, one captured prefix despite source advancement, checkpoint-ahead-source success, no replay external work or original dispatch, and blocked publication/recovery with no new replay. This contained scenario retains its subscriber/queue/runtime objects; genuine cold-process evidence is supplied by Workerd. Existing direct-result/predecessor, duplicate, snapshot/privacy and external recovery coverage remains passing.
- The existing limited-model group additionally checks both production query procedures, named query parameter refusal, decoded full-claims authorization, invalid-claims rejection and an explicit authored Aggregate authorization command without request-progress callbacks. `node scripts/verify-session-identity.mjs` passed all six browser/session recovery groups.
- Explorer schema metadata was refreshed (12 concrete Repos, 58 declarations); `pnpm nx run explorer:check` passed. Scoped formatting, source/control scans, documentation links/ranges/hashes and `git diff --check` passed. Independent source review found no blocking activation, source-lock, recovery, snapshot-boundary or request-freshness defect. Nx Cloud access returned 401 while local tasks completed successfully.
- The fixed prefix bounds history followed, not total duration. Cloudflare's existing 30-second constructor-gate limit remains; earlier occurrence commits and pending output support retry after failed startup. No reset, deployment or vendor propagation was performed.

## Remaining work

None.
