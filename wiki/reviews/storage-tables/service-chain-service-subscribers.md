# ServiceChain.replaySubscribers

**Current-binding review:** 2026-10-16, against current source with independent column-design and replay-lifecycle reviewers. This filename is retained from the original `serviceSubscribers` review. Only this ServiceChain table is reviewed; all verification remains deferred.

**Verdict: retain exactly `serviceVersion` and `acknowledgedServiceIndex`, with their current names and constraints.** They record receiving-release membership and the contiguous prefix confirmed to ServiceChain. No additional schema, state, naming or lifecycle cleanup is justified by this refresh.

**Status:** source review recorded in [Plan 151](../../plans/151-plan-storage-table-review.md). [Plan 158](../../archive/plans/158-plan-service-chain-replay-subscribers.md) implemented and verified the two-column model on 2026-10-15 against an earlier snapshot. That historical result does not verify current code or active Plans 196/211/212/213/214/215/216/217/218/219. [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md) and applicable [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md) rules govern current Service ownership.

## Physical owner and represented fact

One ServiceChain fixes `{ systemId, serviceName }`. One receiving ServiceVersionRepo adds `serviceVersion`. A subscriber row records that receiving release's membership and source-confirmed replay progress through this ServiceChain's retained admitted commands. This is **subscriber progress**, not a live connection, command producer, materialized resource, complete pending payload or retained execution history.

The receiving release can differ from an admitted command's original `serviceVersion`. ServiceChain reconstructs the receiver key from its own owner plus the stored receiving version. ServiceVersionRepo evaluates under its own bound release; the transported admitted command preserves original provenance independently. A full receiving Repo name, repeated owner fields or the latest original command's release cannot replace this identity.

- [ServiceChain owner](../../../packages/system-worker/src/ServiceChain/serviceChainName.ts#L6-L10), [receiving owner](../../../packages/system-worker/src/ServiceVersionRepo/serviceVersionRepoName.ts#L6-L14), [exact queue identity binding/reconstruction](../../../packages/system-worker/src/ServiceChain/ServiceChain.ts#L77-L96).

## Every current column, constraint and consumer

Both columns are required/non-null, with no SQL defaults. `serviceVersion` is the text primary key. There is no explicit secondary index, foreign-key relation, generated application ID, JSON member, timestamp, status, failure or membership flag. The declaration does not impose semantic-version formatting or a SQL nonnegative/safe-integer CHECK; supported enrollment and delivery boundaries supply identity/cursor validation. Zero is explicitly inserted, not a SQL default or a second representation of null.

| Column                     | Meaning, writers/readers and mutability                                                                                                                                                                                                                    | Necessity and removal consequence                                                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serviceVersion`           | Required receiving release identity, immutable for the row. Source activation/enrollment insert it; queue availability, selection, receiver-key reconstruction and exact acknowledgement address it.                                                       | Retain as the primary key. Distinct authored release materializations need independent memberships and cursors. Removing it collapses recipients; a full receiver name repeats the fixed System/Service owner.                             |
| `acknowledgedServiceIndex` | Required inclusive contiguous position confirmed to ServiceChain. Activation seeds zero only for a missing release. Enrollment and successful delivery advance it monotonically through SQL `max`. Selection compares it to the finalized source boundary. | Retain. It is not derivable from the source tip or necessarily equal to the receiving Repo's local head. Removing it loses durable per-release confirmation after restart, partial delivery or a lost reply. Null has no distinct meaning. |

There is no nested structured value to audit in this two-scalar row. The shared store's generic `coalesce(cursor, 0)` expression does not make this Service column nullable; it does not justify restoring nullable Service progress or adding a compatibility path.

- [Exact current declaration](../../../packages/system-worker/src/ServiceChain/serviceChainDbConfig.ts#L47-L53), [explicit zero/conflict-do-nothing activation](../../../packages/system-worker/src/ServiceChain/onRepoStartup/onRepoStartup.ts#L18-L38), [availability/selection](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L109-L168), [monotonic acknowledgement and enrollment](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L169-L198).

## Authored availability and durable membership

ServiceChain supplies `availableSubscriberIdentities` from the authored release keys in `config.system.services[this.key.serviceName]`. Shared enrollment compares every fixed source-owner field and requires the receiving identity to belong to that list before upserting. Dispatch uses the same availability list. The old finding's missing-availability-check observation is obsolete in this binding.

Source activation holds original-command/replay recovery, then inserts every authored receiving version at zero in one synchronous transaction using conflict-do-nothing. It neither resets an existing cursor nor removes a version absent from the current authored code. Missing code leaves a dormant membership and acknowledged prefix; restored code can resume its retained backlog.

Authored availability is code membership, not socket liveness, receiver health or the recovery registry. Persisting `active`, pause, failure or deployment-reset flags would duplicate or alter that policy. A caught-up row remains enrolled for future commands. There is no automatic unsubscribe, expiry or retirement mechanism in this binding.

- [Authored availability supplied by ServiceChain](../../../packages/system-worker/src/ServiceChain/ServiceChain.ts#L83-L96), [owner/availability validation and eligible selection](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L109-L168), [non-destructive activation enrollment](../../../packages/system-worker/src/ServiceChain/onRepoStartup/onRepoStartup.ts#L18-L38).

## Finalized source boundary and receiving progress

`readReplayCommandsPage` exposes only the contiguous admitted-command prefix with retained original `outcome`. Its tip is immediately before the first command whose outcome is null, or the admitted tip if none is pending. It returns at most 64 rows, requires nonnull outcome and respects the requested fixed maximum. Reading does not execute pending originals. The canonical outcome remains `{ result, finalizedAt }`; there is no `commandOutcome` field in this current binding.

Each drain captures one finalized boundary. Public `lastIndex` can advertise more history than a particular page delivered, so acknowledgement must use the final delivered row, bounded by that drain. It must not copy the advertised tip or infer progress from the command's original release.

ServiceVersionRepo's subscriber checks exact `systemId/serviceName` against its bound owner. Its cursor reader uses actual `materializationHead.serviceIndex`, returning zero only when no local head exists. The old finding's hardcoded-zero report and external-work activation descriptions no longer describe current source.

Current cold activation calls `catchupMaterialization`, which invokes `.catchup()` while the receiving publication outbox owns recovery around materialization. Catch-up captures the first returned finalized boundary, re-reads durable local progress around concurrent pushes and continues only until that fixed boundary is committed. A local head already ahead is valid.

**Pulled catch-up does not directly advance ServiceChain's subscriber acknowledgement.** Source activation already owns automatic release enrollment. Explicit `.subscribe()` separately catches up, reads the actual local head and reports it to the source. Shared enrollment validates a safe nonnegative position no greater than the current finalized source tip, then performs a synchronous monotonic upsert. Zero is a valid report, not a forced report for an already-materialized receiver.

- [Pending-original boundary](../../../packages/system-worker/src/ServiceChain/readPendingServiceCommand.ts#L7-L22), [bounded finalized replay page](../../../packages/system-worker/src/ServiceChain/readReplayCommandsPage.ts#L14-L46), [subscriber source identity and actual head](../../../packages/system-worker/src/ServiceVersionRepo/replayCommandsFanoutSubscriber/replayCommandsFanoutSubscriber.ts#L41-L69).
- [Actual receiving activation](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts#L84-L87), [activation catch-up procedure](../../../packages/system-worker/src/ServiceVersionRepo/catchupMaterialization/catchupMaterialization.ts#L7-L16), [fixed-boundary pull and local re-read](../../../packages/system-worker/src/makeFanoutSubscriber/runFanoutCatchup.ts#L34-L90), [explicit catch-up then enrollment](../../../packages/system-worker/src/makeFanoutSubscriber/subscribe.ts#L35-L56), [safe source-bound enrollment](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L429-L480).

## What source acknowledgement proves

1. ServiceVersionRepo receives the page through its owner-local replay procedure and commits one admitted command at a time. Each resource change, local materialization head and complete pending ServiceVersionChain output share one synchronous transaction. A page is not one atomic receiving transaction.
2. Only a successful complete receive envelope permits ServiceChain to advance the subscriber cursor, to the final delivered row. SQL `max` prevents delayed acknowledgement or stale enrollment from rewinding a newer confirmation.
3. A later command failure can leave a committed receiving prefix ahead of ServiceChain's cursor. A lost successful reply can have the same effect. Redelivery validates/reuses already committed output and skips reevaluation of those positions; a gap fails before new materialization.
4. The transported original outcome establishes source finalized eligibility. The receiving release evaluates its own program/result; its result need not equal the original. Replay removes external emissions before preparation/ID allocation without renumbering retained model operation positions.
5. Source acknowledgement proves the receiving materialization/output commit covered the delivered prefix. It does not prove ServiceVersionChain publication, projection application, browser delivery or an original-command receipt on another owner. Those durable facts have separate owners and recovery.

The receiving head and the source acknowledgement therefore carry different responsibilities. Copying the receiving head into every source read, replacing the cursor with a source tip or adding another durable receiver-state mirror would blur the protocol rather than simplify it. No result hash, timestamp or extra receipt field is required in this row.

- [Per-command replay loop](../../../packages/system-worker/src/ServiceVersionRepo/replayCommands/replayCommands.ts#L9-L16), [materialization transaction](../../../packages/system-worker/src/ServiceVersionRepo/materializeCommandTx.ts#L15-L42), [resources/head/output retention](../../../packages/system-worker/src/ServiceVersionRepo/utils/retainEvaluatedCommandTx.ts#L19-L53), [receive before final-row acknowledgement](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L258-L290).
- [Committed-position/gap handling](../../../packages/system-worker/src/ServiceVersionRepo/utils/readServiceOccurrenceTx.ts#L27-L69), [replay duplicate handling](../../../packages/system-worker/src/ServiceVersionRepo/replayCommands/replayCommand.ts#L41-L55), [pending/history output recovery](../../../packages/system-worker/src/ServiceVersionRepo/findEvaluatedCommand.ts#L31-L68), [sparse operation positions/external suppression](../../../packages/system-worker/src/ServiceVersionRepo/utils/prepareServiceOutput.ts#L25-L41).

## Concurrent recovery and retention

Drains serialize through one semaphore; a drain may deliver concurrently to up to 100 receiving releases. Failed recipients are excluded only within that drain. Healthy recipients continue before typed failures/defects are combined and reported. Failure or interruption renews the durable replay alarm after scoped cleanup, so later alarms can retry backlog without persisted suspension or manual resume.

Producer leases and revisions protect recovery from concurrent enrollment and original finalization. Enrollment does not wait for the drain semaphore, avoiding a drain waiting on a cold receiver whose activation must read/enroll at the source. A concurrent producer prevents an empty drain from releasing recovery prematurely. The original-outcome completion hook acquires a scoped replay producer lease and explicitly calls `replayCommandsFanout.wake()` on exit, including repair after a receipt committed before its completion hook finished. Its revision prevents an older drain with a captured pre-finalization tip from clearing the newly finalized prefix's recovery before the queued pass starts. Releasing a producer lease only updates producer bookkeeping.

**Deletion condition:** none in the supported lifecycle. Retain receiving membership and source-confirmed progress for this ServiceChain's lifetime, including caught-up and temporarily unavailable releases. RPC capability disposal is not subscriber deletion. A permanent release-retirement policy would require a separate decision; this review introduces none. Acknowledgements update the subscriber row and never delete retained commands or ServiceVersionChain history.

- [Fixed-prefix recipient isolation](../../../packages/system-worker/src/makeFanoutQueue/runFanoutDeliveries.ts#L19-L63), [producer leases, drain serialization and alarm renewal](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L291-L345), [enrollment outside the drain semaphore](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L429-L480), [original-outcome wake hook](../../../packages/system-worker/src/ServiceChain/ServiceChain.ts#L162-L172), [independent recovery operations](../../../packages/system-worker/src/makeRecoveryRegistry/makeRecoveryRegistry.ts#L28-L79).

## Historical assessment and current reconciliation

The 2026-10-15 review examined a four-column `serviceSubscribers` row. Plan 158 removed the full `serviceVersionRepoName` because owner plus receiving version reconstructs it, removed `active` in favor of authored availability and replaced nullable `currentIndex` with nonnull `acknowledgedServiceIndex` seeded at zero. `serviceVersion` became the primary key. Those decisions remain settled.

Archived Plan 158 records its earlier schema, membership, numeric-zero, lost-acknowledgement, dormant-code and shared replay/failure checks. Its passing evidence belongs to that snapshot. The current refresh corrects the former finding's obsolete membership/activation/zero-cursor/commandOutcome descriptions; it does not rerun those checks or reopen the implemented model.

Both independent current reviewers support both columns/current names, exact receiving identity, authored availability/dormant retention, actual-head catch-up, source-only confirmation and monotonic recovery. No new ordinary-path correctness/privacy defect or implementation cleanup was identified. Service pending-request/capability changes remain separately governed by active Plans 219/218/217 and their unrun checks.

Only this existing finding and Plan 151 change. No production/schema edits, tests, fixtures, runners, configuration, storage reset, deployment or commit occur. All verification remains deferred: no typecheck, lint, tests, builds, acceptance, formatting, documentation/link/citation/whitespace checks, independent implementation review or unchanged-storage comparisons ran. The two source reviewers do not verify any active implementation. Inventory totals are not revalidated, and no new storage cutover is proposed.

**Next table:** SystemRepo.acceptedDefinitions. Catalogue ownership and retention need their own finding; this Service subscriber review grants no verdict on them.
