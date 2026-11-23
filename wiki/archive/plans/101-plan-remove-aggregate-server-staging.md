# Remove aggregate server staging

Status: Complete and archived on 2026-10-11. Approved in chat; dependency [shared ManagedRuntime cutover](100-plan-shared-managed-runtime.md) completed on 2026-10-10.

## Problem and decision

Server session repositories currently speculate about command results and forward their staging failures into the canonical chain. That gives speculative execution authority over the event history and duplicates ownership inside actor and agent projection Durable Objects. Browser rehearsal remains useful for immediate feedback, but canonical admission must retain the submitted command and canonical execution must decide its outcome against the aggregate's current state.

1. Browser sessions alone stage commands. Actor and agent sockets send original commands directly to AggregateChain, preserving authentication, bindings, ordered admission, deduplication and completion frames.
2. AggregateVersionRepo owns authoritative guard and program execution. Aggregate actor guard declarations are removed; command policies use aggregateRelease.guards. Service actor guards and session authorization remain separate.
3. Actor and agent version repositories directly own confirmed projections. Delete AggregateSessionRepo rather than replacing it with a stateful helper. Shared projection procedures have explicit inputs.
4. Projection storage retains full resources, projectionState and browserCommandOutbox. Delete its duplicate command history, staged journal, scratch database, staged outbox and reconciliation. AggregateVersionChain owns execution history; actor and agent version chains own browser delivery history.
5. Reception validates command rows and operations, applies operations, computes selection deltas, advances checkpoint/hash and enqueues private browser outcomes in one synchronous transaction. Failed canonical commands advance with empty deltas. Snapshot resources and cursor are captured atomically; RPC waits happen outside transactions.
6. Remove the unused remote validateActorCommand endpoint and staged-admission contracts. Local SDK/browser validation and rebase remain. Trusted async continuation admission retains its separate lineage and nullable browser metadata.
7. Fixed schema changes require fresh empty storage, without migrations, fallback decoders or automatic deletion. Preserve unrelated WIP and the completed managedRuntime changes.

## Planned files

Legend: + create, ~ modify, - delete. Directories list their in-scope descendants.

```text
zerospin/
  packages/core/src/
    ~ aggregateActor/
    ~ aggregateSession/
    - contracts/StagedAggregateCommandSchema.ts
  packages/sdk/src/
    ~ index.ts
  packages/system-worker/src/
    ~ AggregateChain/
    - AggregateChain/admitStagedCommands/
    ~ AggregateVersionRepo/materializeCommandTx.ts
    ~ aggregateSessionChain/
    ~ AggregateActorVersionRepo/
    ~ AggregateAgentVersionRepo/
    ~ AggregateActorVersionChain/
    ~ AggregateAgentVersionChain/
    ~ AggregateSessionApi/
    - AggregateSessionApi/validateActorCommand/
    - aggregateSessionRepo/
    + aggregateProjection/
    ~ RepoServicesLive.ts
    ~ SystemApi/executeAggregateCommand/executeAggregateCommand.ts
  explorer/
    ~ scripts/capture-schema.mjs
    ~ src/data/{schema-snapshot.json,table-purposes.ts,architecture.ts}
  scripts/lint/
    ~ zerospin-plugin.mjs
  wiki/
    ~ glossary.md
    ~ architecture/
    ~ patterns/system-worker/
    ~ plans/069-plan-rpc-call-stack-cleanup.md
    ~ plans/099-plan-channel-contract-programs.md
```

## Implementation

1. Replace socket staging and staged lookup with ordinary singleton admission and immutable receipt verification. Remove AC stagingFailure schema, staged ingress and materializer bypass.
2. Remove aggregate actor guard schema/types/factories/update requirements and remote validation capability; preserve aggregate release and service actor policies.
3. Move surviving schema/view/projection procedures to aggregateProjection. Remove all speculative tables and code and directly compose the owning Durable Objects' queue, subscriber, lifecycle and read methods.
4. Keep operation validation, relational selection entry/exit semantics, privacy, durable outbox acknowledgements, bounded catchup and snapshot consistency.
5. Reconcile affected current READMEs, architecture workflows, glossary, patterns and active RPC inventory. Update only the aggregate actor guard/staging conflict in plan 099; its Channel migration stays separate. [ADR 006](../../adrs/006-browser-speculation-and-confirmed-projections.md) records the implemented authority and retention trade-off.

## Verification

1. Run scoped Nx dependency builds, lint and typecheck for core, system-worker and browser, plus the TicTacToe build. Run scoped formatting and whitespace checks. No new test files, fixtures, runners or configuration are authorized.
2. Exercise existing applications or RPC seams for actor/agent success, locally failed stage staying local, canonical refusal and optimism cleanup, retry after lost acknowledgement, reconnect/snapshot/restart, relational selection/privacy, version replay and trusted continuation where available. Shopping browser verification is prohibited by its local guidance.
3. Record actual checks and limitations. Do not claim automated aggregate runtime coverage where no suite exists. Keep the plan active while any required gate is incomplete.

## Progress and evidence

Implemented on 2026-10-10 after the shared runtime dependency completed. The socket uses direct singleton admission with immutable receipt validation. AC staged ingress and stagingFailure, aggregate actor guards, remote validation, ASR composition, scratch execution and projection command/staged tables are removed. Actor and agent Durable Objects own confirmed projection delivery and reads directly. Shared procedures retain synchronous atomic resource/checkpoint/outbox commits and bounded snapshots. Current module/wiki guidance, Explorer schema/graph consumers, lint RPC inventory and related RPC/Channel plan references are reconciled. ADR 006 records the authority and history ownership decision.

Final verification on 2026-10-11:

1. Browser lifecycle chat `01a12832-3d4e-71a1-a199-395438ba7a18` completed successfully, including its 36-task consumer graph and archived plan. Its check exposed the missed SDK re-export of deleted StagedAggregateCommandSchema, now removed by this cutover. Channel chat `01a1294d-2a2a-76e0-9c9b-4231c418fc78` reports its source implementation and eight-project build/typecheck/lint graph complete; its separate requested runtime probes remain unfinished in active plan 099. No changes were made to those chats' owned browser or Channel implementations.
2. `pnpm nx run-many -t lib lint ts -p @zerospin/core system-worker @zerospin/browser` passed all 15 tasks including dependencies after final cleanup (`/tmp/zerospin-asr-final-graph.log`). The `ts` tasks run actual TypeScript checks. `pnpm nx run tic-tac-toe:build` passed all 17 tasks (`/tmp/zerospin-asr-tictactoe-build.log`). Explorer lint/typecheck passed all 18 tasks with dependencies (`/tmp/zerospin-asr-explorer-checks.log`). Existing unrelated lint warnings remain; scoped warnings introduced or exposed by this cutover were removed.
3. Live TicTacToe Workerd RPC/WebSocket checks passed direct actor admission and success, canonical contract refusal with empty delta, simulated lost admission acknowledgement with exact retry returning the same AC index and one retained row, reconnect/private outcomes, actor selection isolation, atomic snapshot/checkpoint agreement, acknowledged projection outbox, and trusted asyncPlayO continuation with retained actor lineage and nullable browser coordinates. Evidence: `/tmp/zerospin-plan101-actor-results.json`.
4. Live verification found a canonical aggregate guard refusal being retried without finalization. The materializer now retains aggregate-guard-failed as an authored rejection. After stopping and restarting the same worker/storage, the pending command finalized once with empty delta; retry recovered its original index, its delivery failure cleared, and its private outcome was recovered behind the current execution cursor. Resource rows/timestamps survived, checkpoint/hash advanced, and the projection outbox drained. Evidence: `/tmp/zerospin-plan101-actor-restart-results.json`.
5. Live Shopping Workerd RPC checks passed direct administrative agent success, server-stamped systemName, canonical purchase-not-paid refusal with empty delta, private outcomes withheld from a second node, complete purchase/item snapshot rows, and trusted async payment/label continuation. Restarting the same worker/storage preserved the snapshot, cursor/hash and both private outcomes. Registered projection tables are exactly purchase, purchaseItem, browserCommandOutbox and projectionState; its outbox is empty after delivery. Evidence: `/tmp/zerospin-asr-agent-results.json`, `/tmp/zerospin-asr-agent-storage-results.json`, `/tmp/zerospin-asr-agent-restart.log`. Shopping was exercised only through permitted RPC seams; no browser journey was run.
6. Inline local SDK checks used the existing TicTacToe declaration and real provisioned SQL.js/Drizzle APIs. A locally rejected stage retained zero commands/operations and unchanged resources; a valid stage retained optimism. Importing a canonical failure cleared optimistic writes and retained the failure, and repeated import was idempotent. This checks browser staging/import procedures; it does not claim a browser UI journey. The finalized input was supplied locally, with actual production finalization independently checked above.
7. Inline projection transaction checks used Shopping's existing release, agent selections, authored mapped commands and provider responses. A hidden pending purchase remained available for selected item relations; payment confirmation emitted its complete 15-field selected row. Failure advanced the checkpoint with an empty delta/private result; unrelated system outcomes stayed private. Repeated delivery changed nothing. Late invalid aggregate binding, operation association, malformed JSON or model version rolled back the entire page's resources, checkpoint and outbox, including the preceding valid operation. These are production procedure checks, independently complemented by the live DO checks above.
8. Same-release replay used the five actual finalized TicTacToe AC rows, current replayCommandTx/onDOActivation and a fresh provisioned SQL.js database. Every finalization, final board state and disposition hash matched the live VAR; async emission retained frozen input with null producer lifecycle. Repeating all five rows mutated no table. Evidence: `/tmp/zerospin-plan101-same-release-replay-results.json`.
9. Explorer's existing capture command regenerated 63 schema tables, and both edited MJS consumers passed syntax checks. Independent source/diff review found no projection regression. Final scoped Oxfmt-through-Nx formatting and whitespace checks passed on all 71 retained files. The document review passed 501 local links (apart from the seven known scoped-out missing links), 160 source hashes, 195 citation ranges and 11 diagram mappings. Preexisting unrelated glossary/check-script links remain outside this work. The pre-edit WIP snapshot is retained at `/tmp/zerospin-asr-before`.

Verification limits: existing TicTacToe has only game@1.0.0/human@1.0.0, so cross-release historical actor lineage replay was not exercised. Existing Shopping commands cannot remove a paid purchase or make it nonselected, so authored selection exit has source review but no runtime scenario. No new test files, fixtures, runners, configuration, releases, compatibility paths, migrations or automatic storage deletion were introduced. Fresh temporary storage was used for startup; existing application databases were preserved. Initial failures from concurrent output cleanup and temporary manual-check shape mistakes were superseded by the successful final checks above.

## Completion

1. The user's 2026-10-11 direction, “Tackle this now,” resumes immediate closeout against the verified source rather than retaining the previous wait for [Plan 099](099-plan-channel-contract-programs.md). That plan's independent runtime verification and archival remain with its owning chat; this completion does not mark them complete.
2. Subsequent [Plan 103](103-plan-compact-domain-workflows.md) changed shared materialization, projection, socket and browser procedures. Its completed ledger records production SQLite and Workerd verification of malformed/duplicate projection rows, atomic checkpoint ownership, canonical success/refusal, tagged resume, exact retry, private replay, interruption cleanup, bounded catchup under concurrent publication, snapshot reconciliation and trusted async continuation. Its live socket/mapper results were inspected during this closeout; these later checks complement the original evidence above.
3. The later schema/props cleanup is covered by completed [Plan 069 Iteration 6](069-plan-rpc-call-stack-cleanup.md#iteration-6--rpc-boundary-schemas-and-tidy-orchestration--2026-10-11), including production factory/SQLite probes and its 20-task graph (`/tmp/zerospin-iteration6-nx-final.log`). Independent closeout review confirmed that all 28 post-Plan103 source changes belong to that verified scope, all 84 scoped TypeScript files precede its final graph, and all 40 cited source paths across 76 metadata records match current hashes. No uncovered production change remains.
4. The current-source closeout graph passed all 15 core/system-worker/browser lib/lint/real TypeScript tasks, the 17-task TicTacToe build, and all 18 Explorer lint/typecheck tasks with their dependencies. Evidence: `/tmp/zerospin-plan101-close-graph.log`, `/tmp/zerospin-plan101-close-tictactoe.log`, `/tmp/zerospin-plan101-close-explorer.log`. Normal Nx caching and dependency scheduling were preserved; `--skipSync` preserved concurrent reference configuration.
5. Archived this plan under its existing filename and repaired inbound and relative links. Scoped Oxfmt and whitespace checks passed (`/tmp/zerospin-plan101-close-format.log`), and every repaired inbound link and the archived plan's relative links resolve. ADR 006 remains active. The requested heartbeat pause returned “Automation does not exist in the app and could not be updated”; there is no existing automation to pause or recreate. Verification limits above remain explicit; no new production code, test files, fixtures, runners, compatibility paths or storage deletion were needed for closeout.

## Remaining work

None.
