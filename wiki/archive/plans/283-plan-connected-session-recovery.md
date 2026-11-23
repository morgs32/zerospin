# Plan 283: Connected browser session recovery

Status: Complete. Implementation, release/adoption and browser acceptance verified.

## Summary

1. Zerospin owns recovery for connected Aggregate and Service browser sessions in
   production and development. A damaged retained session should recover
   automatically when the backend is healthy.
2. Preserve readable local commands with their original identities where possible.
   Otherwise, create a healthy replacement and notify the user that some local
   changes may not have been recovered.
3. Keep existing application toast handlers and `renderError(error, retry)`.
   Standalone sessions, backend storage, login state, and application intake drafts
   remain outside this change.

## Recovery behavior

1. Intercept recognized retained-state failures and unexpected connected startup
   or synchronization failures before publishing a terminal failure.
   Authentication failures, ordinary network interruptions, and command refusals
   retain their existing handling.
2. Allow one recovery cycle per new session attempt. First attempt repair using
   the existing producer identity; allow at most one fresh-producer fallback.
   Ordinary reconnects cannot restart this cycle.
3. Obtain and validate a fresh authenticated snapshot before destructive work. If
   authentication, connectivity, or snapshot validation prevents this, preserve
   storage.
4. For preserving repair, validate the complete retained original-command stream.
   Keep its producer ID, command IDs, payloads, and positions; rebuild resources
   from the snapshot, then reconcile through existing replay and admission
   mechanisms before resuming submissions. Do not restage uncertain commands with
   new identities.
5. If the retained identity or command stream cannot be recovered, replace only
   the affected connected-session namespace. Drain connections and storage handles
   under the namespace lease before recreation; support unreadable SQLite storage
   rather than relying solely on SQL table deletion.
6. Coordinate recovery in the SharedWorker. Withdraw readiness during repair,
   fence retired deliveries with a generation independent of producer identity,
   preserve pending replica work during preserving repair, and prevent old
   asynchronous operations from entering the replacement.
7. After recovery exhaustion, publish the terminal failure through existing
   handling. A failed facade stays failed; Retry constructs a new owner.
   Internally, a one-shot `newSessionAttempt` attachment signal rearms recovery for
   reload or Retry, including when other tabs keep the worker alive. Concurrent
   attachments join an existing recovery without replenishing its allowance.

## Reporting and interfaces

1. Extend `ISessionFailureReport` with nonterminal `origin: 'recovery'`, reported
   through the existing `session.store.failure` mechanism.
2. Emit a user-facing recovery warning only when local work may have been lost or
   left unconfirmed. Successful preservation stays quiet. Record every recovery
   attempt, original failure, chosen path, and outcome in diagnostics.
3. Keep application failure observers mounted through initialization and recovery
   so startup warnings reach existing toast handlers. Do not change subscription
   replay semantics or add a recovery-specific render callback.
4. Preserve `renderError(error, retry)` and the transport-only meaning of
   `retryConnection`. Add no public connected-session reset API, separate command
   journal, persistent lockout, storage migration, or backend protocol change.

## Delivery phases and planned changes

1. **Framework implementation:** work from an isolated producer checkout,
   preserving unrelated Studio changes. Implement recovery, reporting,
   coordination, existing-test extensions, and documentation. Show the diff and
   verification results, then stop for review.
2. **Release and consumer adoption:** after phase advancement, publish the next
   fixed-group release from clean committed inputs. Update Red Rope's exact pins
   and lockfile using pnpm 9.15.9; adjust notification observer lifetimes. Show
   these changes before starting browser acceptance.
3. **Browser acceptance:** verify the retained-session recovery and complete login
   flow. Report results, reconcile affected glossary/architecture guidance, and
   archive the plan only when all required work is complete.

Planned hierarchy (`~` modify, `+` create; grouped names identify related existing
files):

```text
zerospin/
├── wiki/plans/283-plan-connected-session-recovery.md                 +
├── packages/core/src/
│   ├── {AggregateNode,ServiceNode}/…                                 ~
│   ├── Node/makeNodeSubscriptions.ts                                 ~
│   └── sessionFailure/{types,makeSessionFailureReporter}.ts           ~
├── packages/browser/src/
│   ├── {AggregateNode,ServiceNode}/…                                 ~
│   ├── Node/…                                                       ~
│   └── sessionReplica/…                                             ~
├── packages/error/src/defaultErrorMessages.ts                        ~
├── packages/{core,browser}/tests/…                                   ~
└── fragment/content/{handbook,reference}/…                            ~

redropeparking/
├── apps/web/components/…SessionProvider.tsx                          ~
└── package manifests and pnpm-lock.yaml                              ~
```

## Verification and acceptance

1. Extend existing core recovery/history tests, Aggregate and Service
   replica-lifetime tests, and network/authentication tests. Cover preserved
   command identities, lost replies without duplicate effects, historical
   completion replay without double application, and rejection of retired
   deliveries.
2. Extend existing browser scenarios using production SharedWorkers and real
   IndexedDB. Exercise both environments, unreadable storage, simultaneous tabs,
   bounded failure, reload/Retry rearming, and cleanup failure retaining namespace
   exclusion. Create no new test files, fixtures, or runners.
3. Confirm preserving repair produces no toast; possible-loss fallback produces
   one notice through an observer mounted before loading completes. Failed
   recovery reaches the author's existing error component.
4. Run relevant Nx library, type, lint, and root `zerospin:test` checks. Browser
   scenarios require actual browser execution; compilation alone does not
   establish recovery.
5. After adoption, run `pnpm nx run web:build-storybook` and
   `pnpm nx run web:build`.
6. In Red Rope, verify retained-session recovery → **Complete your intake** on
   `/signed-in` → reload retains the prompt → **Complete intake** resumes the first
   unanswered step. Verify a partially completed draft survives and member,
   waitlist, activation, and error/retry behavior remains correct.

Recovery provides best-effort preservation, not a guarantee against unreadable
local storage. When recovery cannot restore usability, existing author-controlled
error handling remains the final fallback.

## Phase 1 outcome and verification

1. Implemented connected Aggregate and Service recovery in the isolated
   `codex/connected-session-recovery` worktree at
   `/private/tmp/zerospin-connected-recovery`. The original Zerospin Studio WIP
   and Red Rope changes were preserved. No package was published or adopted.
2. Preserving repair validates complete retained producer inputs, keeps command
   identities and push-pause intent, installs authenticated resources, and
   reconciles historical outcomes before readiness. Fresh fallback recreates
   only the owned namespace after handles drain. WASM preparation failures do
   not authorize deletion. Failure deferral, delivery generations, queued
   mutation fencing, and bounded fresh-attempt rearming cover both families.
3. Required library/type/lint checks passed for core, browser, React, and error.
   Existing lint warnings outside the changed files remain. The full
   `pnpm nx run zerospin:test -- --maxWorkers=4` passed **45 files / 235 tests**;
   loopback permission was required for the Cloudflare test workers. The Node
   recheck also compiles every browser fixture and passed **22 files / 94 tests**.
4. Actual browser verification passed all **20 cases**: Aggregate and Service,
   development and production, preserving repair, schema fallback, unreadable
   SQLite, bounded exhaustion, and fresh-owner Retry with another client port
   retaining the SharedWorker. Preserving Service cases also wait for retained
   admission acknowledgement (`admittedThroughPushIndex: 1`).
5. Two separate browser documents concurrently initialized through one Aggregate
   recovery, retaining the original Node ID with two resume events. Separate
   live Aggregate and Service runs then induced a checkpoint conflict after
   both documents were ready. Both documents transitioned through initializing
   back to ready, retained the original Node ID, emitted no loss warning, and
   shared one replacement replay.
6. Browser scenarios used production public sessions, SharedWorker hosts, leases,
   SQLite and IndexedDB, with an opt-in simulated authenticated backend protocol.
   They establish browser recovery behavior, not Red Rope backend/login
   acceptance. The verified worker artifact hash is
   `28f4651edb895e1944aaea8b65752e2a9947378696833d359edcdc802ec54e2f`.
7. Reproduce single-owner cases using the existing
   `prepareAggregateRecovery` / `verifyAggregatePublicRecovery` and
   `prepareServiceRecovery` / `verifyServicePublicRecovery` exports in
   `packages/browser/tests/`, their sibling `?sharedworker&url` entries, and a
   fresh run ID per case. For two-document live checks, prepare once with
   `mode: 'live'`, initialize a public owner against the same preparation in
   each document, call `invalidateHostRecovery(apiUrl)`, and observe both stores
   returning to ready before disposing both owners. No test files, runners, or
   configuration were created.
8. Verification used fresh disposable fixture namespaces at
   `http://localhost:15183/`. Temporary fixture tabs and the isolated Vite server
   were closed afterward; the original Red Rope login tab and storage were
   untouched. Screenshot: `/private/tmp/zerospin-plan283-browser-results.jpg`.

## Phase 2 outcome and verification

1. Preserved the intervening published `37.0.2` release by merging
   `c78805f586077d05d49d573eec6abee47a163981`, including its Service admission
   decoding fix. Aligned the existing Service recovery fixture with that wire
   shape; no compatibility field or decoder was introduced.
2. Published **all 20 fixed-group packages at `37.1.0`** to the configured local
   registry from clean committed producer revision
   `ae6e6c128999424a212e55f097a4ce0b60d223be`. Versioned consumer-skill metadata
   also reports `37.1.0`. The release build compiled all 19 packages with `lib`
   targets; `@zerospin/server-only` ships source directly. Publication preview
   and publication completed successfully. The merged producer suite passed
   **45 files / 235 tests**.
3. Read back version, latest tag, integrity, and shasum for all 20 packages.
   Representative browser/Core/CLI tarball integrity and contents were checked:
   the browser runtime matches the release build, Core retains the Service
   admission fix, and CLI output is present. Registry metadata does not include
   `gitHead`, so the producer revision is recorded explicitly here. Evidence:
   `/private/tmp/zerospin-phase2-published.json`.
4. Red Rope now has **23 exact direct framework pins** across Web, Admin, and
   its application-owned parking package, plus an updated lockfile. Installation
   used pnpm **9.15.9** and a subsequent frozen-lockfile install passed. All
   three apps resolve the same physical `@zerospin/core` instance; no old
   `37.0.x` fixed-group lock entries remain. Installed Intent skills were
   reloaded from `37.1.0`.
5. Updated the renamed React session components required by the release. Moved
   existing intake, enrollment, admin, and contact failure subscriptions above
   their loading gates, preserving existing toast/draft-error presentation.
   Corrected two TypeScript issues in the earlier signed-in story assertions.
   Red Rope's existing staged intake changes remain byte-for-byte unchanged;
   those story typing corrections are separate unstaged changes. The earlier
   Vite production-build fix was preserved.
6. Consumer verification passed: Web and Admin full app typechecks; existing
   Web tests (**3**) and parking-domain tests (**6**); `web:build-storybook`;
   `web:build`; and `admin:build`, including prerendering. Scoped formatting
   and `git diff --check` passed. Evidence:
   `/private/tmp/redrope-phase2-adoption.json`.
7. Phase 2 review artifacts: `/private/tmp/redrope-plan283-phase2-adoption.patch`
   contains only this adoption's working-tree changes, excluding the existing
   staged prompt implementation and earlier Vite fix;
   `/private/tmp/zerospin-plan283-phase2-release.patch` contains producer changes
   since the phase 1 implementation commit. No Red Rope files were staged or
   committed. No phase 3 browser/login actions, session deletion, or storage
   resets were performed.

## Phase 3 outcome and verification

1. Verified the running Red Rope application through its existing Clerk login:
   `/signed-in` displays **Complete your intake**, stays there after reload, and
   **Complete intake** resumes `/intake`. An empty draft resumes
   `/intake/01-garages`; a draft with only city completed resumes
   `/intake/02-fleet`. Reloading preserves the city and resumes the same first
   unanswered step. These checks were repeated after concurrent Plan 025 moved
   the draft from Zustand persistence into its standalone visitor session;
   those concurrent changes were preserved.
2. Exercised retained-session recovery against the real authenticated backend
   using both current `37.1.0` connected namespaces. After each owner closed,
   the verification changed only its retained `dispositionChainHash` under the
   exclusive namespace lease. Authenticated startup repaired both namespaces
   and retained their original Node IDs. The Aggregate had no retained original
   commands. The Service's six retained originals kept the same IDs, payloads
   and positions, with unchanged digest
   `e75827f25126cd29c59fc7016f512dc6f73e8b9f544c626e2a597dcb672e9da4`.
   The later handoff request produced a seventh Service original. Preserving
   repair emitted no toast, and the application draft stayed unchanged.
3. The live checks used the published production SharedWorker runtime, whose
   phase 2 artifact hash is
   `35d4dcd311e6a66c1036bc8cd9de4ee45cd4daf1a9a744d3ccf48a552148db50`.
   A separate canonical failure-report probe published
   `origin: 'recovery'` / `node-recovery-work-unconfirmed` while the Service was
   initializing. Exactly one existing application toast appeared, followed by
   ready state and the completion prompt. This probe verifies notification
   observer wiring; it does not establish a fresh-producer fallback in Red
   Rope. Actual fallback and unreadable-storage behavior remain established by
   the phase 1 production SharedWorker browser scenarios.
4. Exercised the existing browser stories: missing and incomplete members show
   the prompt with `/intake` href and no automatic navigation from the initial
   memory path `/`; an accepted member reaches `/signed-in-story`; waitlisted
   membership reaches `/waitlist`; missing username normalizes to `/profile`;
   activation text and the existing error/Retry behavior remain correct. The
   prompt stories' existing wait was raised to ten seconds because actual
   SQLite startup could exceed their one-second default.
5. Transient stale-worker/guard errors during concurrent development were
   resolved with a scoped application restart and fresh document. No browser
   backend state reset, authentication change, broad storage reset or new test
   file/fixture/runner was used. The only consumer source change in this phase
   was the small existing-story timeout/format adjustment; concurrent work was
   preserved.
6. Reconciled the glossary's stale DEV-only recovery descriptions and clarified
   the architecture reporter paragraph and existing notification pattern. They
   now describe production/development recovery, preserved original identities,
   bounded fresh-producer fallback, new-attempt rearming, nonterminal recovery
   notices and observers mounted through initialization. Scoped formatting and
   `git diff --check` passed. Earlier phase 2 build/type/test results remain
   separately dated above; they are not represented as fresh checks of the
   concurrent draft-storage change.
7. Browser evidence is recorded in
   `/private/tmp/redrope-plan283-phase3-browser.json`. Screenshots:
   `/private/tmp/redrope-phase3-recovered-prompt.jpg`,
   `/private/tmp/redrope-phase3-resumed-fleet.jpg`,
   `/private/tmp/redrope-phase3-retained-city.jpg` and
   `/private/tmp/redrope-phase3-startup-notice.jpg`.

8. Final cleanup removed the synthetic Austin choice through the current draft
   UI: every city checkbox is clear and Continue is disabled for the unanswered
   city step. The older localStorage draft's verification-only Austin selection
   was restored to its original empty value. Clerk login remained unchanged.
   Full navigations cleared temporary probes; no temporary SharedWorker wrapper
   remained. A final `/signed-in` check again reached ready state and displayed
   **Complete your intake**. Browser evidence is present at the recorded JSON
   path. No implementation or required verification remains, and this plan is
   archived with its original filename.

## Remaining work

None.
