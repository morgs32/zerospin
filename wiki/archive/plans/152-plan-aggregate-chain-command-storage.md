# AggregateChain command storage and outcomes

**Date:** 2026-10-14

**Status:** Implemented and verified. Archived after scoped checks and independent review.

**Parent:** [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md).

**Evidence:** [AggregateChain.commands review](../../reviews/storage-tables/aggregate-chain-commands.md).

## Problem and intended result

Before this change, `AggregateChain.commands` stored a complete transport envelope, repeating its database's aggregate identity and carrying redundant System-name metadata. External input was named `response` and normalized absence and recorded JSON null to the same value. Original-result retrieval depended on VersionRepo disposition data even after Chain acknowledgement.

Store command-specific facts, reconstruct bound aggregate context for transport, give external input explicit meaning, and retain the complete original outcome for original-result recovery. Preserve exact input retries, original ordering, authority, replay and synchronous acknowledgement. This is a bounded change to the first reviewed table and its required callers, not a review or redesign of every coupled table.

## Settled decisions

1. Remove persisted `aggregateId` and `aggregateName` from this Chain's command rows. Reconstruct them from the bound Chain key wherever a complete command envelope is required. Preserve admission and receiving-owner validation.
2. Remove `systemName` from command/external-work metadata without a renamed field, routing wrapper or owner-wide substitute. Bound repositories and capabilities establish System ownership. Authored System/session configuration names have their separate existing purpose.
3. Name frozen external observation `externalOutcome`. Successful content is encoded with the exact external contract's response codec and decoded before evaluation. Record and deliver terminal external request failures as continuation input too. Ordinary admission cannot supply either branch; recorded continuations retain the complete observation, including a successful JSON null.
4. Rename `finalization` to `commandOutcome` and retain the complete original-command result or public failure. Preserve first-outcome immutability and contradictory-receipt refusal. Use the acknowledged Chain outcome for original-result retrieval; progress pending originals through the retained VersionRepo and existing delivery path.
5. Require literal `kind` on every Origin variant: actor, agent and System. System authority is explicit `{ kind: 'system' }`. Retain frozen definition versions and actor claims. Add no placeholder credential identity. Current Origin schemas already carry these tags; confirm completeness and preserve them without creating compatibility aliases.
6. Keep exact encoded payload identity, original/source `aggregateVersion`, producer `nodeId`/`sessionName`/`pushIndex`, one shared `aggregateIndex`, and the bounded original-delivery diagnostic. Do not add completion cursors, receipt digests, retry counters or a second pending-work table.

## Settled outcome representation

Use `commandOutcome` and `externalOutcome`, both with the flat structure:

```ts
{
  _tag: ('Success', success, recordedAt);
}
{
  _tag: ('Failure', failure, recordedAt);
}
```

1. Use the existing `Success/success` and `Failure/failure` convention. `success` contains the encoded command result or contract-encoded external response. Command failures and external request failures are distinct types.
2. Keep null outside the union: pending command outcome, or absent external observation. Store the nullable object directly. A successful JSON-null response is `{ _tag: 'Success', success: null, recordedAt }`; do not use nullable text or normalize absence into JSON null.
3. `recordedAt` is the first recording time. Sample command recording alongside result retention in the executing VersionRepo transaction after evaluation or retained refusal. Record an external observation alongside its continuation outbox entry. The Chain copies the retained times unchanged; retries recover them and replay cannot overwrite original times. This is a wall-clock recording observation, not an exact SQLite commit instant. Existing execution-start and operation timestamps keep their separate meanings; command indices determine ordering.
4. Deliver both external outcome branches to authored continuation evaluation. An external failure can be handled by a continuation whose `commandOutcome` is success. It never automatically refuses the continuation or changes the originating command's outcome.
5. External request failure establishes that no usable response was obtained, not that the remote side effect did not occur. Authors own reconciliation and model transitions, as well as existing request retries and timeout configuration.

These choices supersede the earlier representation alternatives and the no-child failure policy in ADRs 011 and 012. The parent table review remains independently active.

## Scope and required propagation

- **Chain row versus transport:** `AggregateChain` admission, retained retry recovery, original delivery, replay paging, acknowledgement and direct original-result recovery. Decouple delivered occurrence types from `commands.$inferSelect` so owner fields can be reconstructed deliberately.
- **Direct original-result interface:** [ISystemApiRpc.executeAggregateCommand](../../../packages/core/src/systemApi/ISystemApiRpc.ts) returns `AggregateCommandReceiptSchema` from Chain-owned admitted identity, aggregate position and full original command outcome. The receipt excludes the VersionRepo disposition hash; pending originals still progress through retained original delivery. Keep VersionRepo replay/checkpoint result types separate. Do not add a Chain hash column or fetch the VersionRepo solely to fill the old response shape.
- **Shared command metadata:** Core command/continuation/executed schemas and types, command construction, external-response validation and prepared invocation. Renaming command metadata does not rename HTTP response variables, the external declaration's `response` codec, merely because they share a word. Authored external callbacks deliberately receive the complete decoded `externalOutcome`.
- **VersionRepo integration:** aggregate original/replay input decoding, identity validation, immutable result retention and result recovery. Propagate shared metadata changes through ServiceChain/ServiceVersionRepo only where the shared contract requires it; do not independently redesign their tables here.
- **External work:** concrete preparation, frozen continuation reconstruction and recorded admission/proof in both families. Preserve exact local declaration resolution and original-only external execution from Plan 150 while deleting the superseded System-name requirement.
- **Required consumers:** browser/Node/session/agent command construction, CLI administrative input and first-party application callers that compile or decode affected envelopes. Retain owner identity in transported commands, other owners' storage and callback inputs wherever independently required; deleting two Chain columns does not authorize deleting all aggregate identity fields.
- **Documentation:** affected module READMEs, architecture, local patterns, glossary and governing ADR wording. Reconcile Plan 150/ADR 012's superseded frozen-name statement and the settled command-outcome shape under ADR 005. Reconcile the naming guidance with the explicit Origin discriminator decision if necessary.

## Implementation sequence

1. Define the settled outcome codecs, table-owned row/field codecs and complete delivered-command type with clear owner-context reconstruction.
2. Cut the redundant Chain columns and System-name metadata. Update admission, exact retained retries, delivery/replay reconstruction and acknowledgement without weakening identity checks or creating aliases.
3. Propagate `externalOutcome` through the actual shared dependency graph. Record and enqueue success or failure atomically, expose the decoded outcome to authored callbacks, and update application failure transitions. Prove ordinary refusal, recorded-null acceptance, exact failure proof and successful failure handling through existing verification seams.
4. Retain and recover the complete original `commandOutcome` through the Chain, cutting the direct-result interface's dependency on VersionRepo disposition data. Commit recording time in the original VersionRepo and copy it unchanged. Keep replay's own evaluation/outcome distinct from the Chain's original outcome.
5. Reconcile in-scope docs and existing verification, obtain an independent review, and record actual evidence here. Preserve unrelated working-tree changes.

## Verification and completion

Use the permitted existing Nx build/typecheck/lint graph for the changed packages and direct consumers; discover exact targets at implementation time. Use existing admission profiles, existing Workerd/acceptance files and their production procedures where they cover the change. Create no new test files, fixtures, runners or configuration.

Required behavior evidence:

- Complete owner envelopes reconstruct from Chain context, and wrong-owner input/receipts are refused.
- Identical retries preserve receipt, raw input, original outcome and any recording time before consulting current declarations; conflicting retries/outcomes are refused.
- Ordinary input cannot supply either external outcome branch; recorded JSON-null success retains presence and passes exact originating-contract proof.
- External failure and its continuation enqueue atomically. Its authored handler can commit model changes and retain a successful command outcome without asserting the remote side effect failed.
- Pending originals and their alarms recover after interruption or lost acknowledgement; business refusal finalizes and allows subsequent originals.
- Replay exposes the contiguous original-finalized prefix and computes each release's own outcome without producing external work or replacing the original command outcome.
- Changed fixed schemas fail explicitly against superseded storage. Require empty affected storage; add no translation/fallback decoder and perform no storage reset under this plan.

Report missing existing verification seams explicitly rather than creating prohibited fixtures. Completion requires the decided behavior, in-scope checks and independent review to finish; then archive this child plan separately from the still-active parent review.

## Implemented result and evidence

1. Added distinct command and external outcome codecs with flat Success/success and Failure/failure branches and DateFromString recording times. Replaced superseded command fields without aliases or fallback decoders. Aggregate command rows retain no aggregate ID/name or System-name metadata; complete owner envelopes reconstruct from the bound Chain key.
2. External outcomes and their continuation enqueue commit atomically. Preparation/authority failures before the request remain recoverable operational failures. Captured request/timeout/post-request codec failures deliver a public external failure; persistence failures leave no false request observation. If request and recording both fail, the complete combined Cause survives privately. First observations, source proof and recording times remain immutable.
3. Direct aggregate execution returns its acknowledged original Chain receipt without a disposition hash and skips VersionRepo lookup for completed retries. Replay records each release's own outcome, without external production or overwriting the Chain's original.
4. Shopping payment and label failures retain needs_reconciliation; tracking failure releases only its matching pending sequence. Remote purchase uncertainty retains command/aggregate identities without restoring the cart. Tic-Tac-Toe records a computer-move failure and preserves the existing New game action.
5. The scoped library/type graph passed 27 tasks across 11 selected projects and their dependencies. Scoped lint and Workerd typechecks passed. The full existing Workerd suite passed 25 of 26 tests; the sole profile property-order snapshot mismatch was corrected and its two-test scoped rerun passed. No production change followed that full suite.
6. Existing runtime acceptance passed all eight groups, including success/failure continuations with successful model-changing handlers, JSON-null presence, exact proof/owner refusal, timestamp contradictions and retries, rollback/recovery, direct Chain receipt retrieval and original/replay isolation. Existing inference acceptance and all six session-identity/browser-recovery groups passed.
7. Shopping, Tic-Tac-Toe and Explorer production builds passed. Explorer check passed with six existing warnings and no errors. Source schema capture refreshed nine concrete Repos and 50 declarations without executing Worker modules. Scoped formatting and whitespace checks passed.
8. Independent source review accepted the corrected request capture boundary, Cause preservation, outcome codecs, Chain receipt ownership, replay isolation, privacy and consumer failure transitions. Eight affected architecture/glossary/contract documents passed a 626-link source/range/hash audit. Two unrelated existing diagram-annotation issues were preserved. Governing ADRs 005, 011 and 012, affected module READMEs, patterns, consumer guidance and the [research note](../../research/external-outcomes-and-failure-continuations.md) are reconciled.
9. Verification used existing test files and runners only. No provider calls, deployment, storage reset, compatibility migration or publication occurred. Existing Plan 150/153/154 and other unrelated working-tree changes were preserved. Nx Cloud access code 401 is an existing remote-cache limitation; local tasks passed.

Logs: `/tmp/zerospin-plan152-types.log`, `/tmp/zerospin-plan152-checks.log`, `/tmp/zerospin-plan152-profiles.log`, `/tmp/zerospin-plan152-acceptance.log`, `/tmp/zerospin-plan152-inference.log`, `/tmp/zerospin-plan152-sessions.log`, `/tmp/zerospin-plan152-builds.log`, `/tmp/zerospin-plan152-explorer.log`.

## Remaining work

None.
