# Actor connection capabilities and cleanup

**Date:** 2026-10-16

**Status:** Completed and verified on 2026-10-16. Implements the recorded [Actor connectionLocks finding](../../reviews/storage-tables/aggregate-actor-version-chain-connection-locks.md); preserve Agent and Service physical storage.

## Problem and agreed behavior

AggregateActorVersionChain currently stores a full admitted session declaration although its socket consumers use only selected model names and exact command versions. Cleanup deletes only on close, with no failed-attachment compensation or activation reconciliation.

1. Replace only Actor `connectionLocks` with three required columns: `connectionId` text primary key, JSON `modelNames` and JSON `contractVersions` (command name to exact version). Remove Actor's full `lock` column and redundant unique connection index. Preserve the full client lock, ticket/forwarded-admission validation and per-connection requested subset; never broaden to every actor declaration or substitute latest contract versions.
2. Read owner-specific connection rows into one compact runtime capability shape. Agent keeps its existing two-column full-lock table and unique index, including full lock/attachment cross-checks. Service physical storage and consumers remain unchanged. Explicitly check Actor attachment Origin kind/name/version against the bound Actor Chain now that these constants are absent from Actor SQL.
3. Preserve full actual Origin/claims, session and producer identity in the attachment; preserve exact command identity, admission receipts, private recipient filtering, contiguous replay and synchronous replay/live handoff. Attachments retain phase/Node binding, not replay cursors. No history, outcome, hash, publication acknowledgement or resource schema changes.
4. Provide idempotent Actor connection disposal for close/error and failed installation. If capability encoding, SQL insertion or attachment installation fails or is interrupted, remove the row if present and close the already accepted socket. Explicitly closing paths reclaim Actor rows even when a later close callback is absent; errors in sending/closing must not bypass reclamation. Retain valid hibernating sockets.
5. In Actor `onDOActivation`, after schema initialization and before events, snapshot surviving Partyserver connection IDs completely, then synchronously remove orphan Actor rows. Enumeration failure must delete nothing; preserve sockets in every valid phase. Do not use Partyserver's separately lazy `onStart`, add a TTL or introduce credential revocation.
6. Changed Actor fixed schemas require empty affected AggregateActorVersionChain storage. No automatic reset, data translation, compatibility decoder, alias or fallback. Preserve unrelated WIP, and do not create test files, fixtures, runners or configuration.

## Implementation

1. Split the Actor connection table declaration from the unchanged Agent declaration. Add owner-local runtime capability schema/projection and a role-aware reader with bound-owner/attachment validation. Keep synchronous SQL operations and meaningful domain procedures.
2. Update installation and message/live/replay/HTTP consumers to use selected model names and exact contract versions. Remove full-lock decoding from Actor connection reads and redundant HTTP filtering already performed by the history reader. Shared runtime adaptation must not change Agent persistence.
3. Implement Actor disposal, failed-install compensation and activation reconciliation, preserving existing Agent close behavior. Keep SQLite cleanup atomic and avoid any await between the survivor snapshot and pruning.
4. Extend existing acceptance assertions for compact SQL shape/PK, selected resources/exact contract versions, missing or malformed state, failed attachment installation, idempotent disposal and orphan pruning that preserves surviving sockets. Extend the existing Workerd cold-activation scenario to exercise the real Actor activation hook and prove Agent/Service rows remain unchanged.
5. Reconcile the module README, glossary, finding and Plan 151 with the implemented result. Add no ADR unless the result meets the repository's qualifying-decision criteria; this scoped capability/lifecycle cleanup fits the existing ownership decision. Keep Plan 151's next table at AggregateAgentVersionRepo.materializationHead.
6. Run the required scoped checks and independent source review, fix in-scope failures, record evidence, then archive this same plan and repair inbound/relative links only when everything passes.

`+` creates; `~` modifies:

```text
zerospin/
  wiki/plans/
    + 209-plan-actor-connection-capabilities-and-cleanup.md
    ~ 151-plan-storage-table-review.md
  packages/system-worker/src/
    aggregateSessionChain/
      + connectionCapabilities.ts
      + readConnectionCapabilities.ts
      + installConnection.ts
      + disposeConnection.ts
      + reconcileConnectionLocks.ts
      ~ aggregateSessionChainDbConfig.ts
      ~ AggregateSessionChain.ts
      ~ onConnect/onConnect.ts
      ~ onMessage/{onMessage,admitSocketCommand,admitAggregateSessionCommand,replaySocketCommands}.ts
      ~ getBrowserCommands/getBrowserCommands.ts
      ~ README.md
    AggregateActorVersionChain/
      ~ AggregateActorVersionChain.ts
      ~ README.md
    AggregateSessionApi/getBrowserCommands/
      ~ getBrowserCommands.ts
    aggregateProjection/getSnapshot/
      ~ getAgentBootstrap.ts
    filterAggregateBrowserCommand/
      ~ filterAggregateBrowserCommand.ts
  packages/system-worker/test/
    telemetry/
      ~ invocation-order.workerd.spec.ts
    migratable-do-repo/
      ~ system-repo-activation.workerd.spec.ts
      ~ owners.worker.ts (only if existing replay callsites require the narrower definition)
  scripts/
    ~ verify-plan140.mjs
  wiki/
    ~ glossary.md
    reviews/
      ~ command-origin-consumers.md (affected and stale cutover citations)
      storage-tables/
        ~ aggregate-actor-version-chain-connection-locks.md
        ~ aggregate-actor-version-chain-command-resolutions.md (affected citations)
        ~ aggregate-actor-version-chain-exposed-commands.md (affected citations)
        ~ aggregate-actor-version-repo-projected-command-outbox.md (affected citations)
```

## Verification

1. Reuse the inspected system-worker task graph: `pnpm nx run-many -t ts lint test-workerd-ts test-workerd -p system-worker --nxBail`, including its required dependency library tasks and normal caching. Do not overlap library rebuilds with runtime acceptance checks. Never verify Explorer.
2. Run the existing `node scripts/verify-plan140.mjs` acceptance runner against the resulting artifacts, with the concise added connection assertions and existing Agent/Service regressions. No new runner or fixture.
3. Check formatting of changed files, scoped whitespace, documentation links/ranges and hard-cutover consumer completeness. Independently review disposal ordering and survivor reconciliation, plus unchanged Agent/Service SQL declarations.

## Verification outcome

1. `pnpm nx run-many -t ts lint test-workerd-ts test-workerd -p system-worker --nxBail` passed all nine tasks, including five required dependency tasks; four used cached outputs. Both typechecks passed and all 27 Workerd tests across six files passed. Lint reported zero errors and thirteen pre-existing `curly` warnings outside this change. Nx Cloud emitted ancillary 401 messages while local tasks succeeded. The graph was rerun after independent review identified and corrected the earlier encoding/SQL installation failure gap.
2. `node scripts/verify-plan140.mjs` passed all thirteen acceptance groups. The existing Actor SQLite group now proves compact installation/read and primary key; selected live/replay models; exact historical contract-version admission and own-key membership; missing/malformed rows and bound actor mismatch; failed SQL/attachment installation disposal; idempotent cleanup even when closing throws; surviving-socket preservation and orphan pruning; and no deletion after interrupted socket enumeration. An initial assertion incorrectly expected a database error code for an enumeration defect; the corrected check verifies failure plus unchanged rows, preserving the original Cause.
3. The existing fourteen-owner Workerd cold-restart scenario exercises real Actor `onDOActivation`: a seeded orphan is removed, while Agent/Service full-lock rows and two-column schemas survive unchanged. Direct source comparison additionally confirms the Agent full-lock declaration (including its unique index), Agent class and Service storage configuration match the pre-change snapshot exactly.
4. Independent lifecycle/source review confirmed activation ordering, full survivor enumeration before transactional deletion, exact capability/identity checks and complete Actor installation compensation, including typed failure, defect and interruption. No remaining actionable defects were found. Full lock validation remains at admission, and private recipient/order/history semantics remain intact.
5. Updated both module READMEs, the glossary, original finding, Plan 151 implementation status and affected source citations. Formatting, scoped whitespace and local documentation links/ranges passed; archival preserves the filename and repairs inbound/relative links. Plan 151's next table remains AggregateAgentVersionRepo.materializationHead. The existing ownership ADR remains sufficient; no new ADR is needed.
6. No new test files, fixtures, runners or test configuration were created. No Agent/Service physical cutover, compatibility path, storage reset, deployment or Explorer verification was performed. Deployment of this fixed-schema Actor change requires empty affected AggregateActorVersionChain storage.

## Remaining work

None.
