# Standalone staged-command journaling and original claims

**Status:** Completed and archived; implementation and required verification passed.
**Pull request:** [PR 106](https://github.com/morgs32/zerospin/pull/106).
**Date:** 2026-10-27.
**Inspection base:** `c89b31a270` on `codex/staged-command-journal`.
**Prerequisite:** [Plan 279](279-plan-synchronous-staged-command-journal.md)'s
post-commit journal and Aggregate replica recovery implementation.

## Problem and agreed behavior

1. `makeStandaloneAggregateSession` stages into an in-memory Aggregate replica
   before asynchronous handoff to its authoritative local `AggregateNode`.
   Closing the document before Node retention commits can lose a staged command.
   Standalone currently leaves the shared replica's journal disabled because
   `makeStandaloneAggregateConnection` supplies no `journalIdentityKey`.
2. Enable the existing synchronous, best-effort journal for Standalone. Attempt
   each write after SQL COMMIT, before committed-table observers and before
   staging returns, retaining Plan 279's reentrant command ordering.
3. Scope entries by the existing `standaloneStorageKey`, original `nodeId`, and
   original `{ sessionId, sessionIndex }`. Reuse the Aggregate journal prefix
   and command schema. Do not add claims values, a new storage namespace, or a
   new hash to the journal identity. The existing storage key already includes
   the generated path and complete authored session lock.
4. Preserve the complete original encoded command, including its claims,
   payload, contract version, Session coordinates, and `stagingOutcome`.
   Recovery submits that original to the same Node incarnation. It never calls
   public staging again or substitutes the recovering attachment's claims.
5. Remove the attachment-wide equality requirement between command claims and
   current attachment claims. A new attachment may deliver an original whose
   non-path claims differ while remaining attached to the same storage owner.
   Preserve claims-schema, Aggregate/Actor/session ownership, registered-contract,
   exact retry, and Node-incarnation validation.
6. Preserve the Aggregate ownership fact previously guaranteed indirectly by
   full claims equality: decoded original `claims.aggregateId` must equal the
   command's `aggregateId`, which `AggregateNode.accept` also checks against the
   Node's Aggregate identity. Reject conflicting IDs using the existing
   `node-command-identity-mismatch` failure. This is an explicit ownership check,
   not a replacement comparison of the complete claims object.
7. Remove entries after validated durable original retention. Standalone's
   existing drain executes retained originals with their captured claims and
   commits authored resource changes and final retention atomically. Journal
   cleanup does not wait for authoritative execution or retained `outcome`.
8. Any localStorage access, serialization, read, write, or deletion failure
   preserves existing staging and ordinary handoff behavior. No journal failure
   may reject an already committed stage or fail initialization.

## Source and rationale at the inspection base

1. [`makeStandaloneAggregateSession`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/makeStandaloneAggregateSession.ts#L117-L168)
   already computes the stable storage key, passes it to the concrete connection,
   and opens the ordinary Aggregate replica. Exposing that existing key through
   `journalIdentityKey` activates
   [`openAggregateSessionReplica`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/sessionReplica/openAggregateSessionReplica.ts#L107-L139)'s
   journal, coverage partition, and recovery machinery without a new public option.
2. [`standaloneStorageKey`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/standaloneIdentity.ts#L40-L55)
   deliberately excludes incidental claims values. Current attachments can share
   that database with differing valid claims. The current
   [`receiveCommandRows`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/receiveCommandRows.ts#L14-L30)
   full-object hash comparison is the restriction being removed, not a persistence
   identity requirement.
3. [`makeStandaloneWorkerRuntime`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts#L238-L253)
   already validates each original's claims through `encodeStandaloneClaims`, but
   discards the returned `aggregateId`. Retain that result and validate the
   original claim Aggregate ID explicitly. Keep attachment initialization's
   existing path/key/owner checks and current-lifetime claims binding unchanged.
4. [`acceptAggregateOriginalTx`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/core/src/AggregateNode/acceptAggregateOriginalTx.ts#L31-L99)
   checks the expected `nodeId` inside the Node transaction, deduplicates exact
   Session coordinates, validates Standalone originals, and checks ownership and
   registered contract version before allocating positions. That transaction is
   the authoritative incarnation fence for each offered command.
5. [`executeStandaloneCommand`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/packages/browser/src/StandaloneNode/executeStandaloneCommand.ts#L64-L92)
   already evaluates the original using `command.claims`. An original retained
   before a claims change can execute with captured claims today. Journal-only
   originals should have the same semantics; survival must not depend on which
   side of Node retention the document closed.
6. [Research](../../research/standalone-staged-command-journal.md) records the source
   inventory and the revised recommendation. [ADR 004](../../adrs/004-standalone-authority-and-storage-scope.md)
   provides authority/storage context; its existing machinery is not a reason to
   retain blanket claims equality. No pending-command revocation requirement is
   introduced by this work.

## Delivery, execution, and lifecycle

1. Add `journalIdentityKey: () => key` to the concrete Standalone connection.
   The key is already computed during asynchronous initialization. The shared
   replica binds it to a validated Node snapshot before publishing staging
   readiness. No new per-command asynchronous work is introduced.
2. Keep the shared `onCommandStaged` commit callback, per-command localStorage
   entries, and browser failure isolation unchanged. Do not create another journal
   implementation, claims-specific partition, delivery path, or domain switch.
3. Simplify Standalone command reception to check the attachment lifetime,
   then return an empty retention array immediately when `rows.length === 0`.
   An empty page must neither call `AggregateNode.accept` nor schedule the drain.
   For nonempty pages, offer each complete original through
   `AggregateNode.accept(command, boundNodeId)`, check lifetime again, schedule
   the existing drain, and return retention coordinates. Delete the claims
   hashes/comparison and their unused import.
4. Remove the now-unnecessary snapshot-based `assertCurrent` dependency from
   `receiveCommandRows` and its `StandaloneBrowserSessionApi` call site. Keep
   the API's `check()` lifetime guard and the transactional expected-Node check
   on every `AggregateNode.accept`. Retain `assertCurrent` for other existing
   control methods that actually use its current snapshot. Do not replace the
   atomic incarnation check with an earlier snapshot observation. The preceding
   empty-page return must remain before drain scheduling, so an empty request
   through a stale Node-bound subscriber cannot trigger replacement-Node work.
5. In the Standalone runtime's original-command validator, decode the original
   claims using the authored schema and explicitly compare its returned
   `aggregateId` with `command.aggregateId`. Continue the Node's existing tuple,
   contract-version and exact-retry validation. Retained immutable history and
   its stored claims are not rewritten or revalidated as new input on retries.
6. Reuse the shared recovery drain's original-coordinate ordering, registration
   before delivery, full-key coverage partition, cancellation cleanup, and
   unresolved-interest resubscription. Old-session coverage must never be
   installed into a current-session command row with the same local index.
7. Attachment B may recover commands staged by attachment A when their
   non-path claims differ but storage key and `nodeId` match. New commands from
   B still capture B's current initialized claims. Recovered A commands continue
   to execute using A's captured claims. Preserve both contexts without copying
   old commands into B's session table or editing B's initialized identity.
8. On ordinary restart, recover against the retained `nodeId`. After explicit
   reset/replacement rotates `nodeId`, entries for the retired incarnation remain
   inert. A changed authored session lock or generated path selects another
   storage key. Do not import old entries or reset/migrate existing storage.
9. Delete `standalone-command-claims-mismatch` completely from its emitter,
   `makeOutboxSubscriber`'s failure declaration, and `defaultErrorMessages`.
   Search current callers/docs for any remaining live references; add no alias,
   fallback code, or compatibility-only test.

## Planned files

`~` means modify. This plan adds no production module or new test/fixture file.

```text
zerospin/
  packages/
    browser/src/
      ~ StandaloneNode/makeStandaloneAggregateConnection.ts
      ~ StandaloneNode/receiveCommandRows.ts
      ~ StandaloneNode/StandaloneBrowserSessionApi.ts
      ~ StandaloneNode/makeStandaloneWorkerRuntime.ts
      ~ outbox/makeOutboxSubscriber.ts
    error/src/
      ~ defaultErrorMessages.ts
    core/tests/
      ~ node-history-recovery.spec.ts
      ~ node-view-recovery.spec.ts
  fragment/content/handbook/
    ~ sessions-and-synchronization.md
  wiki/
    ~ architecture/browser/StandaloneSharedWorkerExecution.md
    ~ architecture/browser/bootstrapBrowserSession.md
    ~ adrs/004-standalone-authority-and-storage-scope.md
    ~ glossary.md
```

## Implementation sequence

1. Wire the Standalone connection's existing storage key into the shared journal
   interface. Preserve all shared journal/recovery implementations and the cold
   constructor's current inputs.
2. Replace full attachment-claims equality with the explicit original Aggregate
   ownership check at Standalone original validation. Remove redundant reception
   preflights and delete the obsolete failure declaration/message in the same
   cutover. Preserve current-session identity and reset fences.
3. Extend the smallest useful existing scenarios or run bounded probes through
   production runtime/retention/executor interfaces. Reuse existing released
   declarations and setup rather than introducing new fixture files or helpers.
   Keep test assertions focused on changed behavior and the removed check's
   retained ownership invariant.
4. Perform the scoped checks below. Track any unavailable browser setup and
   unverified seam explicitly; do not manufacture fixtures/runners under the
   current restriction.
5. After implementation, update the existing Fragment handbook section with
   public Standalone staging/recovery semantics. Reconcile runtime ownership,
   transaction/retention timing, scope, and original-claims execution in the
   existing architecture docs and glossary. Amend governing ADR 004 to clarify
   that the shared page handoff journal carries pending input; its existing
   objection to a second authoritative history does not prohibit that journal.
   No new ADR is required unless the implemented decision meets the repository's
   qualifying criteria. Preserve historical evidence as historical.
6. Record the actual result and verification, repair links, set Remaining work
   to None only after required work is complete, and archive this plan under
   `wiki/archive/plans/` with its filename preserved.

## Verification and acceptance

1. **Original claims across changed attachments:** stage under claims B, close
   before Node retention, and reopen the same storage partition under claims A
   whose non-path values differ. Recover the exact original Session coordinates,
   encoded payload, claims B, and staging facts. Prove authoritative execution
   uses B's claims while the new session stays bound to A. Reuse a released
   claims-dependent command such as Tic-Tac-Toe
   [`createGame`](https://github.com/morgs32/zerospin/blob/c89b31a2700d7be60263f22787662a25d9a3230c/examples/tic-tac-toe/src/contracts/createGameV1.ts#L18-L30),
   whose guard requires payload `id` to equal `claims.instanceId`; rewriting B
   to A would reject it.
2. **Retention and retry:** pause authoritative execution, retain the recovered
   original, and observe journal cleanup before a final exists. Reopen/retry
   after interrupted acknowledgement or failed deletion and establish one
   original allocation. Resume normal execution and verify its original claims
   and result. The existing pause/manual execution and stale-Node scenarios in
   `node-history-recovery.spec.ts` provide a headless seam for these facts.
3. **Ownership and replacement:** reject a schema-valid original whose
   `command.aggregateId` matches the Node but whose `claims.aggregateId` differs,
   without appending history or applying resources. Preserve invalid-schema,
   wrong-owner/contract, stale-incarnation, and exact changed-retry rejection.
   In disposable fixture storage, exercise reset/replacement and establish that
   old-node journal entries cannot restore retired commands. Reuse existing
   Standalone lifetime checks in `node-view-recovery.spec.ts` where applicable.
   Through a previously obtained Standalone staged-command subscriber, submit
   `[]` both before and after Node replacement while its attachment remains live.
   Assert an empty retention result and zero `AggregateNode.accept` or drain
   calls, including when the subscriber's bound `nodeId` is stale. This proves
   empty pages cannot schedule execution against the replacement Node.
4. **Shared journal guarantees:** confirm the Standalone connection enables the
   existing post-COMMIT/pre-observer callback before staging readiness. In a real
   browser, check entry presence before return, reentrant ordering, recovery
   under different claims, and a representative localStorage failure preserving
   ordinary staging/handoff. Reuse Plan 279's shared implementation and prior
   common-module evidence rather than duplicating its full fault matrix.
5. **Browser setup constraint:** this checkout has no retained Standalone
   `.browser.ts`/worker fixture. Plan 234's historical Chromium proof used a
   separately authorized temporary fixture; it is not an available current
   runner. Use an existing accessible Standalone application/entrypoint for
   the browser journey when available. Creating a test fixture, runner, or
   configuration requires an explicit user request in this chat. If no allowed
   host is available, finish authorized implementation and existing checks,
   record the precise missing browser proof, and obtain that authorization
   before adding setup. Keep the plan active until required proof is complete.
6. Discover current resolved Nx tasks and run the smallest relevant browser,
   core, and error build/typecheck/lint and existing Node scenarios. The existing
   root test task compiles the complete test program; use explicit file/project
   filters for runtime scope. Never verify Explorer. Do not create test files,
   fixtures, runners, or configuration as part of this plan without the required
   separate authorization.
7. Verify that connected Aggregate/Service journal behavior is unchanged, that
   no live reference to the removed error remains, and that formatting,
   documentation source links/citations, and `git diff --check` pass. This task
   authorizes neither application storage resets nor dependency publication.

## Implementation and verification outcome

- `makeStandaloneAggregateConnection` now exposes the existing storage key to the
  shared journal. No shared journal/recovery implementation or fixed schema changed.
- Original reception preserves captured claims, validates the original Aggregate
  ID explicitly, and retains the transactional Node-incarnation fence. The complete
  attachment-claims comparison and its obsolete error were removed. Empty pages
  return before `AggregateNode.accept` or drain scheduling.
- Scoped Nx lint/build tasks passed for `@zerospin/browser`, `@zerospin/core`, and
  `@zerospin/error`. The filtered root Node test task passed 28 tests in 8 existing
  files and compiled the complete test program. The added existing-file scenario
  uses the actual Standalone runtime/executor and covers captured B claims through
  attachment A, conflicting claim Aggregate ID rejection, empty subscriber pages
  before and after in-memory Node replacement, and nonempty stale input rejection.
- Chromium used the retained, previously authorized Plan 234 fixture, temporarily
  linked to this worktree, in a disposable context. The journal entry existed
  synchronously after staging while Node `pushIndex` remained 0. Closing that page
  and reopening under claims A recovered B's original on the same `nodeId`.
  With execution paused, retention advanced `pushIndex` to 1 without model rows or
  a final. Forced journal deletion failure retained the entry; another reopen
  removed it while `pushIndex` remained 1. Manual execution then created `gam_b`
  at Aggregate index 1 while the recovering session retained `gam_a` claims.
  A representative `setItem` quota failure left staging successful and normal
  handoff/execution reached Aggregate index 1. No page errors occurred.
- Plan 279's unchanged post-COMMIT/pre-observer callback retains its prior
  reentrant-ordering and connected Aggregate/Service evidence. This implementation
  adds only the Standalone connection binding to that shared implementation.
- After explicit user authorization, Chromium exercised `session.reset()` solely
  in a new isolated context and fresh fixture namespace. A command journaled
  before Node retention remained under the retired `nodeId`; reset changed
  `nodeId`, left the replacement at push/Aggregate index 0 with no model rows,
  and manual execution reported `empty`. Reopening under different non-path
  claims kept that replacement identity and empty history. A new command then
  reached push/Aggregate index 1 and created only `gam_current`, while the retired
  journal entry remained inert. No page errors occurred. The disposable context
  was closed; existing application storage was untouched.
- Scoped formatting, documentation source hashes/ranges and links, whitespace,
  and independent source review passed. The retained fixture, its configuration,
  and dependency links were restored after both browser journeys; the temporary
  Vite host was stopped. No test/fixture/configuration files were created.

## Remaining work

None.
