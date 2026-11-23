# System Worker RPC method explorer inventory and implementation

**Status:** Archived on 2026-10-26 after maintainer-approved retirement. Catalogue cleanup was completed previously; the remaining broad callback/error-policy tracking is cancelled. No application verification ran during archival.

## Archival disposition — 2026-10-26

Current [runAuthoredCallback](../../../packages/core/src/execution/runAuthoredCallback.ts) normalizes sole framework refusals at caller-owned boundaries, validates declared business failures and preserves composite/non-failure Causes. Historical callback/config failures are not current failure evidence. No concrete current defect was established by archival source review. Do not recreate removed catalogues or transfer a repository-wide error migration to [Plan 258](258-plan-schema-backed-backend-errors.md); that plan retains its narrower error/network rollout scope.

## Request and scope

Inventory the production RPC surface in `packages/system-worker`, record which
implementations need sibling `*.explorer.ts` catalogues, and implement runnable
catalogues. Include capability APIs, Durable Object Repo methods, failure
capabilities, and shared queue/subscriber factories. Exclude generated
Cloudflare declarations and transport-only test fixtures.

The current approved catalogue scope is only the aggregate admission pilot.
The maintainer cancelled all other catalogue authoring on 2026-10-10. Retain
the shared profiler and runner; do not restore removed catalogues or fixtures.

An explorer executes the actual method with scoped fixtures. It must cover
inhabited observable success and every finite inferred error code, plus distinct important paths
sharing those codes. A returned RPC failure is an observable failure outcome;
an empty Effect error channel does not prove that the domain cannot fail.

## Current evidence and approved seam

1. At the start, the admission pilot was the only existing catalogue. The runner loads
   catalogues in Node through Vite and cannot import `cloudflare:workers`.
2. `makeDORepo.getRepo` reads namespace bindings directly from
   `cloudflare:workers.env`; repo acquisition originally had no injectable service. The approved acquisition tags now isolate it.
   Promise execution uses `Effect.promise` without a custom service requirement.
3. Most capability procedures settle errors into RPC envelopes or failure
   capability objects. Preserve precise domain failures rather than claiming
   exhaustive coverage from success-only wrapper catalogues.
4. Approved remote seam: execute local behavior with real storage, acquire
   remote Repo capabilities through typed Effect service tags, and supply
   scenario-specific remote adapters. Verify remote identity, requests,
   refusal, responses, and ordering. Keep actual RPC asynchronous and retain
   separate Workerd transport checks. The user approved this acquisition-only
   model after reviewing pseudocode for `getAggregateVersionRepoTableRows`.
5. Inherited methods share their defining implementation catalogue. Failure
   capabilities and queue/subscriber factories require coverage of their
   actual shared behavior, not duplicated fixtures for each owner.

## Approved remote Repo approach

1. Use repo-specific acquisition tags, beginning with `SystemRepos` and
   `AggregateVersionRepos`. Each `getRepo` accepts the existing exact Repo key
   and returns the typed remote capability needed by its callers. Keep
   `SystemRepo` and `AggregateVersionRepo` imports type-only in portable
   procedures. A generic all-Repos locator adds unnecessary Repo-kind/key
   correlation to these callers.
2. `SystemApi.getAggregateChains` acquires `SystemRepo(systemId)` and awaits
   `getRepoRegistrations({ repoType: 'AggregateChain' })` through the existing
   `Effect.promise` / `readRpcEnvelope` path.
3. `SystemApi.getAggregateVersionRepoTableRows` first queries the bound
   deployment's registrations, rejects an unregistered physical Repo name,
   parses its owner fields, then acquires the registered AggregateVersionRepo
   and awaits `getRepoTableRows`. The capability retains ownership of
   `systemId`; the receiving Repo retains table-name validation. Move authored
   name utilities into one portable module used by both the shell and procedure.
4. Build live layers in the Worker composition point, initially
   `GatewayApi.getSystemApi`, using the existing static `getRepo` functions.
   Provide those layers when the existing shared runtime executes the bound
   capability. Do not allocate another `ManagedRuntime` or put Worker imports
   into browser-safe system construction.
5. Local fixture adapters acquire identity-checked capabilities and return
   Promises that execute the actual remote method against fresh storage and
   serialize its real result. Scenarios exercise acquisition refusal, RPC
   rejection, malformed envelopes, returned domain refusals, requests and
   ordering. These are method explorers; real multi-Repo transport remains
   covered by affected Workerd checks.
6. Acquisition tags alone are insufficient: `makeApiHandler` transitively
   imports Worker telemetry persistence. Telemetry needs a separate portable
   seam. Its `IAnyError | IZerospinErrorJson` annotations also erase domain
   failure unions, as does the inherited table-reader signature. Preserve
   actual finite errors before RPC encoding and classify observable outcomes
   rather than claiming success-only coverage of admitted behavior.
7. An asynchronous operation does not necessarily acquire another Repo.
   Ticket hashing awaits Web Crypto. The implemented log appender now commits
   local SQLite insertion and retention in one synchronous transaction. Keep
   repo tags tied to real remote acquisition.

## Implementation steps (historical rollout; cancelled)

1. Discover all production RPC owners and methods using current source and the
   Explorer RPC catalogue. Reconcile inherited/shared implementations and
   record every method, implementation location, existing catalogue, async
   seam, eligibility issue, and intended sibling catalogue.
2. Implement local-only catalogues first using fresh scoped SQL.js databases,
   real Drizzle tables and codecs, observable result verification, and rollback
   or retained-state verification where relevant. Annotate existing method
   spans with `annotateFunctionSpan`.
3. Implement the approved acquisition-only Repo services. Remove ambient lookup
   from local procedure imports at that seam; production adapters obtain the
   real stubs. Keep identity/authorization ownership and synchronous SQL
   transaction restrictions intact. Do not introduce compatibility paths.
4. Preserve precise errors before RPC serialization and author every remaining
   catalogue with actual success and rejection scenarios. Cover failure
   capability behavior and shared factories once per implementation.
5. Extend artifact checks to admit multiple catalogues while retaining all
   admission checks. Verify catalogue imports arrange no fixtures, output
   identities match the inventory, and every required catalogue executes.
6. Run scoped Nx typecheck, lint, explorer execution/artifact checks, and
   affected Workerd checks. Record failures and unrun checks explicitly.
7. Reconcile existing explorer terminology and local guidance with the result.
   Create an ADR only if an implemented decision meets repository criteria.
   Archive this plan only after implementation and required checks complete.

## Current catalogue scope (2026-10-10)

The maintainer cancelled the remaining catalogue rollout and requested removal
of every `.explorer.ts` file and dedicated fixture except the admission pilot.
The current catalogue is
[`admitAggregateCommands.explorer.ts`](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/admitAggregateCommands.explorer.ts),
with its declarations and scoped storage setup in the same file. Cases use
local immutable declarations and acquire storage through `AdmissionStorage`;
there is no separate fixture module. The inventory and planned catalogue files have
been removed because they no longer describe authorized work.

Production callback/error policy and Repo acquisition services are outside this
removal. Their outstanding work below remains separate from catalogue authoring.
The verification history below describes earlier repository states, not current
catalogue coverage.

## Implemented behavior and verification

### Local and rejected-capability catalogues

1. Created 76 new sibling catalogues, retaining the original admission pilot.
   All **77 catalogues, 145 outcome groups, and 485 scenarios** execute actual
   procedures with scoped fixtures. Rejected-capability catalogues verify
   observable retained failures; they do not imply admitted-domain coverage.
2. Narrowed obsolete broad annotations to actual error channels, preserved
   literal definition kinds through registration, and annotated authored
   method and transaction spans. No failure possibilities were cast away.
3. Fixed aggregate replay so malformed retained command hash/ID values enter
   the existing `session-replay-invalid` Effect failure instead of escaping as
   synchronous defects. Regression scenarios preserve storage.
4. Made log index allocation, insertion, and 1,000-row retention one
   synchronous SQLite transaction. Existing public error codes remain;
   insertion, encoding, trimming, duplicate-ID, and BEGIN refusals roll back.
5. Extracted three local lookup procedures. Exact missing aggregate checkpoints
   return null; present rows return their required command ID and disposition
   hash. Removed an unreachable fallback query and impossible nullable/genesis
   fallback without changing fixed schemas or adding compatibility fixtures.
6. Passed `pnpm nx run-many -t ts lint explorer:check authorization-provisioning:check -p system-worker,@zerospin/shapes`.
   The artifact check validates every catalogue's inert import, expected
   outcomes, authored root, arguments/exit/source references, and retains the
   admission pilot's existing duplicate, rollback, and five-span checks.
   Workerd verifies actual owner RPC reentry, provisioning, retained state,
   capability refusals, routing, WebSocket upgrades, and single-use tickets.
7. Lint has zero errors and three pre-existing warnings in unmodified methods
   (`SystemApi.executeAggregateCommand` and optimistic projection staging).
   Nx Cloud access returns 401; all selected local tasks passed.
8. Scoped formatting and `git diff --check` passed. Existing explorer glossary
   definitions remain applicable; updated the local testing pattern/index.
   No implemented decision in this batch warrants an ADR. Preserve concurrent
   Explorer UI/package/lockfile changes outside this work.

### Approved acquisition Services and observable RPC outcomes

1. Bound all 14 Repo acquisition tags and portable API telemetry persistence at
   the existing SystemApi runtime boundary. Production uses the original static
   getters and telemetry appender; fixtures use typed capabilities with exact
   keys and execute actual receiving methods against fresh production schemas.
   All 28 inspection getters retain registration checks, capability-bound
   system identity, real asynchronous RPC, and receiver-owned table validation.
2. Shared each owner's portable physical-name contract with its production
   factory. Preserved precise handler, receiver, readiness, and rejected
   capability outcomes without casts or compatibility paths. Telemetry scenarios
   verify persisted rows and returned backend links against the actual failure.
3. Added `rpc-result-codes` classification to the profiler. `profile.result` and
   `function.exit` retain the original Effect Exit; `observableResult` classifies
   returned failures without inventing a Cause. Malformed results, wrong
   outcomes, outer failures, defects, and interruption reject execution.
4. Added healthcheck, shared inherited readiness, and SystemRepo spec-acceptance
   catalogues. Spec scenarios verify four-family synchronous rollback, repeat
   acceptance, retained definitions, new releases, and receiver Worker metadata.
5. Passed `pnpm nx run-many -t ts lint test:node explorer:check authorization-provisioning:check -p system-worker,@zerospin/core,shopping`
   and the final receiver-validation recheck
   `pnpm nx run-many -t ts lint explorer:check authorization-provisioning:check -p system-worker,shopping`.
   All selected targets and 17 dependency tasks passed: **112 catalogues,
   408 outcome groups, 1,060 scenarios**, and 56 core Node tests. Existing Workerd
   checks passed for owner RPC reentry, concurrent provisioning, preserved data,
   lost original receipts, cross-version results, refusals, agent snapshots,
   membership, routing, native WebSockets, and single-use bound tickets.
6. Core lint reported four pre-existing curly warnings, System Worker three;
   no errors. The deliberate-any type-regression suppressions passed scoped lint
   recheck; this batch introduces no lint warnings. Nx Cloud
   401 does not prevent the selected local checks from passing.
7. Verified SystemApi backend-error lookup, aggregate-ID discovery, executing
   Worker spec inspection, and spec acceptance. Existing `System` service binds
   the executing Worker's authored definition at the same composition boundary;
   it does not substitute the receiving Repo's deployed version. Consolidated
   backend lookup's existing owner validation into the actual receiving method;
   its own catalogue now verifies malformed owner identities before any SQL.
   Removed the redundant validation wrapper.

### Finite method errors and native factory catalogues

1. Tightened explorer declaration/runtime eligibility to require the ZerospinError
   discriminator and finite literal codes. Failure-only methods with success type
   never omit the success group; broad or untagged failures remain ineligible.
   Method producer types flow through acquisition services, callbacks, outbox
   delivery, and encoded receivers without error casts.
2. Added real portable factory roots with native RpcTarget constructors supplied
   by Worker shells. Fresh storage and actual receiving procedures verify queue
   enrollment, fanout recovery, disposal, rollback, and retained refusal identity.
   Seven scoped factory catalogues passed 64 groups and 101 scenarios.
3. The shared runner writes the logger's existing bounded function-result
   snapshot instead of serializing raw native RPC capabilities. In-memory
   verification retains actual values. A callable Proxy regression verifies
   writing diagnostics cannot invoke synthetic capability serialization.
   Profiles identify the local method with `methodSpanId` while retaining
   separate receiving RPC roots; artifact checks resolve that explicit ID.
4. Native Effect spans can have default hex IDs. The logger now starts local
   telemetry ancestry when a foreign parent lacks the declared telemetry IDs,
   and omits those foreign IDs from log linkage. Actual nested RPC telemetry
   passes the production wire schema without casts.
5. Outbox and fanout execution preserve complete composite Causes.
   RPC encoding handles exactly one typed failure; pure defects/interruption
   preserve their Cause, while a composite containing typed failures becomes
   a defect holding the complete original Cause rather than a partial encoded
   refusal. Existing transaction normalization remains the limitation below.
6. The earlier scoped core checks and 72 Node tests passed; logger typecheck/lint
   and 9 Node tests passed, including native ancestry and composite-Cause
   regressions. Current combined evidence, including 80 core tests and affected
   transport checks, is recorded below. Core lint retains five existing warnings.
7. Retained SystemApi failure capabilities use the actual Gateway admission
   error union, inferred from authorizeSystemApiRequest: decode refusal,
   publishable-key refusal, and invalid production key. The native shell and
   terminal encoder retain these three codes and the serialization fallback.
   HTTP API boundary errors also include the real encoder's serialization refusal.
   Explorer inference derives channels from the actual callable's Parameters
   and ReturnType without specializing its generic error to a fixture.
8. Prepared async work retains the resolved declaration's identity and reuses
   the actual payload/response decoder after external declaration validation.
   Projection output encoding of already validated fixed fields is an internal
   invariant; removed redundant unreachable output-refusal mappings. Ordinary
   arbitrary-contract validation and existing transaction normalization remain.

### Recorded verification before scope reduction

1. Before the scope reduction, source contained **159 of 198** required catalogue
   destinations: Worker **138**, Browser **20**, Studio **1**. Their actual artifacts contain **1,022 outcome
   groups and 2,087 scenarios**. That scope still had 39 missing catalogues.
   Removing browser and Studio catalogue work leaves the 31 System Worker
   destinations recorded below; these historical checks do not establish
   complete inventory coverage.
2. Final coordinated run 35 (`/tmp/zerospin-rpc-finite-thirty-fifth-check.log`)
   passed the then-current Worker/Browser/Studio catalogue execution and strict
   artifact validation after the final builds. Worker has **875 groups and 1,891 scenarios**;
   Browser has **134 groups and 181 scenarios**. The admission pilot retains
   **22 groups, 60 scenarios**, duplicate/rollback checks, and five authored
   spans. Studio has **13 groups and 15 scenarios**.
3. Run 22 passed all selected compilation/typechecking, the CLI dependency
   compilation, Shopping typechecking, **80 core tests** and **72 browser
   tests**. Logger typecheck/lint and **9 Node tests** also passed before the
   unchanged logger sources were reused by this combined graph.
4. Selected lint passed for Worker, Core, Browser, Studio, Logger, Error,
   Shapes, CLI, and Shopping across runs 31/32/34. Core retains five existing
   warnings outside the new explorer fixtures. The new fixture warnings and
   class-method spacing failures were repaired; no lint errors remained in those
   runs.
5. All 39 SystemApiFailure catalogues observe actual Gateway admission
   validation and terminal RPC serialization: three source-inferred admission
   codes plus the serialization fallback, **156 failure groups and 312
   scenarios**, with no success group. The profiler rejects broad/untagged
   errors, result-envelope channel escapes, and fixture-only generic narrowing.
   Actual callable/span names agree; merged receiving RPC traces retain their
   separate roots and the local method's explicit methodSpanId.
6. SQL.js snapshots preserve foreign_keys. Retained aggregate setup completes
   actual replay/publication before observation. Malformed raw JSON takes the
   real Drizzle transaction refusal; a declared non-roundtripping codec takes
   the actual projection decoder refusal. Replay/storage assertions remain
   exact. No production behavior was altered to match a fixture.
7. Affected transport verification passed: native outbox:check in run 33
   (`/tmp/zerospin-rpc-finite-thirty-third-check.log`), and
   authorization-provisioning:check plus aggregate-administration:check in run 34
   (`/tmp/zerospin-rpc-finite-thirty-fourth-check.log`).
   Aggregate administration includes the Shopping successes check, so no
   duplicate standalone Shopping run is needed. Native fixtures supply their
   real RpcTarget and existing runPromiseExit; the Node fanout fixture supplies
   its own constructor explicitly, replacing an unused import interception.
   Native verification exposed missing AggregateVersionChains/ServiceVersionChains
   bindings in the production replay callbacks. Each callback now supplies its
   existing native acquisition adapter when it runs, retaining the same owner
   runtime. Cold lost-receipt recovery and published cross-version results pass.

### Scope reduction verification (2026-10-10)

Removed all 27 browser and Studio method catalogues, their 15 exclusive browser
fixture/scenario helpers, the two packages' explorer commands, and the unused
generic artifact checker. Retained the shared core profiler and runner required
by System Worker. The source/reference audit found no method catalogue outside
`packages/system-worker` and no remaining imports of the removed helpers.

The core Node suite ran 87 tests: 82 passed, including every explorer test, and
five failed in aggregate-session validation/staging, application-layer cause
assertions, and operation emission. The removal does not change those production
paths. Browser and Studio typechecks could not run because their retained
`system-worker:lib` dependency failed in existing Worker explorer code, including
the removed `commands` schema field and missing Worker catalogue imports. These
checks need another run after the in-progress callback/catalogue work is repaired.

### Existing transaction boundary behavior

Outbox, fanout, and RPC encoding retain complete Causes as
implemented above. The existing makeTx still selects one failure from all-Fail
composite Causes and normalizes non-failure transaction body Causes to
`drizzle-transaction-failed`. This task does not change that transaction policy;
do not claim global defect/interruption preservation from profiler checks.

## Admission-only cleanup verification (2026-10-10)

Removed 150 other catalogues and 51 exclusive setup/scenario helpers. Retained
one self-contained admission catalogue and all 60 scenarios across 22 outcome
groups. Cases now supply plain input objects or storage Effects; removed the
separate fixture module, declarations service and mutable fixture callbacks. Fresh production
schemas, duplicate recovery, synchronous rollback and lazy-import checks remain.

`pnpm nx run-many -t ts lint explorer:check -p system-worker` passed in
`codex/admission-explorer`; lint reports existing production warnings outside the
changed files. The source import audit found no references to removed modules.
The admission-only cleanup has no remaining work. The items below concern the
separate production policy work retained from this plan.

## Remaining work

None under this archived plan.
