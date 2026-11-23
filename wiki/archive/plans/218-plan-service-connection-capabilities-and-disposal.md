# Service connection capabilities and disposal

**Date:** 2026-10-16

**Status:** Complete. Implementation and required scoped verification completed under Plan 151 on 2026-10-22; archived with the parent review still active.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [ServiceActorVersionChain.connectionLocks](../../reviews/storage-tables/service-actor-version-chain-connection-locks.md). **Architecture:** [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md), applicable [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md). Preserve completed [Plan 217](217-plan-service-direct-resolution-prefix-read.md)'s direct-prefix work and all unrelated changes.

## Problem and agreed behavior

ServiceActorVersionChain stores a full ServiceSessionLock for every socket, although selected model/contract names are the only connection-specific capability facts. Its message and broadcast paths have different owner checks, and teardown depends too heavily on successful sends/closes and later callbacks. Rows whose socket disappeared have no activation reclamation.

1. Replace the fixed `connectionLocks` declaration with exactly three required columns: primary-key text `connectionId`, JSON `contractNames` and JSON `modelNames`. Remove `lock` and its redundant unique-index representation. Selected lists preserve exactly the validated lock's own keys; empty lists still require an admitted row. No defaults, extra identifiers, timestamps, versions, lock hashes or replacement tables.
2. Preserve full initial ServiceSessionLock decoding and exact authored equality, selected model versions/graph closure, ordinary-contract exclusion, exact contract versions, claims codec, canonical actor path, complete actual claims and trusted forwarding checks. Only project selected names after successful validation.
3. Share one synchronous capability reader between messages and live broadcast. Decode trusted attachment state, compare exact Service name/version, actor name/version/path to the bound key, enforce issued/resumed Node equality when the issued Node is nonnull and fail closed for missing/malformed rows or unavailable selected declarations. Resolve models and each public ordinary contract only from that exact bound Service release/actor view. Keep exact pushed `contractVersion` comparison to the derived public declaration version; never select latest/global lineage or silently widen/drop a selection.
4. Return compact runtime models/derived contract versions without fabricating a full submitted lock. Keep existing model-record payload filters and full recipient checks, preserving actual claims, session, Node, actor/version and Service identity. Keep null-issued-Node Service resume semantics. Do not change shared browser payloads, command/outcome/history/checkpoint protocols or Actor/Agent storage.
5. Install capabilities and attachment without an intervening yield after SQL insertion. Dispose every failed/interrupted installation, including encoding/insertion failure before a row exists. SQL and WebSocket attachment are separate persistence mechanisms; use compensating finalization rather than claiming a joint transaction.
6. Add one idempotent disposal procedure that invalidates attachment authority and independently attempts an optional state-required notice, original-socket closure and SQL deletion through finally/finalizer structure. Send/close failure must not skip reclamation, and deletion failure must not skip the closure attempt. Use it for failed admission, invalid message/state/replay, close, error and broadcast failures. Isolate broadcast disposal failures per connection after durable history append so they cannot retract publication acknowledgement.
7. At the real owner activation hook after schema/bootstrap, enumerate all surviving socket IDs completely before pruning only absent IDs in one synchronous transaction. Enumeration failure deletes nothing; preserve all survivors regardless of phase. Hibernation is not disposal. Add no TTL, authentication-revocation policy or history cleanup.
8. Hard-cut the ServiceActorVersionChain fixed schema; affected storage must be empty. No compatibility aliases/decoders, migration, dual paths or automatic reset. Keep Aggregate Actor/Agent and all other physical storage unchanged. Perform no reset, deployment or commit.

## Decisions and rationale

1. Caller-selected capabilities cannot derive from a named session or the actor's complete exposure set; dropping selected names would widen authority. Keep per-socket durable selection outside the compact identity/phase attachment.
2. Service validates each selected contract against the single public declaration in the exact bound release. Unlike a historical-version selection, this association can derive; store contract names, derive runtime versions and compare commands exactly. Keep model interpretation within that same release.
3. Keep runtime model records for the existing Service browser filter instead of changing shared filtering APIs or manufacturing declaration payloads. New helpers own capability recovery, installation, disposal and reconciliation; remove the old full-lock row reader/deleter rather than retaining parallel concepts.
4. Amend governing ADR 015 and affected documentation in place. This is an implemented Service representation/lifecycle amendment, not a new ownership architecture or a reason to alter Aggregate/Agent storage.

## Implementation sequence

The original sequence below records the initial deferral; Plan 218 verification resumed on 2026-10-22.

1. Add compact codecs/selection and the exact-owner synchronous capability reader; replace the physical row declaration and remove obsolete full-lock row access from connection state.
2. Bind full admission to compensated capability/attachment installation. Add disposal/reconciliation and wire class activation, close/error and outer failure paths.
3. Update message, command admission, replay and live broadcast to use compact runtime capabilities and disposal. Preserve Plan 217's scalar prefix reads, real joined payload replay and synchronous final tail/send/live transition.
4. Update existing acceptance/Workerd assertions in place for exact storage, selected-capability derivation, identity/private filtering, installation/disposal failures and safe orphan/survivor behavior. Preserve Actor/Agent assertions. Create no tests, fixtures, runners or configuration files; run no checks during deferral.
5. Reconcile module READMEs, governing ADR 015 and any directly affected local glossary/pattern statements with the actual implementation. Update the finding and Plan 151 without reviewing another table; next remains ServiceChain.externalOperationOutbox. Record all unrun checks and keep the plan active.

## Planned file hierarchy

`+` creates; `~` modifies. Preserve current Plan 217 and unrelated working-tree edits.

```text
zerospin/
  packages/system-worker/src/
    ServiceActorVersionChain/
      ~ serviceActorVersionChainDbConfig.ts
      ~ connectionState.ts
      + connectionCapabilities.ts
      + readServiceConnectionCapabilities.ts
      + installConnection.ts
      + disposeConnection.ts
      + reconcileConnectionLocks.ts
      ~ ServiceActorVersionChain.ts
      ~ onConnect/onConnect.ts
      ~ onMessage/onMessage.ts
      ~ onMessage/admitServiceSocketCommand.ts
      ~ onMessage/replayServiceSocketCommands.ts
      ~ README.md
    serviceProjection/
      ~ broadcastServiceCommands.ts
      ~ README.md
  packages/system-worker/test/migratable-do-repo/
    ~ system-repo-activation.workerd.spec.ts
  wiki/
    adrs/
      ~ 015-service-delivery-history-and-projection-ownership.md
    plans/
      + 218-plan-service-connection-capabilities-and-disposal.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ service-actor-version-chain-connection-locks.md
```

## Verification seams

1. Existing acceptance/Workerd seams should establish exactly three required columns and one connection primary key; retained empty/subset selection; exact bound versions/external exclusion; attachment owner/issued Node checks on both messages and broadcast; full private-recipient and model filtering; and unchanged scalar-prefix/payload replay ordering.
2. Existing lifecycle seams should cover failed encoding/SQL/attachment installation, throwing send/close with disposal, explicit error callbacks, absent-ID pruning, survivors in every phase and enumeration failure without deletion. Keep assertions concise and reuse existing databases/declarations; preserve Actor/Agent regression assertions.
3. The maintainer ended deferral on 2026-10-22. Inspect current Nx configuration and run the scoped source/Workerd type/lint/test graph with required dependencies. The former acceptance runner and Workerd tree are removed; extend the current authorized SQL and Workerd seams in place and do not report deleted runners as executed. No Explorer verification is required or permitted. Run formatting/documentation/link/citation/whitespace checks, independent implementation review and unchanged-storage comparisons then, resolve failures and record actual evidence before archival.

## Implementation outcome

`connectionLocks` contains exactly required primary-key `connectionId`, JSON `contractNames` and JSON `modelNames`. Full initial lock/declaration/version/model-closure/claims/path validation precedes projection to selected names, including empty selections. The shared synchronous `readServiceConnectionCapabilities` resolves those selections only from the exact bound Service release and Actor, retains complete actual claims and checks attachment/key/issued-Node identity. Command admission still compares the pushed contract version exactly. No full-lock compatibility reader or alternate capability path remains.

`installConnection` protects capability preparation, encoding, SQL insertion and attachment installation with failure compensation. SQL insertion and attachment installation have no intervening yield. `disposeConnection` attempts fencing, optional notice, closure and SQL deletion through nested finally blocks. Admission/message/replay/close/error paths use it; broadcast failures are isolated from history acknowledgement and other sockets. Complete native socket enumeration precedes absent-only pruning in the real owner activation transaction. Plan 217's scalar/payload and final tail/live behavior remains intact.

## Verification — 2026-10-22

1. Three Effect-native cases extend the existing [SQL seam](../../../packages/system-worker/tests/repo-names.spec.ts). Actual SQLite PRAGMAs establish exactly three required fields and only the primary-key index. Exact returned-map assertions establish subset/empty selections without widening, exact release/Actor/claims/path/issued-Node behavior, null-issued-Node semantics and fail-closed missing/malformed/duplicate/external/unavailable selections. A child Model reference proves relational closure in both the runtime reader and actual initial lock validator.
2. The SQL lifecycle case injects capability-preparation failure and deterministic child-fiber interruption before insertion, SQL abort and attachment failure after the row exists. Every failure reclaims the row and attempts closure. Independent fence/send/close failures cannot prevent deletion; a deletion abort cannot skip prior closure. Repeated disposal remains safe. The production table metadata is immutable, so the encoder is not monkeypatched: its inclusion within the same protected Effect is source-verified. Runtime preparation faults do not claim a separately injected immutable-encoder failure.
3. The reconciliation case verifies complete enumeration before any deletion, no deletion after an enumeration failure, rollback when a later prune fails and successful absent-only pruning. It uses valid generic connection stubs without casts; actual saved phases and owner activation are exercised in Workerd.
4. Three cases extend the existing [Workerd seam](../../../packages/system-worker/tests/agent-runtime.spec.ts), [Worker](../../../packages/system-worker/tests/support/agentRuntimeWorker.ts) and [declarations](../../../packages/system-worker/tests/support/agentRuntimeConfig.ts). Real local WebSocket upgrades exercise full initial lock/model/contract/claims/path/header rejection, post-insert attachment failure, exact retained names and empty capability rows. Recorded native close calls prove 4004 admission rejection and 1011 installation-failure closure attempts, with no surviving row or connection. A pre-upgrade client may remain CLOSING while the transport handshake completes; these assertions do not claim completed TCP closure. Exact command-version/full-claims/selected-contract failures produce command-specific refusal frames before canonical admission. Successful versions 1 and 2 retain the matching Service/contract versions in ServiceChain with `outcome: null`.
5. The actual Actor projection materializes the two source rows needed for query evaluation. Its authored reservation-ID identity placeholder selects only the matching row for the real snapshot and public deltas. Concurrent sockets with the same Actor partition/Node/session but different non-path role claims receive the same selected models; only exact full claims receive the owned refusal. An empty capability selection receives no resource delta while retaining its own private refusal. A bad-owner attachment is disposed on both message and broadcast paths. Throwing native send and close do not prevent capability deletion, healthy delivery or successful history append; retained public/private rows survive.
6. Actual `unsafeEvictDurableObject(..., { webSockets: 'hibernate' })` reconstructs ServiceActorVersionChain with a changed incarnation. Real awaiting/live sockets and a fixture-parked replaying attachment survive unchanged while an absent socket row is pruned by inherited owner activation. The awaiting socket resumes successfully; explicitly invoking the real error callback, a malformed real message and client closure exercise the remaining class cleanup paths. The parked phase is not an interrupted replay Effect, and the explicit error callback is not an actual network-failure injection.

The initial complete scoped Nx run passes the compiler/library graph and **65 tests across eight files**, including the six new cases and retained Actor/Agent/Plan 217 checks. Independent review closed a masked negative assertion, replaced partial map comparisons with exact ones and made repeated refusal assertions match each command ID. Initial fixture-only typing, frozen-metadata spying, raw-materialization and early-close-event assumptions were corrected. No production defect was identified.

A concurrent commit, `2a12230d71`, adds the native SystemApi module and declares `@zerospin/server-only` for System Worker. Its missing local link initially blocked the subsequent lint prerequisite build. `pnpm install --offline --filter system-worker --ignore-scripts --frozen-lockfile` restores the already-declared workspace link without changing manifests, dependency versions or the lockfile. The final complete compiler/library/test graph passes **66 tests across eight files**, including the concurrent native API case. Scoped System Worker lint passes with zero errors and the one existing unrelated curly warning at `prepareServiceProjectionOccurrence.ts:68`. New fixture-only curly/empty-stub warnings were corrected with braces and explanatory comments. A duplicate `vi` import caused by the concurrent test edit was reconciled. The subsequent `ea1604c61d` commit changes package/Intent metadata without changing the inspected runtime. Nx Cloud artifact reporting was unavailable (401/DNS); the local Nx tasks completed successfully.

All **395 pre-existing System Worker TypeScript modules** remain unchanged against the turn baseline. The new native SystemApi module belongs to that concurrent commit. Qualified comparison of historical co-landed commit `ff1c4b34220320b25cc79c1e95e54ccf6f532e9e` and parent `ff3ef7b82e21d6be568e0ac2cdfd8c91a5fe1495` preserves 51 Aggregate Actor/Agent/shared modules, three ServiceActorVersionRepo modules and ten of thirteen schema declaration files. Plan 218 changes only ServiceActorVersionChain.connectionLocks; other schema/owner changes in that commit belong to Plans 219–222. Later Agent Node stores are covered by the current baseline. This is source-preservation evidence, not physical-database equivalence or a storage reset.

Scoped formatting, local document links/source-citation ranges, whitespace and independent review pass. Module READMEs, the recorded finding, governing ADR 015 and Plan 151 are reconciled with actual behavior; no new domain term, pattern or ADR is required. Generic identity/selection/private-recipient enforcement requested by Plan 239 is covered here. The fixture supplies trusted headers and execution packets and substitutes SystemRepo registration. Authentication providers, ticket admission, accepted-catalogue deployment, browser SDK behavior and interrupted replay-Effect resumption are not established; Plans 196/219/221 retain independent obligations. No existing stores are reset, no compatibility path is added and no deployment or commit is performed. Parent Plan 151 remains active.

## Remaining work

None.
