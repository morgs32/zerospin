# Session execution and failure reporting

Status: Complete. Approved and verified in chat on 2026-10-09.

## Agreed behavior

1. Expose typed `session.runSync` and `session.runPromise`; keep ManagedRuntime private and remove runtime fields from initialized state. Saved methods resolve the current lifetime.
2. Observe complete execution Exits, emit transient `SessionDefect` notifications for escaping defects, and propagate original failures. Include application-layer acquisition, owned background initialization, and cleanup. Recovered or deliberately normalized defects keep their existing behavior; pure interruption stays quiet.
3. Restore standalone aggregate and service staging and remove bound methods. Combine synchronous evaluation, transactional staging, result recognition, and known `StageFailure` emission. Keep generic result recognition and validation silent.
4. Retain session-owned, identity-fenced service execution bindings. Compose staging/capability callbacks as Effects; acceptance and post-accept decoding never emit `StageFailure`. Preserve initialized-but-not-current service failures.
5. Allow general execution before initialization with lazy application services. Cold staging checks readiness without acquiring the application layer, using the same reporter for unexpected preflight defects.
6. Apply the execution facade to all five browser variants and Studio aggregate agents. Agent SQLite/socket resources remain initialization-owned. Preserve revocation, generation fences, recovery, transaction behavior, and delivery.
7. Replace superseded callers, exports, tests, examples, docs, and Explorer diagrams. Preserve unrelated WIP. Server/System and authoritative SharedWorker runtime owners remain outside this cutover. No compatibility, casts, or schema/storage changes.

## Implementation

1. Add shared typed execution and Exit observation utilities in core; update aggregate, service, agent staging/types and failure events.
2. Refactor ordinary browser lifecycle/factories/bootstrap into the reported execution boundaries. Refactor the independent agent lifecycle consistently.
3. Migrate consumers and verification seams. Reconcile glossary and local patterns with implemented behavior; create an ADR only if the result warrants one under repository conventions.
4. Complete verification below, record outcome, and archive this plan with its filename preserved.

Planned hierarchy (`+` creates, `~` modifies):

```text
zerospin/
  packages/
    core/
      + src/sessionExecution/
      ~ src/{aggregateSession,serviceSession,agent,sessionFailures}/
      ~ src/aggregateSession/stageCommand/stageAggregateCommand.ts
      ~ test/ and typecheck/
    browser/
      ~ src/{makeSessionLifecycle,sessionRuntime,bootstrapAggregateSession,bootstrapServiceSession,makeAggregateAgentSession}.ts
      ~ src/{makeSession,makeServiceSession,makeStandaloneSession,makeMockSession}/
      ~ src/index.ts, test/, e2e/
    ~ react/ and sdk/ affected exports/docs
  ~ examples/tic-tac-toe/ and explorer/
  wiki/
    ~ architecture/, patterns/, glossary.md
    + plans/082-plan-session-execution.md
```

## Verification

1. Prove precise application-service inference, unchanged contract inference, and absence of bound staging and public/initialized runtimes.
2. Test synchronous, asynchronous, acquisition, background, and cleanup defects: exact-once events, original exception identity, isolated observers, and quiet interruptions/recovery.
3. Cover cold staging without application acquisition, release/reinitialization, saved delegates, service readiness phases, agent fences, rollback, acceptance uncertainty, validation identifiers and synchronous-program enforcement.
4. Run coordinated scoped Nx checks for core/browser, affected consumers, independent browser fixtures, and Explorer. Use real typechecks where configured tasks are placeholders. Obey Shopping's browser-test prohibition.
5. Finish scoped formatting, diff checks, exhaustive live-source removal/bypass searches, and architecture/citation checks.

## Outcome and evidence

1. Implemented typed `runSync`/`runPromise` on every browser session and Studio aggregate agent. ManagedRuntime and initialized runtime fields are private. Saved delegates resolve replacement lifetimes; cold general execution acquires application services lazily, while domain readiness checks do not acquire them.
2. Complete Exits report escaping defects through the stable transient failure stream without changing native exception identity. Acquisition, initialization/background fibers, native fiber-start exceptions, scheduled outbox activity, socket recovery and cleanup are covered. Observer exceptions remain isolated. Cleanup attempts every owned resource and preserves the initiating failure when cleanup also fails. Recovered/normalized defects and pure interruptions retain their prior behavior.
3. Restored standalone staging and removed bound methods and raw runtime exports. Aggregate and agent evaluation, synchronous transaction, result recognition and recognized `StageFailure` reporting share one concrete Effect pipeline. Service execution captures its session-owned binding once, fences readiness and preview publication, and enforces synchronous staging. Acceptance and subsequent decoding remain outside staging notification logic. Validation stays lazy and silent with disposable identifiers.
4. The coordinated core/browser/React/SDK/Studio graph passed compilation, applicable typechecks, lint and React claims verification. Core has 25 passing node tests and browser has 56. Both independent Playwright fixtures pass, covering retained standalone work and aggregate/service outbox retry liveness. Shopping's real `tsc:typecheck` and TicTacToe's real `ts` script pass; its disabled Nx placeholder was not treated as compilation evidence. No Shopping browser test was run.
5. Explorer's real typecheck, lint and full 83-file formatter pass, along with all 12 architecture diagram tests and all 27 RPC catalog tests. The production catalog now follows actual staged-command subscriber exposure into Node acceptance instead of asserting removed facade methods. Architecture provenance verifies 279 current source hashes/ranges and 242 citation ranges across six affected documents.
6. Scoped SDK formatting passes for 48 files, and `git diff --check` passes. Exhaustive live-source searches and ownership audits found no remaining public session runtime access, bound staging callers, captured context runners or escaping session interpreter bypasses. Separate System/SharedWorker infrastructure ownership is preserved. Existing unrelated lint warnings and unavailable Nx Cloud remote caching do not prevent the local gates from passing.
7. Updated exports, examples, consumer types, React docs, Explorer metadata/diagrams, local session patterns and glossary. Preserved concurrent WIP. No compatibility path, durable storage/schema change or cast exception was introduced; no new ADR was warranted.

## Remaining work

None.
