# Plan 271: Remove connected-session command execution

Status: Completed and verified on 2026-10-26. Implemented on
`codex/remove-connected-session-execution`; runtime storage was not reset.
Publication, deployment and consumer adoption remain outside this change.

## Problem and agreed behavior

1. Connected Aggregate and Service browser sessions must not expose
   `executeCommand`. Remove the feature outright, including its exclusive private
   RPCs, helpers, types, tests and documentation. Do not replace it with another
   browser execution hook, execution handle, submit/wait pair or public outcome
   observer.
2. Browser Actor actions continue through synchronous local staging and ordinary
   ordered Node delivery. Preserve `stageAggregateSessionCommand`,
   `stageServiceSessionCommand`, their local results, authentication, session
   replication and canonical admission/execution/replay.
3. Administrative `SystemApi.executeAggregateCommand` and
   `SystemApi.executeServiceCommand`, Aggregate `authorize.executeCommand`,
   Standalone execution, Agent execution and external work remain supported.
   Their internal methods may legitimately contain `executeCommand` in their
   names. Never remove behavior by a global method-name replacement.
4. Preserve canonical `outcome`, `{ result: Success | Failure, finalizedAt }`,
   command identity, exact retained retry recovery and `dispositionChainHash`.
   Removing browser waiting does not remove durable canonical execution or
   permit direct writes to materialized models.

## Baseline and dependencies

1. Committed HEAD at planning time is
   `bf029423dd61748ee40f11e887c04ae245bfd019`. It already includes
   [PR 69](https://github.com/morgs32/zerospin/pull/69), which introduced the
   connected execution feature. Discarding uncommitted changes restores that
   implementation; it does not perform this plan.
2. The uncommitted alternative routes unstaged commands through Node admission
   and replaces the private SessionApi execution RPCs with
   `awaitCommandOutcome`. It is superseded for this feature. Do not replay that
   alternative first merely to remove it afterward. See the
   checkpointed reexecution inventory.
3. Execute this removal before replaying the remaining
   [Plan 270](./270-plan-contract-release-names-and-command-kinds.md) category work.
   Retain its independently justified Node-backed Actor provenance, command-kind
   cutover and Actor/Agent/System/External distinctions. Typed administrative
   execution and seed programs remain Plan 270 work, described in the
   accepted System-command construction and seeds direction.
4. The proposed single-flight execution gate, `pendingExecution`,
   `canStageCommand` and `canExecuteCommand` were not approved. They are not
   requirements for a removed browser execution feature. Preserve the old
   session-gating handoff
   and research as historical exploration, not instructions to implement those
   fields or prohibit staging.

## Implementation

1. Remove `executeCommand` from both connected session constructors and their
   returned objects. Delete `IConnectedSessionCommands`. Remove the
   execution-only `IConnectedBrowserSession` distinction and its reexports and
   callers; use the existing appropriate browser-session type instead of
   retaining an alias with no independent responsibility. Preserve meaningful
   host-specific typing and the generic React provider only where its remaining
   callers require them.
2. Delete the committed `executeAggregateSessionCommand`,
   `executeServiceSessionCommand` and `encodeConnectedSessionCommand` helpers
   after verifying their remaining callers. Remove execution-only network
   operation declarations and imports. Keep shared admission providers,
   lifecycle/network handling and credential refresh used by ordinary sessions.
3. Remove `AggregateSessionApi.executeCommand` and
   `ServiceSessionApi.executeCommand`, their public RPC declarations and
   execution-only failure/lint entries. Keep snapshot, subscription and socket
   capabilities. Preserve `executeDirectAggregateCommand` and
   `executeDirectServiceCommand`: committed administrative SystemApi paths and
   Aggregate authorization also use them.
4. Remove the committed Node-less `DirectActorCommandSchema` variants and their
   type/schema union branches when the removed SessionApi methods are their only
   production ingress. Actor commands retain real `nodeId`, `sessionName` and
   `pushIndex` through ordinary Node delivery. Narrow execution/admission and
   retained-row handling accordingly without changing legitimate Agent, System
   or external command shapes. Reconcile this step with Plan 270's schema work
   once, rather than reconstructing and deleting the same variants twice.
   Keep SQL provenance columns nullable where other command categories require
   null values; removing the Node-less Actor union member does not make every
   retained command an Actor command.
5. If implementing against a checkout containing the superseded WIP, delete its
   exclusive `submitCommand` orchestration, admission waiters, private outcome
   RPCs, Chain Actor-outcome methods and Node point reads. Remove Standalone
   methods added only to satisfy that interface. Remove nullable unstaged-input
   support, replay skips and optimistic-view no-ops when no remaining caller
   needs them. Retain ordinary staged-command handoff/recovery and existing
   canonical administrative outcome retrieval; judge shared code by callers.
6. Remove assertions and scenarios whose purpose is invoking the deleted
   connected/private SessionApi methods. Preserve independent authentication,
   selected-data privacy, ordinary staging, Node delivery and administrative
   immutable-retry coverage in the existing files. Reassess Plan 270's proposed
   authenticated fixtures after this deletion; do not create the formerly
   requested three declarations or the additional reader Actor merely to keep
   rejected-feature tests alive. Any remaining fixture need requires its own
   explicit authorization.
7. Inventory fixed persisted schema changes separately from the interface
   deletion. Record affected Node/native formats and Chain/session rows only
   where the resulting schema actually changes. Require empty affected storage
   for a fixed-schema rollout, with explicit authorization identifying the
   storage. Add no fallback decoder, migration, optional legacy branch or
   compatibility alias. No storage reset is authorized by this plan.

## Planned file hierarchy

Legend: `~` modify, `-` remove. A path marked conditional exists only in the
superseded WIP; do not create it before removing it.

```text
zerospin/
  packages/browser/
    ~ src/makeConnectedAggregateSession.ts, makeConnectedServiceSession.ts
    ~ src/browserSession/types.ts, src/index.ts
    - src/browserSession/encodeConnectedSessionCommand.ts
    - src/executeAggregateSessionCommand.ts, executeServiceSessionCommand.ts
    ~ src/Node/runNodeNetwork.ts, NodeErrors.ts
    ~ tests/node-authentication.spec.ts, node-network-errors.spec.ts
    ~ README.md, skills/zerospin-browser-sessions/SKILL.md
    ~ src/bootstrapAggregateSession.ts, bootstrapServiceSession.ts (conditional)
    ~ src/{AggregateNode,ServiceNode,StandaloneNode}/ (conditional exclusive methods)
    ~ src/outbox/makeSessionCommandHandoff.ts (conditional exclusive waiting)
    - src/awaitAggregateSessionCommandOutcome.ts, awaitServiceSessionCommandOutcome.ts (conditional)
    - src/browserSession/awaitNodeAdmission.ts (conditional)
  packages/core/
    ~ src/contracts/CommandSchema.ts, types.ts
    ~ src/{AggregateNode,ServiceNode,aggregateSession,serviceSession}/ (affected schema/callers)
    ~ tests/contracts.typecheck.ts and existing relevant scenario files
  packages/system-worker/
    ~ src/{AggregateSessionApi,ServiceSessionApi}/ declarations and failure lists
    - src/{AggregateSessionApi,ServiceSessionApi}/executeCommand/executeCommand.ts
    - src/{AggregateSessionApi,ServiceSessionApi}/awaitCommandOutcome/ (conditional)
    - src/{AggregateChain,ServiceChain}/awaitActorCommandOutcome.ts (conditional)
    ~ src/{AggregateChain,ServiceChain,repoServices}/ (conditional exclusive exposure)
    ~ src/ command consumers and retained-row handling affected by DirectActor removal
    ~ src/AggregateVersionChain/evaluatedCommand.ts
    ~ src/ServiceVersionChain/evaluatedServiceCommand.ts
    ~ tests/native-system-api/native-system-api.workerd.spec.ts
    ~ tests/service-command-admission/service-command-admission.workerd.spec.ts
  packages/react/~ README.md, skills/zerospin-react/SKILL.md and execution-only typing consumers
  packages/sdk/~ src/ and skills/ execution-only exports/guidance
  packages/native/~ affected fixed-schema declarations only if required
  scripts/lint/~ zerospin-plugin.mjs
  .nx/version-plans/~ existing breaking-change note
  wiki/~ glossary.md, current architecture/patterns and Plan 270 references
```

## Verification and completion

1. During implementation, inspect resolved Nx project/task configuration once
   and run the smallest explicit build/type/lint graph for changed Browser,
   Core, System Worker, SDK and relevant React/native consumers, preserving
   normal dependencies. Never verify Explorer.
2. Reuse the existing `zerospin:test` compiler and focused runtime seams. Establish
   that connected session types and RPCs lack the removed method; ordinary
   staging/delivery still works; administrative canonical execution and retained
   retry outcomes remain intact. Preserve Standalone behavior. Create no test
   files, fixtures, runners or configuration.
3. Search current authored code and guidance for the removed feature, exclusive
   helper names and direct Actor variants; review remaining legitimate
   `executeCommand` uses individually. Run scoped formatting and diff checks.
   Old WIP checks are historical evidence, not proof of this removal.
4. After implementation, reconcile SDK/Browser/React guidance, glossary,
   architecture citations, the breaking-change note, Plan 270 and relevant
   handoffs with the actual result. Create or supersede an ADR only if the
   implemented decision meets the repository's qualifying criteria; do not
   create a new spec or record an unimplemented decision as governing behavior.
5. Archive this plan only after the agreed removal and permitted verification
   are complete. Publication, deployment, sibling consumer edits, Git cleanup
   and storage resets remain outside this plan's authorization.

## Outcome and verification

1. Removed connected Aggregate/Service `executeCommand`, both private admitting
   SessionApi RPCs, five exclusive helper files, connected-only facade types,
   network operation names and the execution-only React session generic.
2. Removed the Node-less Actor union members and their retained-row alternatives.
   Ordinary Actor commands require the complete Node tuple. Nullable SQL
   provenance columns for Agent/System/continuation commands are unchanged.
   Administrative SystemApi, Aggregate authorization, Standalone, ordinary Node
   delivery and canonical outcome/replay behavior remain supported.
3. Removed only obsolete private-execution scenarios and their exclusive existing
   declarations/grants. Current codec/compiler assertions reject absent or
   incomplete Actor Node coordinates. No test files, fixtures, runners or
   configuration were created.
4. `NX_NO_CLOUD=true pnpm nx run-many --projects=@zerospin/core,@zerospin/browser,system-worker,@zerospin/sdk,@zerospin/react --targets=lib,ts,lint`
   passed all 19 tasks, including normal dependencies.
5. The existing `zerospin:test` task compiled the complete test program and passed
   37 tests in nine existing files: Browser authentication/network errors, Core
   receipt delivery, native administrative SystemApi, service admission, command
   delivery, service Actor connections, and Aggregate/Service history fanout.
   The command used those explicit file paths and `--maxWorkers=2`.
6. Reconciled current Browser/React/SDK guidance, glossary, ADR 023, the major
   version note and eight affected architecture documents. Refreshed affected
   source hashes/ranges without changing the existing sequence order. Scoped
   formatting, stale-feature searches, document links and diff checks passed.
7. The initial local baseline included `bf029423dd` (Nx skill documentation).
   The PR excludes that unrelated commit and uses remote `main` at
   `569ff979ac56c99058346c8a87b7aad37b3a6047`; implementation source, package pins,
   lockfile and verification target configuration are identical between those
   baselines. Other restored plans, handoffs and research remain local WIP.
8. No runtime storage reset, deployment, package publication or Explorer
   verification was performed. Existing Node-less Actor history is outside the
   new fixed schema and requires the separately authorized empty-state rollout.

## Remaining work

None.
