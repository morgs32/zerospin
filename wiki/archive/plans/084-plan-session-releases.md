# Session releases, dynamic instances, and owned execution

Status: Implemented and verified on 2026-10-09.

## Agreed behavior

1. Separate immutable authored session releases from independent live browser instances. Use explicit aggregate, service, standalone, mock aggregate, mock service and aggregate agent release constructors and one `makeBrowserSession({ sessionRelease, ...instanceInputs })`. Construction acquires no resources; `initialize()` starts or restarts the captured identity.
2. Releases contain schemas, canonical models/contracts/modules or agent query selections/bindings, owner/actor versions, application layers and transport wiring. Instances expose `session.sessionRelease`, independent stores/failures, private runtime and lifecycle. Introduce no manual session version.
3. Use standalone imperative `stageAggregateSessionCommand`, `validateAggregateSessionCommand`, `makeAggregateSessionModelId` and corresponding service functions. Aggregate functions include agents. Stage is synchronous for aggregates and asynchronous through durable acceptance for services. Validation is synchronous, silent for recognized refusals, evaluates guard/program once, discards operations and uses disposable IDs. Remove former APIs and bound command/ID methods outright.
4. Keep typed `runSync`/`runPromise`, current-lifetime saved delegates and automatic complete-Exit defect reporting. Cover acquisition, initialization/background work and cleanup; retain original failures, observer isolation and quiet pure interruptions. Cold domain preflight must not acquire application services.
5. Capture current initialized capabilities once, preserve service phase/binding ownership and exact aggregate lifetime fences before evaluation and commit. Validation rejects replacement as well. Retain synchronous transactions, rollback, uncertainty and failure normalization. Acceptance and subsequent result decoding stay outside staging notifications.
6. Require separate aggregate instance selection and admission `{ aggregateId, credentials }`. Authentication receives both and returns complete claims; reject mismatched authenticated IDs before capability construction. Preserve authorization and verify online/offline publication identity. Expected claims remain a full assertion, not authentication evidence.
7. System and project-root agents registries consume authored agent releases; Studio creates independent mounted instances. Preserve canonical executable references, selection capture, transient SQLite/socket ownership, recovery and delivery.
8. Add React-only `makeReactApp(sessionRelease)` with `Initializer` and `useInitializedSession`. Initializer commits above inner Suspense, then subscribes and starts initialization. Owner-cached readiness promises rotate on withdrawal; return the stable facade. Preserve errors, StrictMode and stale-completion fences. React 19 is the minimum.
9. Reject same-release ancestors across separate React bindings; permit same-release siblings and distinct releases nested. Fixed input changes require remounting and are rejected if the owner persists; update credential callbacks without restart. Give dynamic rows independent inner Suspense boundaries and place multiple owners above their shared consuming boundary.
10. No public Session/InitializedSession Effect tags, compatibility paths, new casts, durable storage redesign or invented mock delivery. Preserve separate Server/System and authoritative SharedWorker runtime ownership and unrelated WIP.

## Implementation

1. Implement core standalone operations, release metadata types, validation and transaction fences.
2. Split all browser factory families into pure releases and instance construction, bind inputs at construction, enforce explicit aggregate selection, retain reported execution/lifecycle paths and migrate fixtures.
3. Update core identity/server authentication and admission, System/Studio agent declarations and mounted consumers, and DevTools metadata.
4. Implement React ownership/readiness and migrate SDK exports, applications, typechecks, fixtures and docs.
5. Reconcile architecture/Explorer provenance, glossary and local patterns with actual implementation. Create an ADR only for an implemented decision satisfying all qualifying criteria.
6. Complete verification, record evidence and remaining work, and archive this plan with its filename preserved.

Planned hierarchy (`+` creates, `~` modifies, `−` removes superseded paths):

```text
zerospin/
  packages/
    core/
      + src/sessionRelease/
      ~ src/{aggregateSession,serviceSession,agent,identity,system}/
      ~ src/sessionExecution/, test/, typecheck/
      − superseded staging, can and validation entry points
    browser/
      + src/sessionRelease/, src/makeBrowserSession/
      ~ concrete lifecycle/bootstrap/Node implementation, exports, test/, e2e/
    react/
      + src/makeReactApp/
      ~ exports, peers, checks/, README.md
      − superseded construction/initialization hooks
    ~ sdk/, studio/, devtools/, affected cli integration
    ~ system-worker/ admission and authentication
  ~ examples/ affected declarations, owners, callers, tests
  ~ explorer/ affected examples, metadata, diagrams, checks
  wiki/
    + plans/084-plan-session-releases.md
    ~ architecture/, patterns/, glossary.md
```

## Verification

1. Prove release/schema/contract/payload/result/failure/model/application-service inference, ordinary and agent calls, invalid call rejection and absence of removed public APIs.
2. Cover synchronous/asynchronous, acquisition, background and cleanup defects; original failure identity, isolated observers, interruption, cold acquisition, saved delegates, release/reinitialization, exact lifetime rollback, service phases and acceptance uncertainty.
3. Prove guard/program run once, validation retains no commands/resources, all IDs are disposable, recognized refusals remain silent, and synchronous execution/failure normalization survive.
4. Test admission requested-ID validation, mismatch, authorization denial, refresh, online/offline identity, independent instances and agent acquisition/recovery/delivery fences.
5. Exercise real React StrictMode, abandoned renders, initial/recovery Suspense, stable promises, startup error identity, stale rejection, credentials refresh, replacement, siblings and ancestor rules.
6. Run scoped coordinated Nx compilation/libraries/lint/core-browser tests, system-worker Workerd seams, real consumer typechecks, independent React/browser fixtures and Explorer provenance checks. No Shopping browser verification.
7. Finish scoped formatting, diff checks and exhaustive active-source exposure/bypass/old-API searches; preserve unrelated work.

## Implemented outcome

All six families now separate pure authored releases from independent resource owners. Public standalone command validation, staging, and model-ID functions execute through the session's private owned boundary. React 19 bindings create committed owners with cached readiness promises, identity checks, and lifetime fences. Admission selects the aggregate independently of credentials and verifies complete authenticated claims. Connected instances retain their first full claims across disposal and reinitialization.

The final audit also routed DevTools readiness reads, queued agent lifetime/progress work, and reconnect outbox refresh through reported boundaries. Publication observer exceptions remain isolated; obsolete callbacks remain quiet. Callers, SDK exports, fixtures, architecture/Explorer references, module documentation, glossary, and local patterns follow the new API. Concurrent versioned-agent work from plan 085 was preserved.

## Verification evidence — 2026-10-09

1. The coordinated Nx library graph passes for core, browser, React, Studio, SDK, DevTools, System-worker, and CLI: 16 tasks including dependencies.
2. Scoped core/browser/React source and fixture typechecks and lint pass. Core has 32 passing tests; browser has 67, including all 14 initialized-session cases. Coverage includes precise ordinary/agent/service inference, removed API rejection, cold execution, full Exit defect reporting, isolated observers, acquisition/cleanup, identity retention, validation IDs, phase/lifetime fences, rollback, delivery, and recovery.
3. Actual Nx React `claims:check` passes combined ownership, StrictMode, Suspense, startup/stale error, credential, nested/sibling, claims, and six-family inference checks. The negative unknown-command fixture was adjusted for overload diagnostic placement without changing its assertion or adding casts.
4. Real Shopping, TicTacToe, and Explorer consumer typechecks pass. No Shopping browser verification was run.
5. System admission/aggregate administration, authorization/provisioning, and Workerd outbox checks pass. Concurrent plan 085's fixture transports were preserved; its corrected in-Worker WebSocket upgrade check also passes.
6. Independent standalone and outbox Playwright fixtures pass. The outbox fixture passed again after the final reconnect reporting change (1/1, 18.6 seconds), using the configured Nx task without rebuilding dependencies. No Shopping browser verification was run.
7. Explorer type/lint/format checks, all 16 diagram tests, all 27 RPC/provenance tests, and production build pass. Architecture hashes, citation links/ranges, calltree references, and participant references match current source.
8. Scoped formatting, diff checks, and exhaustive removed-API/runtime/singleton/interpreter scans pass. Remaining matches are intentional negative tests, substantive internal helpers, separate authoritative System/SharedWorker ownership, historical records, and stale generated Graft metadata.

Overlapping early verification graphs caused transient missing artifacts; subsequent checks used stable outputs and excluded rebuilding dependencies. Those failed runs are not completion evidence. Local Nx checks pass despite unavailable remote cache access (401). Four pre-existing core lint warnings remain outside the changed area; scoped changed-file lint is clean. Plan 084 required no new ADR under the repository's qualifying criteria.

## Remaining work

None.
