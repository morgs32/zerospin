# Shopping promotion ServiceVersionRepo.promotionReservation

**Reviewed:** 2026-10-17 against the original simulator, with independent lifecycle and column-design reviewers. **Approved implementation follow-up:** [Plan 239](../../archive/plans/239-plan-shopping-promotion-reservations.md) replaces that simulator with the concrete Shopping promotion feature under [ADR 018](../../adrs/018-shopping-promotion-ownership-and-observation.md). Implementation is written and all verification remains deferred. Exactly this source ServiceVersionRepo resource responsibility is recorded; projections, Nodes/replicas and other resource-owner contexts retain separate review status.

**Verdict: retain the eight-column reservation resource under the now-approved feature.** The earlier recommendation to remove an unused development-only simulator is superseded by the maintainer's requirement to restore promotion. Promotion Service owns shared allocation, ten-minute holds, Purchase commitment, cancellation and 100 lifetime redemptions. User Aggregate owns Cart intent/request observations and payment; the authenticated read-only Promotion session independently exposes owned reservations. A failed Aggregate request can coexist with a saved Service allocation.

## Ownership and representation

**Application completion (2026-10-21):** [Plan 239](../../archive/plans/239-plan-shopping-promotion-reservations.md)
is complete. Explicit SDK harness stories in
[reservation tests](../../../examples/shopping/tests/promotion.spec.ts),
[payment tests](../../../examples/shopping/tests/promotion-checkout.spec.ts) and
[System tests](../../../examples/shopping/tests/system.spec.ts) pass cancellation
before queued reservation delivery, capacity and terminal-ID accounting,
expiry/committed retention, paid/declined/uncertain payment, exact Purchase
binding, stale selection/decision refusal and reservation reuse. All nineteen
workspace scenarios and strict compiler checks pass; source review confirms
the exact-ID read-only observer and identity selection configuration. Generic
delivery, replay, authentication/provider and Backend Node verification remain
with Plans 151/214/218/221/249 and do not block application closure. The dated
source findings below remain historical; no storage reset or deployment occurred.

[promotionServiceRelease](../../../examples/shopping/src/zerospin/services/promotion/promotionServiceReleaseV1.ts) remains `promotion@1.0.0`, with one promotionReservation Model and four concrete commands. [Shopping's System](../../../examples/shopping/src/zerospin/system.ts) registers it. ServiceVersionRepo's physical owner is `(systemId, serviceName='promotion', serviceVersion=1)`; its resource table is composed alongside materializationHead and complete pending publication, without resource-owned command/execution history.

[PromotionReservationV1](../../../examples/shopping/src/zerospin/services/promotion/models/promotionReservation/PromotionReservationV1.ts) uses the existing Model/table codecs: **eight SQL fields**, plus bound modelName/version in complete resource envelopes. Constant promotionId is removed. No custom storage adapter or per-row identity derivation machinery is introduced.

| Column        | Meaning and nullability                              | Responsibility and retention                                                                                                                                                       |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | Required prv-prefixed primary key                    | One-use reservation identity. Retained terminal rows prevent reserve/commit from reopening a denied/cancelled/consumed ID; command deduplication is a separate guarantee.          |
| `createdAt`   | Required resource timestamp                          | Original reservation decision or cancellation-tombstone creation. Uses logical Service evaluation time.                                                                            |
| `updatedAt`   | Required resource timestamp                          | Current resource transition time; this is not a separate transition log.                                                                                                           |
| `aggregateId` | Required shopper Aggregate identity                  | Shared Promotion Service cannot derive individual shopper identity from its owner. Guards and authenticated Actor selection scope access to this value.                            |
| `cartId`      | Required crt-prefixed identity                       | Exact Cart association and active-reservation exclusion inside the owner transaction. This is an identity descriptor, not a cross-database SQL reference.                          |
| `purchaseId`  | Nullable pur-prefixed identity                       | Null before commitment. Commitment and Purchase-bound cancellation freeze an exact Purchase binding; release/redemption cannot use another Purchase.                               |
| `expiresAt`   | Nullable safe integer in epoch milliseconds          | Service assigns a deadline only when granting a hold. Denied/absent-cancellation rows use null; later transitions preserve the original deadline. Commitment does not auto-expire. |
| `status`      | Required reserved/denied/committed/released/redeemed | Current allocation/ID-retirement decision. Nullable Purchase/deadline cannot replace this state.                                                                                   |

Full resource envelopes retain modelName/version through common bound codecs. Existing primitive validation supplies identifier, timestamp, safe-integer and enum representation. Cross-field allocation and capacity rules belong to the Service transaction rather than a new generic reservation framework or copied availability column.

## Capacity and retained terminal resources

1. **Reserved:** null Purchase, granted deadline. Counts toward capacity and active Aggregate/Cart exclusion only while expiresAt is later than logical evaluation time. Expiry does not delete the row or permit reuse of its ID.
2. **Committed:** exact Purchase binding. Counts toward capacity and active Aggregate/Cart exclusion regardless of deadline. Unknown payment retains this allocation; no timer guesses the provider result.
3. **Redeemed:** same Purchase binding. Counts permanently toward 100 lifetime allocations and cannot be released. Moving committed→redeemed counts the same resource once.
4. **Released:** no capacity use. Retains nullable/exact Purchase binding and the original deadline, if one existed. An absent release creates a tombstone with null deadline so a delayed reserve/commit cannot allocate that ID.
5. **Denied:** no capacity use. Retains the decision and retires the ID even if capacity later becomes available. A fresh application requires another ID.

Capacity is committed + redeemed + unexpired reserved. Active Aggregate/Cart exclusion is committed + unexpired reserved for that exact pair. Both checks and the grant occur within ServiceVersionRepo's synchronous evaluation/application transaction. Terminal resources are necessary current business state: deleting redeemed resources reopens lifetime capacity; deleting denied/released resources reopens retired IDs. Neither publication acknowledgement nor external request settlement deletes them.

## Command transitions and response ambiguity

1. Reserve creates reserved or denied for a fresh ID. Existing owned IDs return their existing small decision without reopening. Service assigns availability/deadline; caller expected/available/expiresAt fields are removed.
2. Commit requires a live reserved row and binds its exact Purchase. Repeated same-Purchase commitment is idempotent. A retired, missing, expired or differently bound row refuses.
3. Cart cancellation carries null Purchase and cancels absent/unbound allocation, refusing committed/redeemed allocation without exact Purchase binding.
4. Purchase cancellation releases its exact committed allocation or retires an absent/unbound row before delayed commitment. Conflicting Purchase binding refuses. Redeemed allocations cannot be released.
5. Redeem changes exact Purchase committed→redeemed and is idempotent for that same Purchase. Unreachable simulator missing-row creation branches are removed.
6. Each command returns reservationId/status/nullable purchaseId/nullable expiresAt. The authored Aggregate request constructs stable Service command identity/input and handles encoding/retained receipt decoding. Aggregate continuations never consume Service history or serviceIndex.

A request can exhaust bounded retries after Promotion Service committed. Aggregate Cart/Purchase records failed request progress without overwriting Service allocation. Read-only observation queries the exact retained reservation ID and can show held/committed/released/redeemed independently. No query callback writes Aggregate state, retries work or initiates payment. Failed release/redemption may conservatively retain committed capacity until an explicit matching transition succeeds.

## Transaction, replay and privacy boundaries

1. ServiceVersionRepo validates/evaluates/applies under its synchronous transaction/savepoint and commits resource changes, materializationHead and complete pending publication together. External requests run outside owner transactions and execution gates.
2. Original execution samples one logical outcome.finalizedAt. Replay reuses the retained original value and scopes a frozen Effect wall Clock to synchronous Service validation/evaluation; resource writes use that same timestamp. Monotonic timing/sleep and external requests/alarms/ordinary queries retain live timing. Historical lease decisions must not change when reconstructed after expiry.
3. Promotion shopper Actor uses existing Clerk verification and exposes only rows whose aggregateId matches the verified subject. It has `contracts: {}`. The unused global ledger query and development gate are removed; allocation mutation remains through Aggregate external contracts.
4. Cart stores selected/removal intent and request progress only. Purchase freezes Cart/reservation identities for later release/redemption, which must not depend on Cart's latest checkout pointer. Complete resource envelopes remain intact through existing codecs.

## Historical review and implementation limits

The original source review found a dormant nine-column development simulator with no first-party checkout consumer. It recommended removal, while explicitly recognizing that terminal rows served allocation/ID-retirement responsibilities if the feature were retained. The maintainer then approved the business feature, independent observer and eight-column model in Plan 239. That requirement supersedes the removal recommendation; keeping old machinery solely because it was registered remains unjustified.

Plan 239 removes the constant promotionId, caller comparison/availability/deadline inputs, development-only layer, global ledger query and dead transition branches. It adds no compatibility path, replacement ledger, retention job or custom storage layer. Its replay-clock follow-up amends [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md) and is linked from [Plan 214](../../archive/plans/214-plan-service-ordered-operations-and-finalized-at.md).

All implementation verification remains deferred, including formatting, lint/typecheck/build/tests, contract/resource acceptance, documentation/link/reference checks, preservation comparisons and independent implementation review. Source-derived design is not runtime evidence. No new test files/fixtures/runners/configuration, browser verification, Explorer check, storage reset, deployment or data deletion is authorized. Changed affected schemas/protocols require empty storage under the pre-release policy.

**Next owner/table:** Tic-tac-toe game AggregateVersionRepo.game, declared by gameV1.ts under game@1.0.0. Its [release binding](../../../examples/tic-tac-toe/src/gameAggregateReleaseV1.ts) and [System registration](../../../examples/tic-tac-toe/src/system.ts) remain inventory context only; its columns/lifecycle and every other resource owner require separate review.
