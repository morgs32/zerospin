# Opaque aggregate IDs

**Status:** Archived on 2026-10-26 after maintainer-approved closure of the original opaque-ID scope. Prefix removal was implemented and verified in the 2026-10-09 record below. The separate physical Repo-name encoding cutover is excluded and is not promised by this plan.

## Archival disposition — 2026-10-26

The maintainer approved closing the original prefix-removal work and excluding the side-conversation physical Repo-name encoding proposal. Empty or dot-only Repo path-fragment support is not established by opaque string validation. No new encoding cutover, storage operation or application verification was performed during archival.

## Agreed behavior and scope

1. Aggregate IDs are application-chosen strings. Remove the framework `acct_` constraint from admission, execution, browser/agent lifetimes, Studio, and persisted aggregate registrations and tickets.
2. Remove `makeAggregateId` and its exports and abbreviation. Keep other ID families unchanged. Preserve requested/authenticated ID equality and authorization.
3. Store aggregate IDs as text. Changed fixed schema metadata requires empty storage; do not migrate or delete user storage.
4. Preserve concurrent admission and call-stack work.

## Implementation

1. Replace prefix schemas and the aggregate ID type, remove the generator, and simplify registration.
2. Use application IDs directly in Shopping and TicTacToe examples.
3. Verify arbitrary IDs through admission, commands, snapshots, reconnection, storage, and routing, and compile affected consumers.
4. Update glossary and affected local examples; format scoped files and audit remaining constraints.

`~` modifies; `−` removes.

```text
zerospin/
  packages/
    ~ core/src/{models,identity,aggregate,aggregateSession,utils}/
    − core/src/utils/make/makeAggregateId.ts
    ~ browser/src/, browser/test/
    ~ system-worker/src/, system-worker/checks/
    ~ studio/src/, sdk/src/
  ~ examples/{shopping,tic-tac-toe}/
  ~ wiki/glossary.md, wiki/patterns/react/swr-rpc-queries.tsx
```

## Verification — 2026-10-09

1. Coordinated Nx library builds passed for core, browser, system-worker, SDK, and Studio, including their dependencies.
2. Core's 32 and browser's 67 Node tests passed. Browser fixtures use `room/雪?revision=1#board%25` through initialized commands, agent lifetimes, standalone identity, online snapshots, remembered offline admission, and release/reinitialization. Non-string instance selection is rejected before application acquisition.
3. `system-worker:aggregate-administration:check` and `system-worker:authorization-provisioning:check` passed. Real Workerd/SQLite checks retain plain IDs, UUIDs, Unicode and reserved characters exactly across admission, commands, registration, snapshots, agents, and tickets. Authentication mismatch, authorization denial and credential validation remain checked.
4. Core/browser/worker/Studio and Shopping/TicTacToe TypeScript checks passed. Scoped lint tasks passed with existing warnings and no errors. No Shopping browser verification ran.
5. Scoped formatting and diff checks passed. Active-source searches found no framework aggregate abbreviation, prefix schema, or `makeAggregateId` implementation/export. Other ID families remain unchanged. The relevant planned admission snippet was corrected without replacing concurrent plan 069 work.
6. Fixed SystemRepo aggregate-ID fields now use text; the repository's empty-storage policy applies. No storage was erased or migrated.

## Remaining work

None under this archived plan.
