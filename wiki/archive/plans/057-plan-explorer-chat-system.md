# Explorer chat system

Status: Complete — 2026-10-07.

## Agreed work

1. Build the shared-room chat backend in `explorer/src/zerospin`. Defer the chat UI and navigation.
2. Register the `explorer-chat` system with one `room` aggregate and anonymous `member` actor. Each versioned declaration is version `1.0.0` in its own file.
3. Pin participant claims to `aggregateId: acct_general`, with self-asserted `participantId` and `displayName`. All participants read the complete room history.
4. Store append-only messages with body and sender fields, using standard resource IDs and timestamps. `sendMessage` accepts `{ id, body }`, rejects whitespace-only bodies and display names, and derives sender fields from claims through synchronous model operations.
5. Add `explorer/zerospin.config.ts` for `sys_explorerchat`, an Nx `zerospin:dev` task on port 3042, required workspace dependencies, and configuration typechecking.
6. Document backend startup and declarations for the later UI. Reconcile implemented glossary terms; create no ADR unless a real implemented trade-off warrants one. Archive this plan after all required verification passes.

## Verification

1. Run Explorer's scoped build, typecheck, lint, and formatting checks.
2. Start the real backend and confirm its authored system spec is accepted.
3. Use a temporary runtime script to admit two participants, send messages, and verify shared history and sender attribution.
4. Verify invalid messages create no message rows and history survives a backend restart. Browser transport verification belongs to the deferred UI work.

## Outcome and verification

1. Added the room model, send contract, anonymous member actor, aggregate and system, each with explicit model/contract registrations. Messages preserve body formatting and capture participant IDs and trimmed display names from claims.
2. Added the backend config and continuous Nx dev task on port 3042. Linked the SDK and CLI through pnpm and matched Effect to the workspace's existing `4.0.0-rc.111`. Typecheck, lint and formatting include the new config; a local lint override permits SDK backend imports in the four backend declaration/config files.
3. Explorer build, typecheck, lint and formatting checks passed, with their required library builds. The initial lint failure was resolved by the scoped SDK allowance. Nx Cloud reported workspace-access code 401; local tasks passed.
4. The real Workerd backend reported `Ready on http://127.0.0.1:3042/ (system spec accepted)`. A temporary Node script admitted Alice and Bob through ordinary actor capabilities, executed each participant's send through the trusted SystemApi, and verified both snapshots contained the same two messages with correct sender fields and standard timestamps.
5. Whitespace-only bodies and display names failed with `empty-message` and `empty-display-name`, leaving both participants' message histories unchanged. Stopping and restarting the backend retained the exact two-message history for both admitted readers.
6. Updated Explorer's README and the glossary's Explorer chat room definition. No governing architecture trade-off required an ADR. Chat UI, browser sessions and browser transport verification remain outside this completed backend phase.

## Remaining work

None.
