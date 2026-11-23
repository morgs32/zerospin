# Replace bound capabilities with explicit operation helpers

Status: Recovered and verified against remote `main`, 2026-10-10. The original implementation was verified on 2026-10-08 but remained in archived snapshot `ae2c40a123` and did not reach `main`. The recovery branch is `codex/recover-explicit-operations`.

## Recovery

1. Recover the approved authoring refactor on `codex/recover-explicit-operations`, based on remote `main` (`deaf3d1a69`). Preserve the archived snapshot and both existing checkouts.
2. Port the implementation into current aggregate/service constructors, scoped database reads, and execution interfaces. Preserve newer ownership, command history, timeout, and transaction behavior; do not restore obsolete overloaded APIs.
3. Migrate all current callers, including the restored Tic Tac Toe opponent. Port historical verification into the existing Node and compiler-only suites rather than restoring the old fixture directory or Nx task.
4. Record fresh verification below, reconcile affected documentation, and archive this plan again only after recovery is complete.

## Agreed behavior

1. Programs yield `makeCreateOperation`, `makeUpdateOperation`, `makeDeleteOperation`, `makeMoveOperation`, and `makeAsyncOperation`. Each helper takes an explicit model or external contract, validates and emits only when yielded, and returns `Effect<void, IAnyError, IOperationSink<ExactOperation>>`. Infer the declaration solely from its argument; use `NoInfer` for dependent inputs.
2. Preserve operation shapes, complete create validation, update masks, exact identities/versions, async payload validation and cloning, and current async payload input types. Export model helpers through root and browser SDKs; async emission remains server-only. Move `IAsyncOperation` beside other operation types.
3. Delete capability maps, `makeModelOperations`, `IModelOperations`, and binding closures. Keep authored callbacks unchanged; execution supplies prepared input, query database, and inline failures. Mapper declarations have required top-level `models` and `contracts`; callbacks no longer receive `models` or `operations`.
4. `contractVersion.models` declares typed database reads and allowed model emissions. Check base output against its retained contract models, mapper output against its declared models/contracts, then combined output against the executing owner. Guards/producers cannot emit; async emissions remain mapper-only.
5. Derive final result inference from the declared codec/type, including void when omitted. Preserve actual base/mapper callback types and combine their execution services with guard services, excluding the operation sink; producer requirements stay separate.
6. Preserve synchronous append-only collection, order, pre-application reads, mapper query filtering, and transactional application. Migrate all in-scope callers without aliases or dual paths. Storage schemas do not change.

## Implementation hierarchy

`+` adds files; `~` modifies files. Delete obsolete binding factory/types outright.

```text
zerospin/
├── packages/core/                    ~ contract types, execution, existing verification
│   ├── src/contracts/make/           + five operation helpers
│   ├── src/contracts/                + asyncOperation.ts, runContractGuard.ts
│   │                                 + runExternalProducer.ts
│   ├── test/                         + operation-emission.node.spec.mjs
│   └── typecheck/                    + operation-emission.typecheck.ts
├── packages/sdk/src/                 ~ root/browser exports
├── packages/, examples/, explorer/   ~ callers and execution requirement inference
└── wiki/                             ~ active documentation, patterns and glossary
```

## Verification and completion

1. Add an executable, compiler-checked fixture through public helpers, `makeOperations`, and `runContractGuard`. Cover deferred emission, create validation, masks, fresh ordered collectors, caught retries, failed runs, result codecs, inline failures, claims, recorded responses and mapper pre-application reads.
2. Cover undeclared/wrong-version model rejection, unregistered async contract rejection, base-phase async rejection, and guard/producer rejection with inherited sinks. Compile positive/negative attribute, ID, mask, payload, declared scope, upgrade, base/mapper result and service inference cases without new casts.
3. Use core's existing `test:node` and `ts` targets to discover the runtime and compiler-only fixtures. Preserve the current Nx verification structure; add no task, framework, or dependency.
4. Run core/browser Node tests and System Worker aggregate transaction/async, Shopping, and outbox checks. Run scoped Nx library/type/lint/build and changed-file formatting checks across migrated consumers, including Shopping, Tic Tac Toe, and Explorer. Shopping verification excludes browsers. Reconcile current architecture, patterns and glossary after implementation; create an ADR only if the implemented decision meets all governing criteria.
5. Record evidence and archive this plan only when implementation and required verification are complete.

## Original implemented outcome (2026-10-08)

1. Added the five explicit, deferred operation helpers and removed the bound capability factory, injected callback capabilities, and superseded types. Root and browser SDK exports match the approved server/browser boundary.
2. Retained raw base, guard, mapper, and external producer callbacks. Execution injects each declaration's failures and checks exact model or external contract membership before application. Model aliases remain supported; declaration identity and version checks remain exact.
3. Result inference follows the declared codec, with distinct base and mapper callback results. Shared execution requirements include base, guard, and mapper services, exclude the runner-owned sink, and retain producer services separately.
4. Guard and producer runners reject emission attempts even when authored callbacks catch the sink error. Producer rejection state is fresh per run. Synchronous collection, pre-application reads, mapper query filtering, operation order, and transaction application remain intact.
5. Migrated authored TypeScript callers and the browser's JavaScript integration fixture. Reconciled active architecture, glossary, and patterns. No schemas, dependencies, compatibility paths, or casts were added. This authoring refactor does not meet all three ADR criteria, so no ADR was created.

## Original verification evidence (2026-10-08)

1. Passed `pnpm nx run-many -t lib ts typecheck lint build operation-emission:check initialized-session:check -p @zerospin/core @zerospin/sdk @zerospin/browser @zerospin/studio system-worker @zerospin/react @zerospin/devtools shopping explorer --parallel=3` (37 tasks including dependencies).
2. The new core fixture passed its TypeScript positive/negative cases and executable assertions. It covers deferred emission, validation, masks, exact operation inference, alias/version scope, collectors/retries/failure isolation, result codecs, failures/claims/responses, mapper pre-state, execution requirements, and guard/producer isolation with inherited sinks and caught attempts.
3. The migrated browser fixture passed initialized-session claims, types, transactions, lifecycle, and queued delivery checks under Node. Shopping and Explorer production builds and typechecks passed; no Shopping browser verification ran.
4. The initial ten-project graph also ran tic-tac-toe build/typecheck/lint. Its build/typecheck failed on the removed `computerOperations`, `computerOperatorV1`, `playOV1`, and `computerTurn` modules and obsolete returned arrays. The README at that time described this intentional broken state. On 2026-10-08, the maintainer approved excluding those existing failures from the original completion. The current recovery migrates and verifies the restored Tic Tac Toe contracts normally.
5. Package lint has two existing `curly` warnings in unchanged browser files. Nx Cloud reports workspace access code 401 after successful local execution; all local checks above completed.
6. Changed-file formatting passed on all 57 existing changed/new files. Changed TypeScript/JavaScript passed `oxlint --deny-warnings`; `git diff --check` passed. Active source searches found no remaining bound capability APIs or injected callback operations.

## Recovery implemented outcome (2026-10-10)

1. Ported all five helpers, exact operation types, and guard/producer isolation into the current aggregate/service constructors. Authored callbacks retain their identity; execution supplies failures and scoped database reads. Removed the bound operation factory, capability maps, obsolete injected callback arguments, and guard-binding factory.
2. Kept independent base, mapper, and combined owner scope validation; exact model and external contract identity/version; immutable ownership; distinct base/mapper results; and application service inference excluding the internal operation sink. Collection remains synchronous, ordered, and separate from transactional application.
3. Migrated all current production and verification callers, including Shopping, the restored Tic Tac Toe opponent, Explorer, Studio, browser standalone declarations, and direct guard fixtures. The replay fixture now instruments the original authored callback of mapped contracts.
4. Added core runtime and compiler-only fixtures to existing tasks. Added a bounded SQLite producer lifecycle check to aggregate administration: caught emissions persist a failure; timeout waits for interruption finalizers; retry state survives a recreated runner; successful recovery records and delivers one response.
5. Reconciled contract documentation, patterns, glossary, architecture source hashes/ranges, and Explorer source anchors. No storage schemas, command history, package dependencies, compatibility paths, or casts changed. The decision does not meet the repository's ADR criteria, so no ADR was added.
6. Preserved both existing checkouts and snapshot `ae2c40a12397f6c2572f836b39f6ff177d7176d3` at `refs/codex/snapshots/fae8e51253a58f4ab9ac376159dfc000f4982d54`. The recovery is isolated in its own worktree. The recovery starts from remote `main` (`deaf3d1a69`). PR #44 merges directly into `main` and excludes unpublished Explorer commit `eabfa9c362` and its unrelated compiler repairs. The pre-cleanup recovery remains available at `refs/codex/recover-explicit-operations-before-scope-cleanup`; the older branch and both checkouts remain intact.

## Initial recovery verification evidence (2026-10-10)

These checks ran on local-main baseline `eabfa9c362` before the PR scope correction. They are historical evidence; final verification on remote `main` is recorded separately below.

1. Passed `pnpm nx run-many -t lib,ts,typecheck,lint,build,test:node,aggregate-administration:check,shopping-successes:check,outbox:check -p @zerospin/core,@zerospin/sdk,@zerospin/browser,@zerospin/studio,system-worker,@zerospin/react,@zerospin/devtools,shopping,tic-tac-toe,explorer` (42 tasks, including dependencies; 19 valid cache replays). Log: `/tmp/zerospin-recover-explicit-operations-verified.log`.
2. Core's 58 Node tests and compiler-only cases passed, including deferred emission, complete create validation, masks/cloning, ordering, retries, failed-run isolation, exact model/async scope, distinct codecs/results, execution services, and caught guard/producer emission rejection with fresh run state. Browser's 68 Node tests and typechecks passed, including guard services, initialized sessions, transactional reconciliation, and release inference.
3. System Worker aggregate administration passed its aggregate/service transaction, async persistence/replay, producer timeout/finalizer/retry/recreated-runner, and response delivery checks. The dedicated successful aggregate run is also recorded in `/tmp/zerospin-recover-explicit-operations-aggregate-check.log`.
4. System Worker Shopping and outbox checks passed. Shopping, Tic Tac Toe, and Explorer builds/types/lint passed; core, SDK, browser, Studio, React, Devtools, and Worker scoped libraries/types/lint passed. No Shopping browser verification ran.
5. Changed-file formatting, strict changed-TypeScript/JavaScript lint, and `git diff --check` passed. All 76 changed TypeScript/JavaScript files pass `oxlint --deny-warnings`. Refreshed architecture metadata and source ranges were checked against current source. Active-source audits found no remaining injected operation facades or deleted API references.
6. Package lint retains ten existing warnings in unchanged core/Worker files; all local tasks exit successfully. Nx Cloud reports workspace access code 401 after local execution, without failing local checks. Historical October 8 results above remain separate from this fresh recovery evidence.

## Verification after PR scope correction (2026-10-10)

The branch was rebuilt from remote `main` (`deaf3d1a69`), preserving only explicit-operation recovery and its required caller, verification, and documentation updates. Explorer UI, tooling, workers, dependency manifests, and the lockfile match remote `main`. Its four changed files migrate the send-message contract, flatten mapper declarations in its compiler fixture, and refresh operation-related source anchors.

1. Passed the same scoped Nx graph listed above on remote `main`: 42 tasks, including dependencies, with seven valid cache replays. Log: `/tmp/zerospin-recover-explicit-operations-main-verified.log`.
2. Core's 54 Node tests and compiler-only cases passed; browser's 68 Node tests and types passed. System Worker aggregate/service transaction, async producer timeout/finalizer/retry/recreated-runner, Shopping, and outbox checks passed.
3. Scoped libraries, types, lint, and builds passed across the migrated packages and consumers, including Shopping, Tic Tac Toe, and Explorer. No Shopping browser verification ran. All 74 changed TypeScript/JavaScript files pass `oxlint --deny-warnings`; log `/tmp/zerospin-recover-explicit-operations-main-lint.log`.
4. Package lint retains the same ten warnings in unchanged core/Worker files. Local tasks exit successfully; Nx Cloud's workspace access code 401 does not fail local execution. Original snapshot results and initial local-main recovery results remain separate above.
5. Formatting passed on all 82 existing changed/new files; log `/tmp/zerospin-recover-explicit-operations-main-format.log`. The final scope audit confirms 84 operation-recovery files, four required Explorer updates, and unchanged dependency manifests, lockfile, and unrelated compiler fixtures. Recovery source hashes are current, all 176 architecture citation anchors resolve, and the 66 affected Explorer source anchors are valid. `git diff --check` passed.

## Remaining work

None.
