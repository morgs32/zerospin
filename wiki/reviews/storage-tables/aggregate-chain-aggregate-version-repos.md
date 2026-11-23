# AggregateChain.replaySubscribers

**Current finding — 2026-10-16:** Bounded refresh against current uncommitted source, with independent column-design and lifecycle reviewers. Retain the settled two-column model from [Plan 153](../../archive/plans/153-plan-aggregate-chain-replay-subscribers.md). No additional schema or consumer change is proposed. All verification remains deferred.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md). Governing ownership and finalized-prefix contracts: [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md), [ADR 014](../../adrs/014-synchronous-original-finalization.md) and [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md). Earlier Plan 153 passing results remain historical evidence; this refresh does not rerun them or verify active Plans 211, 212 or 213.

## Current verdict and physical owner

Retain `replaySubscribers(aggregateVersion, acknowledgedAggregateIndex)` with its existing names and constraints. One row records AggregateChain's retained replay relationship and source-confirmed progress for one receiving authored Aggregate release. AggregateChain's physical database fixes `systemId / aggregateId / aggregateName`; the release varies within that owner. The complete AggregateVersionRepo key is reconstructed from this bound identity plus the stored release.

This is **subscriber progress**, with permanent retained membership until a separately defined retirement policy exists. It is not resource state, command history, pending payload, a checkpoint owned by AggregateVersionRepo, a live connection or proof that AggregateVersionRepo has already been instantiated. AggregateChain reads retained admitted commands to deliver replay; advancing this row deletes neither source commands nor AggregateVersionChain history.

- [Physical AggregateChain identity](../../../packages/system-worker/src/AggregateChain/aggregateChainName.ts#L6-L12), [fixed owner binding](../../../packages/system-worker/src/AggregateChain/aggregateChainMigratableDORepoConfig.ts#L11-L15), [two-column declaration](../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts#L54-L60), [release identity and reconstructed receiver key](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L90-L110).

## Every current column and constraint

| Column                       | Meaning, null/default rule and mutation                                                                                                                                                                                            | Necessity, writer and reader                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `aggregateVersion`           | Required raw-text primary key; immutable receiving release identity within this AggregateChain. No SQL default.                                                                                                                    | Retain. The physical owner omits release, and multiple releases independently consume replay. Activation inserts authored releases; explicit enrollment validates release availability. The queue reconstructs the complete receiving key from this field. Removing it loses which release owns a cursor; retaining a full Repo name or repeated owner columns adds no independent identity.                                   |
| `acknowledgedAggregateIndex` | Required integer, highest inclusive replay position confirmed to AggregateChain for that release. Zero means no confirmed commands. No SQL default: activation explicitly supplies zero. Supported progress updates are monotonic. | Retain. Dispatch selects releases behind the finalized source prefix. Successful pushed receipt and explicit receiver-reported checkpoint enrollment advance it with `max(existing, reported)`. Removing it loses the source's durable acknowledgement fact and forces repeated replay from zero or remote progress lookup. Neither the source tip nor pending publication/history can derive this release's confirmed cursor. |

There are no additional declared indexes, SQL foreign keys, nullable alternatives, JSON subfields or framework-added row IDs/timestamps in this table. Primary-key uniqueness identifies one cursor per release. Safe nonnegative bounds are enforced at the enrollment RPC; the SQL integer declaration does not itself impose those bounds. Shared storage's generic `coalesce` supports other bindings and does not give this required column a null lifecycle state.

- [Declaration](../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts#L54-L60), [explicit zero enrollment](../../../packages/system-worker/src/AggregateChain/onRepoStartup/onRepoStartup.ts#L18-L33), [selection and monotonic acknowledgement](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L144-L175), [atomic monotonic enrollment](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L177-L198), [cursor boundary validation](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L429-L480).

## Current lifecycle, transactions and recovery

1. AggregateChain activation holds original-delivery and replay recovery before one synchronous transaction inserts every currently authored receiving release at zero with `onConflictDoNothing`. Existing cursors remain unchanged. The same authored release list gates both dispatch and explicit enrollment; release removal excludes delivery without deleting its row. Returning code resumes against retained progress. Authored availability cannot replace the cursor, and a persisted `active` flag would mirror configuration.
2. `readReplayPage` exposes only the contiguous admitted-command prefix with retained `outcome`: before the oldest null-outcome command, or through the admitted tip when none is pending. It reads ascending pages capped at 64, bounded by the requested maximum. Reading replay does not execute pending originals. Each drain captures one finalized boundary, so later finalizations do not extend that drain indefinitely.
3. The queue selects available releases behind that boundary, excluding releases already in flight or failed in the current drain. It reconstructs the complete receiver key, acquires the source-bound capability and awaits successful `receive`. Only then does a synchronous source transaction advance `acknowledgedAggregateIndex` through the **last delivered row**, using `max`. The advertised `lastIndex` alone is not an acknowledgement.
4. AggregateVersionRepo materializes replay commands independently. A later command failure can leave a committed page prefix while AggregateChain retains its older acknowledgement. Redelivery skips/revalidates committed commands using pending evaluated-command publication or retained AggregateVersionChain history. No distributed transaction spans receiving materialization and source acknowledgement.
5. **Current cold activation uses `.catchup()`, not `.subscribe()`.** AggregateVersionRepo's `onRepoStartup` runs `catchupMaterialization`, which captures one finalized boundary through the existing subscriber. Its durable materialization head can therefore advance without a direct source-cursor update. Subsequent successful pushed replay advances this source acknowledgement. Source activation already enrolled authored releases; no extra receiver enrollment is required for automatic recovery.
6. Explicit `.subscribe()` first catches up, rereads the committed materialization head and reports it to AggregateChain. Queue enrollment validates safe nonnegative progress no greater than the deliverable source tip, exact bound owner identity and current receiving-code availability, then uses one synchronous monotonic upsert. Source-bound receiver acquisition also checks System/aggregate identity. Enrollment holds a producer lease and stays outside the drain semaphore, avoiding a cold-receiver activation deadlock and protecting its wake from concurrent empty-drain release.
7. A failed release keeps its source acknowledgement unchanged and is excluded only for that drain; healthy releases proceed. Typed failures and defects retain their Causes. Source-wide failure and interruption renew recovery. Later durable alarms retry the retained backlog, with no failure/suspension field or manual resume. Every alarm hold writes a storage wake; a consumed alarm is not recovered merely by retaining an in-memory lease.
8. Original-outcome acknowledgement acquires a scoped replay producer lease and explicitly calls `replayCommandsFanout.wake()` on exit before original delivery releases its alarm hold. The producer revision prevents an older replay drain with a captured pre-finalization tip from clearing recovery before the queued pass starts. A successful replay drain releases its alarm hold only when no active producer and no newer producer revision require another pass. Source failure or interruption renews the hold after scope/permit cleanup. Capability disposal removes no SQL row. There is no unsubscribe, expiry or automatic deletion path for this binding; defining retirement is separate policy work, not a reason to add stored flags now.

- [Activation transaction and recovery holds](../../../packages/system-worker/src/AggregateChain/onRepoStartup/onRepoStartup.ts#L17-L33), [shared availability/owner checks](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L107-L166).
- [Finalized source page](../../../packages/system-worker/src/AggregateChain/readReplayPage.ts#L8-L45), [oldest command without outcome](../../../packages/system-worker/src/AggregateChain/readPendingAggregateCommand.ts#L6-L22), [fixed drain boundary and independent failures](../../../packages/system-worker/src/makeFanoutQueue/runFanoutDeliveries.ts#L19-L63).
- [Commit before acknowledgement and capability disposal](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L270-L301), [receiver replay/duplicate recovery](../../../packages/system-worker/src/AggregateVersionRepo/replayCommands/replayCommand.ts#L37-L54).
- [Current VersionRepo activation](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L226-L231), [cold catch-up call](../../../packages/system-worker/src/AggregateVersionRepo/catchupMaterialization/catchupMaterialization.ts#L7-L17), [bound identity and durable receiver cursor](../../../packages/system-worker/src/AggregateVersionRepo/replayCommandsFanoutSubscriber/replayCommandsFanoutSubscriber.ts#L39-L68), [explicit subscription checkpoint](../../../packages/system-worker/src/makeFanoutSubscriber/subscribe.ts#L35-L55).
- [Validated leased enrollment](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L429-L480), [producer revision and drain recovery](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L291-L345), [original acknowledgement recovery handoff](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L181-L191), [durable alarm renewal/isolation](../../../packages/system-worker/src/makeRecoveryRegistry/makeRecoveryRegistry.ts#L28-L79).

## Review reconciliation and verification limits

Both independent reviewers recommend retaining the two-column model and current names. No new ordinary-path lifecycle, privacy or column-ownership defect was found. The old stored availability/suspension/null-progress findings are historical and resolved by Plan 153; do not restore those concepts. The current cold-activation `.catchup()` boundary is recorded explicitly rather than carrying forward the old finding's obsolete activation description.

Only this finding and Plan 151 are edited. No implementation, tests, fixtures, runners, configuration, storage reset or deployment is authorized or performed. All verification remains deferred: no typecheck, lint, tests, builds, acceptance, formatting, whitespace/link/range validation, preservation comparison or independent implementation verification ran. Plans 211, 212 and 213 remain active and unverified; additional AggregateVersionChain publication `dispositionChainHash` validation remains separately deferred. Source review is distinct from those unfinished implementation checks.

**Next table:** ServiceVersionRepo.materializationHead, following Plan 151's owner/table order. Other owner-specific migration-ledger occurrences retain their separate review status.

## Historical source review — 2026-10-14

The following pre-Plan-153 audit is preserved as historical evidence. Its old columns, citations, future-tense implementation language and activation description do not describe the current binding above.

### Original table: AggregateChain.aggregateVersionRepos

**Reviewed:** 2026-10-14

**Status:** Historical source review complete. The settled two-column model and automatic later recovery are implemented and verified by [archived Plan 153](../../archive/plans/153-plan-aggregate-chain-replay-subscribers.md).

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

**Implementation subplan:** [Plan 153](../../archive/plans/153-plan-aggregate-chain-replay-subscribers.md).

The findings below record the source before Plan 153. Its current table is `replaySubscribers`, containing only `aggregateVersion` and nonnullable `acknowledgedAggregateIndex`. Authored aggregate release membership supplies availability, and shared fanout drains retain durable alarm recovery without a stored suspension or manual resume. Consult the implementation plan for current verification evidence and remaining work.

## Verdict

This is a source-owned replay subscription ledger, not a registry of existing or live VersionRepos. Current rows remember receiving-release progress and a persisted suspension reason. The database already fixes the System and aggregate instance/name. The maintainer has selected `replaySubscribers` as the table name and rejected persisted suspension: the desired durable facts are receiving release and acknowledged progress.

The full Repo name duplicates owner context and release; `active` mirrors the bundled authored aggregate release registry; cursor null duplicates zero. The current failure field has real blocking semantics, which the selected automatic-recovery policy deliberately removes. Replace its scheduling role before deleting it; a column deletion alone would not implement safe retries.

## Every column

| Column                     | Actual purpose and lifecycle                                                                                                                                                                                                  | Disposition                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `aggregateVersionRepoName` | Primary key, generated from System/aggregate identity plus receiving release. Immutable; the generic queue reparses it to acquire the recipient.                                                                              | Derive transiently from the Chain key plus version instead of retaining a complete route name.                      |
| `aggregateVersion`         | Receiving authored aggregate release. Unique; written during activation/enrollment. Delivery currently reads the same version from the full Repo name instead; this column has no named runtime reader.                       | Retain as the canonical row key.                                                                                    |
| `active`                   | Current bundled-registry membership. Activation marks every row false, then marks bundled releases true. Removed releases retain cursor/failure, and readdition preserves them.                                               | Derive membership from the current registry; it is not connection liveness or replay readiness.                     |
| `currentIndex`             | Highest inclusive aggregate position the Chain accepts as durably processed by this release. Acknowledgement and receiver enrollment advance it monotonically. It can lag actual receiver state after a lost acknowledgement. | Retain confirmed progress with an explicit name; use nonnullable zero.                                              |
| `failure`                  | Encoded typed delivery failure that suspends pushed replay. Non-null rows are ineligible; ordinary enrollment refuses them. Activation preserves the failure, and explicit resume clears it without rewinding progress.       | Remove persisted suspension under the selected automatic-recovery policy; replace its scheduling role deliberately. |

[Table definition](../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts#L49-L63), [physical recipient identity](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoName.ts#L7-L13), [Chain queue wiring](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L66-L99).

## Findings

### 1. Persist the release identity once

The recipient name is exactly the containing Chain's `systemId / aggregateId / aggregateName` plus `aggregateVersion`. Activation derives the complete name and stores both it and the version. Delivery then reparses the name. This is a generic queue-interface dependency, not independent domain information. [Name generation](../../../packages/system-worker/src/AggregateChain/onRepoStartup/onRepoStartup.ts#L20-L30), [delivery lookup](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L261-L275).

Use the receiving release as the durable identity and reconstruct the complete recipient key/name at the queue's delivery seam. Preserve enrollment's bound-owner validation. Do not retain the complete name under a different column or add a second identity table to preserve the current generic interface.

**Maintainer decision, 2026-10-14:** name the table `replaySubscribers`. Do not split the complete Repo name into more persisted owner columns. The proposed row stores only the receiving `aggregateVersion`; the Chain supplies its bound System/aggregate context when acquiring that VersionRepo. SystemRepo's actual Repo registry has a separate responsibility; this table does not prove Repo existence.

### 2. `active` mirrors configuration, and enrollment has a second membership path

One synchronous activation transaction sets all entries inactive and inserts/reactivates the current bundled releases, preserving existing cursor/failure. Queue selection filters on this flag. There is no live-connection lifecycle or operator activation setter behind it. This is **authored aggregate release membership reconciliation**, not alarm-registry reconciliation. [Release membership reconciliation](../../../packages/system-worker/src/AggregateChain/onRepoStartup/onRepoStartup.ts#L35-L57), [replay selection wiring](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L87-L98).

The authored aggregate release registry lists the executable releases bundled in the Worker. The [recovery registry](../../../packages/system-worker/src/makeRecoveryRegistry/makeRecoveryRegistry.ts) separately registers recovery operations and schedules durable wake-ups. Always qualify which registry is meant in future explanations.

Derive eligible release membership from the bundled aggregate registry while keeping dormant rows. Removing the flag must not delete removed releases' history or reschedule an unavailable release.

Source also shows inconsistent membership authority: fresh `queue.subscribe` validates owner fields and cursor, then its encoder inserts `active: true` without checking bundled release membership. Existing enrollment only advances the cursor and leaves an inactive row inactive. Consequently the same subscription request's eligibility depends on whether a row already exists. [Owner-only validation](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L67-L84), [insert versus existing update](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L133-L164), [new-row encoder](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L80-L98).

**Recommendation:** one domain rule must determine whether a receiving release is eligible. Use current registry membership consistently for both enrollment and dispatch rather than two persisted membership writers. This is a source-confirmed inconsistency; no runtime probe or security claim is made.

Here “eligible” only means that there is a next replay delivery to attempt now: the receiving release's code is available, its acknowledged position is behind the finalized source history, and it is not already being delivered in this pass. Those selection requirements do not require an `active` column or an operator-controlled enablement gate. A missing receiving release's cursor/history stay retained and its backlog can continue automatically when its code returns.

### 3. Null progress adds no lifecycle state

Eligibility uses `coalesce(currentIndex, 0)`; delivery uses `currentIndex ?? 0`; acknowledgement and repeated enrollment also coalesce before taking the maximum. A retained null can become zero merely through re-enrollment without any command replay. [Selection/acknowledgement](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L66-L116), [enrollment](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L146-L153), [delivery cursor](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L250-L259).

Null therefore does not mean unregistered, disconnected or waiting for a recipient subscription. Chain activation creates null rows and they can receive pushed replay immediately. The generic subscriber's zero-to-null conversion is an encoding convention, not a different durable state. [Receiver enrollment](../../../packages/system-worker/src/makeFanoutSubscriber/subscribe.ts#L35-L55).

**Maintainer decision, 2026-10-14:** name confirmed progress `acknowledgedAggregateIndex`. Use nonnullable zero for no confirmed commands. It can trail receiver commitment after interruption. A newer receiver-reported checkpoint or late page acknowledgement advances it with `max`; neither can rewind it. Standardizing queue acknowledgement-field names is recorded in [TODOS.md](../../../TODOS.md).

### 4. Failure means suspension, not a business outcome or retry diagnostic

Delivery acknowledges a page only after successful receiver commitment. Exactly one typed lookup/accessor/receive failure is encoded and persisted. Subsequent pushed delivery excludes that row; repeated enrollment refuses to clear it. Explicit resume clears the failure transactionally and starts another drain. [Failure classification](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L261-L288), [blocking selection](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L96-L100), [failed enrollment](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L146-L181), [resume](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L184-L221).

This is different from `commands.lastDeliveryFailure`. Defects, interruption and mixed Causes escape instead and retain alarm recovery. Healthy receiving releases can continue when one release is suspended.

**Maintainer decision, 2026-10-14:** typed delivery errors and defects do not justify an indefinite pause. Keep command history and the acknowledged cursor, report failures, and retry later through alarm recovery. Newly appended commands remain behind the failed occurrence until successful replay. A corrected Worker automatically gets another chance; add no manual resume requirement, persisted suspension reason, deployment-reset gate or replacement failure flag. Log alerts are a later observability task, not a prerequisite for retries.

Required scheduling changes:

- A failed delivery never advances acknowledged progress. Retained recipient commitment handles uncertain acknowledgements and exact redelivery.
- Attempt a failing release once per drain; remember failures only for that pass. Do not clear that exclusion merely because new commands extend the source tip. Healthy receiving releases continue independently.
- Typed errors, defects and dispatcher-wide failures preserve or renew durable alarm recovery. The current drain releases its alarm before reporting a settled typed failure, and per-recipient defects currently abort its scoped siblings; both paths need deliberate changes.
- Explicitly schedule a later wake-up. An in-memory lease alone cannot rearm a consumed alarm. Release recovery only when there is no retryable backlog or concurrent producer work.
- Keep scheduling state transient. Do not add persisted attempts, next-retry times or deployment identities.

[Current drain settlement](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L337-L355), [per-recipient settlement](../../../packages/system-worker/src/makeFanoutQueue/runFanoutDeliveries.ts#L29-L60), [durable alarm hold](../../../packages/system-worker/src/makeRecoveryRegistry/makeRecoveryRegistry.ts#L43-L46). These describe future changes, not implemented behavior.

## Enrollment and recovery facts

1. The Chain seeds current release membership during its own activation. AggregateVersionRepo's current activation hook only recovers external work; it does not automatically subscribe this replay feed. Generic subscription documentation is not sufficient evidence of that lifecycle. [VersionRepo hook](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L409-L412).
2. Receiver catch-up can separately report a committed checkpoint. Source enrollment validates bound identity and updates retained progress monotonically in a synchronous transaction. Enrollment must remain independent of a drain waiting for the receiver's cold activation.
3. A page can commit at the receiver before its source acknowledgement is lost. Redelivery reuses retained occurrences; the receiver skips its committed prefix and validates retained command identity. The source's cursor is confirmed knowledge, not distributed atomic state. [Replay retry](../../../packages/system-worker/src/AggregateVersionRepo/replayCommands/replayCommand.ts#L37-L52).
4. Disposing a receiver capability does not remove the SQL row or deactivate the release. There is no unsubscribe operation. Release removal/readdition preserves progress and suspension through registry reconciliation.

## Simplest proposed model

```ts
{
  aggregateVersion: number; // primary key within the Chain
  acknowledgedAggregateIndex: number; // starts at 0
}
```

The Chain supplies aggregate/System context. The authored aggregate release registry supplies current code availability. The queue derives complete recipient identity and retries failures through the alarm registry. The two-column model and automatic recovery are settled and tracked in Plan 153. No implementation has started.

## Evidence and verification limits

Two independent reviewers traced all five columns, enrollment, reconciliation, delivery, acknowledgement and resume. Primary-agent reconciliation checked the shared storage/queue procedures and separated generic behavior from this concrete owner. Current working-tree source was reviewed; no tests or runtime probes were run and no code was changed.

Recheck source before implementation, particularly shared fanout consumers and any new resume call sites. Other subscriber tables have not been reviewed by this finding.
