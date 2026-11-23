# Synchronous staged-command journal and recovery

**Status:** Complete; implemented and verified on `codex/staged-command-journal`.
**Date:** 2026-10-27.
**Inspection base:** `0579a08926`; source inspected locally. Existing unrelated
planning edits are outside this work.
**Implementation base:** `6b741b1317bbff197ca8df7f199b9c8f40e2b37b`;
rebased onto `5e04a608bd` before the final passing Nx checks.

## Later maintenance — 2026-11-03

1. Removed the stale active duplicate, which incorrectly described this completed work as unimplemented. This archived document remains the completion record.
2. Later PR #107 removed the transaction `onCommit` hook. Current staging invokes the journal callback after the SQL transaction returns and before the staging call returns; committed-table observers may run first. Earlier observer-order verification below describes its historical source revision, not a current ordering guarantee. The current lifecycle documentation and glossary state the later behavior.
3. This cleanup changes documentation only; no runtime checks were rerun.

## Problem and agreed behavior

1. Connected browser Aggregate and Service sessions stage commands into an
   in-memory SQLite replica. Staging returns synchronously, while
   `makeSessionCommandHandoff` asynchronously delivers commands to `AggregateNode`
   or `ServiceNode` in the SharedWorker. Closing the browser before Node retention
   commits can lose a successfully staged command.
2. Add a best-effort localStorage journal written synchronously after successful
   local staging commits and before that staging call returns. On a later
   initialization with the same authenticated Node identity, recover unacknowledged
   commands through the existing Node retention path.
3. **Settled failure policy:** if localStorage access, encoding, writing, reading,
   or deletion fails, preserve today's staging and delivery behavior. A journal
   failure must not reject a committed command, roll back optimism, fail session
   initialization, or prevent normal handoff. The journal improves ordinary
   browser-close recovery; it does not promise physical disk flush or recovery
   after storage eviction, clearing, or Node replacement.
4. Deliver the original encoded command. Preserve `sessionId`, `sessionIndex`,
   payload, contract version, claims, and `stagingOutcome`, including the captured
   result and time. Do not invoke public staging to recover a command, allocate
   replacement submission coordinates, or rerun payload construction.
5. Delete an entry only after validated durable Node retention acknowledgement.
   This is distinct from server admission, execution commit, dispatch
   acknowledgement, and retained `outcome`. Do not wait for server execution to
   clean up this browser handoff journal.

## Current source and implementation seams

1. [`stageAggregateSessionCommand`](../../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts)
   runs [`stageSessionCommandTx`](../../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts)
   synchronously. The transaction commits optimism, advances `sessionIndex`, and
   inserts the local command row together. Rejected staging leaves no committed
   row to journal.
2. [`openAggregateReplica`](../../../packages/browser/src/sessionReplica/openAggregateReplica.ts)
   creates an in-memory database.
   [`openAggregateSessionReplica`](../../../packages/browser/src/sessionReplica/openAggregateSessionReplica.ts)
   and [`openServiceSessionReplica`](../../../packages/browser/src/sessionReplica/openServiceSessionReplica.ts)
   subscribe to committed command-table changes and wake the handoff queue.
3. [`makeCommitObservation`](../../../packages/core/src/drizzle/makeCommitObservation.ts)
   and [`makeInMemorySQLite3`](../../../packages/core/src/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts)
   flush committed-table notifications after transactions settle, but suppress
   nested flushing while listeners run. A synchronous store listener can stage
   another command and return before that command's notification is delivered.
   Consequently, table observation cannot provide the required per-call journal
   guarantee. The staging-only `makeTx.onCommit` callback runs in
   `SqliteSession.transaction` immediately after SQL COMMIT and before committed
   observers. Transactions without a callback retain their ordinary notification
   semantics; native SQLite update/commit hooks remain unchanged.
4. [`makeSessionCommandHandoff`](../../../packages/browser/src/outbox/makeSessionCommandHandoff.ts)
   handles the live replica queue and acknowledges retention through the current
   replica receiver. Its current bookkeeping uses `sessionIndex` because it owns
   one session. It must not be reused unchanged for old sessions' commands.
5. Connected session constructors allocate a fresh `sessionId` on each
   initialization. Replica receiver coordinate installation accepts only its
   current session. Recovery therefore delivers old-session commands separately
   from current-session row installation.
6. [`acceptAggregateOriginalTx`](../../../packages/core/src/AggregateNode/acceptAggregateOriginalTx.ts)
   and the Service equivalent compare exact retries by original
   `{ sessionId, sessionIndex }` before allocating Node positions. Existing
   staged-command subscribers already accept those complete Node commands.
   Reuse them; add no server endpoint or second admission mechanism.
7. Staged-command subscribers also register offered commands as attachment
   interests, so subsequent Node snapshots include their `commandCoverage`.
   [`installAggregateNodeView`](../../../packages/core/src/aggregateSession/installAggregateNodeView.ts)
   and [`installServiceNodeView`](../../../packages/core/src/serviceSession/installServiceNodeView.ts)
   require every coverage entry to belong to a current-session command row.
   Browser replica receivers must validate and partition recovered-session
   coverage before calling these unchanged installers.

## Journal ownership and format

1. Own the journal in `packages/browser`. Provide explicit Aggregate and Service
   entry points with their existing command schemas; share only the small
   localStorage mechanics and recovery delivery procedure. Do not add `ownerKind`
   or another property that recreates that domain switch.
2. Scope keys by an explicit Aggregate/Service prefix, the existing
   `sessionKey(identity)` hash, the original `nodeId`, `sessionId`, and
   `sessionIndex`. The identity hash includes backend/application selection,
   release/definition identity, resource selection, and verified claims. Obtain
   and cache this hash during asynchronous initialization, before publishing a
   stageable initialized session. No asynchronous hash runs inside staging.
3. Capture the exact authenticated identity and `nodeId` from the validated Node
   snapshot. Never derive the scope from requested credentials alone, and never
   store credentials, authentication tokens, or capabilities in the journal.
   The encoded command necessarily retains its original claims and payload.
4. Store one immutable JSON entry per submission containing the complete
   unallocated `IAggregateNodeCommand` or `IServiceNodeCommand`. `id`, `nodeId`,
   `nodeIndex`, and `pushIndex` inside that original command remain null; the
   storage key's `nodeId` identifies the Node incarnation allowed to retain it.
   Read using the existing strict command schema and verify the key coordinates
   against the decoded value. Use one current format, without fallback decoders,
   migrations, alternate fields, or compatibility aliases.
5. Use `setItem` and `removeItem` per entry. Do not maintain a shared array,
   mutable manifest, persisted recovery cursor, or read-modify-write collection.
   Independent tabs must not overwrite one another's pending commands.
6. Preserve entry bytes after writing. Only the successful staging callback
   creates an entry; snapshots, replay, table notifications, and acknowledgements
   never create or rewrite one. A deletion failure cannot cause an acknowledged
   command to be journaled again by another observation path.
7. Retain entries until Node acknowledgement. Disposing a session or closing a
   tab does not delete them. Sign-out suspends recovery; signing back into the
   exact same identity may resume it. A different identity or definition never
   consumes those entries. Do not clear unrelated localStorage data.
8. Bind recovery to the original `nodeId` as well as identity. A stale entry left
   by failed deletion must not be submitted to a newly created Node that lacks
   the original deduplication history. Leave unmatched entries inert; no storage
   reset, garbage-collection feature, or cross-incarnation recovery is in scope.

## Synchronous write and acknowledgement

1. Require an explicit synchronous post-commit staging callback for connected
   Aggregate and Service sessions. Bind the Aggregate callback to its initialized
   capability and forward it through `stageAggregateSessionCommand` to
   `stageSessionCommandTx`. Supply the Service callback through
   `bindServiceReplicaCommands` to `stageServiceSessionCommandTx`. Core owns the
   callback invocation boundary through `makeTx.onCommit` and
   `SqliteSession.transaction`; the browser owns its localStorage implementation.
2. Capture the complete encoded original alongside the staging transaction's
   internal result. Immediately after SQL COMMIT and before committed-table
   publication, invoke the callback exactly once on the staging call's stack,
   before returning the existing public staging
   result. Supply that encoded original directly, including original Session
   coordinates and `stagingOutcome`; do not reconstruct it from a later snapshot
   or scan all pending rows. Keep public staging return shapes unchanged.
3. The callback uses its captured authenticated identity and original `nodeId`
   scope, encodes JSON, and calls `localStorage.setItem` synchronously. Invoke it
   only after successful commit, outside the SQLite transaction and native hooks;
   rollback/rejection, snapshot installation, and replay never invoke it. Nested
   staging from a synchronous observer runs its own callback before its own
   staging call returns, even while the outer table-notification flush is active.
   The outer command is journaled before its observers can stage the inner
   command, preserving per-session write order for other tabs scanning storage.
   Keep existing table observers for handoff/progress publication only. Do not
   debounce, schedule a microtask, wait for unload, or await SharedWorker RPC.
4. Guard localStorage property access as well as each operation. Catch journal
   failures inside this best-effort boundary and continue the original handoff.
   Do not route storage exceptions through terminal session failure reporting.
   Isolate callback exceptions after commit so they cannot alter staging results.
   No new public status, persistent retry counter, or notification UI is needed.
5. Validate live retention acknowledgements against the offered submission and
   current attachment's `nodeId`. Keep current replica coordinate installation
   unchanged. After it succeeds, attempt deletion of the matching journal entry.
   Snapshot coverage proving the same command's Node retention may also clean
   up its entry after the existing exact coverage validation.

## Recovery delivery

1. After authenticated identity and `nodeId` are validated and replay readiness
   permits Node staging, snapshot the matching journal keys. Read entries
   individually so a malformed entry cannot hide valid entries. Ignore and
   retain malformed or mismatched entries; a scan/access failure leaves ordinary
   live handoff working. Recovery never rewrites entries under a new identity.
2. Exclude the current session's commands from this recovery scan; its existing
   replica queue owns them. For old sessions, group by original `sessionId` and
   deliver in ascending `sessionIndex`. There is no new cross-session total
   order. Preserve ordering within each recovered session.
3. Serialize recovery delivery ahead of ordinary live handoff for this
   attachment, without blocking synchronous staging. New local commands can
   continue staging and journaling while recovery waits. A failed journal read
   or an invalid entry must not wedge the ordinary handoff queue.
4. Use the existing `stagedCommandAttachment(nodeId)` subscriber and
   `makeOutboxDelivery` transport behavior. A focused recovery procedure owns
   old-session entries; it does not insert them into the current replica's
   command table or pass their acknowledgements to `retainCoordinates`.
   Reuse the existing Node commit, synchronization push, and snapshot publication.
5. Validate every returned `INodeRetention`: original `sessionId` and
   `sessionIndex`, expected `nodeId`, and valid Node allocation. An unrelated,
   empty, malformed, stale-attachment, or partial response cannot delete an
   unacknowledged entry. Deliver one command per page to keep this boundary small.
6. After validated retention, retire the entry from this drain's in-memory
   worklist and attempt entry deletion. Failed deletion must not cause repeated
   delivery within the same drain or block ordinary live handoff. If the browser
   closes
   after Node commit but before deletion, reopening resends the identical
   original. Exact Node deduplication returns its existing allocation.
7. Multiple tabs may recover the same original concurrently. The Node's existing
   serialized transactional retention provides deduplication; both tabs can
   delete the same entry after valid acknowledgement. Add no leader election or
   localStorage lease. Within one tab, share the recovery drain per exact Node
   scope so sibling initialized sessions do not launch redundant drains.
8. Fence recovery by lifecycle, authenticated identity, and attachment generation.
   Abort on dispose/sign-out/Node replacement. Wake transport retries through
   existing reconnect/readiness events. Do not spin on storage exceptions. Leave
   an entry on transport uncertainty or Node refusal; defer that session's later
   entries and allow unrelated sessions and ordinary live handoff to proceed.
9. Recovered optimism reaches the new session through normal Node command
   materialization and snapshots. Do not restore resource rows directly from
   localStorage or reexecute public staging. Before Node retention succeeds,
   recovered commands do not appear as new-session optimism.
10. Before calling the subscriber, register each recovered command with the
    browser receiver's recovery-coverage validator and failure observer under
    its original `{ sessionId, sessionIndex }`. Node retention can publish a
    snapshot before the retention response arrives. Keep validation metadata for
    the attachment lifetime, including terminal resolution markers, so already
    captured or repeated coverage remains recognizable after journal deletion.
    Keep unresolved recovered interests, including known canonical allocations,
    in reconnect subscription inputs until terminal resolution so a same-Node
    reconnect does not lose later failure observation.
    Preserve command failure reporting without allocating new Session coordinates.

## Recovered-command snapshot coverage

1. In `makeAggregateReplicaReceiver` and `makeServiceReplicaReceiver`, strictly
   decode coverage and validate the snapshot's authenticated identity, Node
   incarnation, and checkpoint before partitioning. Use full
   `{ sessionId, sessionIndex }` keys; two sessions can have the same local index.
2. Pass current-session coverage to the existing core installer with the rest of
   the snapshot unchanged. Route foreign-session coverage only when its full key
   matches a registered recovered command for this attachment. Reject unknown
   foreign-session coverage and duplicate keys; never silently filter all foreign
   sessions or weaken the core installer's current-row checks.
3. Validate recovered coverage against the registered command: command name,
   original coordinates, expected `nodeId`, allocation consistency across replies
   and snapshots, and `nodeIndex <= snapshot.nodeIndex`. Validate any resolution's
   ID against `makeNodeCommandId(nodeId, pushIndex)`, its command name against the
   original, and its `aggregateIndex` or `serviceIndex` against the snapshot's
   materialization checkpoint. Repeated resolutions must agree. Coverage with
   null allocation and null resolution proves no retention and cannot delete an
   entry.
4. Prepare recovered acknowledgement and failure-observation effects separately.
   Apply them only after current-session snapshot installation succeeds and the
   attachment/lifetime fence remains current. Validated allocation coverage may
   retire the recovery work item and attempt journal cleanup even if the direct
   retention response was lost. Resolution coverage feeds the existing failure
   observer with the acknowledged canonical command ID, without looking up or
   updating an unrelated current-session command row.
5. Process current and recovered coverage through their respective observation
   paths after the successful installation. Fence and retire recovery metadata
   with its attachment. Preserve ordinary Node snapshot materialization; do not
   open a separate recovery attachment or introduce another subscription protocol.

## Scope and alternatives

1. Include connected Aggregate and Service browser sessions. Keep Standalone,
   mock, transient core sessions, and Agent observation behavior unchanged.
   Shared replica utilities must receive an optional browser journal dependency
   only from connected constructors rather than enabling storage everywhere.
2. Keep existing SQLite schemas, retained Node history, admission protocols,
   command execution, and server retention unchanged. No reset is required or
   authorized. No dependency publishing or consumer rollout is part of this plan.
3. An asynchronous IndexedDB write or unload handler leaves the original window
   open. Replacing Node persistence with localStorage broadens ownership and
   loses existing transactional materialization. Re-staging recovered inputs
   changes their identity and may duplicate execution. A single shared JSON array
   loses concurrent tab writes. These alternatives do not meet this scope.
4. Accept synchronous main-thread work proportional to one command's encoded
   size. Do not serialize the entire pending set on each stage or add a separate
   persisted resource snapshot. localStorage remains best effort and bounded by
   browser policy and quota.

## Planned files and implementation steps

`+` means create; `~` means modify. The new modules have focused responsibilities;
keep exact filenames aligned with the implemented procedures.

```text
zerospin/
  packages/core/src/
    ~ aggregateSession/makeInitializedAggregateSession.ts
    ~ aggregateSession/stageCommand/stageAggregateSessionCommand.ts
    ~ aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx.ts
    ~ serviceSession/stageServiceSessionCommandTx.ts
    ~ drizzle/SqliteSession.ts
    ~ drizzle/make/makeTx.ts
  packages/browser/src/
    + stagedCommandJournal/makeStagedCommandJournal.ts
    + stagedCommandJournal/recoverStagedCommands.ts
    + stagedCommandJournal/makeRecoveredCommandCoverage.ts
    ~ AggregateNode/makeConnectedAggregateConnection.ts
    ~ ServiceNode/makeConnectedServiceConnection.ts
    ~ sessionReplica/replicaConnection.ts
    ~ sessionReplica/openAggregateSessionReplica.ts
    ~ sessionReplica/openServiceSessionReplica.ts
    ~ sessionReplica/bindServiceReplicaCommands.ts
    ~ sessionReplica/makeAggregateReplicaReceiver.ts
    ~ sessionReplica/makeServiceReplicaReceiver.ts
    ~ outbox/makeSessionCommandHandoff.ts
  wiki/
    ~ architecture/browser/AggregateCommandLifecycle.md
    ~ architecture/browser/bootstrapBrowserSession.md
    ~ glossary.md
```

1. Add the per-entry best-effort journal mechanics and explicit Aggregate/Service
   schema bindings. Keep identity hashing asynchronous at initialization and
   all per-stage operations synchronous.
2. Reuse the connected connections' existing authenticated identity key to supply identity
   hash, original `nodeId`, attachment readiness, and lifetime fences to their
   replica journal. Preserve other callers of shared replica utilities.
3. Add explicit post-commit staging callbacks and live-acknowledgement cleanup.
   Preserve public staging returns and isolate callback failures after commit.
   Supply captured encoded originals directly; keep table observation out of
   journal creation and verify reentrant staging independently.
4. Add the recovery drain and pre-delivery registration, then validate and
   partition recovered coverage in both browser receivers before calling the
   unchanged core installers. Wire original-coordinate ordering, exact retention
   validation, deduplication, attachment fences, failure observation, and
   best-effort cleanup. Integrate recovery and live handoff scheduling without
   broadening Node APIs.
5. Perform the permitted verification below. Do not create test files, fixtures,
   runners, or configuration: that requires a separate explicit user request.
6. After implementation, update the existing lifecycle/bootstrap documentation
   and reconcile glossary terminology with the actual result. Explain the local
   staging commit, journal write attempt, durable Node retention, and server
   execution as separate facts. Create an ADR only if the implemented decision
   is hard to reverse, surprising without context, and a real trade-off.
7. Record verification evidence, set Remaining work to None only after all
   required work is complete, and archive this plan under `wiki/archive/plans/`.

## Verification and acceptance

1. Discover resolved browser-package Nx targets before running the smallest
   relevant typecheck/lint and existing behavioral checks. Include affected
   callers of shared replica/handoff signatures. Never verify Explorer.
2. Using existing browser seams and disposable application storage, demonstrate
   that a successful Aggregate and Service staging call has its exact journal
   entry before returning, while rejected staging produces none. Include a
   synchronous store observer that stages a second command during the first
   command's committed-table flush: that inner call must attempt its own journal
   write before returning. Verify the explicit callbacks, not eventual table
   notification delivery, and verify callback exceptions preserve staging results.
3. Interrupt handoff before Node retention, reopen with the same identity and
   `nodeId`, and demonstrate retention of the original submission coordinates
   followed by normal materialization. Repeat with Node retention committed but
   acknowledgement/cleanup interrupted: one original allocation must remain.
   Deliver recovered-session coverage while the new session has no matching
   row, then while both sessions share a `sessionIndex`: installation must succeed
   without attributing the recovered allocation/resolution to the new row.
   Include coverage arriving before the retention response, terminal command
   failure observation, repeated coverage after cleanup, and unknown foreign
   coverage rejection. Invalid recovery coverage must not acknowledge the journal.
4. Exercise localStorage getter/setItem/getItem/removeItem failure using existing
   permitted seams. Successful local staging, optimism, normal live handoff, and
   session initialization must preserve today's behavior. A failed deletion may
   cause a duplicate retry, never a new allocation in the same Node.
5. Check two-tab recovery of the same command, ordering of two commands from one
   old session, identity/definition isolation, stale attachment acknowledgements,
   and Node replacement. Node replacement must leave old entries inert.
   Do not reset existing user storage to perform these checks.
6. Where existing tooling cannot demonstrate a required behavior, record the
   precise unverified seam as remaining work. Do not manufacture a new harness
   or present source inspection as browser runtime proof.
7. Check documentation links and `git diff --check` for the scoped changes.

## Implementation and verification outcome — 2026-10-27

1. Implemented the journal and recovery in the browser package with explicit
   Aggregate/Service schema bindings. Standalone, mocks, transient core sessions,
   Node schemas, and backend command admission/execution remain unchanged.
2. The final callback boundary is after SQL COMMIT and before observer
   publication. Initial implementation placed it after observer flushing; a
   review identified the cross-tab ordering hazard when an inner stage journaled
   index 2 before outer index 1. The final boundary closes that hazard without
   source-liveness leases or pending-row scans.
3. Recovered coverage is validated and partitioned before the unchanged core
   installers. Recovery ownership uses `Effect.acquireUseRelease` so cancellation
   releases sibling drains. Unresolved recovered interests survive journal cleanup
   and same-Node reconnect; terminal coverage retires the interest.
4. `NX_NO_CLOUD=true NX_DAEMON=false pnpm nx run zerospin:test -- packages/browser/tests packages/core/tests --project node`
   passes all 49 scenarios across 14 files, including complete test-program
   compilation. The existing staging scenarios now prove encoded originals,
   rollback suppression, callback exception isolation, SQL commit before callback,
   and callback completion before committed-table observation. No test files,
   fixtures, runners, or configuration were created.
5. Real Chromium checks used the existing Shopping Vite task on isolated port
   12138 and fresh existing host-fixture identities in disposable contexts.
   Aggregate and Service reentrant staging both recorded journal write order
   `[1, 2]` and the inner command's entry before its staging call returned.
   Closing that document before handoff and reopening produced a new Session
   with the same `nodeId`, retained both originals through `pushIndex = 2`, and
   removed the journal entries.
6. Additional browser checks passed for two-tab recovery, retry after Node
   retention with failed deletion (no extra allocation), failed recovery cleanup
   followed by normal live handoff, and old/new Session `sessionIndex = 1`
   collisions. Getter, `setItem`, and `getItem` refusal preserved ready sessions,
   synchronous staging success, and ordinary durable Node handoff. Existing
   Aggregate replacement and Service public-session assertions also passed.
7. Controlled RPC/coverage probes in Chromium passed identity/Node scope
   isolation, unknown and duplicate foreign coverage rejection, repeated
   resolution equality, stale-attachment acknowledgement refusal, interruption
   cleanup, reconnect-interest retention, and terminal-interest retirement.
   These use real localStorage and production recovery code with supplied RPC
   envelopes; they are boundary evidence, not live backend execution evidence.
8. Browser fixtures run with unavailable backend transport and seeded Node
   baselines. The observed durable facts prove local journal/Node retention,
   coverage, and replica behavior; they do not assert remote canonical admission
   or execution. No existing application storage was reset or deployed.
9. Live lifecycle/bootstrap documentation and glossary terminology were updated.
   No ADR was necessary for this reversible browser handoff improvement.

10. Final core/browser Nx lint targets pass with no errors. Existing core lint
    warnings outside this change remain; scoped lint for every changed TypeScript
    file has no warnings. Scoped formatting, documentation links/citations, and
    whitespace checks pass. Independent source review found no remaining blocker.
    Local logs: `/tmp/plan279-final-lint.log`, `/tmp/plan279-final-tests.log`,
    and `/tmp/plan279-browser-evidence.json` (eight browser journeys/probes).

## Remaining work

None.
