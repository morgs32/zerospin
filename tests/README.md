# Tests

Run the tests from the workspace root:

```sh
pnpm nx run zerospin:test
```

Nx builds the required library outputs, compiles the complete test program with
`tsconfig.tests.json`, then runs the Node and Workers Vitest projects configured by
`vitest.config.mts` and `vitest.workerd.config.mts`. The command fails if compilation or a runtime test fails.

| Owner                                                              | Runtime coverage                                                                                                                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Shopping](../examples/shopping/tests/)                            | Fourteen harness scenarios: cart/Product behavior, checkout/redemption, expiry, cancellation before delivery, capacity, payment uncertainty/decline, exact decision binding and reservation reuse. |
| [Tic-Tac-Toe](../examples/tic-tac-toe/tests/computer-move.spec.ts) | Computer move success and chooser failure.                                                                                                                                                         |
| [Core](../packages/core/tests/receipt-delivery.spec.ts)            | Service receipt delivery success and failure, using test declarations in `fixtures/receipts/`.                                                                                                     |
| [System Worker](../packages/system-worker/tests/)                  | Real Durable Object admission, execution, retained history, projections, sockets, Agent deadlines and durable retry; direct `cloudflare:test` and Drizzle.                                         |

Shopping's [compiler example](../examples/shopping/tests/system.typecheck.ts)
checks public harness command-result and query-row inference, including exact
command-result equality. Core's
[compiler checks](../packages/core/tests/contracts.typecheck.ts) cover accepted
contract calls and intentional misuse with explained `@ts-expect-error` assertions.
These compiler-only checks are included in the test command and never execute.

Core's [Node view recovery scenarios](../packages/core/tests/node-view-recovery.spec.ts)
exercise Aggregate and Service Nodes with real SQLite: lost retention replies,
exact and conflicting retries, shared optimistic views, newer local commands,
missing-known-coverage refusal and same-row empty-final settlement. Refusal checks
compare retained rows, checkpoints and resources before and after the invocation.
Injected replay and projection defects also verify installer rollback after real
model writes and Node reconstruction over retained SQLite after a selected final
commits. The latter preserves pending-command replay without reopening storage.

[Initial staging and inverse scenarios](../packages/core/tests/session-staging-inverses.spec.ts)
verify Aggregate and Service post-insert lifetime rejection, complete replica
rollback, allocation reuse and stored delete/move inverse restoration. Direct
inverse-helper checks establish codec/resource restoration, not browser rebase
integration or inverse-lifecycle cleanup.

These headless scenarios do not establish browser or Native host behavior.

The [Aggregate](../packages/browser/tests/aggregate-host.browser.ts) and
[Service](../packages/browser/tests/service-host.browser.ts) host action fixtures
support manual checks in a disposable browser context through the existing
`shopping:dev:app` Vite task. Their sibling worker entries run production
SharedWorker hosts against real IndexedDB. They compile with the test program;
the Node test command does not execute them. [Plan 234](../wiki/archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#actual-browser-storage-and-sharedworker-replacement--2026-10-27)
records the executed retention, lease, refusal and worker/document replacement
journeys, setup commands and proof limits. Use fresh fixture identities and
storage, without resetting existing application databases.

For a command-table migration, build two worker artifacts for each family. Add
`migration_marker (value integer NOT NULL)` to the newer family database
declaration with a matching forward SQL step. Serve both on the same fixture
origin. Pass each build’s `connectAggregateMigrationHost` or
`connectServiceMigrationHost` to `verifyBrowserStorageUpgrade({ prepared, old,
current, inspect })`. This holds the older lease while the newer worker waits,
reopens the migrated file with the older artifact, and drops the first committed
outcome reply before reconnect. SQLite state and the captured backend protocol
are both checked.

To exercise a shipped writer, set `ZEROSPIN_PREVIOUS_CORE_PACKAGE` and
`ZEROSPIN_PREVIOUS_BROWSER_PACKAGE` to the installed `@zerospin/core` and
`@zerospin/browser` package directories from the same release, then run

```sh
pnpm exec vitest run --project node packages/core/tests/node-history-recovery.spec.ts -t 'preserves immutable'
```

Use the released 48.0.0 and 48.0.1 packages to cover both Aggregate histories
stamped 24. Use 48.0.2 for the installed planner control.

The [Aggregate public-session assertions](../packages/browser/tests/aggregate-public.browser.ts)
and [Service public-session assertions](../packages/browser/tests/service-public.browser.ts)
extend those fixtures through `makeConnectedAggregateSession` and
`makeConnectedServiceSession`. In a fresh disposable context, load both public
modules and host modules, then call `prepare` / `prepareServiceHost` with unique
identities. Keep local Vite JS/WASM asset responses available through the browser
driver while marking the context offline. Both fixtures use an unreachable
`.invalid` backend origin; SharedWorker fetches can still reach local assets
despite the offline navigator state.
Run Aggregate's `verifyAggregatePublicBootstrap`,
`verifyAggregatePublicReplacement` and `verifyAggregatePublicDefinitionRefusal`,
then Service's `runServicePublicBrowserTests` and
`runServicePublicDefinitionRefusal`, passing each preparation and its sibling
host-worker URL. The public assertions dispose their sessions. These exports
compile with the test program and run through the existing Playwright tool;
Node Vitest does not execute them. [Plan 234](../wiki/archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#public-browser-bootstrap-staging-and-replacement--2026-10-27)
records the actual run and its limits.

For the journal-only interruption window, use the existing Aggregate worker URL
with `hold-staged&finalize` query flags. Call `prepareAggregateJournalReload` after
preparing a fresh Aggregate fixture: it stages through the public session and
proves a persisted journal original exists while Node `pushIndex` is zero. Keep
the returned preparation and original in the browser driver, then abruptly reload
the document without disposing its session. Re-import the modules and call
`verifyAggregateJournalReload` with the same worker URL and saved result. The
fixture removes its exact test-owned gate, recovers the original coordinates,
unpauses delivery and checks Node identity and a retained canonical outcome.
CacheStorage holds only that test gate; commands remain in their normal journal
and Node storage. Both documents must have no HTTP service-worker controller.
The fixture keeps the compiled runtime hash unchanged; consumer adoption must
separately verify a real old-to-new executable update with pending retained work.

Pass a file to filter the Vitest run:

```sh
pnpm nx run zerospin:test -- examples/shopping/tests/system.spec.ts
```

File filters apply to Vitest; compilation still checks the complete test program.

Keep application behavior tests with their app and framework tests with their
owning package, outside production `src` directories. Node Effect tests use explicit `describe` blocks and `it.effect` from
`@effect/vitest`, which supplies each test's Scope and `TestClock`. Workers tests
use Vitest with the Cloudflare plugin, real production classes and SQLite
Durable Object bindings. Use `runInDurableObject` for inline Drizzle inspection,
`runDurableObjectAlarm` for alarms and the stock eviction/reset APIs for lifecycle
scenarios. Shared support files contain authored declarations and class exports;
keep scenario setup, fault injection and assertions in each test. Keep SDK commands, query selections, inputs and outcomes
visible inside each scenario; no domain arrangement DSL is needed.

Error-package tests verify schema-backed framework error construction, public
codecs, typed diagnostic narrowing, and scoped error preservation. Browser-package
tests verify provider deadlines, pending-call lifetime, backend timeout and
connection attribution, and typed worker-RPC error round trips. Run these focused
scenarios with `pnpm nx run zerospin:test -- packages/error/tests packages/browser/tests`.

The shared [SQLite opener](support/openTestDb.ts) provisions disposable storage
and closes it with the test's Effect Scope; scenarios own their rows.
Shopping uses `makeSystemHarness` with scoped SQLite, real application services
and Effect's `TestClock`. The direct contract tests inspect evaluation output;
they do not establish operation commitment or distributed delivery.

The Node and Workers checks require no dev server, browser session or sign-in. Workers tests
exercise admission, execution commit, dispatch acknowledgement, retained
`outcome` and reconstruction separately. They use the real Durable Object
runtime and native WebSockets; they do not establish browser IndexedDB,
SharedWorker sharing or authenticated deployment behavior.

Run only System Worker verifications:

```sh
pnpm nx run zerospin:test -- packages/system-worker/tests
```

Run a single Workers file with `--project workerd` and its path. File filters
still compile the complete test program.
