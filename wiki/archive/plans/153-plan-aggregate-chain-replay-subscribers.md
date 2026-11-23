# AggregateChain replay subscribers

**Date:** 2026-10-14

**Status:** Implemented and verified on 2026-10-14. Independent review complete.

**Parent:** [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md).

**Evidence:** [AggregateChain.aggregateVersionRepos review](../../reviews/storage-tables/aggregate-chain-aggregate-version-repos.md).

## Problem and intended result

Before this implementation, `aggregateVersionRepos` stored a full physical receiver name beside its release version, mirrored bundled release membership through `active`, represented unacknowledged zero as null, and indefinitely suspended replay after a typed failure. Its generic queue relied on that failure flag for scheduling and required an explicit resume.

Retain only the receiving release and confirmed replay progress. Derive owner context and code availability when selecting delivery. Failed attempts leave backlog intact and get another chance on a later alarm wake, including after corrected Worker code is deployed.

## Settled row model

```ts
replaySubscribers: {
  aggregateVersion: string; // primary key within this AggregateChain
  acknowledgedAggregateIndex: number; // nonnullable, starts at 0
}
```

1. Rename this table to `replaySubscribers`. Use the receiving release as its single durable identity. Derive the complete VersionRepo key/name from the bound Chain plus that version; do not split the name into additional persisted owner columns.
2. Use `acknowledgedAggregateIndex` for source-confirmed progress. Advance monotonically only after committed receipt or a valid receiver-reported committed checkpoint. Retain the distinction from the receiver's possibly newer actual state after a lost acknowledgement.
3. Remove `active`. The authored aggregate release registry supplies currently available executable releases. Retain removed releases' rows/cursors so their history resumes when code returns. Enrollment and delivery use one consistent release-availability rule.
4. Remove the persisted replay failure/suspension gate and its manual resume path. Typed delivery errors, defects and dispatcher failures get later automatic recovery. Add no replacement failure flag, deployment-reset gate, persistent retry counters or pending-work table.
5. Preserve the retained finalized source history and each receiver's committed prefix. New commands accumulate behind unsuccessful delivery; failed attempts never advance acknowledgement. Healthy recipients continue independently.
6. Keep transient scheduling state scoped to one drain. Attempt a failed recipient once during that drain, even if the source tip grows. A later drain retries it.
7. The alarm registry schedules durable recovery wake-ups. Renew recovery on unsuccessful drains, including when the fired alarm was consumed. Release only when recoverable work is settled and no producer revision requires another pass. An in-memory lease alone is insufficient.
8. Report failure Causes without turning them into delivery authorization state. Preserve interruption and scope cleanup; do not cancel healthy recipients merely because another recipient defects. Future log alerts are separate work and must not gate retries.
9. Qualify registry terminology in code/docs: **authored aggregate release membership** determines code availability; **alarm registry** coordinates recovery wake-ups. There is no operator enablement state to reconcile after every deployment.

## Scope and necessary shared changes

- `AggregateChain/aggregateChainDbConfig.ts`, `AggregateChain.ts` and `onDOActivation/onDOActivation.ts`: two-column table, release-key identity, current authored release membership, monotonic acknowledgement and dormant-row retention.
- `makeFanoutQueue/makeFanoutQueueStorage.ts` and `makeFanoutQueue.ts`: separate durable row identity from a physical Repo-name assumption, bind the concrete acknowledged cursor, remove stored failure selection/enrollment gates and the retired resume interface.
- `makeFanoutQueue/runFanoutDeliveries.ts`: settle recipient failures independently, retain per-pass exclusions, continue healthy recipients and avoid repeated immediate selection of a failed page.
- `makeAlarmRegistry/makeAlarmRegistry.ts`: preserve its shared operation isolation and explicit durable scheduling. Change it only if necessary to implement the drain's required recovery lifecycle; add no per-Repo alarm override.
- `makeFanoutSubscriber` and existing queue consumers: propagate necessary common interface changes, retain catch-up/enrollment ordering and accurate committed progress reporting. The five current shared fanouts are AggregateChain/ServiceChain replay, aggregate actor/agent result delivery, and service result delivery.
- Remove obsolete pause/resume-only storage and callers in those shared fanouts where the selected automatic-recovery policy requires it. Do not turn required propagation into a full review or identity/cursor redesign of other subscriber tables. Their broader `acknowledged*` naming work remains in [TODOS.md](../../../TODOS.md).
- Update the affected module READMEs, architecture workflows, Explorer names/purposes and local patterns that currently describe indefinite failure suspension, nullable-zero semantics or the old table. Preserve unrelated working-tree work.

Use the existing owner configuration to express actual row identity and receiving Repo acquisition. Add only the concrete variation needed by existing owners; do not introduce forwarding modules or an additional routing envelope.

## Implementation sequence

1. Cut the AggregateChain table to the settled row model and bind its domain identity/cursor into the shared queue. Reconstruct complete recipient keys from retained version plus bound Chain context.
2. Replace activation's stored membership mirror with current authored release availability and idempotent enrollment. Preserve old cursors when releases disappear or return; reject incompatible owner identity and handle unavailable receiving code consistently.
3. Remove durable pause/resume behavior from shared fanout storage and interfaces. Preserve source history and committed receiver checkpoints.
4. Implement finite drain passes and independent recipient settlement. Retain/renew a later durable alarm on typed errors, defects, interruptions and source-wide failure without spinning or starving healthy recipients.
5. Propagate required consumers/docs, verify production seams through permitted existing checks, obtain independent review and record evidence here.

## Verification and completion

Use existing Nx package typecheck/build/lint targets and directly affected consumers, with exact targets discovered before implementation. Use existing production acceptance/Workerd coverage where available. The maintainer explicitly authorized one focused shared fanout fixture on 2026-10-14 to close the remaining fault/concurrency evidence and finish archival. Reuse the existing test runner and configuration.

Required evidence:

- Exactly the two declared columns remain; no full receiver route name, `active`, stored suspension reason, nullable-zero alternative or compatibility aliases survive in this owner.
- Enrollment and late acknowledgements never rewind source-confirmed progress. Cold startup and removed/reintroduced receiving releases preserve the cursor.
- Wrong-owner enrollment is refused, and missing receiving code does not lose its row/backlog or create a manual re-enable requirement.
- Lost receiver acknowledgements redeliver safely and recover the already-committed prefix.
- Typed delivery error and per-recipient defect both leave progress unchanged, allow healthy recipients to finish, and schedule later retry. A growing source tip cannot repeatedly retry the failed recipient within the same drain.
- Source-read/selection failure and interruption retain durable recovery; firing an alarm followed by failure schedules another wake without relying on a later command append or redeployment hook.
- A subsequent successful attempt advances progress and clears transient failed-recipient bookkeeping; a settled empty drain safely releases recovery without losing a concurrent producer's wake-up.
- Existing outcome/Cause reporting and scope cleanup remain intact. Log-alert integration is not part of this subplan.

Changed fixed storage requires empty affected storage. Add no translation migration, old-schema decoder or automatic reset. Record unavailable existing verification seams as unfinished evidence rather than manufacturing prohibited runners.

Archive this child only after implementation, required checks and independent review complete. The parent table review remains active independently.

## Implementation outcome

- AggregateChain now owns exactly `replaySubscribers(aggregateVersion, acknowledgedAggregateIndex)`. Activation inserts authored releases at zero without changing retained rows. The same authored release-ID list governs enrollment and delivery; complete receiving Repo keys are reconstructed from the bound Chain.
- Shared queues bind their concrete identity and cursor columns. Enrollment uses one atomic monotonic upsert and rejects a checkpoint beyond the deliverable source tip. Wire cursors use numeric zero. Necessary propagation across all five fanouts removes stored failure and manual resume while preserving the other tables' identities, cursor names/nullability and ServiceChain membership flag.
- Each drain fixes one history boundary, settles recipient Causes independently, excludes failed recipients only for that pass, and treats missing selected history as failure. Unsuccessful drains renew a durable alarm after scope/permit cleanup. Enrollment now holds a producer lease, closing its race with an empty drain releasing recovery.
- The existing alarm registry already isolates operations and explicitly renews storage alarms; no registry changes were necessary. No retry counters, compatibility paths, migrations or storage resets were added.
- The shapes library lacked a raw text primary key. Necessary support for `primitives.text({ primaryKey: true })` now keeps release versions as unprefixed strings through SQLite, row/portable codecs and existing reference resolution. It rejects nullable, unique and defaulted primary-key options.
- Module READMEs, architecture workflows, local patterns, glossary and Explorer are reconciled. Independent source review approved the final queue/owner changes and plain text-key support after resolving finite-pass, enrollment-alarm-race and replay-commit wording findings.

## Verification evidence

- `pnpm nx run-many -t ts lint test-workerd-ts -p system-worker,@zerospin/shapes,@zerospin/production-worker,@zerospin/dev-worker` passed, including required declaration builds. The first attempt exposed the missing text-primary-key primitive; the implemented primitive resolved that failure.
- `pnpm nx run-many -t ts lint test-workerd-ts typecheck format:check -p system-worker,@zerospin/production-worker,@zerospin/dev-worker,explorer` passed after the final source edits. Lint has zero errors; the pre-existing warning in `owners.worker.ts` and six warnings in untouched Explorer UI files remain outside scope. Nx Cloud reported access error 401 after successful local tasks; it did not block the checks.
- `pnpm nx run system-worker:test-workerd test/migratable-do-repo/system-repo-activation.workerd.spec.ts test/telemetry/invocation-order.workerd.spec.ts` passed all 8 existing tests. The final expanded acceptance file was then rerun alone and passed all 3 tests.
- The existing acceptance scenario verifies the physical two-column/nonnullable schema, real finalized replay to both receiving releases, cold cursor retention and repeated lower-bound catch-up without rewind. Using the existing inspection Worker, it leaves a source acknowledgement at zero while the receiver retains its committed three-command prefix; cold production activation and its alarm restore acknowledgement to three without subscription or duplicate receiver rows.
- Existing Worker revisions also prove dormant backlog and automatic restoration: removing release `1.1.0` retains its cursor at three while release `1.0.0` advances to four; reintroducing `1.1.0` advances its cursor to four through alarm recovery without manual enablement.
- Existing Explorer schema capture passed for 9 Repos/50 tables. It confirms the exact AggregateChain columns and removal of only `failure` in the four other shared fanout tables. Scoped formatting, local documentation links and `git diff --check` passed.
- The authorized fixture binds the production queue, alarm registry, subscriber schema and replay reader to real SQLite, with deterministic transport gates and recorded alarm writes. Six focused cases prove owner/availability/checkpoint refusal, monotonic late acknowledgement, independent typed failures and defects, finite source boundaries, corrected later delivery, source-read and real SQL selection failure, interruption cleanup, and active-enrollment/completed-producer revision races. The fixture consumes stored alarms before recovery and verifies fresh writes after unsuccessful settlement; capability disposal and complete typed/defect/interruption Causes are asserted.
- `pnpm nx run system-worker:test-workerd test/fanout-queue/fanout-queue.workerd.spec.ts test/migratable-do-repo/system-repo-activation.workerd.spec.ts test/telemetry/invocation-order.workerd.spec.ts` passed all **14 tests** after the final fixture cleanup refinement. These combine six contained production-factory cases, three real Workerd acceptance cases and five invocation/telemetry cases.
- The final `pnpm nx run-many -t ts lint test-workerd-ts typecheck format:check -p system-worker,@zerospin/production-worker,@zerospin/dev-worker,explorer` passed against the current working tree, including declaration dependencies. Lint had zero errors; warnings in concurrent command/external-work changes and unchanged Explorer UI remain outside this plan. No fanout fixture warnings remain. The optional Nx Cloud access error did not affect successful local checks.
- Independent review approved all required behavior and evidence. Its final fixture-cleanup observation was resolved by retaining blocked enrollment/alarm Promises and draining newly retained work before disposing the runtime and SQLite. No additional production defect was found by fault/concurrency verification.

The explicitly authorized follow-up added one shared fixture and one six-case spec under `packages/system-worker/test/fanout-queue/`, using the existing runner and configuration. Existing acceptance assertions reuse their existing Worker revisions and inspection seam. Concurrent command-storage changes were preserved and the fixture was adapted to the current source codec/reader. Changed fixed storage still requires empty affected AggregateChain, ServiceChain, AggregateVersionRepo and ServiceVersionRepo storage. No production storage was reset.

## Remaining work

None. Parent Plan 151 remains active independently.
