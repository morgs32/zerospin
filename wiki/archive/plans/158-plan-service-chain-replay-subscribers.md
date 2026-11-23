# ServiceChain replay subscribers

**Date:** 2026-10-15

**Status:** Completed and verified on 2026-10-15. Archived independently of parent Plan 151.

**Parent:** [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md).

**Evidence:** [ServiceChain.serviceSubscribers review](../../reviews/storage-tables/service-chain-service-subscribers.md).

## Problem and intended result

ServiceChain's replay table stores the complete receiving Repo name beside its release, mirrors bundled release membership in `active`, and represents an empty acknowledgement as either null or zero. Activation and direct enrollment also apply membership differently.

Retain only receiving release and acknowledged service position. Reuse the shared fanout behavior and owner adapter already implemented for AggregateChain in [Plan 153](153-plan-aggregate-chain-replay-subscribers.md).

## Settled model

Replace `serviceSubscribers` outright with the physical table `replaySubscribers`:

```ts
{
  serviceVersion: string; // primary key within this ServiceChain
  acknowledgedServiceIndex: number; // nonnullable integer, initially 0
}
```

1. Keep `serviceVersion` as the receiving release identity. It can differ from each delivered command's original/source service release.
2. Remove `serviceVersionRepoName`. Reconstruct the complete receiver key/name from this Chain's `{ systemId, serviceName }` plus the retained release. Add no repeated owner columns.
3. Remove `active`. Derive receiving code availability from the Worker's authored service release registry, consistently for enrollment and dispatch. This is authored service release membership, not the alarm registry or network liveness.
4. Rename stored `currentIndex` to `acknowledgedServiceIndex`; remove null and initialize missing releases at zero. The value is the inclusive contiguous position confirmed to the source, which may lag receiver commitment after a lost acknowledgement.
5. Keep unavailable releases' rows and cursors dormant. Their return resumes retained backlog automatically. Add no failure field, suspension, manual resume, deployment-reset gate, retry counter or replacement membership table.

## Scope and sequencing

- **Declaration:** change only the subscriber-table portion of `ServiceChain/serviceChainDbConfig.ts`. Coordinate with [Plan 157 — service command storage](157-plan-service-chain-command-storage.md), preserving its current command-row/transport changes. The separate [Plan 157 — command Origin checks](157-plan-command-origin-checks.md) is independent work; do not rename or absorb it.
- **Queue adapter:** bind the existing `subscriberIdFromKey`, `subscriberKeyFromId`, `subscriberIndexColumn` and `availableSubscriberIds` hooks in `ServiceChain.ts`. Use release-only IDs and reconstruct exact owner-qualified receiver keys. Preserve owner checks and the complete service-occurrence type established by command-storage work; do not restore `$inferSelect` coupling or a second owner reconstruction path.
- **Activation:** transactionally insert missing authored service releases at zero with conflict-do-nothing. Remove full-name preparation, clearing/reactivating flags and other membership-mirror work. Do not rewrite retained progress or delete unavailable releases. Continue holding original/replay recovery alarms before activation writes.
- **Enrollment and dispatch:** use the same current authored release set in both paths. Preserve matching-owner validation, safe nonnegative position checks, position no greater than the committed replay tip, and monotonic `max` updates. Keep the shared RPC/internal `currentIndex` vocabulary where it is already correct; the persisted domain rename does not authorize renaming every queue cursor.
- **Consumers:** update affected ServiceChain/module documentation, architecture, glossary/pattern references where needed, Explorer `sc/serviceSubscribers` purpose/schema capture and existing verification that names the old table or cursor. Do not independently redesign other owners' subscriber tables.

Use the existing shared fanout implementation. No new queue abstraction, scheduler, retry policy or enrollment wrapper is required.

## Required delivery and recovery behavior

1. Source activation enrolls missing receiving releases even without a receiver-initiated subscription. The receiver's subscribe path catches up before reporting its durable checkpoint; direct queue enrollment itself validates/stores the report rather than performing remote catchup.
2. Expose only the contiguous original-acknowledged command prefix. A drain fixes its source boundary; new appended commands do not repeatedly retry a failed recipient within that drain.
3. ServiceVersionRepo commits replay one occurrence at a time. If a later row fails, earlier rows can remain committed while the source cursor stays behind. Redelivery validates and skips that committed prefix instead of reevaluating it, then resumes at the first missing occurrence.
4. Advance the source cursor only after complete receive succeeds, to the last delivered occurrence rather than the envelope's advertised tip. A valid bounded enrollment checkpoint may also confirm receiver progress. Late acknowledgements and stale enrollments cannot rewind it.
5. Errors and defects leave the failed recipient's acknowledgement unchanged and exclude it only for that drain. Healthy recipients continue. Later durable alarms retry retained backlog without a persisted pause.
6. Preserve source-wide failure, interruption and concurrent producer/enrollment recovery. A fired alarm is consumed: unsuccessful drains must renew durable storage alarms, not merely retain an in-memory hold. Keep existing producer leases/revision fencing and drain serialization.

## Verification and completion

Run permitted existing scoped Nx checks and existing fanout/production-owner Workerd seams. Create no new tests, fixtures, runners or configuration.

Required evidence:

- Exact two-column table, zero enrollment, stable reactivation and reconstructed receiving identity.
- Dormant cursor preservation when a release disappears; resumed backlog when it returns.
- Matching authored membership for enrollment and dispatch, including refusal of an unsupported receiving release and a foreign owner.
- Numeric zero, monotonic stale enrollment/acknowledgement, and unsafe/beyond-tip refusal.
- Only original-acknowledged history is replayed; partial receiver commitment/lost acknowledgement redelivers safely without duplicate authored effects.
- Healthy-recipient progress alongside typed failures/defects, later alarm retry, durable rearming after failed/interrupted/source-wide drains and producer/enrollment concurrency.
- Required command-storage integration, schema consumers and documentation remain consistent.

Changed fixed storage requires empty affected storage. Refuse the superseded table/columns; add no translation migration, alias, fallback decoder or automatic reset. This plan authorizes no storage reset.

Report unavailable existing verification evidence as unfinished work rather than creating prohibited infrastructure. Obtain independent identity/acknowledgement/recovery review, record actual results, then archive this child independently of the parent table review.

## Implementation outcome

1. ServiceChain now retains exactly `replaySubscribers(serviceVersion, acknowledgedServiceIndex)`: a text primary key and nonnullable integer acknowledgement. Removed the physical full receiver name, `active` mirror and nullable cursor outright, preserving the separate command-storage implementation.
2. The owner adapter uses the existing shared fanout hooks to reconstruct `{ systemId, serviceName, serviceVersion }` and apply one authored service release set to enrollment and dispatch. Activation holds original/replay recovery before a synchronous transaction inserts missing releases at zero with conflict-do-nothing. Retained acknowledgements and unavailable releases remain untouched.
3. Updated ServiceChain/shared-fanout documentation, architecture, glossary/patterns and Explorer schema/purpose consumers. Extended only existing verification files; added no tests, fixtures, runners or configuration files. No compatibility path, storage translation or reset was added. Changed affected storage must be empty.

## Verification evidence

1. `pnpm nx run-many -t ts lint test-workerd-ts -p system-worker` passed, including declaration dependencies. After the final verification-capability disposal refinement, `pnpm nx run-many -t lint test-workerd-ts -p system-worker` also passed. Four existing unrelated lint warnings remain; no errors.
2. `pnpm nx run system-worker:test-workerd test/fanout-queue/fanout-queue.workerd.spec.ts test/migratable-do-repo/system-repo-activation.workerd.spec.ts test/telemetry/invocation-order.workerd.spec.ts` passed all **14 tests**. The final production-owner acceptance rerun passed all **3 tests** after the capability disposal refinement.
3. The existing production-owner seam proves ServiceChain's exact physical two-column/nonnullable schema, zero enrollment and old-table absence; direct foreign-owner, unavailable-release and beyond-tip refusal; stale enrollment without rewind; real original/source-release delivery to both receiving versions; cold cursor retention; lost-acknowledgement alarm recovery without duplicate receiver journal rows; dormant backlog and automatic resumption when receiving code returns. Renaming the physical table to its superseded name makes activation refuse it without translation or reset.
4. The existing six-case shared-fanout suite additionally probes negative, fractional and unsafe enrollment positions. It proves numeric-zero enrollment, monotonic late acknowledgements, fixed drain boundaries, healthy-recipient progress alongside typed failures/defects, later alarm retry, source-read/SQL-selection failure, interruption, fresh durable alarm writes after consumed alarms, producer/enrollment leases and revision fencing. The unchanged shared implementation is bound through the same owner adapter hooks.
5. `node scripts/verify-plan140.mjs` passed all **8 groups**. Its existing real-SQLite service seam proves only the original-acknowledged prefix is replayable. The added focused replay probe commits the first occurrence, refuses an owner-invalid later occurrence, then redelivers the corrected page with the first authored contract removed: the retained first journal row stays byte-for-byte unchanged and the next occurrence commits successfully. An initial assertion read an encoded SQL row as decoded data; using its owning table codec resolved the assertion and the full script passed.
6. `node explorer/scripts/capture-schema.mjs` captured **9 Repos / 50 tables**. Explorer typecheck and lint passed; its initial generated-snapshot formatting failure was corrected and `pnpm nx run explorer:format:check` passed. Six existing unrelated Explorer lint warnings remain. Scoped formatting and `git diff --check` passed. Optional Nx Cloud 401 reports did not affect successful local checks.
7. Independent identity, acknowledgement and recovery review found no source defects. Final independent review inspected the actual acceptance, shared-fanout and partial-commit assertions and passing logs, found no remaining implementation or evidence blocker, and approved archival. Documentation review separately confirmed receiving/source version distinctions and archival link scope.

## Remaining work

None. Parent Plan 151 remains active independently. No production storage was reset.
