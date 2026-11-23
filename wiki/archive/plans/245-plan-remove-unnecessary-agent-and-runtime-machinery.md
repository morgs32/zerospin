# Remove unnecessary Agent and runtime machinery

**Date:** 2026-10-18

**Status:** Implemented and verified on 2026-10-18. Scoped checks and source review passed; the runtime coverage limits below remain explicit.

**Basis:** The [machinery audit](../../research/agent-node-machinery-audit.md) and the request to remove its unnecessary mechanisms while retaining real transaction and lifecycle guards. [Plan 244](244-plan-transient-agent-nodes.md) supplies the current transient Agent Nodes. Its implementation and the earlier Service Agent browser/backend work are still in the working tree; preserve that work and recheck current callers before editing. Do not restore HEAD, reset or stash the tree.

**Reference decisions:** [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md), [ADR 007](../../adrs/007-canonical-results-and-selected-chain-ownership.md), and [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md). Update descriptions of the implemented result rather than preserve machinery solely because a document names it.

## Agreed result and boundaries

1. Delete unused capabilities and their supporting machinery: the public Agent database/proxy, committed-SQL statement capture, redundant Agent transport state/context/startup handle, duplicate readiness and identity inputs, duplicate subscription methods, empty fanout factories, and unused Worker invocation fallback paths.
2. Remove the audited unnecessary resource-array construction and repeated command-state decoding/progress scans. Preserve owning model codecs, final evidence, error/Cause propagation and checked replay semantics.
3. Keep explicit Aggregate and Service entrypoints and exact release/contract/application-service inference. Add no overloads, compatibility aliases, dual paths, fallback decoders, new `any` or `ALLOWED_CAST`. Do not redesign the ordinary Actor/Standalone APIs or their existing implementation signatures.
4. Keep Agent Sessions thin. They own application execution, lifecycle and their current Node; the Node owns current read/write availability, connection, command state and producer progress.
5. Leave Shopping declarations, contracts, versions, producers, reservations, data and startup for later. Make no Actor refactor, including no restructuring of the common SessionLifetime's internal Actor/machine/supervisor. Shared framework call-site updates must preserve Actor behavior and contracts.
6. Change no fixed database schemas, storage guards, Node identities, backend wire messages, admission rules, ticket format, durable history or retention policy. Perform no publication, sibling rollout, deployment, storage activation/reset or application startup.
7. Add no tests, profiles, fixtures, runners or configuration. Use existing checks and source review at the named behavioral seams. Do not verify Explorer.

## Guards and responsibilities to retain

| Responsibility                            | Required behavior                                                                                                                                                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local staging                             | Originating input and optimistic model writes commit in one synchronous transaction. A recognized refusal retains neither. Validation always rolls back and uses validation-local ID factories.                                                           |
| Received authority                        | Commit authoritative baseline, final evidence and checkpoint before rebuilding projected models in a second transaction. Replay failure cannot undo the first commit.                                                                                     |
| Publication and reentrancy                | Withdraw the resource view and writable readiness before the authoritative commit. Retain the small publication epoch/lifetime guard and checks after both commits so an observer cannot resurrect a revoked view.                                        |
| Private command evidence                  | Final presence comes from `aggregateIndex` or `serviceIndex`, independently of null failure or empty delta. Private evidence survives selection exit and failed projection until normal disposal detaches the Node.                                       |
| Admission                                 | Keep one in-flight admission, exact ID/payload/`pushIndex` retry, admitted/final proof, first-gap private progress and the definitive pre-admission-refusal classification. Uncertain receipt/transport failure cannot authorize deletion or renumbering. |
| Resource revocation versus SQL retirement | Retain `revoke()` separately from `dispose()`: terminal resource revocation may occur while reconciliation still needs private SQL to publish committed final evidence. Actual disposal closes that opportunity.                                          |
| Transaction lifetime                      | Preserve `makeTx`, `withSavepoint`, `evaluateSynchronousSavepoint` and `fenceTransaction`, including synchronous suspension cancellation, native rollback, original Cause and retired transaction-builder checks.                                         |
| SQLite notifications                      | Flush committed table changes only after execution and the outer transaction settle. Preserve rollback/savepoint bookkeeping, listener isolation, reentrant batching, unsubscribe behavior and read-table tracking in both adapters.                      |
| Transport/lifecycle                       | Keep scoped socket ownership, AbortSignal/retired-attempt checks, serialized events, admission/replay timeouts, late acquisition cleanup and joined shutdown before SQLite close. Reconnect keeps the same Node/producer and resumes retained progress.   |
| Shared Nodes and delivery                 | Preserve SQL serialization/drain, reset pause and acknowledgement, subscriber cursors, durable acknowledgement, complete pending publication and `recoveryRegistry` holds.                                                                                |

## 1. Remove the Agent database capability and proxy

1. Delete `IAgentNodeView.db` and `fenceAgentNodeRead.ts`. Remove their imports and the view/state model generics that exist only for the unused database property. Keep the release generic on each Node and Session for exact contract/application typing.
2. Publish only the existing synchronous `readSelection(selection, identity)` capability with normalized command/progress state. Inside that method, check Node lifetime, current view epoch, publication availability and exact declared-selection membership, then call `selection.all` using the Node's private database.
3. Keep old captured readers invalid after reconciliation, terminal revocation or disposal. Preserve the current last usable view during permitted network retry; it remains visibly stale and unwritable. Do not replace the proxy with another recursive wrapper, raw SQLite exposure, generic query executor or arbitrary-query API.
4. Studio continues to consume the same guarded selection method and normalized command state. No SQL observers, journal queries or JSON failure decoding return to the UI. Keep the inspector mounted after selection exit, while a view is temporarily unavailable, and after terminal cleanup retains normalized evidence.

## 2. Delete dead SQL statement capture

1. Reduce `makeCommitObservation` to its real remaining responsibility: delaying table-change flushing until execution and the outer transaction settle. Retain that file/function; delete the statement-capture feature outright rather than rename and retain it.
2. Delete `onCommittedTransaction`, `ICommittedSqlStatement`, capture stacks, captured-batch/publication queues, capture-only parameter cloning/freezing, `isPublishing`, statement `record` and capture merge/discard methods. Move the still-required `ISqliteStatementParameter` type into `drizzle/types.ts`; preserve actual binding normalization and copies.
3. Replace the capture stack's notification barrier with two small counters, `executionDepth` and `transactionDepth`. This is connection-local scheduling state, not persisted state. Keep `beginExecution`/`finishExecution` around statement preparation, binding, stepping, result/changes collection and finalization. Flush only when both counters are zero, isolating observer errors so a successful COMMIT cannot become a transaction failure.
4. In the outer `SqliteSession.transaction`, enter the transaction barrier after successful BEGIN and leave it in `finally` after COMMIT or ROLLBACK has settled. Preserve native transaction/error ordering. In nested `SqliteTransaction`, remove the now-unused observation constructor dependency and all capture calls; preserve SAVEPOINT/RELEASE and ROLLBACK TO/RELEASE exactly. The outer barrier already covers nested work.
5. Remove capture-only SQL classification, SQL-text lookup, captured batches and the `queryMetadata` argument to `executeStatementRows`. Retain Drizzle's required `prepareQuery` signature and its metadata forwarding to the prepared-query implementation. Preserve all supported row modes, parameter normalization, statement finalization and `changes` capture before observers may write again. Leave existing ordinary function signatures intact; add no overloads.
6. Remove capture-only `sqlite3.sql` from the generic client interface, the Native JavaScript bridge implementation and Swift `SQLiteHost`'s `case "sql"`. Preserve the browser adapter's internal wa-sqlite `sqlite3.sql` calls: they identify real transaction/savepoint controls. Preserve the Native host's authorizer, savepoint, commit/rollback and table-change flush logic.
7. Preserve each adapter's changed-table sets, savepoint snapshots, autocommit checks and `isFlushing` loop. Do not move those responsibilities into another helper queue or conflate table/read observation with SQL statement replication.

```text
Statement execution
  increment executionDepth
  prepare / bind / step / collect / finalize
  capture changes before notifications can reenter
  finally decrement executionDepth and flush if settled

Outer transaction
  BEGIN; increment transactionDepth
  run body; COMMIT, or ROLLBACK and propagate failure
  finally decrement transactionDepth and flush if settled

Flush if settled
  require both depths == 0
  call existing adapter.flushTableChanges with observer errors isolated
```

## 3. Simplify Agent construction, startup and transport

1. Remove caller-supplied `agentName` from Aggregate/Service Session construction inputs and Studio call sites. Derive Agent name/version exclusively from `sessionDefinition`; retain those fields in bootstrap requests, sockets and backend admission where they establish real identity.
2. Remove `makeAgentSessionHost.inputsValid` and its generic validation branch. Validate nonempty `aggregateId` at the explicit Aggregate factory boundary, before constructing/acquiring the host, using the existing `agent-session-inputs-invalid` error. Service construction needs no repeated declaration-name validation. Invalid Aggregate construction now fails at that boundary instead of waiting for `initialize()`; document this intentional narrowing. Neither case acquires application services or SQLite for invalid input.
3. Remove `execution` from synchronization props and delete its application-context capture/provision. Keep captured application execution in Node opening/evaluation. The scoped socket owner inherits its bootstrap Effect context and uses its existing injected operations; no second runtime is needed for transport.
4. Delete the shared Agent transport's `generation`/attempt epoch: its connection attempts are serial and each attempt's scope awaits `makeSocketAttempt.stop()` before the next one begins. Continue checking the parent AbortSignal and `attempt.active()` at every current late-callback/publication boundary. Do not remove ordinary Node generation/reset guards.
5. Delete the transport's `terminal` boolean and toggles. Preserve Cause-based defect/interruption handling, the existing retry-code allowlist and explicitly-offline retry policy. Synchronous protocol/Node exceptions remain terminal; typed transport uncertainty retains existing retry treatment.
6. Have synchronization fork its scoped owner, await its existing first-replay Deferred itself and return void. Delete the immediately consumed `awaitFirstUsableReplay()` handle and simplify both family bootstraps without changing the owner resource scope or cancellation ordering.
7. Delete the bootstrap subscriptions that mirror every `Node.writable` change into Session `status`. After first usable replay, each bootstrap checks abort/current Node/terminal failure and publishes Session `ready` once. Session status then describes initialized lifecycle; Node `writable`, `view` and `connection` exclusively describe current command/resource availability. Reconnect/reconciliation may withhold Node writes while the Session remains ready. Failure/disposal still dominate and cannot be overwritten by late readiness publication. Ordinary Actor/Standalone lifecycle semantics remain unchanged.
8. Preserve public `sessionId`, cold construction, general execution typing, terminal-error display, retained command inspection and fresh-producer reinitialization. Do not merge the explicit family adapters or factories into an overloaded entrypoint.

## 4. Remove duplicate subscription and Worker factory paths

1. Replace all three `makeNodeSubscriptions.replaceSnapshot()` calls with `publish()` and delete the identical alias. Retain reset pause, attachment acknowledgement, cancellation, interest sampling and captured-view checks.
2. Delete `makeFanoutSubscriber/catchup.ts` and its empty `makeCatchup<...>()` factory. Public catch-up calls `runFanoutCatchup(options, index).pipe(Effect.asVoid)` directly.
3. Convert `makeSubscribe<...>()` in `subscribe.ts` to a direct generic `subscribeFanout(options, index)` procedure. Let normal arguments infer types rather than repeating the factory's long generic parameter list. Keep catch-up before the durable cursor reread and source enrollment, including exact source/key/privacy checks and acquired capability disposal.
4. Make the existing Worker policies required: `runInvocation` and `encodeRpcOutcome` in `makeMigratableDORepo`/`makeFanoutQueue`, `runInvocation` in `makeOutboxQueue`, and `encodeRpcOutcome` in both subscriber factories. Remove every missing-policy execution/encoding branch and conditional spread in the five projection/replay subscriber forwarders.
5. Keep policies injected by the current Worker composition roots. Do not import `runWorkerInvocation`, Worker telemetry or application config into the generic factories, and add no bound wrapper factory. `makeMigratableDORepo` must retain its config-independent import behavior.
6. Recovery dispatch already owns its invocation capture/runtime: register the plain drain Effect and keep direct background wake/drain invocation wrapped exactly once by the supplied policy. Preserve one original failure/Cause, public error encoding and receiver acknowledgements. This cleanup must not create nested runtimes or double telemetry capture.
7. Treat required policy arguments as an intentional public API cutover. Current in-repository compositions already supply them; update any necessary mechanical caller signatures and maintained public documentation. Preserve namespace/Repo registration, all durable schemas, actor identity/locks and retention behavior. Add no optional legacy path or default policy.

## 5. Remove unused data construction and repeated publication work

1. Separate projected model rebuilding from caller-owned graph capture. `rebuildOptimisticResourcesTx` performs replacement/replay and returns void. Ordinary `makeNodeOptimisticView.project` performs its existing checked final graph capture inside the same transaction and returns that graph unchanged.
2. Each Agent reconstruction retains a checked scan of its final model rows through the existing owning model/resource codec, inside the projection transaction, but does not accumulate or return an unused resource array. Keep the small scan explicit in the family implementation; add no capture-mode flag, overloaded projection engine or lazy query capability. Preserve invalid-model/row rejection and transaction rollback; the optimization removes the unused collection, not validation.
3. In both Agent Nodes, read only the fields needed for normalized command state and producer progress during `publish`: ID, command name, session index, nullable owner index, private failure and push position. Decode private failure with its existing codec. Do not reread/decode retained payloads or complete historical deltas merely to render command status.
4. Derive allocated maximum and private first-gap completion from that one row set. Use an ephemeral set of finalized originating push positions plus a linear prefix walk rather than repeated `some` scans and another full-history query. Other progress readers use the same focused derivation; payload-requiring submission/replay/redelivery checks still read their complete retained inputs/evidence.
5. Add no stored cursor/counter/cache, replacement command table or second Session history. Keep command ordering, same-ID final equality, private failure provenance and the normalized publication shape unchanged.

## Implementation sequence and planned files

1. Reinspect the current working tree and confirm the audit's caller/absence claims. Preserve Plan 244 and the Service Agent feature. Capture current public declarations and behavior at the guarded seams before replacing code.
2. Narrow Agent reads and remove redundant construction/startup/transport state together with Studio caller updates.
3. Delete SQL statement capture across Core, Native and Swift while preserving the table-observation barrier and native savepoint semantics.
4. Remove duplicate subscription/fanout paths and make Worker policies explicit. Trim the unused graph collection and publication scans without changing authoritative state or replay validation.
5. Run the permitted checks, review the behavioral seams, then reconcile current documentation with actual source. Record evidence and remaining work here; archive only after all required items pass.

`~` modifies, `-` deletes, `+` creates. This is a file/module map, not a requirement to create forwarding helpers.

```text
zerospin/
├── packages/core/src/
│   ├── AggregateAgentNode/
│   │   ├── ~ AggregateAgentNode.ts, types.ts, README.md
│   │   └── - fenceAgentNodeRead.ts
│   ├── ServiceAgentNode/~ ServiceAgentNode.ts, types.ts, README.md
│   ├── agent/~ types.ts
│   ├── Node/~ makeNodeSubscriptions.ts, rebuildOptimisticResourcesTx.ts, makeNodeOptimisticView.ts
│   ├── AggregateNode/~ AggregateNode.ts
│   ├── ServiceNode/~ ServiceNode.ts
│   └── drizzle/
│       ├── ~ makeCommitObservation.ts, executeStatementRows.ts, SqliteSession.ts, types.ts, README.md
│       └── make/makeInMemorySQLite3/~ makeInMemorySQLite3.ts
├── packages/browser/src/
│   ├── AggregateAgentNode/~ AggregateAgentNodeSynchronization.ts
│   ├── ServiceAgentNode/~ ServiceAgentNodeSynchronization.ts
│   ├── agentNodeBrowser/~ synchronizeAgentNode.ts, makeAgentSessionHost.ts
│   ├── ~ bootstrapAggregateAgentSession.ts, bootstrapServiceAgentSession.ts
│   ├── ~ makeAggregateAgentSession.ts, makeServiceAgentSession.ts
│   └── makeBrowserSession/~ README.md
├── packages/studio/
│   ├── src/~ AgentExplorer.tsx, ServiceAgentExplorer.tsx, AgentSelectionBrowser.tsx
│   └── ~ README.md
├── packages/native/src/~ openNativeSqlite.ts
├── packages/swift/Sources/Zerospin/~ SQLiteHost.swift
├── packages/system-worker/src/
│   ├── makeMigratableDORepo/~ makeMigratableDORepo.ts, README.md
│   ├── makeFanoutQueue/~ makeFanoutQueue.ts, README.md
│   ├── makeOutboxQueue/~ makeOutboxQueue.ts
│   ├── makeOutboxSubscriber/~ makeOutboxSubscriber.ts
│   ├── makeFanoutSubscriber/
│   │   ├── ~ makeFanoutSubscriber.ts, subscribe.ts
│   │   └── - catchup.ts
│   ├── AggregateVersionRepo/replayCommandsFanoutSubscriber/~ replayCommandsFanoutSubscriber.ts
│   ├── ServiceVersionRepo/replayCommandsFanoutSubscriber/~ replayCommandsFanoutSubscriber.ts
│   ├── aggregateProjection/evaluatedCommandsFanoutSubscriber/~ evaluatedCommandsFanoutSubscriber.ts
│   ├── serviceProjection/~ executionPacketsFanoutSubscriber.ts
│   └── serviceAgentProjection/~ executionPacketsFanoutSubscriber.ts
├── fragment/content/reference/~ browser.md
└── wiki/
    ├── plans/+ 245-plan-remove-unnecessary-agent-and-runtime-machinery.md
    ├── ~ glossary.md
    ├── architecture/~ AuthoredSystem.md, relevant browser/SQLite/Worker sections
    └── adrs/~ governing 003, 007, 015 descriptions where affected
```

## Verification and completion

1. Add no test files, fixtures, profiles, check runners or configuration. Existing package behavioral suites removed from this repository are not runnable requirements. Do not recreate them or claim the new cleanup has automated runtime coverage.
2. Run existing scoped Nx declaration builds, typechecks and lint for Core, Browser, Studio, System Worker, CLI, SDK, React, Native and dev/production worker variants, with explicit project selection and dependencies in one graph. Run only existing targets: Core is checked by `lib`; Native `ts` includes its `build` dependency. Do not use root all-workspace wrappers or overlapping graphs.
3. Run existing `zerospin-swift:build` for the deleted bridge branch, reusing its Native build dependency. Run existing root `test-external-types` and `test-external-examples` with their existing selection in a subsequent scoped graph. These checks do not authorize Shopping edits/startup. A failed or blocked required check keeps this plan active.
4. Run formatting checks on changed files and `git diff --check`. Search authored source/emitted declarations/current maintained docs for `fenceAgentNodeRead`, public Agent `view.db`, `onCommittedTransaction`, `ICommittedSqlStatement`, capture-only methods/SQL bridge, `replaceSnapshot`, `makeCatchup`, `makeSubscribe`, the Agent replay-wait handle and optional Worker policy fallbacks. Preserve historical research/archives and unrelated usages of words such as capture, epoch, generation and outcome.
5. Review the following against final source and any relevant existing regression checks. Distinguish source conclusions from executed runtime coverage:

   | Seam                        | Required evidence                                                                                                                                                                                                                                                                            |
   | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Guarded reads               | Only declared synchronous selections; no published raw DB; captured readers fail after replacement/revocation/disposal; read availability remains withdrawn across both reconciliation commits.                                                                                              |
   | Reentrant authority/failure | Epoch checks survive terminal/disposal callbacks before/after both commits. Committed final evidence remains inspectable after unexpected replay failure; no premature SQL retirement hides it.                                                                                              |
   | SQLite settlement           | Outer commit/rollback, nested release/rollback preserving earlier outer changes, failed prepare/step/finalize, observer writes, throwing/unsubscribing observers and restored table-name publication retain behavior. Statement results/changes are captured before observation can reenter. |
   | Transaction lifetime        | Suspended/rejected authored work rolls back and retires its builders with original Cause preserved; `fenceTransaction` and savepoint behavior remain intact.                                                                                                                                 |
   | Agent lifecycle/transport   | First replay gates initialization; ready lifecycle and current Node writability stay distinct; reentrant disposal/failure cannot publish late ready; serial attempt retirement, timers, exact retry/private replay and fresh-ticket reconnect retain behavior.                               |
   | Identity/types              | Identity derives from the canonical declaration; wrong Agent/owner/version/contract/model remains refused. Emitted APIs retain exact inference and contain no new overloads, aliases or raw Agent DB access.                                                                                 |
   | Delivery/fanout             | Catch-up/cursor reread/enrollment ordering, pending-publication acknowledgement, recovery holds and one invocation/error-capture policy remain intact; importing generic Repo factories does not pull application config.                                                                    |
   | Derived state               | Model codecs still check final reconstructed rows. Private first-gap progress cannot skip unresolved input. Status publication avoids full payload/delta decoding without weakening final equality or retention.                                                                             |

6. After implementation, update the glossary, affected module/Studio/browser reference documentation, architecture diagrams/source citations and the governing ADR descriptions to match actual source. Explain the Agent readiness semantic and required Worker policy arguments. No new ADR is expected for deleting unused machinery; create one only if an implemented decision meets the repository's qualifying criteria. Keep the audit historical and earlier deferred verification, including Plans 227–234 and Shopping Plan 239, unchanged.
7. Record exact executed checks, source-review evidence, retained warnings and runtime coverage limits. Set **Remaining work: None** and archive this plan with repaired links only after implementation, required verification and documentation are complete.

## Implementation and verification record — 2026-10-18

Implemented all five cleanup areas. Agent views now expose only guarded synchronous
`readSelection`; the private database and proxy are gone. Both Agent families preserve
the authoritative-then-projection transaction boundary, final model validation and
normalized private evidence. Status publication selects only needed columns and uses
one ephemeral finalized-position set for first-gap progress.

SQL statement capture, its callback/types and native/Swift SQL lookup bridge are gone.
`makeCommitObservation` retains only execution/outer-transaction settlement barriers.
Agent construction derives identity from its release; empty Aggregate IDs fail before
resources. Transport retains scoped serial attempts and retry rules without duplicate
context/generation/terminal state. First replay publishes Session `ready` once; Node
`writable`, `view` and `connection` own current availability. Empty subscription/fanout
factories, duplicate publication methods and optional Worker policy paths are removed.

### Executed checks

All commands ran through existing Nx targets in sequential graphs, with no Explorer
selection and no new tests, fixtures, runners or configuration.

1. `NX_NO_CLOUD=true pnpm nx run-many -t lib ts lint -p @zerospin/core @zerospin/browser system-worker @zerospin/studio @zerospin/cli @zerospin/sdk @zerospin/react @zerospin/native @zerospin/dev-worker @zerospin/production-worker --parallel=3` passed: 35 tasks including dependencies, 9 cache hits. Core has no separate `ts` target; its declaration build checks types. Native's existing `ts` dependency ran its build. Existing Core lint warnings (33) and Studio lint warning (1) remain; no new cleanup warnings or errors were reported.
2. `NX_NO_CLOUD=true pnpm nx run zerospin-swift:build` passed, including its Native build dependency (2 tasks).
3. `NX_NO_CLOUD=true pnpm nx run-many -t test-external-types test-external-examples -p zerospin --parallel=2` passed: external typecheck and all 6 existing regressions (8 tasks including dependencies, 3 cache hits).
4. Existing `zerospin:format` and `zerospin:format:check` ran on this plan's changed supported files, isolated by a task-start file-hash manifest rather than the pre-existing dirty tree. Both passed. Repository formatter exclusions for Drizzle files remain; their edited source was reviewed manually. `git diff --check` passed.
5. Authored-source/emitted-declaration searches found no removed proxy, capture callback/type, publication alias, empty fanout factory, replay-wait handle or optional Worker policy path. Emitted Agent views expose only `readSelection`; release/command inference remains intact and required policies are nonoptional.

### Source review and boundaries

Independent source review checked all named seams. This is source evidence, separate
from the executed existing checks above:

- Captured selection readers check lifetime, epoch and declared selection membership. Revocation/disposal invalidate them. Reconciliation withdraws reads/writes before authority and checks retirement after each commit; unexpected replay failure preserves committed final evidence for normalized publication before SQL retirement.
- Final reconstructed model rows still pass owning codecs inside the projection transaction. Ordinary Nodes capture their full result graph in that same transaction; Agents validate without collecting the unused graph. Focused command publication decodes the owning failure field only. Final presence still uses owner index, and first-gap progress cannot skip unresolved originating input.
- Statement preparation/binding/stepping/result and changes collection/finalization remain inside execution settlement. Outer transaction depth starts after successful BEGIN and ends after COMMIT/ROLLBACK. Savepoint release and ROLLBACK TO/RELEASE order, read-table tracking, listener isolation, reentrant batching and restored-table publication remain. Results/changes are collected before observer writes can reenter.
- `makeTx`, `withSavepoint`, `evaluateSynchronousSavepoint` and `fenceTransaction` are byte-identical to the task-start snapshot. Their rollback, suspension cancellation, retired-builder and original Cause behavior was not changed.
- First replay gates initialization; abort/current Node/failed checks dominate once-only ready publication. Scoped attempts retire serially before retry; message serialization, active/abort guards, timers, one in-flight admission, exact retained retries, offline allowlist, defect/interruption handling and fresh-ticket reconnect remain.
- Exact owner/Agent/version/contract/model validation and backend admission are unchanged. Generic Worker factories retain type-only policy imports without pulling application config. Catch-up still precedes durable cursor reread/source enrollment, and acquired source capabilities are disposed. Recovery runs plain registered drains within the Repo's policy; direct background delivery invokes its policy once. Pending-publication acknowledgement and recovery holds are unchanged.
- No Shopping, fixed schema, wire/identity, storage/reset, Actor redesign, new overload, compatibility alias, new `any` or `ALLOWED_CAST` changes were introduced. No application startup, deployment, publication or sibling rollout was performed. Earlier Service Agent/Plan 244 working-tree changes were preserved.

Updated module/Studio/browser reference documentation, glossary, affected architecture
workflows/source citations and governing ADR 003/007/015 descriptions. No new ADR was
needed. Historical research, archives and earlier deferred verification, including
Plans 227–234 and Shopping Plan 239, retain their status.

No new automated AgentNode or SQLite runtime coverage was added. The existing external
regressions do not exercise every cleaned-up lifecycle, observer, reconnection or
projection-failure seam. Those behaviors have source review only under the agreed
no-new-tests/no-startup boundary; no live Agent-session verification is claimed.

**Remaining work:** None.
