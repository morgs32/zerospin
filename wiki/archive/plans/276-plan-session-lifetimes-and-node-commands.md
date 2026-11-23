# Plan 276: One session lifetime and one Node command through its lifecycle

**Date:** 2026-10-26

**Status:** Completed and verified on 2026-10-27 on
`codex/session-lifetimes-node-commands`, stacked on PR 91 at `917a177788`.
Replaces the pasted Plan 274 and the subsequent chat draft.
The maintainer approved including the shared lifetime replacement and permits
public API redesign. This revision incorporates the agreed flat command shape.
This is the same session plan approved as Plan 274 in chat; upstream independently used 274 and 275 before this branch was created.

**Stack:** Implement in an isolated worktree on the completed branch from
`codex://threads/01a17a94-530b-7673-8c01-51a99a2aa969` ("Check AAVC and SAVC
command chains"). The maintainer's latest instruction authorizes committing,
pushing and opening the stacked PR; it supersedes the original no-commit
boundary. It does not authorize storage resets, publication or deployment.

**Baseline:** Initially reviewed against `e675756969`; implementation starts from PR 91 at `917a1777883975d4eddb8759a9cbcfd7f4e90bd5`. Preserve unrelated changes present
when implementation starts. Plan 234 retains its separate remaining obligations.

## 1. Responsibilities and construction

Build around one stable session, successive disposable lifetimes, one replica per
lifetime and its concrete connection:

- The session lifetime owns execution, initialization, cancellation and cleanup.
- The session replica owns synchronous staging, ordered handoff, Node-view
  installation and originating-command failure observation.
- The concrete connection owns transport, authentication, attachment replacement
  and reconnection.

Keep `makeConnectedAggregateSession`, `makeConnectedServiceSession` and
`makeStandaloneAggregateSession`. Their required inputs and capabilities differ;
a generic family/mode constructor would obscure those differences. Preserve the
existing public staging results, connected authentication controls and Standalone
reset behavior.

Each constructor composes its initialization in this order:

```ts
const connection = makeConnectedAggregateConnection(connectionProps);
const replica =
  yield *
  openAggregateSessionReplica({
    ...replicaProps,
    connection,
  });
yield * connection.start(replica);
```

1. Provide concrete Connected Aggregate, Connected Service and Standalone
   Aggregate connection constructors. Construction is synchronous and cold: no
   credentials acquisition, RPC stubs, listeners, ports or timers.
2. `openAggregateSessionReplica` and its Service equivalent compose database
   acquisition, receiver, handoff, failure observation, command preparation and
   subscriptions within the lifetime resource Scope. Return the replica's
   receiving methods and pending-command reader directly. Keep the focused
   database openers used by Mock sessions.
3. Pass the actual connection to the replica under a narrow family-specific
   structural interface exposing staged-command attachment acquisition and a
   captured currentness check. Do not construct a second capabilities object.
   Replica interfaces must not depend on a concrete connector's function type.
4. `connection.start(replica)` is the sole connection activation operation. It
   returns a scoped Effect, registers cleanup before transport acquisition, and
   completes after the first coherent view is installed and handoff is available.
   Start once per connection; automatic reconnection stays inside that connection.
5. The replica supplies pending commands, view installation, reset, state,
   attachment readiness and connection-failure observation. Rename the existing
   receiver `reconnect()` callback to `attachmentReady()` because it only refreshes
   and wakes handoff. Commands staged synchronously during first-view publication
   wait until the attachment is available.
6. Connected authentication and push controls belong to the connected connection;
   constructors adapt them to public methods and devtools encoding. Standalone
   uses its own attachment interface without backend credentials or admission.
   Remove its unused public attachment snapshot/push/pause/resume/authentication
   facade methods and their exclusive procedures; retain private generation
   checks, automatic command draining and explicit reset behavior.
7. Delete the two bootstrap functions and their package exports,
   `standaloneConnector`, connector injection parameters and connected-interface
   impersonation. Add no bind phase, synchronization owner, `.callbacks` envelope,
   forwarding-only acquisition/start helper, optional-method protocol or mode flag.

## 2. One command representation across handoff, retention and recovery

Use `IAggregateNodeCommand` / `AggregateNodeCommandSchema` and
`IServiceNodeCommand` / `ServiceNodeCommandSchema` for the same commands throughout
their Node lifecycle. Put `nodeId`, `nodeIndex` and `pushIndex` flat on the command.
Do not introduce `INodeCommandRequest`, a recovery command, a command envelope or
a nested `position`.

### Content and allocation

The prerequisite stack now identifies local submissions with `sessionId` and
`sessionIndex`; AggregateNode/ServiceNode construct the canonical command ID from
`nodeId` and `pushIndex`. Preserve that accepted identity design. This replaces the
older plan's assumptions about preallocated IDs and partial acknowledgements.

- Derive immutable command fields and primitive constraints from canonical encoded
  Actor schemas, with `sessionId`, `sessionIndex` and required encoded staging
  evidence. Service version remains definition-bound; retain Aggregate identity.
- Use the same family Node command directly before and after retention. Keep
  `id`, `nodeId`, `nodeIndex` and `pushIndex` flat. Before allocation is known all
  four are null; once known all four are present with nonempty Node identity,
  positive safe indices and the canonical ID derived by `makeNodeCommandId`.
  Reject partial or contradictory allocation. Add no lifecycle tag or generic
  lifecycle parameter. A canonical admitted Actor command still requires its
  actual nonnull canonical ID and complete producer provenance.
- Null means **unknown to this holder**, not proof that AggregateNode/ServiceNode
  has not retained the command. Lost-ack recovery supplies the same command with
  unknown allocation. Immutable equality excludes all four allocation fields;
  compare supplied known allocation independently with retained facts.
- Preserve the prerequisite acknowledgement exactly:
  `{ sessionId, sessionIndex, nodeId, nodeIndex, pushIndex }`. Its complete Node
  allocation determines the canonical ID through `makeNodeCommandId`; use the
  retained coordinates rather than allocating a new identity. Do not add an ID
  column, duplicate identity storage or a new acknowledgement field.
- Snapshot/subscription options contain arrays of commands directly. Attachment
  interests retain commands directly and update their known flat allocation on
  acknowledgement. Preserve local submission-key correlation until allocation.
- AggregateNode/ServiceNode alone allocate producer coordinates. Supplied known
  allocation must match an existing retained original; reject invented allocation
  when no original exists. Preserve exact retry and captured-prefix checks.

### Remove lifecycle aliases and conversion chains

1. Remove `IAggregateNodeCommandInput`, `IServiceNodeCommandInput`,
   `IAggregateStagedCommand`, `IServiceStagedCommand` and the superseded input-schema
   definitions after migrating their callers. Do not replace them with Input,
   Staged, Retained, Recovery or Prepared aliases for the same command.
2. Readers and methods requiring complete allocation expose an inline refinement
   of the family command type requiring nonnull `id`, `nodeId`, `nodeIndex` and
   `pushIndex`. Derive validation from the same field declarations. Preserve
   static guarantees at canonical Actor construction and Node dispatch without
   exporting another command category or duplicating its schema.
3. Reconstruct Node commands directly from local rows and the bound declaration.
   Remove the Aggregate preparation round trip through `SessionCommandSchema`
   encoding, field stripping and a second command representation. Derive public
   session result schemas from shared content where appropriate; do not use them
   as an intermediate transport format.
4. Rename raw Node SQLite selection types to `IAggregateNodeCommandRow` and
   `IServiceNodeCommandRow`. A normalized original/final storage row is not a
   complete command. Retain row reconstruction and corruption checks.

### Validate each fact at its receiving interface

- Command-page and subscription APIs decode before mutating attachment interests.
  Typed Core procedures do not repeat those structural decodes. Preserve Node
  identity, contract membership/version, exact retry and generation checks.
- Decode owned command coverage once in each replica receiver before installation.
  Keep coverage compact and flat: missing coordinates require `resolution: null`;
  retained coordinates allow the existing family-specific resolution. Preserve
  coverage completeness/uniqueness, identity, captured-prefix, checkpoint,
  resolution consistency and prior-coordinate checks in the installer.
- Reconstruct local SQLite coordinates through the shared field constraints;
  corrupt half-present stored coordinates remain an error. Decode reconstructed
  Node commands after SQL phase and contract checks; validate final-row positions
  consistently as well.
- Cut Browser, Core, Standalone, Native and affected existing examples over
  together. Full immutable commands remain private to their attachment's own
  interests; views expose compact owned coverage, never other tabs' commands.

No SQL layout or stored JSON representation changes are planned. Service Actor
and session names tighten to the canonical nonempty constraints. Reject invalid
data directly; introduce no fallback decoder or preservation path for invalid rows.

## 3. Direct lifetime ownership and remaining wrapper cleanup

Replace the shared lifecycle machine, supervisor runtime, Actor, handle stream
and state modules. Remove Browser's resulting unused machine dependency.

1. Each disposable lifetime owns one lazy application runtime, one abort
   controller, a parallel execution Scope, a sequential resource Scope,
   initialization completion and shared disposal completion. Start no idle
   supervisor or monitoring fiber.
2. Reserve initialization synchronously before invoking application code. Reject
   a second initialization on the open lifetime with `session-already-mounted`.
   Run initialization through the execution adapter with its resource Scope;
   resolve only on successful completion while the lifetime is active.
3. Retirement and disposal synchronously revoke capability and abort exactly once.
   Install the shared disposal promise before callbacks so reentrant disposal
   joins it. Defer asynchronous cleanup by one microtask to allow native
   execution roots to finish enrollment.
4. Interrupt/join initialization, close execution work, close resources
   sequentially, then dispose the application runtime. Connection cleanup precedes
   replica subscriptions/handoff cleanup, which precede database closure. Attempt
   every phase despite failures; retain the first cleanup failure and settle
   disposal only after all phases finish. Preserve the original terminal error.
5. Startup failure rejects initialization through the existing failure mechanism
   and begins shared cleanup. Disposal rejects pending initialization immediately.
   Late startup and retired callbacks cannot restore readiness.
6. Keep the stable lifecycle facade: React remount needs to select a new
   disposable lifetime after the previous one closes. Queued replacement waits
   for successful cleanup and rechecks terminal failure/reservation identity.
   Disposal cancels it; terminal failure or failed cleanup prohibits replacement.
7. Apply this lifetime owner to producer sessions, Mock Aggregate/Service sessions
   and the browser Agent host. Keep `makeSessionLifetimeExecution`: native root
   enrollment and asynchronous cleanup from suspended `runSync` must finish
   before resource closure.

Remove the other demonstrated shallow wrappers in this area:

- Specialize the Browser/Native staged-command subscriber and handoff to
  `readonly INodeRetention[]`; remove their arbitrary acknowledgement generic.
  Decode acknowledgements before coordinate writes. Keep family command/row and
  execution-environment parameters that represent actual variation, and leave
  shared Core delivery generic.
- Remove the handoff's unused returned `name` and its `pending = () =>
readPending()` forwarding closure. Preserve its idempotent explicit disposal
  and retention waiter: Native calls both. Rename `waitFor` to
  `waitForRetention`, which waits for Node retention, not canonical execution.
- Remove the unused failure-observer `observeAdmissionFailure` forwarding method;
  originating admission refusals already enter through `observeNodeState`.
  Preserve the independent observed-ID set so pending refused commands cannot
  re-arm notifications after their originating-command entries are consumed.

Do not collapse genuinely different facts while removing aliases:

- A retention acknowledgement proves coordinates. Coverage describes one captured
  view's treatment of an owned command. Neither is another full command category.
- Public staging results carry decoded authored results and local session
  metadata; Node transport carries encoded immutable staging evidence. Preserve
  public results and local bookkeeping without copying their field declarations.
- The stable session facade, a disposable lifetime and its revocable ready binding
  have different responsibilities. Preserve readiness/current-binding checks
  without creating another session object merely to forward the same methods.
- Canonical admitted commands, selected exposure, staging evidence and canonical
  `outcome` remain distinct facts with their existing authority and privacy rules.

## 4. Verification and completion

Extend existing Browser authentication/network suites and Core recovery/staging
suites with existing declarations and inline mocks. Create no test files,
fixtures, runners or configuration. Keep the smallest meaningful cases proving:

1. First-view staging reaches Node retention; Standalone initializes without
   backend admission. Initial and repeated handoff/recovery use the same flat
   command, including lost-ack recovery with unknown allocation.
2. Invalid field combinations, fabricated allocation, changed known allocation
   and conflicting immutable input fail before mutation. A session with unknown allocation recovers an already-retained command without
   a second append; a known allocation must preserve its derived canonical ID.
3. Cancellation and reentrant disposal revoke capability immediately and close
   resources once, in order, including asynchronous execution finalizers.
4. Reinitialization waits for cleanup; cancellation prevents queued replacement;
   late startup cannot restore readiness. Exercise producer, Mock and Agent host
   callers of the shared lifetime.
5. Replacement fences obsolete publication/acknowledgement, including replacement
   on a reused attachment. Credential refresh cannot change bound identity.
   Preserve coherent overlay transfer, originating failure observation, staging
   rollback and Native retention waiting.

Run one explicit Nx graph with normal dependencies:

```sh
NX_NO_CLOUD=true pnpm nx run-many \
  --projects=@zerospin/core,@zerospin/browser,@zerospin/native,@zerospin/react,@zerospin/sdk \
  --targets=lib,build,ts,lint --parallel=1
```

Then run the existing scoped test command:

```sh
NX_NO_CLOUD=true pnpm nx run zerospin:test -- \
  packages/core/tests packages/browser/tests \
  --project node --maxWorkers=2
```

Check scoped formatting, removed imports/exports and documentation/source links.
Update Fragment developer guidance and architecture ownership/lifecycle docs;
reconcile qualifying glossary/ADR changes after implementation. Record actual
results and archive only after required implementation and verification pass.

**Boundaries:** Preserve synchronous staging transactions, immutable staging
evidence, Node retention durability, canonical `outcome`, `serviceIndex` and
`dispositionChainHash`. No browser execution API, submit/wait replacement, public
outcome observer, extra queue, admission-identity redesign, acknowledgement
extension, compatibility aliases or migrations. No storage resets, Explorer
verification, package publication or deployment.

## Implementation and verification results

- Replaced both bootstraps and the Standalone connector adapter with cold concrete
  connections and complete replicas; removed the lifecycle machine, supervisor,
  state files and Browser's machine dependency/project reference.
- Unified each family's Node command across allocation, handoff and recovery,
  preserving PR 91's local submission identity, complete retention acknowledgement
  and derived canonical ID. No SQL layout, stored JSON format or storage-version
  changes were made.
- The final scoped Nx graph passed all 18 tasks with normal dependencies. It ran
  serially to prevent React lint from reading Core output while Core's build
  cleaned it. Existing warnings remain in untouched files; changed files have no
  lint warnings.
- Full test-program compilation and 26 tests across five existing Core/Browser
  files passed. Evidence covers allocation/recovery, early handoff, retired
  acknowledgements, cold construction, scoped startup cancellation, reentrant
  disposal, suspended execution cleanup, failure precedence, queued replacement,
  and Mock/Agent host reuse. Runtime evidence is headless.
- Shared example-based lifecycle/composition cases live in the existing Core
  suites under their established source-import allowance. No lint/test
  configuration, test files or fixture files were added or changed.
- Offline frozen install, changed-file formatting, whitespace checks and added
  documentation-link/source-range checks passed. Updated Fragment, architecture
  and glossary explanations describe the implemented ownership and command facts.
- No runtime storage reset, deployment, package publication or Explorer
  verification was performed. Plan 234 remains separately active.

## PR 93 follow-up review — 2026-10-27

- Rebased the feature onto main at `41c94bb7daa02a61e612ce7617c7d82a303f1d83`
  after its prerequisite stack merged. Preserved main's subscriber delivery-epoch
  fences and existing allocator, history, publication and recovery regressions;
  migrated their command fixtures to the flat command shape.
- Removed handwritten coverage and resolution declarations in favor of the
  definitive schemas. Known allocation now narrows the existing command union
  with `Extract`, rather than redeclaring its four allocation fields.
- Centralized immutable-content and shared-known-allocation comparison in
  `assertSameNodeCommand`. Removed redundant connection startup flags and queued
  initialization cancellation state; the pending completion itself supplies the
  replacement identity fence, without an extra request wrapper or type.
- `makeSessionCommandHandoff` checks attachment currentness before decoding
  acknowledgement content and discards failures from retired delivery pages
  before reporting failure or rejecting replacement waiters. Existing regression
  scenarios failed before each fix and passed afterward, including a rejected
  retired transport followed by successful replacement retention.
- Independent command/recovery and lifetime/composition deep reviews, followed by
  review of their fixes, left no actionable findings. SQL rows, coverage,
  retention acknowledgements, decoded public staging results and subscriber
  capabilities retain their distinct responsibilities.
- The final scoped Nx graph passed all 18 tasks. Full test-program compilation
  and all 38 Core/Browser tests across 11 existing files passed. Offline frozen
  install, formatting, whitespace and affected documentation-link/source-citation
  checks passed. Existing lint warnings remain confined to untouched files.
  Runtime evidence remains headless.

## Remaining work

None.
