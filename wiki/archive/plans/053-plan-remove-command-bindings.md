# Remove aggregate command bindings

Status: Completed — 2026-10-06.

## Agreed behavior

1. Remove aggregate command binding and its private method registry outright. Initialization acquires resources and publishes admitted identity; module-defined command functions use current resources directly. Do not add an execution discriminator, normalized session, replacement registry, or installed commit/delivery strategy.
2. Keep `stageAggregateCommand` and `stageAggregateAgentCommand` for optimistic staging. Add `executeStandaloneAggregateCommand` for atomic local staging and execution, and migrate standalone/mock callers. Each entrypoint invokes its concrete transaction after shared preparation and evaluation.
3. Retain canonical ordinary and agent declarations, precise selected-contract inference, synchronous evaluation and transactions, disposable validation IDs, deferred guard/validation execution, and admitted identity/claims independent of mutable published state. Disposal synchronously revokes current resources before asynchronous teardown.
4. Live and agent lifecycle owners observe committed command records and enqueue delivery after the transaction stack returns. Preserve acceptance uncertainty, retry/reconnect, direct agent submission, record recovery, ordered reconciliation, and originating failure reporting. Standalone backup continues observing committed SQL independently.

## Implementation

1. Replace the binding file and forwarding helpers with data-only acquired resources and ordinary preparation/evaluation procedures. Publish resources before readiness in each constructor; clear them on release. Keep invocation scopes separate from the activation runtime and preserve canonical identity checks.
2. Make live, agent, and standalone entrypoints choose their transactions statically. Keep post-commit observer/delivery failures outside the local command result. Remove redundant progress publication from pending staging; publish changed execution progress through its lifecycle owner.
3. Migrate browser live/agent/standalone/mock owners and existing test fixtures, SDK/package exports, and in-scope callers together. Preserve unrelated work in the shared checkout and recent typed guard, snapshot, and System registry changes.
4. After implementation and checks, update the existing aggregate command lifecycle architecture document with source-owned sequence diagrams, immediately paired numbered annotations, Trigger steps, exact citations, current hashes, and implemented lifetimes. Reconcile directly affected current references and glossary text without rewriting unrelated sections.
5. Deliver committed SQLite notifications after transaction capture cleanup. Keep the nested-transaction guard around the authored transaction program so a committed-progress observer can synchronously start the next command without being mistaken for a nested transaction. Preserve immediate progress visibility and isolate committed SQL observer exceptions.
6. Provision fixed aggregate command phase indexes once on each fresh session database, before standalone schema serialization or backup capture. Remove command-time schema DDL from staging, local execution, and record import. Exact-schema restore rejects backups missing these constraints; do not translate or repair their rows.

## Verification

1. Use the existing aggregate staging and live-query seams for readiness, release/reinitialization, admitted identity/claim protection, precise typing, guards, validation, transaction rollback, and standalone staged/executed records and progress.
2. Use the browser agent-preview seam for committed-record delivery, coalesced stages, authoritative rejection, uncertainty/retry/reconnect, direct submission ordering, and lifetime-fenced disposal. Verify observers cannot reenter the commit transaction or convert a committed local result into staging failure.
3. Run scoped Nx TypeScript/lint/library dependencies and React tests for core/browser/React/SDK; run browser agent-preview and core command/history fixtures as needed by changed seams. Run consumer type checks where exports/callers change. Run formatting checks on changed files and `git diff --check`.
4. Validate architecture links, citation ranges and source hashes, one annotation per sequence message, and exhaustive live-source removal of aggregate binding symbols. Keep service-session code outside this refactor.

## Outcome

Removed aggregate command binding and the private method table. Activation is frozen acquired data with protected admitted identity and claims. Ordinary functions select canonical contracts, evaluate within invocation scopes, recheck the same current activation, and call their concrete transaction directly. Live and agent staging keep optimistic records; explicit standalone execution retains staged and executed records atomically. No execution discriminator, replacement registry, or installed command/commit/delivery strategy was added.

Browser owners publish/revoke activation and observe committed records for progress and delivery. Delivery is queued after synchronous transaction and notification cleanup and retains acceptance uncertainty, original input, reconnect retry, and lifetime fences. SQL capture completes before table observers run; throwing committed observers cannot change local command success or prevent later observers. Fixed phase indexes are provisioned before snapshot validation and backup capture. Backups missing those constraints require explicit reset.

The source-checked [aggregate command lifecycle](../../architecture/browser/AggregateCommandLifecycle.md) and Node delivery workflow now describe the implemented ownership, invocation, commit, delivery, and reconciliation boundaries with immediately paired numbered annotations. Directly affected authored-system, backup, and glossary references were reconciled.

## Completed checks

- `pnpm nx run-many -t ts lint test agent-preview:check node-outcomes:check -p @zerospin/core,@zerospin/browser,@zerospin/react` passed, including 136 React tests, core/browser/React types and lint, library dependencies including SDK/System, aggregate/service Node outcomes, and core/browser agent-preview fixtures. The regressions cover deferred validation, protected claims, activation replacement/release, coalesced live staging, rollback/no-send, acceptance uncertainty/reconnect, committed-observer failures, separate ordered backup captures, chained standalone commands, and true nested-transaction rejection.
- Consumer `ts` checks passed for Studio, Shopping, and System Worker. SDK has no separate `ts` task; its library build passed in the dependency graph. System Worker `contract-programs:check` passed, including exact contract result/operation/service typing and original staging.
- The changed mapped-contract fixture passed when invoked independently with `verifyMappedContracts()` provided `AsyncLive`. Its registered enclosing `system-worker:async-contracts:check` stops earlier at the unchanged duplicate async response rejection assertion in `asyncContracts.ts:563`; unchanged `AggregateChain/admitCommands/admitCommandsTx.ts` returns the retained command for that ID after checking identity rather than the supplied response. This unrelated failure is outside the binding removal.
- An optional Tic-Tac-Toe consumer check fails on unchanged HEAD imports for missing computer operations/operator/turn and `playOV1` files. Those files and imports were not changed here.
- Scoped formatting and `git diff --check` passed. The three Drizzle files follow their existing style and are deliberately excluded by the repository formatter configuration.
- Documentation validation passed: current source hashes, citation bounds, 452 local links, and seven sequence/annotation pairs with message counts 9, 17, 20, 9, 4, 10, and 12. Seven unchanged broken links in unrelated AuthoredSystem sections were excluded; the aggregate lifecycle, Node delivery, and backup workflow documents were checked in full. Live source and current workflow docs contain no removed aggregate binding symbols.

Nx Cloud reported its existing authorization failure (`401`) after local task results; this did not block successful local checks. Concurrent plans 045–052 and other unrelated work were preserved.

## Remaining work

None.
