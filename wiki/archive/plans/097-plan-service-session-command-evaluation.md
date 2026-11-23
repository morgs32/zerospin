# Straight-line service session command evaluation

Source README paths below are historical inventory. Their [pre-consolidation snapshot](https://github.com/morgs32/zerospin/tree/79c1824b1a0353f770211851c0bfe1cc54d0ba46/packages) remains available; current documentation lives in [Fragment](../../../docs/README.md) and [architecture](../../architecture/AuthoredSystem.md).

Status: Complete — 2026-10-10.

## Problem and agreed direction

1. `stageServiceSessionCommand` and `validateServiceSessionCommand` mix readiness checks, execution lookup, nested `IResult` branching, synchronous evaluation capture, and failure recognition. Browser bootstrap repeats readiness and preparation logic. The procedure is difficult to read as an ordered domain operation.
2. Follow the current `admitAggregateCommands` composition: one straight-line Effect evaluation, submission validation inside that procedure, one synchronous transaction, and one caller-facing result conversion. This is the later admission direction, not the superseded preparation/retention split. [Plan 093](093-plan-system-configuration-validation.md) separately establishes construction-time declaration validation; it does not prescribe a list of runtime validators here.
3. Preserve the distinction between aggregate admission and service staging. Aggregate admission retains validated input without executing its business program. Service staging executes the original contract against the session's optimistic state and returns its predicted result.
4. Current bootstrap predicts and dry-applies operations, then `stageServiceCommandTx` delegates to import/replay and executes the new command again. Replace that local submission path with one evaluation whose applied operations and original result are retained atomically. Subsequent Node imports still rebase pending optimism through the existing replay path.
5. Current public staging decodes its result after Node acceptance. Decode the caller-facing result during the staging transaction, before local retention commits and handoff begins. A result codec failure must not leave a submitted command while returning a staging failure.

## Behavior and ownership

1. Keep public call shapes, generic inference, return types, and synchronous validation versus asynchronous staging unchanged. `stageServiceSessionCommand` succeeds only after durable Node acceptance; its returned result remains the original local staging result, not authoritative execution success.
2. Use ordinary Effect success and failure channels within local evaluation. Change the private bound `stage` and `validate` execution methods from nested `IResult` returns to Effects with explicit errors. Convert to the existing public `IResult` only at the caller-facing boundary. Keep asynchronous acceptance separate, including its existing uncertainty and recovery behavior.
3. The public procedure owns the initial preflight needed before acquiring session execution, contract-aware result/failure presentation, and notification policy. The bound browser implementation owns attachment validity, command construction, transaction execution, and post-commit outbox observation. Do not repeat the same readiness decision at both sites; preserve checks that protect different lifetime or reentrant publication transitions.
4. Resolve the session contract and validate this submission's payload and claims sequentially inside the bound procedure. Reuse guarantees established by authored declarations. Do not introduce `prepare*` modules, a runtime validation framework, or a batch interface solely to use `Effect.forEach`.
5. All state-dependent guard/program/mapper reads use the transaction supplied to evaluation. Collect outputs, validate/encode the program result, decode the caller-facing result, reject forbidden async operations, and apply model operations in authored order inside that transaction. Preserve result/failure codec isolation from application services.
6. Staging commits the complete encoded command, its original encoded result, applied-operation inverse bookkeeping, and next local session position together. Validate and rehearsal use the same evaluation procedure in an always-rollback transaction; they retain nothing and initiate no handoff. Preserve disposable validation ID factories and silent recognized validation failures.
7. Preserve original command IDs, timestamps, claims, actor/service/session provenance, session ordering, and the distinction between uncertain local input and Node-accepted records. Do not allocate Node indices or outbound push positions in the tab. Follow [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md).
8. Preserve `StageFailure` for recognized local staging failures, silent recognized validation failures, and existing `SessionDefect` reporting for escaping defects. Failure conversion must handle both local yieldable errors and already encoded public failures. Avoid duplicate reports.
9. Preserve the synchronous refusal guarantees from [Plan 095](095-plan-owned-execution-and-program-runner-removal.md). Stop suspended fibers and flush their dispatcher before rollback/failure publication; return recognized `program-must-be-synchronous` for authored suspension. The current root session runner stops suspension but does not resume suspended inner result handlers, and `makeTx` otherwise classifies defect exits as transaction failures. Keep capture at the cohesive evaluation phase, consolidate the duplicated staging/validation implementation there, and do not assume an outer `runSync` alone can replace it.
10. Publish outbox observation and handoff state only after successful commit. An observer exception cannot turn an already committed command into a local staging refusal. Preserve attachment pinning through the asynchronous acceptance wait; never retrieve a replacement execution binding to accept an old command.

## Intended flow

```text
stageServiceSessionCommand
  preflight and resolve current bound execution
  synchronous bound staging Effect
    validate attachment and submitted input
    transaction
      evaluate guard/program against tx
      encode and decode result
      apply optimistic operations
      retain command, inverse bookkeeping, and session position
    observe committed outbox
  await acceptance through the same bound execution
  return already validated local success

validateServiceSessionCommand
  preflight and resolve current bound execution
  synchronous bound validation Effect
    validate attachment and submitted input
    always-rollback transaction
      same guard/program/result/operation evaluation
  return recognized result without StageFailure or handoff
```

## Planned files

Legend: `+` create, `~` modify. Paths are rooted at this repository. Modify shared documentation only where its existing description changes.

```text
zerospin/
├── packages/core/src/serviceSession/
│   ├── stageServiceSessionCommand.ts                 ~
│   ├── validateServiceSessionCommand.ts              ~
│   ├── evaluateServiceSessionCommandTx.ts            +
│   ├── stageServiceSessionCommandTx.ts               +
│   ├── validateServiceSessionCommandTx.ts            +
│   ├── importServiceNodeCommands.ts                  ~
│   ├── types.ts                                     ~
│   └── README.md                                    ~
├── packages/core/src/aggregateSession/makeSessionResult.ts ~
├── packages/browser/src/bootstrapServiceSession.ts   ~
├── packages/core/src/sessionExecution/README.md      ~
└── wiki/plans/097-plan-service-session-command-evaluation.md +
```

## Implementation sequence

1. Re-read scoped current diffs before implementation. These files already contain Plan 095 work and unrelated WIP; preserve it. Keep [Plan 096](096-plan-browser-session-lifecycle-machine.md) lifecycle ownership separate. Locate all consumers of the private execution methods and the current `stageServiceCommandTx` export before replacing them.
2. Implement `evaluateServiceSessionCommandTx` as a cohesive Effect procedure accepting an explicit transaction, the session release, command, and decoded claims/input needed for evaluation. It owns synchronous authored-evaluation capture and ordered operation application and returns encoded result, decoded result, and applied operations. Supply `tx`, not bootstrap's captured `db`, to program reads. Reuse current contract and operation helpers; add no generic execution framework.
3. Implement `stageServiceSessionCommandTx` with `makeTx`: evaluate the command once against the current optimistic view, retain complete local staging, persist encoded applied operations for future inverse/rebase work, and advance local metadata. Preserve existing index validation and row encoding. Do not call the outer import transaction from inside this transaction and do not rewind/replay all pending commands merely to append a new local command.
4. Implement `validateServiceSessionCommandTx` with `makeTx(..., { rollback: 'always' })` over the same evaluation procedure. The rehearsal checks operation integrity and result codecs but leaves resource tables, metadata, history, and outbox selection unchanged. Keep disposable ID generation in the bound validation execution scope.
5. Replace bootstrap's `predict`, `projectPrediction`, `validatePrediction`, and local preparation/staging branches with straight-line bound Effects calling these transactions. Construct and validate the submission in that procedure; share a local construction function only if it removes actual duplication without introducing a prepared-command lifecycle. Keep current attachment checks and after-commit observation behavior.
6. Update the private execution types; preserve existing context provisioning in `makeServiceSession`, which already preserves generic staging results. Refactor both public wrappers to ordered `yield*` evaluation with one result-recognition boundary. Preserve the runtime-unavailable preflight path. Remove the duplicate `captureStaging` and `captureValidation` implementations once the transaction evaluation owns their guarantees. Do not broaden this work into changing root `makeSessionExecution` semantics.
7. Return staging's already decoded command after the acceptance wait. Remove the post-acceptance `resolveContractResult` execution and unreachable defensive branches made unnecessary by successful contract/execution resolution. Retain the existing acceptance failure behavior and asynchronous recovery protocol.
8. Delete the superseded `stageServiceCommandTx` wrapper from `importServiceNodeCommands.ts` and migrate every in-scope caller directly. Keep Node import, authoritative history reconciliation, duplicate recovery, and `replayPendingServiceCommandsTx` for actual imports. No alias or parallel local staging path remains.
9. Reconcile service-session and execution README descriptions with the implementation. Check the existing glossary for any changed wording; update only implemented domain meaning. Create an ADR only if the implemented choice is hard to reverse, surprising without context, and involves a real trade-off. No glossary update or ADR creation occurs during planning.
10. Complete scoped verification, record evidence and limitations, and archive this plan with its filename preserved only when no work remains.

## Verification

1. Use the existing public `stageServiceSessionCommand` and `validateServiceSessionCommand` interfaces as behavior seams, plus the existing session journal/import interface for rebase correctness. No new test files, fixtures, check runners, or their configuration are authorized. Use existing applicable suites/stories where available; otherwise verify source and exercise existing interfaces without adding repository test artifacts. Record any limits of behavioral verification explicitly.
2. Verify successful staging evaluates the new command once, commits optimism/history/inverses together, and resolves only after acceptance. Verify validation leaves all persistent session state unchanged and never observes or submits an outbox command.
3. Verify unavailable/released/replaced session, missing contract, invalid payload/claims, business refusal, result encode/decode refusal, forbidden async operation, and operation-integrity failure. Each pre-commit staging refusal leaves no command or optimistic writes. Validation remains silent for recognized failures; staging emits one `StageFailure`.
4. Verify suspension in authored evaluation and codecs: the suspended fiber cannot resume writes or emissions after return, SQL work rolls back, and the refusal retains the existing recognized code. Verify escaping defects are not silently converted into successful validation or reported twice.
5. Verify later Node receipt and finalization imports still rewind/replay correctly using the newly retained inverse bookkeeping. Original staging results remain immutable; accepted ordering, uncertain-local ordering, duplicate imports, and commands with executed counterparts preserve current semantics.
6. Verify handoff waiting uses the original execution binding, Node acceptance failure/uncertainty preserves retained command identity, and observer exceptions after commit do not produce a false local refusal. Public generic contract result/payload inference remains intact.
7. Inspect resolved Nx configurations for core and browser once at implementation time. Run the smallest formatting, lint, source typecheck, and required build graph through `pnpm nx`, adding actual affected consumers only when types/exports require it. Keep dependency scheduling and caching; run scoped `git diff --check`. Do not claim whole-repository validation or repair unrelated WIP failures.

## Scope and alternatives

1. This is a service-session evaluation/composition refactor. No fixed-schema, wire-format, public session-call, Node durability, retry, notification-lifetime, or session-lifecycle redesign is included.
2. Rejected: mechanically use `Effect.fn` while keeping nested result branching and duplicate evaluation. That changes syntax without clarifying ownership.
3. Rejected: move all checks before the transaction by copying aggregate admission literally. Service guards and programs depend on the business state whose mutations must commit atomically.
4. Rejected: introduce a `prepare*` hierarchy or one method per trivial check. Keep sequential submission checks inline and extract only the cohesive transaction/evaluation phases.
5. Rejected: delete every local suspension check and rely on the root runner. That would lose recognized domain refusals or classify them as generic transaction failures.
6. Defer changing the public meaning of a failed asynchronous acceptance wait. That is a separate protocol decision; this plan preserves existing recovery and command identity behavior.

## Implementation outcome and verification evidence

1. Public staging and validation now compose ordered Effects and recognize one caller-facing result. The private execution methods retain generic decoded result inference; existing session context provisioning required no change.
2. Added one transaction evaluation shared by direct staging and rollback rehearsal. Local staging appends the command and inverse bookkeeping without replaying prior pending input. Node imports retain the existing rebase path. No fixed schema or wire format changed.
3. Failure encoding runs inside the captured evaluation so asynchronous business failure codecs are refused before rollback. Rehearsal retains its private Scope and captures its cleanup in the same synchronous phase. Transactions restore escaping non-failure evaluation Causes after rollback instead of reporting them as generic database refusals.
4. The shared `makeSessionResult` recognizer now distinguishes encoded public failures from local framework/business errors. This small additional change preserves already encoded business failures when private execution uses ordinary Effect failure channels. It does not add a separate result-conversion framework.
5. Inline checks against in-memory sql.js SQLite and the public service-session interface passed: rollback rehearsal; one program execution per new staging; atomic optimism/history/inverses/position; receipt rebase and duplicate receipt; finalization and immutable original result; invalid payload/claims and unavailable contract; result validation/decode refusal; result/failure codec suspension; stopped suspended program; operation refusal; forbidden async output after earlier model output; reentrant attachment refusal; rehearsal Scope cleanup; silent validation; one StageFailure; one SessionDefect; original bound acceptance wait; retained command after acceptance failure. No test files, fixtures, or check runners were created.
6. `pnpm nx run-many -t lib ts lint -p @zerospin/core,@zerospin/browser` passed, including the core build, browser build/bundle and source checks, lint, and required dependency builds. Scoped formatting and `git diff --check` passed. Lint retains existing/concurrent warnings outside the new service evaluation code. Nx Cloud reported access code 401 after the local graph succeeded. Concurrent Plan 096 compilation errors were corrected by that work before the final passing graph; this implementation did not modify its lifecycle or machine files.
7. Source review confirmed removal of the superseded local staging/import wrapper and prediction/capture duplicates. Shared glossary terms still describe the implemented domain behavior; no new term or qualifying ADR was introduced. Service-session and execution READMEs now describe the actual transaction and failure ownership.
8. Behavioral verification used SQLite in Node and public session execution; no live application browser inspection or permanent regression suite was added. Outbox publication observer isolation was checked in current browser/SQLite source, and the browser bundle is part of the required final graph.

## Remaining work

None.
