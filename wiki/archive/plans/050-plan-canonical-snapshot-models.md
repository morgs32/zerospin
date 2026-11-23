# Derive snapshot models from the session declaration

Status: Complete — implemented and verified on 2026-10-06.

## Problem and agreed behavior

1. [Snapshot application](../../../packages/core/src/aggregateSession/applyAggregateSessionSnapshot/applyAggregateSessionSnapshot.ts) and its [transactional implementation](../../../packages/core/src/aggregateSession/applyAggregateSessionSnapshot/applyAggregateSessionSnapshotTx/applyAggregateSessionSnapshotTx.ts) accept both `definition` and `models`. Resource validation and replacement use the supplied models, while optimistic replay uses the declaration's models. The interface permits these inventories to disagree.
2. Every current caller derives the supplied inventory from the declaration: ordinary sessions use `definition.models`; canonical agents use `definition.db.models`. Remove the independent `models` input from both functions and derive it through the existing `getAggregateSessionModels(definition)` helper.
3. Preserve resource validation, snapshot identity/claims validation, outcome recovery, and synchronous transactional replacement/replay. This follows [plan 044](044-plan-aggregate-agent-sessions.md)'s canonical declarations and preserves [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md)'s atomic history/recovery rules.

## Implementation

1. Remove `models` from both props shapes and their destructuring. Resolve models directly from the declaration in each implementation before its resource work; use the canonical inventory for validation, table clearing, and insertion. Remove unused imports. Do not build or retain another normalized inventory.
2. Update the three outer callers in Browser's mock aggregate, standalone, and canonical agent constructors, and the direct transactional caller in React's `CommandsLiveQuery.spec.tsx`. Remove only the snapshot arguments; retain local model variables used for database construction, fixture encoding, published state, and other operations.
3. Keep the transaction's current boundaries and order: replace resources, import covered outcomes, replay surviving optimism, and commit metadata together. Preserve rollback on malformed/incomplete recovery, allocator/cursor behavior, and notification timing.
4. Retain the existing generic replay-service requirement interface. Removing its overload or redesigning the executor is outside this plan; success is one authoritative model inventory throughout snapshot application.

## Verification

1. Extend the existing snapshot scenario in [CommandsLiveQuery.spec.tsx](../../../packages/react/tests/CommandsLiveQuery.spec.tsx) to call the interface without a models argument and verify authoritative replacement followed by surviving optimistic replay. Retain its live-query notification and resource/result checks.
2. Use the existing Browser [agent-preview fixture](../../../packages/browser/src/fixtures/agentPreview.ts) for the agent declaration branch. Verify initialization/recovery still resolves its authored `db.models`, preserves canonical model identities, and rejects invalid snapshot resources. Exercise the existing mock/standalone initialization regressions where those fixtures already cover them; do not create an application-browser harness.
3. Preserve existing rejection/rollback coverage for malformed resources, incomplete or contradictory outcomes, and replay failures. Assertions must observe resources, retained records, metadata/cursors, and notifications through the current snapshot/session seams.
4. Run `pnpm nx run-many -t ts,lint -p @zerospin/core,@zerospin/browser,@zerospin/react`, `pnpm nx run @zerospin/react:test`, and `pnpm nx run @zerospin/browser:agent-preview:check` sequentially with required dependencies. Run formatting checks on changed files and `git diff --check`; report unrelated failures without repairing them.

## Scope and completion

1. This is independent of the other overload cleanup plans. It changes caller props, with no storage schema, wire protocol, compatibility alias, migration, or automatic storage reset. Preserve ordinary/agent representation, transient agent lifetime, and existing runtime-service requirements; do not add casts or `ALLOWED_CAST`.
2. After implementation, reconcile affected snapshot/session documentation and source citations. Review the existing glossary only for changed domain meanings; this change should not introduce a new domain term. Record an ADR only if the implemented decision meets the repository's hard-to-reverse, surprising, real-trade-off criteria.
3. Record actual checks and any outstanding work in this plan. Follow the implement skill and archive it only when the required implementation and verification are complete.

## Completion evidence

1. Removed independent snapshot model props and derived resource validation/replacement models through `getAggregateSessionModels(definition)` in both implementations. Updated all three browser callers and the direct React transaction caller; preserved transaction and replay order.
2. Extended the ordinary snapshot scenario to retain surviving optimism, verify committed live-query publication and resource/result preservation, and assert silent full rollback for incomplete/mismatched outcomes and replay failure. Extended the agent fixture with canonical model identities through initialization/recovery and invalid resource/model rejection without state or notification changes.
3. Core/browser/React TypeScript and lint, React tests (125 across seven files), and browser agent preview passed with configured dependency builds. New fixture inference and incomplete input declarations were corrected and the affected checks rerun. React lint was run separately after a concurrent library-clean race to avoid reading removed generated output. Nx Cloud's access warning (401) was non-blocking. Changed-file formatting and `git diff --check` passed.
4. Reconciled snapshot documentation in the existing glossary and reviewed directly affected source citations. No new domain concept or ADR was needed.

## Remaining work

None.
