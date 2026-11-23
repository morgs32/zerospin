# Aggregate pending external invocation model

**Date:** 2026-10-16

**Status:** Complete; scoped verification and documentation closure finished 2026-10-23 under Plan 151. Archived with its filename preserved. Plan 151 and the governing ADRs remain active.

## Problem and agreed behavior

The maintainer approved the [Aggregate external-operation outbox finding](../../reviews/storage-tables/aggregate-chain-external-operation-outbox.md). The pre-cutover AggregateChain duplicated pending parent lineage even though original receipt commits requests once and invocation/settlement addresses the stable external command ID.

1. Retain exactly six required AggregateChain `externalOperationOutbox` columns: `externalCommandId`, `externalContractName`, `externalContractVersion`, frozen JSON `payload`, full `origin` and original `aggregateVersion`. Preserve unique canonical `cmd_…` identity. Remove pending `initiatingCommandId`, `operationIndex` and the `initiating_command_operation` index. Add no replacement pointer, primary key redesign, status, clock, counter or observation cache.
2. Preserve full admitted input and canonical parent `id` in `IEvaluatedCommand`, plus sparse authored `operationIndex` and stable external IDs in its ordered operations. Shared prepared descriptions retain lineage. Replay omits external emissions before preparation/ID allocation without renumbering model operations.
3. Preserve immutable input/outcome validation, predecessor and increasing-operation-index checks. The first synchronous receipt transaction commits `commands.outcome` and all pending requests together. Exact retained-outcome retries return before insertion, including after observation admission has deleted a request. AggregateVersionChain owns complete evaluated-command equality, including operations and hash.
4. Keep the shared queue dependent only on the invocation fields it consumes, while decoding and passing each owner's complete pending row. Resolve the original exact Aggregate release and external contract, frozen payload and full Origin without parent lookup or current-release fallback.
5. Preserve independent per-ID reservations, alarm/activation recovery and synchronous first-observation command admission/pending deletion. Pending deletion proves external observation admission; the admitted command begins with null `outcome`. Admission transaction order assigns `aggregateIndex`; no FIFO request guarantee exists. Loss before local observation admission can repeat provider effects.
6. This Aggregate cutover changes no Service pending storage or Actor/Agent storage. Fixed-schema changes require empty affected AggregateChain storage. Add no reset, migration, fallback, compatibility alias or deployment.

## Decisions and implementation

Complete pending invocation facts avoid a parent join. Although the retained parent could supply Origin/release if a parent pointer remained, invocation and settlement need no parent association. Diagnostic inspection alone does not justify that extra responsibility.

`aggregateChainDbConfig` declares the six required fields and external-ID uniqueness. `recordOriginalCommandOutcomeTx` explicitly encodes the four external member fields with the admitted parent's frozen Origin and release. Its receipt gate precedes insertion. `recordExternalOutcomeAndAdmitCommandTx` re-reads pending work, appends the stable-ID external command with exact frozen context and all-null producer tuple, then deletes the request in one synchronous transaction. Missing pending work makes late callbacks no-ops.

`makeExternalOperationQueue` requires only external command ID, contract name/version and payload; its supplied codec retains the full row. Its process-local reservation lasts through request finalizers, observation recording and recovery reconciliation. Construction is inert; activation, original acknowledgement and alarms wake the queue.

ADRs [016](../../adrs/016-aggregate-original-operations-and-external-work.md) and [013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md), module documentation, glossary and existing local patterns retain the distinction between pending invocation and immutable history. Both ADRs remain governing.

The 2026-10-16 implementation deferred all checks. The maintainer resumed this plan's verification on 2026-10-23. [Plan 257](257-plan-direct-system-worker-verifications.md) retired the historical acceptance runner and scenario harness; they are not restored or reported as executed. Service's later [Plan 219](219-plan-service-external-operation-outbox.md) independently removes its pending lineage, and [Plan 256](256-plan-service-evaluated-commands.md) replaces its output packet. Plans 211/212 retain their applicable independent obligations under Plan 151.

## Verification follow-up — 2026-10-23

Extend only these existing files; no test files, fixture files, runners, dependencies or configuration are created:

```text
packages/system-worker/tests/
  support/serviceExternalContracts.ts
  support/servicePublicationConfig.ts
  workerd/aggregate-adapter-failures.workerd.spec.ts
```

Four bounded cases use actual AggregateChain/AggregateVersionChain classes and disposable SQLite storage:

1. Inspect the six required SQL columns and sole external-ID unique index. A duplicate external ID on the second request rolls back the first request and parent `outcome`. A successful receipt retains full Actor Origin and frozen input. Real observation admission deletes one request; the exact parent retry cannot recreate it. Changed immutable input or exact outcome is refused. Actual AVC append/read retains the full parent and prepared sparse positions 2/7; a changed operation is refused without replacing history.
2. Fault command INSERT and pending DELETE independently. Both leave admitted commands and requests unchanged. Success/Failure observations preserve exact bound aggregate identity, release, external contract version, payload and full Origin with null `nodeId`, `sessionName` and `pushIndex`. Contradictory late callbacks are no-ops, and stable-ID conflict retains pending work.
3. An empty actual `executeCommandsThrough(0)` invokes its completion hook and launches independent version-1/version-2 requests. A held finalizer keeps the first ID reserved while the second observation is admitted. Repeated native alarms do not overlap the held request. Capture actual `DurableObjectState.waitUntil` promises into stock execution-context controls and await the complete background pass before asserting DELETE-fault rollback and retained recovery. After removing the fault and aborting/reacquiring the object, a different production instance starts an identical frozen retry on activation and admits one stable-ID command.
4. One native queue pass leaves missing exact release, mismatched contract version and invalid payload rows unchanged, admits no commands, invokes no provider probe and retains recovery. The completion barrier awaits all negative background work before assertions.

**Proof boundaries:** trusted internal `appendAggregateCommand` establishes retention of full Actor input, not Actor authorization. Queue tests seed pending rows and substitute minimal authored provider declarations. Sparse history uses canonical preparation and real AVC storage, not a new mixed-model replay fixture. These checks do not establish a complete authored original-to-continuation journey, real provider effects, deployed alarm timing or authenticated browser behavior. The source preservation evidence below supports the unchanged preparation/replay path without claiming fresh runtime proof of those separate journeys. No existing persistent store is reset, and no deployment or commit is performed.

The full suite exposed a pre-existing fixture omission: Aggregate release 2 lacked `dispatchWork`, so native alarms correctly reported failed parallel replay after command delivery drained. The same fixture now binds that public declaration through an explicit no-operation adapter for release 2. Release 1's outgoing adapter and the successful final alarm assertion are preserved. No production replay failure is suppressed. Independent review confirmed this repair.

The existing Service request-failure, invalid-response and timeout cases exercise the unchanged shared execution helper; no duplicate Aggregate failure catalogue is added.

## Source-preservation evidence

The original `/tmp/zerospin-plan213-before` directory is empty, so a comparison with that reported snapshot cannot be claimed. Committed comparisons provide qualified evidence:

- In `90604844c4^..90604844c4`, the Aggregate pending block removes only the two lineage fields and their composite index. The whole file also contains the separately co-landed outcome rename.
- `prepareExternalOperation.ts` has the same Git blob (`d404863a0c8847e39f5a0e4447f6de4f580c6812`) on both sides. `externalOperation.ts` changes only its comment. The Service pending-table block is byte-identical across that commit.
- That commit also replaces the old Aggregate execution packet with a full evaluated command and ordered union. Lineage survives through the complete admitted parent and each external member's sparse `operationIndex`; this is semantic preservation, not byte equivalence of evaluated-history files.
- Service's independent pending cutover is `ff1c4b3422`; its full evaluated-command work is later, in `7f33c4cd38` through `8733e8af18` under Plan 256. Neither is attributed to this Aggregate cutover.
- The fresh `/private/tmp/plan213-verification-before/production-hashes.json` baseline covers 125 production TypeScript modules: Aggregate/Service admission Chains, VersionRepos/VersionChains, the shared external queue and relevant Core execution/declaration code. The source audit matches all 125. This proves no production implementation change in this verification; it establishes no historical database equivalence.

## Check results

- Focused `pnpm nx run zerospin:test -- packages/system-worker/tests/workerd/aggregate-adapter-failures.workerd.spec.ts`: test TypeScript, required dependency builds and all 18 cases pass, including four new Aggregate outbox cases and the 14 existing adapter cases.
- Independent source/test review found no actionable defect and confirmed the proof boundaries above.
- Full `pnpm nx run zerospin:test -- packages/system-worker/tests`: test TypeScript, required dependency builds and all 86 tests across 25 files pass. No tests are excluded or skipped; Explorer is not in this scope.
- The final production comparison matches all 125 modules.
- `pnpm nx run system-worker:lint` passes with zero errors and no new warnings. One existing curly-brace warning remains in the unmodified `service-actor-connections.workerd.spec.ts:197`; this follow-up does not broaden into that file.
- Scoped Nx formatting/checks and whitespace validation pass. All 427 local links/source ranges in the seven affected documents resolve; relevant citation ranges were reconciled with current source. Independent source, test, fixture-repair and closure review found no remaining actionable defect. Existing glossary/local guidance remains consistent with the implemented behavior; no new ADR is needed for this verification.

## Remaining work

None. Plan 151 remains active; its next bounded verification group is Plan 196's complete Service execution journey.
