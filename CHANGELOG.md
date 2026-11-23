## 1.0.0-alpha.11 (2026-11-23)

- The System Worker package is now `@zerospin/system-worker`. Update direct imports and dependencies to the scoped name.

## 1.0.0-alpha.10 (2026-11-23)

### 🩹 Fixes

- Name Repo startup onRepoStartup and awaitStartup.

## 1.0.0-alpha.9 (2026-11-22)

- SystemRepo registers a SystemSpec and its executor pins atomically. Hosted Service queries and command delivery can resolve a later release without replacing the Instance StableWorker.
- ServiceChain owns the typed handle for original Service command delivery. Registered releases can replay retained history after a cold start.

## 1.0.0-alpha.8 (2026-11-22)

- Deployment verifies each new Aggregate or Service Worker by comparing its executing release declaration with the registered export evaluated in Node. Owner Workers run their authored release without a bundled SystemSpec.

## 1.0.0-alpha.7 (2026-11-22)

- Hosted Service history publication schedules Agent pulls and retries unacknowledged notifications.

## 1.0.0-alpha.6 (2026-11-22)

- ServiceChain stores the admitted Agent command fields in receipt columns and migrates existing receipts.

## 1.0.0-alpha.5 (2026-11-22)

- ServiceChain retains hosted Service Agent admission receipts across retries and history compaction.

## 1.0.0-alpha.4 (2026-11-22)

- Aggregate and Service executors report their executing identity through Workers RPC.
- Self-hosted deploys promote the SystemWorker before verifying its SystemSpec and owner bindings. An interrupted promotion can be reverified and resumed.

## 1.0.0-alpha.3 (2026-11-22)

- A ServiceVersionRepo executes the pending command delivered by its ServiceChain. If the Chain retries after losing the acknowledgement, the Repo compares the delivered input with its retained command and returns the committed result.
- Hosted Services can register their release history, await a command result, and prepare input for cross-release replay through the release-scoped binding.

## 1.0.0-alpha.2 (2026-11-21)

- Retain compatible handler builds when updating a hosted Service Worker. The Instance catalog assigns a build when execution starts and preserves that assignment through retries and command continuations.
- Allow a ServiceVersionRepo waking independently to register its schema and replay finalized history through a release-scoped binding.

## 1.0.0-alpha.1 (2026-11-21)

- Replace the private Drizzle ORM fork with upstream `drizzle-orm@1.0.0-rc.6` and adapt Zerospin’s SQLite drivers to the upstream API.

# 49.0.0 (2026-11-20)

### ⚠️  Breaking Changes

- Ship a generic SystemWorker with release-owned histories and register ordinary continuation contracts (MOR-490)

## 48.0.6 (2026-11-19)

### 🩹 Fixes

- Make the installed zerospin CLI executable through npm bin links

## 48.0.5 (2026-11-19)

### 🩹 Fixes

- Support shared local R2 and Worker service bindings in zerospin dev

## 48.0.4 (2026-11-19)

- The local package group combines the offline Node migrations with the React planner error handling previously shipped in 48.0.2.

## 48.0.3 (2026-11-19)

- Migrate connected Node command tables offline while preserving queued commands and an explicit push pause.
- Rebuild planner tables when a named index moves between them.
- After a verified local development clean, retire the old Node and reattach live tabs to the new producer.

## 48.0.2 (2026-11-19)

- Rebuild connected browser read tables from confirmed state while preserving offline commands and producer progress.
- Recognize both shipped Aggregate command-storage formats stamped SQLite version 24 and report pending work that requires its previous runtime.
- After an authenticated local development clean, open a fresh browser Node and keep the previous SQLite file and tab journals with their original history.

# 48.0.0 (2026-11-16)

### Breaking changes

- Remove framework Aggregate upload operations. Applications own file transport and asset lifecycle.
- Refuse incompatible retained upload declarations or Node upload requirements before migration; old pending upload journals are not drained.

## 47.1.0 (2026-11-16)

### Features

- Add Aggregate session UploadOperations with retained upload evidence and ordered recovery.
- Add Actor command failure handlers and command-specific outcome observation.

## 47.0.3 (2026-11-16)

### 🩹 Fixes

- Recover local browser Nodes after reset and clarify registered releases

## 47.0.2 (2026-11-15)

### Fixes

- Preserve command validation error codes while validating decoded JSON
  payloads without rerunning their transport transformations.

## 47.0.1 (2026-11-15)

### Fixes

- Decode defaults on fresh Aggregate session and System harness commands before
  evaluating their original and adapted payloads.
- Narrow ordinary contract callback command origins to ordinary commands.

# 47.0.0 (2026-11-15)

### Breaking changes

- Require the original command when directly evaluating a contract. Guards,
  programs, owner guards, and Aggregate extensions receive the decoded source
  command alongside the payload adapted for the executing release.

### Fixes

- Replay an Aggregate extension only when its originating release also declared
  one, without emitting new outbound work.

## 46.0.3 (2026-11-15)

### Fixes

- Include the latest System Worker Wrangler binding support.

## 46.0.2 (2026-11-15)

### Fixes

- Preserve unexpected SystemRepo RPC failures during storage preflight.

## 46.0.1 (2026-11-15)

### Documentation

- Update SDK guidance for recorded-command continuations and the storage cutover.

# 46.0.0 (2026-11-15)

### Features

- Retain recorded-command outcomes and run release-bound continuations.
- Add server-only aggregate contract extensions and continuation failure handlers.
- Require fresh System storage for the recorded-command delivery cutover.

## 45.0.2 (2026-11-15)

### 🩹 Fixes

- Preserve projected query inference across model unions

## 45.0.1 (2026-11-15)

### 🩹 Fixes

- Fix projected read DB helper typing and include native artifacts

# 45.0.0 (2026-11-15)

### ⚠️  Breaking Changes

- Require explicit contract read projections

## 44.0.3 (2026-11-13)

### 🩹 Fixes

- Support contract-scoped aggregate command sessions

### ❤️ Thank You

- Morgan

## 44.0.2 (2026-11-12)

- Add `ISessionModelRow` for typed browser session query rows.
- Report conflicting Core copies when the CLI rejects a project configuration.
- Embed TypeScript sources in package sourcemaps.

# 44.0.0 (2026-11-12)

### ⚠️  Breaking Changes

- Acknowledge Aggregate publication after Archive persistence. The new AggregateVersionChain storage layout requires fresh storage, and deployment preflight rejects pre-adoption catalogs.

## 43.1.4 (2026-11-11)

### 🩹 Fixes

- Allow down adapters to explicitly refuse replay with a typed sentinel

## 43.1.3 (2026-11-11)

### 🩹 Fixes

- Migrate the Studio button to Base UI and remove Radix Slot

### ❤️ Thank You

- Morgan @morgs32

## 43.1.2 (2026-11-11)

This was a version bump only, there were no code changes.

## 43.1.1 (2026-11-11)

### 🩹 Fixes

- Guide browser users to refresh when an Aggregate release is unavailable.

### ❤️ Thank You

- Morgan @morgs32

## 43.1.0 (2026-11-10)

### Features

- Add a native standalone Aggregate session that initializes offline and restores committed resources and pending commands from local SQLite.
- Publish the JavaScript entry and Swift package together as `@zerospin/native`.

## 43.0.2 (2026-11-06)

### 🩹 Fixes

- Allow managed connected session sign-out while loading, failed, disabled, or retired without deleting retained models.

## 43.0.1 (2026-11-06)

### 🩹 Fixes

- Expose occupied connected Node storage through session failures and verify durable reload recovery.

# 43.0.0 (2026-11-05)

### ⚠️ Breaking Changes

- Connected browser Node storage upgrades; first adoption requires old-runtime drainage and retirement

## 42.0.3 (2026-11-03)

### Fixes

- Expose `useClearSessionAuthentication(definition)` for ready React content to revoke remembered offline eligibility before identity-provider sign-out.

## 42.0.2 (2026-11-03)

### Fixes

- Reopen eligible exact Aggregate/Service identities while offline without waiting for online credentials.
- Keep offline synchronization local and reauthenticate before pending commands resume delivery.

## 42.0.1 (2026-11-03)

### Fixes

- Reuse fixed captured selections when deriving an Aggregate Actor release with
  the same query database, identity schema and selection objects. Contract-only
  updates no longer repeat selection compilation or capture callbacks.
- Recapture replacement selections and changed database or identity contexts,
  preserving validation and rejection behavior. Caller-owned query-option
  mutations do not redefine an inherited captured declaration.

### Documentation

- Document Actor selection inheritance and reconcile the completed capture plan
  and handoffs. Startup CPU and retained-memory savings remain unmeasured.

This patch changes no storage schema and performs no storage reset or deployment.

# 42.0.0 (2026-11-03)

### Breaking changes

- Replace AggregateChain's separate `admissionPosition` and `finalizedPosition`
  tables with one `commandProgress` row containing `singleton`,
  `admittedThroughIndex` and `finalizedThroughIndex`. Existing affected
  AggregateChain storage must be empty before activating this fixed schema.
  This release does not reset storage or provide a translation migration.

### Runtime guarantees

- Admission advances only `admittedThroughIndex` in the same synchronous
  transaction as the admitted command and producer checkpoint. Original
  `outcome` retention advances only `finalizedThroughIndex`, atomically with
  complete pending deliveries. Both fields survive history pruning and
  Durable Object eviction; a missing initialized row fails explicitly.

### Documentation

- Refresh storage-table audit findings, completed plan status, runtime workflow
  documentation, and guidance for existing local development URLs.

# 41.0.0 (2026-11-03)

### Breaking changes

- Report release-local contract support refusals consistently as
  `aggregate-contract-unsupported` or `service-contract-unsupported`, including
  missing ordinary version lineage and missing Actor exposure.

### Fixes

- Retain unsupported recorded external commands as failed replay outcomes after
  source declaration and input validation, allowing older releases to continue
  replay without repeating provider requests.

# 40.0.0 (2026-11-03)

### ⚠️ Breaking Changes

- Normalize SystemSpec model, Actor and Agent version registries to remove repeated definitions

# 39.0.0 (2026-11-03)

### Breaking changes

- Retain native declaration codecs and callbacks; compile portable metadata through
  `makeSystemSpec` instead of constructor `.spec` snapshots.
- Resolve session locks through selected native declarations using names, versions,
  and selected model/contract identities. Changed persisted schemas require empty
  affected storage; storage resets require explicit authorization.

### Features and fixes

- Report successful automatic standalone recovery resets through `onFailure`.
- Diagnose SharedWorker connection failures without exposing private failure text.
- Add `zerospin configure-agents-md` for strict consumer agent rules.
- Clarify declaration lineage, canonical promotion, and release retirement guidance.

## 38.2.2 (2026-11-02)

### Fixes

- Preserve failed Durable Object activation Causes as readable native Errors so Workerd retains encoded replay failure messages instead of reporting `#<Object>`.

## 38.2.1 (2026-11-02)

### Fixes

- Print readable escaping Worker failure Causes during synchronous initialization, invocations, and RPC encoding without changing public outcomes or cancellation behavior.

## 38.2.0 (2026-11-02)

### 🚀 Features

- Add external contract release upgrades with decoded continuation adapters and retained-evidence replay.

## 38.1.1 (2026-11-01)

### 🩹 Fixes

- Integrate the managed React-session implementation previously published in 38.0.1,
  restoring `SessionProvider`, `SessionReady`, `useSession`, and session ownership
  hooks alongside current SharedWorker discovery and Studio declaration views.

## 38.1.0 (2026-11-01)

### 🚀 Features

- Discover connected browser sessions in SharedWorker hosts.
- Add version-scoped declaration views in Studio and system diagrams.

## 37.1.0 (2026-10-30)

### 🚀 Features

- Recover connected browser sessions while preserving readable commands

## 37.0.2 (2026-10-30)

### 🩹 Fixes

- Decode Service command admission messages using their Node command ID and push index, matching the published producer.

## 37.0.1 (2026-10-28)

### 🩹 Fixes

- Retain refusals for unsupported commands in parallel aggregate and service releases.

# 37.0.0 (2026-10-27)

### ⚠️ Breaking Changes

- Remove connected Actor-session execution and its Node-less Actor command variants.
  Actor actions use synchronous session staging and ordered Node delivery;
  administrative SystemApi and Aggregate authorization execution remain supported.

  Replace scalar command origin with kind, rename continuation commands to external,
  and derive retained ticket principal identity from exact session locks.

  Derive ordinary contract inventory from explicit Actor, Agent and System grants;
  register external implementations separately and retain required portable grants.
  Replace standalone command constructors with typed administrative release/input
  methods and run named sequential seed programs with create-only behavior.

  Session staging returns ID-less submissions with non-reused Session positions.
  Nodes allocate canonical command IDs from producer coordinates and correlate
  handoff/coverage by Session coordinates. Admitting Chains persist logical and
  producer progress separately from command history. Node format is 22 and native
  replica format is 11; affected fixed-schema partitions require separately
  authorized empty storage before rollout.

  Direct System APIs reject caller IDs and allocate each invocation in the admitting
  Chain. Re-executing an Effect creates a new command; authored programs own repeated
  business attempts. Shopping retains bounded promotion retries and sequential
  create-only seeds, stopping at the first failure without rolling back prior commits.

- refactor: name actor and contract implementations as releases

  Canonical command envelopes and fixed command rows use `kind` with `external` replacing `continuation`. Retained affected storage must be empty before rollout; no compatibility decoder is provided.

### ❤️ Thank You

- Morgan Intrator @morgs32

# 36.0.0 (2026-10-25)

### ⚠️ Breaking Changes

- Combine Studio port/Portless improvements with direct retained execution outcomes on the current release line.

# 35.1.0 (2026-10-25)

### Features

- Add `zerospin studio --port`, validated `PORT` defaults, and public Portless URLs.
- Add independent Shopping and Tic-tac-toe Studio launchers with fixed ports.

### Current development line

- Publish the committed versioned Agent declaration and contract APIs together
  with Studio. Consumers must move their authored declarations to this release;
  older runtime declaration shapes are not adapted.

## 35.0.1 (2026-10-25)

### 🩹 Fixes

- Correct bundled Intent skill version metadata for the direct execution outcome release.

# 35.0.0 (2026-10-25)

### ⚠️ Breaking Changes

- Return retained ICommandOutcome directly from aggregate/service System execution and aggregate authorization; remove echoed execution receipts.

## 34.0.2 (2026-10-24)

### 🩹 Fixes

- Extract consumer testing and package ownership into Intent skills

## 34.0.1 (2026-10-23)

- Integrate clustered System Diagrams with HTML declaration cards, fixed version stacks, rectangular edge anchors and incident relationship highlighting.
- Preserve the ordinary-program command operation cutover from 34.0.0 while integrating accepted-definition schema cleanup and expanded Workerd admission, lifecycle, observer and native SystemApi verification.
- Align all eight bundled Intent skills with this exact release.

## 34.0.0 (2026-10-23)

### Breaking changes

- Ordinary aggregate and service contracts share one program for model, command and external operation descriptions. Browser staging applies only model operations; original canonical execution freezes outgoing work.
- Removed contract adapters, ServerContract types and execution tags. Command descriptors now bind pure owner definitions, explicit release versions and exact ordinary contracts.
- Added pure aggregate/service external definitions, with provider requests and continuations bound separately in backend implementations. Updated repository consumers and bundled authoring guidance.
- Adapter-only portable catalogue fields are removed. Affected fixed storage requires empty storage for this development cutover; this release does not perform a reset.

## 33.0.2 (2026-10-23)

Restore HTML declaration cards and their original styling, size version stacks and cluster outlines for cards, and attach arrowheads at rectangular card boundaries.

## 33.0.1 (2026-10-23)

Limit aggregate and service ownership edges to actors and agents. Clear incident highlights when the pointer leaves the graph.

# 33.0.0 (2026-10-23)

Replace the two system diagrams with one clustered Reagraph view. Require React and React DOM >=19 <19.3, retain fixed vertical versions, and reveal incident relationships on hover.

## 32.0.1 (2026-10-23)

### Features

- Expose `makeSystemSpec` and `ISystemSpec` from the SDK and document standalone system diagram pages.
- Include merged browser startup diagnostics and schema-backed framework error improvements.

# 32.0.0 (2026-10-23)

### ⚠️ Breaking Changes

- `makeSharedWorker` registers one `sessionDefinition`. Each session has its own worker entry. The worker name still selects aggregate, service, or standalone execution and must match that definition.

# 31.0.0 (2026-10-23)

### ⚠️ Breaking Changes

- Replace the SharedWorker factory with sharedWorkerUrl.

## 30.0.1 (2026-10-23)

Align aggregate admission's executeCommand input type with its existing four-field runtime schema. Callers supply command identity, contract version and payload; the runtime supplies externalOutcome and system provenance.

# 30.0.0 (2026-10-22)

### ⚠️ Breaking Changes

- Replace overloaded browser session construction with concrete connected, standalone and mock initializers; keep definitions separate from host wiring while retaining current typed SystemApi and startup fixes.

## 29.0.2 (2026-10-22)

- Keep commands staged by the first browser session view pending until the Node attachment is available. The existing reconnect wake resumes delivery without failing the session during subscription startup.

## 29.0.1 (2026-10-22)

- Align all eight packaged Intent skills' `library_version` metadata with the shipped release. The typed SystemApi implementation is unchanged from 29.0.0.

# 29.0.0 (2026-10-22)

- Share one typed SystemApi interface across HTTP and native acquisition; keep selection preparation, validation and mapping inside its administrative methods.
- Add `system-worker/getNativeSystemApi` and remove the exported `executeQuerySelectionRpc` helper and `ownerKind` discriminator.
- Use the existing local selection executor for in-process System harness reads.

# 27.0.0 (2026-10-22)

- Remove named service queries and AggregateSessionApi.executeServiceQuery.
- Add typed private SystemApi service reads and share typed selection mapping across administrative transports and the System harness.
- Migrate Shopping quote reads to canonical Product selections; service specifications require a hard cutover of affected catalogue storage.

## 26.0.2 (2026-10-21)

- Configure SQLite codecs explicitly in authored selections, contract reads, ordinary reads, and native/browser adapters after the rc.5 codec split. Preserve typed Date, Boolean, and JSON reads.

## 26.0.1 (2026-10-21)

- Capture canonical physical and query table references from the same database definition in RAW selection expressions.

# 26.0.0 (2026-10-21)

### Breaking changes

- Compare authored actor and agent selection definitions rather than generated SQL. Retain compiled SQL only for execution. Require empty affected catalogue and session state; provide no migration or compatibility path.
- Preserve canonical model/column references and identity placeholders in authored selection expressions. Reject unsupported executable values and noncanonical references.

### Fixes

- Flatten positive to-one ownership filters in the Drizzle SQLite compiler to avoid Workerd's expression-depth limit. Adapt SQLite proxy executors and contract filter types to the exact local rc.5 fork.
- Preserve findFirstOrThrow and current development-line row-subject removal.

## 25.0.1 (2026-10-21)

### 🩹 Fixes

- Preserve the concurrently published 24.0.2 findFirstOrThrow API in the row-subject hard cutover.

# 25.0.0 (2026-10-21)

### ⚠️ Breaking Changes

- Remove row-subject contracts and command resourceId. Keep business inputs in payloads and resourceId on operations; require empty affected storage.

## 24.0.2 (2026-10-21)

### 🩹 Fixes

- Restore findFirstOrThrow for required relational reads

## 24.0.1 (2026-10-21)

Correct published authoring guidance to use integer versions in browser sessions, Studio agent registries and System API queries. Refresh all eight Intent skill metadata versions. Runtime source and built artifacts are unchanged from 24.0.0.

# 24.0.0 (2026-10-21)

All Zerospin-authored versions and references now use positive safe integers. Exact declaration identity, numeric literal inference and explicit lineage remain; Repo configuration requires explicit key codecs and canonical decimal route segments. Commands, resources, sessions, accepted definitions and SQL version fields carry numbers. Old string-version wire messages and affected persisted state require a clean reset. Package and deployment/artifact versions retain their existing representations.

## 23.1.0 (2026-10-21)

### 🚀 Features

- Add findFirstOrThrow for required native and browser relational query results

# 23.0.0 (2026-10-21)

`makeServiceSessionDefinition` now requires, validates, and captures `systemName`, returning a complete frozen service definition with its literal system name preserved. Pass the system name inside the constructor rather than attaching it afterward. This is a breaking authoring API change; service locks, specs, and persistence identities retain their existing shape.

Browser-session guidance and Shopping examples use complete declarations and direct imports, preserving limited model exposure. No compatibility constructor or post-construction system-binding path remains.

## 22.0.2 (2026-10-21)

Browser session guidance now covers design and review, requires one complete pure session definition per file, and rejects exported props objects, shared declaration spreads, and server-derived browser declarations. Tab and SharedWorker imports point directly to the same definition.

# 22.0.1 (2026-10-21)

Ordinary contract upgrades now inherit omitted guards, programs, payloads,
claims, failures and result codecs. Model and operation bindings retain omitted
entries; supplied entries select the new declarations. Inherited callback types
retain their result and Effect requirements without consumer factories or casts.

Omitted `up` passes decoded values forward through destination validation.
Explicit transformations and reverse adapters keep their authored behavior.
Version lineage, retained commands and recorded model operations are preserved;
this release changes no persisted schema and performs no storage migration.

These inheritance defaults change the behavior of omitted upgrade properties.
Use execution-bound `db.models` and recording operations in inherited callbacks;
captured concrete model versions do not rebind themselves.

Verification runs were explicitly deferred. Published artifacts were generated
only for the requested release.

# 22.0.0 (2026-10-21)

Breaking React export rename: import `makeReactUI` from `@zerospin/react` in place of `createUI`. The source/deep-import module is now `makeReactUI`; the old export and module are removed. The pure session-definition input, provider component, attached `useSession()` hook and Initializer/MockInitializer behavior are unchanged. Adopt the fixed-group release and update callers together. No schema, protocol or storage change is required.

# 21.0.0 (2026-10-21)

Breaking scalar descriptor cutover: `Id` replaces the primary-key, foreign-key and reference kinds. Column roles use `primaryKey` and plain `references` metadata. `modelId` derives value identity from a stable model definition; `modelRef` adds a local relationship. Factories, descriptor inference and graph binding no longer need reference resolution or destination-table pointers.

Consumers must replace removed factories/types and adopt this fixed-group release together. Stored definitions and definition locks use the new descriptor representation; affected storage must be empty. There is no compatibility decoder or automatic reset.

## 20.1.2 (2026-10-21)

Model reference columns retain their prefixed ID and nullability types before
owner binding. Type-level reference resolution now uses the same logical model
identity as runtime binding when registry keys differ from model names.

Reconcile the development line with the published React initializer/UI split and
session layer fixes. All nineteen packages use one fixed version. Existing
storage and exact model/operation authority are unchanged.

## 20.1.1 (2026-10-21)

Restore complete Browser and React consumer skills and stamp all SDK skills with
the combined release version. Runtime and declaration artifacts match `20.1.0`.

## 20.1.0 (2026-10-21)

Add stable `modelRef` relationships while retaining the 20.0 React initializer/UI split and session layer fixes. References bind to the owner-selected model version through stable identity and key metadata, avoiding unrelated model and contract version cascades. Direct model and operation ownership checks remain exact.

Only package artifacts were built for publication. Tests, lint, consumer builds, and runtime verification were intentionally not run.

## 20.0.1 (2026-10-21)

Connected React initializers enforce bootstrap and replay service requirements
while preserving supplied layer services in callback sessions. Mock initializers
and browser factories require application layers when replay needs them and retain
their service types. Fragment documentation now covers separate initializers and
UI providers, explicit readiness, and the shared connected/mock composition.

# 20.0.0 (2026-10-20)

Breaking: React initialization and UI context are independent. Use standalone
`Initializer` or `MockInitializer` with a `{ session, isLoaded }` render callback,
then provide that session through the component returned by `createUI(definition)`.
Its attached `useSession()` hook reads context synchronously and throws without a
provider. The former React app factory, initializer members and readiness hook
are removed; session readiness no longer uses Suspense. Mock sessions construct
from pure declarations without connected worker, credentials or API wiring.

## 19.1.0 (2026-10-20)

- Add `modelRef` to SDK browser/server exports for relationships to stable model definitions.
- Bind reference edges to the selected owner graph with compatible key metadata, without cascading unrelated model/contract versions.
- Preserve exact direct model and operation ownership checks.

Tests, lint, consumer builds, and runtime verification were intentionally not run for this release.

# 19.0.0 (2026-10-20)

SharedWorker hosts release their Node, synchronization runtime, SQLite/VFS and
namespace lease when the last client leaves, then reopen lazily for later
clients. A document-owned lifetime lock detects abrupt client loss. The internal
port bootstrap protocol changes; adopt the fixed package group together.
Existing standalone storage identities and persisted data are unchanged.

# 18.0.0 (2026-10-20)

Standalone browser storage now includes the complete session-definition lock in
its database and namespace-lease identity. First adoption opens fresh seeded
partitions while preserving previous databases untouched. Runtime/build identity
and incidental claims remain outside the standalone storage key.

## 16.0.3 (2026-10-19)

### 🩹 Fixes

- Preserve immutable aggregate and service release output during replay without repeating external or destination work.

## 16.0.2 (2026-10-18)

- End the SharedWorker startup deadline after readiness so the socket timeout remains specific, retained and explicitly retryable.

## 16.0.1 (2026-10-18)

- Add explicit connected-session retry and a React error-view retry callback that awaits the failed owner's disposal before constructing a fresh session.
- Preserve retained Node storage and hard failures while reconnecting closed or timed-out transports.
- Retain WebSocket close diagnostics and process preceding protocol messages before publishing transport closure.

# 16.0.0 (2026-10-18)

### Breaking changes

- Add server-only recorded command operations bound to exact ordinary destination contracts and releases.
- Retain complete destination commands with original execution output and deliver them in source order through durable admission acknowledgement. Source replay does not allocate or dispatch destination commands.
- Replace fixed execution-output and Chain delivery schemas; use empty affected storage.

## 15.1.0 (2026-10-18)

### 🚀 Features

- Share router-independent error diagnostics with Next.js

## 15.0.2 (2026-10-18)

Publish the central parallel-models skill: after seed, model data is created or changed only by command execution or replay. Require all seven task skills to load it first, document the invariant in AGENTS.md, and correct the Browser worker example for Intent validation. Runtime and declaration implementations remain unchanged from 15.0.1.

## 15.0.1 (2026-10-18)

Correct session Definition terminology in the packaged Browser skill and current documentation. Align the Browser skill metadata with this patch release. Runtime and declaration implementations retain the 15.0.0 interfaces.

# 15.0.0 (2026-10-18)

### Breaking changes

Reusable ordinary session configuration now uses Definition constructors, types, import paths and application exports. Session construction, execution, worker registration and React integration use `sessionDefinition`. Superseded session Release APIs are removed. Domain releases and independently versioned Agent releases retain Release terminology.

Identity, authorization, session locks, storage formats and domain versions are unchanged by this terminology refactor.

# 14.0.0 (2026-10-17)

### ⚠️ Breaking Changes

- Clarify resource row and JSON codec APIs; preserve Date values through selection and projection encoding.

## 13.0.1 (2026-10-17)

### 🩹 Fixes

- Clarify server reachability when no remembered session identity matches

# 13.0.0 (2026-10-17)

### Breaking changes

- Replace `session.failures`, `SessionFailures` and `makeSessionNotificationLayer`
  with `session.reportFailure(...)` and lifecycle `status`/`failure` in the existing
  session store. Subscribe directly for new nonterminal refusal notifications.
- Fence failed sessions immediately and retain their first terminal error through
  cleanup; failed instances require a fresh owner. Preserve ordinary disposal,
  reinitialization and explicit offline recovery.
- Handle construction and descendant failures inside both React Initializers.
  Committed live-query failures stop their owning session immediately and render
  through its required `renderError`.

## 12.0.1 (2026-10-17)

### 🩹 Fixes

- Preserve service session contract names in generated declarations.

# 12.0.0 (2026-10-17)

### ⚠️ Breaking Changes

- Separate browser session declarations from executable SharedWorker bundles; normalize Node and session storage and expose authored model rows directly. Fixed schemas require empty affected storage.
- Require React initializer `renderError`, expose actor models through `exposedModels`, and use `stagingOutcome`, `outcome.result`, `dispositionChainHash`, and recorded `externalOutcome` consistently.
- Refresh all seven packaged consumer skills for the public 12.0.0 APIs.

### Fixes

- Validate retained external continuation authority before recording a release-local refusal when that release lacks the contract.
- Complete Node/session type boundaries, strict accepted-definition validation, and standalone model-row encoding.

## 11.1.0 (2026-10-14)

Add core's server-only `getSystemApi()` with Effect-provided URL and redacted
secret, independent administrative RPC contracts, and typed relational aggregate
reads. Reads catch up materialization, validate declared model alignment, and
reconstruct nested results locally after checking compiler and projection layout.

# 11.0.0 (2026-10-14)

### ⚠️ Breaking Changes

- Rename connected browser release factories to makeAggregateBrowserRelease and makeServiceBrowserRelease; remove the superseded browser exports.

# 10.0.0 (2026-10-14)

### ⚠️ Breaking Changes

- Move aggregate and service SharedWorker construction and worker assets into the browser package; remove authored connected worker callbacks.
- Include the packaged worker entry in the worker version hash so the URL cutover uses a distinct worker name and lifetime namespace.

## 9.1.0 (2026-10-13)

### Features

- Add seeded in-memory aggregate and service browser sessions through
  `makeMockBrowserSession`, retaining real local queries, aggregate optimism,
  application services, and owned cleanup.
- Add `App.MockInitializer` using the production app context, Suspense,
  ancestry checks, and React lifecycle ownership.
- Service mock submission rejects before staging; local validation remains real.

## 9.0.2 (2026-10-14)

### 🩹 Fixes

- Publish complete versioned consumer skills

## 9.0.1 (2026-10-14)

### 🩹 Fixes

- Ship versioned SDK consumer skills

# 9.0.0 (2026-10-13)

### ⚠️ Breaking Changes

- Automatically reset incompatible persistent browser Node storage and rebuild current authenticated or standalone baselines

# 8.0.0 (2026-10-13)

### ⚠️ Breaking Changes

- Rename generated backend Workers to `<system>-zerospin`; preserve existing Worker identity by renaming deployments and updating frontend backend URLs.

# 7.0.0 (2026-10-13)

### ⚠️ Breaking Changes

- Expose limited actor models, translate checked public output through canonical contract adapters, and replace browser finalization with private failures. Fixed schemas require empty affected storage.

## 6.0.2 (2026-10-13)

### 🩹 Fixes

- Record unsupported administrative replay as a per-version refusal without quarantining historical materializers.

## 6.0.1 (2026-10-13)

### 🩹 Fixes

- Correct the machine package installation example to use the current framework release.

# 6.0.0 (2026-10-13)

### Breaking changes

- Contract declarations name operation descriptors; program props receive matching recording methods. Programs return only their domain result. Checked evaluation continues returning `{ operations, result }` and retains the complete batch atomically.
- Model operation descriptors expose `.schema` and `.make`; external contracts expose `.asyncOperation`. Declarations derive `operationsSchema` for portable batch encoding and decoding. Standalone operation makers and async-schema factories are removed.
- Server evaluation runs its client exactly once before the extension program and injects the result through the client's version-specific `.execution` tag. Server operation maps declare additions, and evaluated batches include client operations first. Framework and authored consumers use the new interfaces.

## 5.0.1 (2026-10-12)

Complete synchronous continuations across Effect scheduler context changes before classifying suspension. Genuine asynchronous work still fences and rolls back synchronous transactions.

## 5.0.0 (2026-10-12)

### Breaking changes

- Contract programs return Effect operation batches with explicit operation schemas. Server contracts replace contract mappings and evaluate their public contracts directly.
- Async operations address concrete aggregate or service contracts and retain source-owned continuations.
- Framework Durable Object repositories use forward-only storage migrations. Changed fixed schemas require empty storage.

## 4.0.3 (2026-10-11)

### 🩹 Fixes

- Decode standalone retained JSON payloads before authored execution

## 4.0.2 (2026-10-11)

### 🩹 Fixes

- Use canonical actor command results and a single SQLite database type

## 4.0.1 (2026-10-11)

### 🩹 Fixes

- Fix empty standalone release requirements and worker layer typing

# 4.0.0 (2026-10-11)

### ⚠️ Breaking Changes

- Consolidate canonical results and selected views, enforce single admission transactions and recorded continuation authority, and give sessions and connections explicit lifetime owners. Remove retired SQL, log-stream and profiler APIs. Fixed schemas require fresh storage.

## 3.0.1 (2026-10-07)

### 🩹 Fixes

- Expose SystemWorker declaration files to installed TypeScript consumers while preserving its TypeScript runtime exports.

## 3.0.0 (2026-10-07)

All 19 distributable packages now share a 3.0.0 release baseline managed by Nx Release.

Extract primitive descriptors, table definitions, row inference, ID factories,
and Effect and Drizzle schema mappings into the standalone `@zerospin/shapes`
package. The moved modules are no longer exported from `@zerospin/core`; import
their public surface from the `@zerospin/shapes` package root.

Rename the primitive descriptor package to `@zerospin/shapes` and add
`@zerospin/react/primitives` with `ShapeForm`, `primitiveInputsMap`, and the
compiled `@zerospin/react/primitives.css` stylesheet. Shape forms validate
complete drafts through the existing Effect codec and submit decoded values.
