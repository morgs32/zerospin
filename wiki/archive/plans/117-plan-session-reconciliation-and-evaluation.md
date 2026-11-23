# 117 — Session reconciliation and authored evaluation transactions

1. **Implementation status:** implemented and verified in the approved goal on 2026-10-11.

2. **Evidence and domain model**
   1. [aggregate import](/Users/morgs32/GitHub/zerospin/packages/core/src/aggregateSession/importAggregateNodeCommands.ts:36) and [service import](/Users/morgs32/GitHub/zerospin/packages/core/src/serviceSession/importServiceNodeCommands.ts:45) are 552/511 lines combining occurrence identity, duplicate equality, checkpoint validation, optimism rewind, authoritative mutation, original acknowledgment, progress and replay. Aggregate has a batch-level first-mutation callback; service repeats rewind setup per occurrence. Both repeatedly read entire history to locate phases and settled IDs.
   2. Aggregate stage, aggregate validation and service evaluation each manually run an Effect synchronously and interrupt/flush suspended fibers. [withSavepoint](/Users/morgs32/GitHub/zerospin/packages/core/src/drizzle/withSavepoint.ts:14) already owns synchronous execution, handle fencing, cancellation, rollback and complete Cause propagation. The duplicate inner runners are removable while preserving `program-must-be-synchronous` refusal.
   3. Separate session originals and authoritative finals remain immutable history rows joined by command ID. Inverse operations are disposable optimism bookkeeping. Only pending originals without a final counterpart are replayed. A final success, failure or hidden private finalization settles optimism identically.
3. **Proposed transaction responsibilities**
   1. One explicit family batch import parent owns validate page → classify ordered occurrences → rewind optimism once if any mutation → retain/apply occurrences → replay survivors once → advance delivery checkpoint → return committed metadata. Named procedures own original identity/coordinates, final equality/continuation, resource application and progress. Aggregate and service stay explicit; share operation codecs/inverse application and the SQL transaction mechanism.
   2. Snapshot installation is another named transaction using the same retention/application/replay procedures. Validate the entire requested receipt-or-missing partition before replacing resources; preserve session positions and original bytes; record acknowledged originals/finals; install the captured baseline and replay survivors once. HTTP agent snapshots retain their distinct private-outcome recovery requirement.
   3. Staging and rehearsal use a cohesive authored evaluation phase. That phase resolves/prepares the bound contract input, evaluates guard/program, checks result codecs and applies supported synchronous operations inside a savepoint. Successful staging then retains original/result/inverses and advances the position in the enclosing transaction. Validation always rolls the enclosing transaction back and retains nothing.
4. **Complete schematic parents**

   ```ts
   const importAggregateNodeCommandsTx = Effect.fn(
     'importAggregateNodeCommandsTx',
   )(function* (tx: ITx, input: IAggregateImportInput) {
     const page = yield* validateAggregateDeliveryPageTx(tx, input);
     const changed = yield* applyOrderedAggregateOccurrencesTx(tx, page);
     if (changed) {
       yield* replayPendingCommandsTx({ tx, definition: input.declaration });
     }
     yield* advanceAggregateDeliveryTx(tx, page);
     return readAggregateSessionMetadataTx(tx, input.sessionId);
   });
   const evaluateAggregateSessionCommandTx = Effect.fn(
     'evaluateAggregateSessionCommandTx',
   )(function* (tx: ITx, input: IAggregateEvaluationInput) {
     const evaluated = yield* withSavepoint({
       tx,
       program: ({ tx: evaluationTx }) =>
         evaluateAndApplyAggregateCommand(evaluationTx, input),
     }).pipe(Effect.exit);
     if (Exit.isSuccess(evaluated)) return evaluated.value;
     if (isSoleAsyncSuspension(evaluated.cause)) {
       return yield* makeZerospinError('program-must-be-synchronous');
     }
     return yield* Effect.failCause(evaluated.cause);
   });
   const stageAggregateSessionCommandTx = makeTx(
     'stageAggregateSessionCommandTx',
   )(function* (tx: ITx, input: IAggregateEvaluationInput) {
     yield* assertAggregateSessionCurrent(input);
     const evaluated = yield* evaluateAggregateSessionCommandTx(tx, input);
     const retained = yield* retainAggregateStagingTx(tx, evaluated);
     yield* assertAggregateSessionCurrent(input);
     return retained;
   });
   ```

   1. `applyOrderedAggregateOccurrencesTx`/service equivalent owns the ordered occurrence loop. For each occurrence it looks up the current transaction's retained rows, classifies `duplicate`, `enrichment`, `original`, `final` or `deferred-recovery`, checks phase identity/Node coordinates and writes that occurrence. It lazily rewinds optimism once before the first actual mutation. Later occurrences see earlier inserts/checkpoint updates in the same SQL transaction; no virtual identity/checkpoint mirror is introduced. New session positions are allocated only when needed and exact retries preserve their original phase row. Return whether any occurrence changed so the parent replays once.
   2. `rewindAggregateOptimismTx`/service equivalent applies inverses in reverse committed optimism order and clears inverse bookkeeping. Strict operation/body/resource interpretation belongs to [108](108-plan-model-operation-codecs.md); retain its transaction-owned previous-state rule. No current declarations reexecute retained authoritative finals.
   3. Retention applies only new authoritative deltas beyond the captured public checkpoint; historical private recovery can settle an original without applying its old delta over a newer baseline. A point recovery beyond the observed public checkpoint remains deferred and cannot establish missing intervening observation. Projection checkpoint and private outcome recovery remain distinct.
   4. `evaluateAndApplyAggregateCommand`/service equivalent use [107](107-plan-contract-evaluation-phases.md) prepared inputs and result policy. Evaluate once against the current optimistic graph; async operations remain forbidden. Encode the new original once without altering its payload bytes and retain the authored staging result exactly once. Inverse bookkeeping records actual persisted prior rows through Plan 108.
   5. `withSavepoint(...).pipe(Effect.exit)` captures only after savepoint fencing/cancellation/rollback completes. `isSoleAsyncSuspension` is a small pure predicate over one Die reason containing AsyncFiberError; it does not run, cancel or flush fibers. Only that single suspension becomes `program-must-be-synchronous`. All typed/business failures, ordinary defects, interruptions and composite Causes remain intact; rollback infrastructure failure stays `drizzle-savepoint-failed`. Never replace an entire composite Cause because one reason looks asynchronous.
   6. Local stage failure aborts the enclosing transaction and retains no original, inverse or position. There is no failed staged history row. Validation uses `makeTx(..., { rollback: 'always' })` around the same successful evaluation/operation application, with deterministic validation ID factories, then returns void. It does not consume persistent IDs/positions, initiate handoff or emit StageFailure. Recognized staging refusal emits exactly one StageFailure after rollback; escaping defects keep their complete Cause and one session defect report.
   7. Intentional strengthening: aggregate validation now rehearses supported operation application and result codecs against an always-rollback transaction, as service validation already does, so invalid operation/reference/result data cannot pass validation and fail only during stage. Document this public behavior. Additional application capabilities remain those of the current session lifetime; validation does not acquire a second runtime.

5. **Removals, intentional cutover and dependencies**
   1. Delete duplicated `Effect.context`/`runSyncExitWith`/`interruptUnsafe`/dispatcher loops from staging and validation. Keep `makeTx`, `withSavepoint` and handle fencing unchanged; [110](110-plan-sqlite-execution-and-commit-observation.md) owns commit observation, not a new authored callback runner.
   2. Delete repeated whole-history searches where exact current-transaction journal queries supply the same invariants. Do not replace SQL transaction state with a duplicate batch identity/checkpoint map. Move service command partial-index provisioning to replica initialization, matching aggregate's existing one-time provisioning; no CREATE INDEX on each import/stage transaction. [109](109-plan-bound-database-definition.md) owns bound schema/index provisioning.
   3. Delete fake runtime `Schema.declare(value => value === effect)` requirement assertions from aggregate import/replay/snapshot APIs; carry generic requirements through statically typed helpers/accurate overloads. Do not add ALLOWED_CAST or weaken requirements to unknown. [105](105-plan-immutable-authored-declarations.md) and [106](106-plan-canonical-authored-manifest-projections.md) own canonical declarations; use them without rebuilding manifests in these runtime procedures.
   4. Remove the unused `applyServiceSessionSnapshot` and its tx module: exhaustive current package/example callers show no consumer; active service bootstrap uses `initializeServiceNodeProjection`. This unused raw replacement cannot rebase retained optimism and should not remain a second public implementation. Remove any direct package export and references in the same hard cutover, without an alias. Aggregate HTTP snapshot remains required by the agent bootstrap.
   5. Public stage method shapes remain synchronous aggregate and asynchronous service acceptance. Service handoff uncertainty still retains committed input without StageFailure. [113](113-plan-session-replica-bootstrap.md) owns handoff/publication and [112](112-plan-agent-session-owners.md) owns agent admission/rejection journal transitions. [116](116-plan-node-command-journal-and-subscriptions.md) owns durable Node persistence. The canonical result-journal plan owns cursor/hash schema removal; apply its exact hard cutover here, requiring empty storage and no legacy field aliases.
6. **Source hierarchy** (`+` create, `~` modify, `-` delete; rooted at `zerospin/`)
   ```text
   ~ packages/core/src/aggregateSession/importAggregateNodeCommands.ts
   + packages/core/src/aggregateSession/applyOrderedAggregateOccurrencesTx.ts
   + packages/core/src/aggregateSession/rewindAggregateOptimismTx.ts
   + packages/core/src/aggregateSession/evaluateAggregateSessionCommandTx.ts
   + packages/core/src/aggregateSession/retainAggregateStagingTx.ts
   ~ packages/core/src/aggregateSession/replayPendingCommandsTx.ts
   ~ packages/core/src/aggregateSession/initializeAggregateNodeProjection.ts
   ~ packages/core/src/aggregateSession/applyAggregateSessionSnapshot/
   ~ packages/core/src/aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx.ts
   ~ packages/core/src/aggregateSession/validateAggregateSessionCommand.ts
   ~ packages/core/src/aggregateSession/{sessionRepoDbConfig,types,makeInitializedAggregateSession}.ts
   ~ packages/core/src/serviceSession/importServiceNodeCommands.ts
   + packages/core/src/serviceSession/applyOrderedServiceOccurrencesTx.ts
   + packages/core/src/serviceSession/rewindServiceOptimismTx.ts
   ~ packages/core/src/serviceSession/{evaluateServiceSessionCommandTx,stageServiceSessionCommandTx,validateServiceSessionCommandTx,replayPendingServiceCommandsTx}.ts
   ~ packages/core/src/serviceSession/{serviceSessionRepoTables,initializeServiceNodeProjection,types}.ts
   - packages/core/src/serviceSession/applyServiceSessionSnapshot/applyServiceSessionSnapshot.ts
   - packages/core/src/serviceSession/applyServiceSessionSnapshot/applyServiceSessionSnapshotTx/applyServiceSessionSnapshotTx.ts
   ~ packages/browser/src/sessionReplica/
   ~ packages/native/src/openPersistentAggregateReplica.ts
   ~ packages/core/src/{aggregateSession,serviceSession}/README.md
   ```
7. **Ordered implementation and acceptance**
   1. Coordinate canonical declarations, contract phases, operation codecs, DB provisioning/commit observation and source cursor schema with Plans 105–110 and the result-journal owner. Resolve accurate typed helper signatures before deleting runtime assertions.
   2. Extract exact family journal queries and the ordered apply procedure with lazy once-only rewind; migrate imports and both snapshot paths together. Preserve sequential batch semantics through the actual SQL transaction; do not create mirrored batch state.
   3. Introduce savepoint-owned complete evaluation, simplify stage/service evaluator and aggregate validation, then remove every duplicate inner runner. Keep refusal recognition/reporting outside the completed rollback boundary.
   4. Move service index provisioning to replica openers, delete unused service snapshot modules and update every browser/native/agent caller. Apply changed fixed schemas with empty storage.
   5. A page with mixed retry, original acknowledgment, new final, hidden/refused final and historical recovery commits a complete projection or leaves it unchanged. Duplicate occurrences within one batch are idempotent only when exact. No successful import advances across a gap or applies an old delta over a fresh snapshot.
   6. A failed pending replay uses its savepoint to discard only that command's speculation according to existing permitted business/reference refusals; unexpected failures abort the whole enclosing reconciliation. Original staging results remain immutable even when optimism is rederived.
   7. Stage and validate produce the same refusal for invalid guards/program/results/operations/references under equivalent view. Validation leaves resources/history/positions/IDs unchanged and emits no StageFailure. Async work is fenced/canceled before rollback; late callbacks cannot write. Defects/interruption/composite Causes remain complete.
8. **Existing verification and documentation lifecycle**
   1. Resolved browser/React targets are `lib`, `ts`, `lint`; core has `lib`, `lint`, `tsc:typecheck` and no `ts` target. Verify the actual current metadata before execution. Reuse actual SQLite/session staging/replay/snapshot APIs and existing application/RPC seams for multi-occurrence rollback, final/private recovery, business/async/reference refusal and immutable retry evidence. No permanent first-party core test/check suite exists; do not invent a test target or add tests/fixtures/runners/configuration.
   2. Runtime interruption, worker handoff and native recovery require their actual existing host seams. A successful isolated SQL exercise does not prove those environments. This planning review ran no checks and makes no pass claim.
   3. Reconcile session READMEs, source-linked architecture, validation/staging public descriptions and the existing glossary after implementation. Create/supersede only qualifying implemented ADR decisions; preserving savepoint ownership does not need a ceremonial ADR. Archive after acceptance and required available verification finish.

## Implementation progress — 2026-10-11

Aggregate and service staging/rehearsal share complete savepoint-owned evaluation/application. Imports retain ordered occurrences in one transaction with lazy once-only rewind and one survivor replay; pending originals use exact NOT EXISTS queries, and service indexes are provisioned by its replica opener. Scoped family source lint passed with zero warnings/errors. Actual SQLite savepoint checks passed cancellation without early/late retained writes and full typed failure/defect/interruption Cause preservation. Service page checks passed duplicate/new occurrence idempotence, rollback after a later gap/conflict, immutable positions and deferred private recovery beyond public progress. Browser handoff preserves unknown authored failure Causes through import; no conversion into defects remains merely to satisfy a narrower type.

### Additional existing-declaration SQLite evidence — 2026-10-11

Disposable inline SQL.js checks used the actual TicTacToe `gameSessionDeclaration`, Shopping shopper contracts/models and existing Studio `positiveItems` declaration. They created no test files, authored declaration fixtures, runners or configuration and changed no production source.

1. TicTacToe public guard refusal and supported create/move validation passed staging/rehearsal parity. Validation retains no resources, history, inverse rows or positions, consumes no persistent factory IDs and emits no StageFailure; each recognized failed stage emits exactly one after rollback. The aggregate missing partition rejects omitted, duplicate and unrequested IDs and invalid captured coordinates before replacement; valid uncertain originals replay from an empty canonical baseline with original payload, staging and session positions unchanged. These bounded assertions passed as `PASS117-A`/`PASS117-B` in `/tmp/zerospin-goal-117-existing-inline.log`; that earlier combined invocation later stopped on an incorrectly represented inline receipt timestamp. The corrected receipt invocation below passed independently.
2. Aggregate and service snapshot receipt reconciliation passed exact partition/coordinate refusal atomicity, original acknowledgement without changed bytes/staging, retained final occurrence, survivor-only replay, acknowledged-as-missing refusal, exact retries and refusal to apply a historical delta over a newer captured canonical graph (`/tmp/zerospin-goal-117-aggregate-receipts-inline.log`, `/tmp/zerospin-goal-117-service-inline.log`, both exit 0). Service missing-partition refusals also leave every SQL table unchanged.
3. Shopping's actual createCart business guard, addToCart payload codec, empty-cart checkout program and supported success paths passed staging/rehearsal parity and validation nonretention/no persistent IDs (`/tmp/zerospin-goal-117-service-inline.log`, `/tmp/zerospin-goal-117-program-refusal-inline.log`). The existing mapped checkout passed internal evaluation's `browser-async-operation-forbidden` refusal after speculative deletes, with all SQL restored; this is an internal savepoint check, not authorization to expose backend mappings through the public session. The existing deleteProduct contract likewise passed internal staging/rehearsal foreign-key refusal against a retained cartItem (`/tmp/zerospin-goal-117-reference-integrity-inline.log`); it is not registered on the shopper's public session.
4. Pending service createCart business refusal clears only that command's inverse while the later addToCart original replays successfully. The existing Studio agent's missing-row public stage/rehearsal refusal retains no SQL/validation IDs/events, and pending missing-row refusal clears only its inverse while the later original replays (`/tmp/zerospin-goal-117-agent-reference-inline.log`). Original staging results and session positions remain unchanged in both families.
5. A real Shopping addToCart replay creates its new product first and then encounters a duplicate cartItem on the second operation. Its unexpected SQL defect remains a sole Die Cause and aborts the whole reconciliation: resources, canonical baseline installation, history, inverse rows and checkpoints exactly match their previous state (`/tmp/zerospin-goal-117-replay-rollback-inline.log`, exit 0).

These checks establish the stated SQLite/API cases, not MessagePort handoff, Worker interruption or native reopening. They do not establish staging/rehearsal parity for every malformed authored result/operation or a suspending authored callback. The later normal mounted MessagePort-backed path is recorded below.

### Actual mounted staging and selected graph — 2026-10-11

The actual TicTacToe application at `http://127.0.0.1:53020/` staged first-party commands through two same-game tabs and rendered committed selected graphs after ordinary Node handoff and backend continuations. Square1 in the second tab reached `XO.......` in both. After that tab closed, Square5 in the survivor reached `XOO.X....`; reopening the second tab displayed the same current graph. Square9 then reached `XOO.X...X`/`X wins!`. Read-only server journals for game `06538c4b-3fe5-44c4-9ef9-3e61b5a38e77` retained six matching source/results, six model/selected-history records, two recorded async continuations and an empty outbox, with public6/hash `b9752804fa90a13212c937aa017b75483f66f57a0d27f82d87f1e3da6ef3f016` and server private prefix4 for producer `node_1fdsGFACy-lSB8DH5MM-Q`.

The second tab's New game/Start game/Square5 flow selected independent game `d2d47ddb-86f6-4fe7-be5a-3c7e56c9a082` and rendered `O...X....`, while the original tab kept its terminal graph. Its distinct producer `node_3O4Qh7bjNzMeQl6Kzl1vE` had own pushes1–2, server private2 and public3/hash `610500ccdada23900c757fd85d76fb1943e1bc9c3a479728ded77e3038b9c940`; three source/result/model/selected-history records matched the selected resource. All nine hashes independently derived from genesis. [Plan118](118-plan-version-result-owner.md) records `/tmp/zerospin-goal-mounted-retry-browser-{baseline,private-baseline,independent-owners}.log` and the complete browser/server bounds.

This establishes normal mounted staging/handoff, authoritative selected-graph convergence, survivor progress, ordinary tab reopening and current-game isolation. No local staging/inverse/pending tables or terminal Node metadata were inspected. The run did not induce paused/offline pending replay, lost receipts, contradictory snapshot partitions, a suspending authored callback, full SharedWorker destruction, native recovery or a late write after SQL close; their direct SQLite evidence and host requirements remain separate.

### Verified source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Actual native offline optimism reconciliation — 2026-10-11

The genuine native app staged its winning move while the backend was down, retaining `cmd_KQiViojj-n3hZOYb2ctZZ` with payload `{"id":"gam_ba36661779d14154bbd4d6bc24eb3d44","board":"XOO.X....","square":8}` at push4/node9 and one optimistic operation. OS process close/reopen and an app update preserved that exact original and the pending projection. After the connection retirement repair, automatic authentication retries continued while offline; backend restoration alone delivered one authoritative success at public6/node10, private4/admitted4. The replica reached afterNode10, removed the optimistic operation and matched Node/server graph `XOO.X...X` and hash `f41d6eeeefdb0fc8df5b5e9b92966cc5a5d931b3684e4066bf3891ccf5f57049`, with all prior nine local rows unchanged. A second actual game reached `O...X....` at public3/private2 without changing any old winner rowset. [Plan118](118-plan-version-result-owner.md#actual-native-offline-recovery-and-independent-owner--2026-10-11) records the complete evidence.

This verifies ordinary aggregate native offline staging, persistent pending replay and optimism reconciliation. It does not inject receipt loss, pause push, interrupt the handoff fiber or measure publication after SQL close.

### Authorized public malformed-output and suspension parity — 2026-10-11

`/tmp/zerospin-framework-goal-data-core-UAv4C2/session-refusals.mjs` uses production contract/session factories, real WASM SQLite/Drizzle resource/session tables and the captured genuine TicTacToe actor graph. The human authorized its temporary malformed and suspending contract declarations. The invocation exits0; `/tmp/zerospin-framework-goal-data-core-UAv4C2/session-refusals.log` records six matched public staging/rehearsal refusal cases.

Malformed result, wrong exact-model emission, invalid operation attributes and non-void guard return produce the same respective refusal from validation and stage. Suspended guards and programs each produce `program-must-be-synchronous`. Every refusal restores all tables, resources, schema, user version and positions; validation emits no StageFailure, and each stage emits exactly one after rollback. All four suspended fibers run cancellation before the calls return, and late resolutions execute no continuation or mutation. Successful validation also restores all rows; the first subsequent successful stage allocates sessionIndex1 and applies its valid update. These checks establish the previously unrun public aggregate output/suspension parity with actual savepoint boundaries; existing service reconciliation/savepoint evidence remains separate from actual Worker/native transport.

### Authorized synchronous cancellation cleanup checks — 2026-10-11

A controlled admission case exposed cancellation cleanup being discarded after the synchronous runner captured its initial suspension. The shared `runSynchronousExit` now retires the actual suspended fiber before classification, preserves completed cleanup failures, defects and independent interruption, and filters only its own annotated interruption. A completed nested boundary is not retired again. Savepoint handles are fenced before cleanup runs; portable codecs, session preflight and decoded Zod validation use the same retirement procedure while retaining their existing public refusal policies.

`/tmp/zerospin-framework-goal-data-core-UAv4C2/cancellation-boundaries.mjs` and its `.log` exit0 against production modules and real WASM resource/session tables. Pure suspension, cleanup Fail, cleanup Die and independent interruption each restore every schema/table/position through an actual nested savepoint. A cleanup attempt to write through the fenced transaction produces `transaction-handle-closed`, retains that defect and changes no rows. Portable codecs preserve the mixed Causes; preflight reports the full Cause once; Zod distinguishes supported cleanup Die/independent interruption from its sole asynchronous-codec validation issue. Sixteen cancelled callbacks execute no continuation or mutation after late resolution. Typed-failing Schema declaration finalizers are outside their never-error release contract and are not counted as a Zod guarantee. These are synchronous core/codec checks, not Worker or native transport interruption proofs.

### Completed connected-host reconciliation boundaries — 2026-10-11

The authorized physical Chrome owner in [111](111-plan-connected-worker-ownership.md) runs the production SharedWorker, MessagePort, IndexedDB VFS and Web Locks. Paused staging retains one exact original and its optimistic resource. Full Worker/Chromium destruction and reopening the same nonempty journal preserve the Node ID, all schema/tables and original coordinates. Resuming delivers that same original once, advances the real public/private progress, removes optimism and converges with the authoritative graph. Holding accepted real SQL and actual VFS close proves drainage before namespace handover; revoked capabilities and cancelled lock waiters cannot mutate that journal. These actual host observations close the remaining paused/persistent/browser recovery and SQL-close boundaries rather than replacing their direct transaction checks.

[113](113-plan-session-replica-bootstrap.md) now verifies the actual complete WASM replica plus six production handoff cases: same-epoch preservation, reset fencing, import failure and retry, missing receipt, frozen acquisition/receive disposal, and successful receipt withholding completion until journal reconciliation. The actual agent session in [112](112-plan-agent-session-owners.md) recovers a genuine lost acknowledgement with byte-equal resend, compacts a real pre-admission refusal atomically, retains optimistic survivors and isolates observers. The six genuine HTTP/WebSocket retirement phases in [111](111-plan-connected-worker-ownership.md) fence late responses before real SQLite closes. Actual Swift/JavaScriptCore production NativeSession lost-receipt recovery and clear-authentication/suspend/resume retain the same nonempty tables, supplementing the ordinary iOS offline recovery above. These distinct owner proofs establish interruption and handoff recovery without describing every controlled case as a physical-host event.

The exact acceptance audit confirms mixed ordered occurrence/duplicate/private recovery, complete rollback across gaps/conflicts, survivor savepoint isolation, staging-result immutability, rehearsal/stage refusal parity, nonretention and cancellation/full Cause preservation. Required source/consumer compilation, scoped formatting and current architecture/glossary provenance pass. Fixed cursor/journal schema changes retain the fresh-storage requirement; no fallback or translation path was added.

## Remaining work

None.
