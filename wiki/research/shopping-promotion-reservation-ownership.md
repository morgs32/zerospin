# Shopping promotion reservation ownership

**Date:** 2026-10-17

**Status:** Source-grounded design history supporting [Plan 239](../archive/plans/239-plan-shopping-promotion-reservations.md) and governing [ADR 018](../adrs/018-shopping-promotion-ownership-and-observation.md). The expanded application harness batch passes; Plan 239 records the app completion evidence. This research remains design history.

**2026-10-21 current-design note:** [ADR 018](../adrs/018-shopping-promotion-ownership-and-observation.md)
supersedes this document's response-progress design. Reserve, release and redeem
now use existing command operations; the read-only Promotion session supplies
allocation facts. Cart retains selection/removal intent, and Purchase retains
`promotionCommitRequested` instead of response progress. Commitment alone keeps
its external request/continuation before payment. The earlier research below is
preserved as design history. Current Shopping registers only integer User,
Marketplace and Promotion revision `1`. Application verification assumes the
framework works: replay/frozen-clock checks belong to Plan 214, Actor
admission/selection privacy to Plans 218/221, and Backend Node recovery to
Plan 249. Generic command delivery and external Clerk-provider integration remain
parent Plan 151 follow-ups, independently of application-plan closure.

## Question and accepted shape

How can Shopping restore a fixed limited promotion while keeping personal checkout independent from shared allocation authority, including lost responses and refresh?

Browser mutations remain User Aggregate commands. Aggregate external contracts invoke Promotion Service. A separate read-only, authenticated Promotion session observes reservation resources. UI combines those views without a subscription that turns observation into another command. The Service and Aggregate need explicit reservation/Cart/Purchase identities; they do not share durable workflow ownership.

| Fact                                        | Owner and durable evidence                               |
| ------------------------------------------- | -------------------------------------------------------- |
| Shopper selected/removed promotion          | User Aggregate Cart.promotion                            |
| Aggregate observed request response/failure | Cart.promotion.requestState or Purchase.promotionRequest |
| Reservation granted/denied/released         | Promotion Service promotionReservation.status            |
| Reservation currently committed to Purchase | Promotion Service purchaseId/status                      |
| Exact amount sent for payment               | User Aggregate Purchase.total                            |
| Provider paid/declined/unknown observation  | User Aggregate Purchase paymentState/evidence            |
| Lifetime promotion consumed                 | Retained Promotion Service redeemed resource             |

A failed request is not a Service allocation state. If Promotion Service commits a reservation but its reply is lost, AggregateChain eventually records externalOutcome.Failure while ServiceVersionRepo still holds reserved. The UI must preserve “held” and the failed-response observation together. Treating missing response as no allocation loses the Service fact; treating the saved allocation as Aggregate request success invents an observation.

## Existing source boundaries reused

1. [Aggregate external operations](../../packages/system-worker/src/AggregateChain/recordOriginalCommandOutcomeTx.ts) retain complete pending request descriptions only after original resource commit. Original request observation/admission is distinct from continuation execution; Plan 239 preserves those queue semantics.
2. [Shopping quotation](../../examples/shopping/src/zerospin/aggregates/user/contracts/getExternalPurchaseQuoteV1.ts) already integrates a remote, read-only Marketplace observation through authored request retries and a guarded continuation. Promotion request encoding/idempotency/result decoding belongs in its own cohesive request implementation, not generic delivery infrastructure.
3. [Shopping payment](../../examples/shopping/src/zerospin/aggregates/user/contracts/processExternalPaymentV1.ts) retains stable provider identity and needs_reconciliation when response does not establish payment outcome. Promotion commitment must survive that uncertainty rather than expire or release on a local timeout.
4. [Model declaration/codecs](../../packages/core/src/models/make/makeModelVersion.ts) separate bound SQL representation from complete resource envelopes. New Cart/Purchase attributes and eight reservation SQL fields need no custom storage adapter or model-identity derivation helper.
5. [Read-only catalog Actor](../../examples/shopping/src/zerospin/services/marketplace/actors/catalogActorV1.ts) and the [catalog session definition](../../examples/shopping/src/zerospin/catalogSessionDefinition.ts) provide the authenticated, zero-command session pattern. Promotion selection adds ownership filtering by verified Clerk subject.
6. [SharedWorker registration](../../examples/shopping/src/zerospin/node.worker.ts) already hosts Aggregate and Service sessions. Add the Promotion release without another transport/coordinator and preserve current SessionRelease APIs.

## Allocation semantics

1. Fixed capacity is 100 lifetime allocations. Count committed + redeemed + unexpired reserved. Converting committed to redeemed counts the same row once.
2. Reserve grants a ten-minute hold using Promotion Service evaluation time. An expired reserved row no longer occupies capacity, but the ID remains retired. Grant at most one active reservation per Aggregate/Cart inside the same synchronous Service transaction.
3. Commitment binds a live hold to one exact Purchase and removes automatic expiry. This is required because payment may happen after the original hold deadline or become uncertain.
4. Redeemed rows permanently account for lifetime consumption. Released/denied resources preserve one-use decisions. These are business resources rather than an event log; deleting them would change capacity or allow ID resurrection.
5. Release-before-reserve and release-before-commit races require a tombstone. Requests run independently and can arrive in a different order than the UI described them. Cart-only cancellation retires absent/unbound reservations; Purchase-bound cancellation can do the same for its exact Purchase. Conflicting Purchase binding refuses.

## Selection and payment boundaries

Cart stores only current selection/removal intent and Aggregate request progress. It does not mirror deadline/allocation state. Purchase freezes cartId/reservationId before quotation so a later Cart pointer cannot redirect old release/redemption work.

Checkout must carry the exact intended nullable reservationId. Comparing it with Cart intent prevents a concurrent Remove/Apply from silently changing the amount. Marketplace receives only product lines and returns a subtotal; it remains independent from promotion. Commitment to the exact Purchase authorizes discounted payment. A successful original reserve response is unnecessary: an independently observed hold can still be committed after the Aggregate observed a request failure.

Failed/refused commitment is terminal for that Purchase and emits no payment. One conditional Purchase-bound cancellation may retire delayed allocation. A late commitment response cannot start payment on that refused Purchase. Paid evidence clears only matching Cart items/selection and emits redemption; definitive decline retains them and emits release; uncertainty retains Cart lock/capacity. All release/redemption work uses the original Purchase identities.

No observer effect retries work or initiates checkout. Explicit Apply/Remove remain Aggregate commands. A failed Apply retries the same reservation ID; a fresh application after denial/expiry/cancellation gets another ID. A reservation claimed by a Purchase cannot be applied to a later Purchase. Quotation-only refusal before commitment can leave its hold reusable.

## Request identity and partial failure

Service command identity is derived from reservation, action and nullable Purchase binding, with immutable input frozen before request. Retrying the same authored request recovers the same admitted command/outcome instead of repeating allocation under a fresh command ID. Cart-scoped and Purchase-scoped release have separate identities. Receipt and serviceIndex details stay inside requestPromotionCommand; continuations receive a small business decision.

Bounded authored retries end in the existing externalOutcome.Failure. This plan deliberately does not replace external delivery with a durable convergence protocol, generic retry command or Service-aware outbox. The continuation records failed progress and returns normally; throwing after a model operation would roll it back under the execution savepoint.

Release/redemption failure may leave a committed allocation consuming capacity even after the Aggregate retains a definite payment outcome. The Service session reports that actual allocation. The plan accepts conservative lost capacity until explicit matching Service transition succeeds. A timer cannot infer provider outcome and must never free uncertain payment capacity.

## Replay defect and selected repair

The simulator's guards read live Effect Clock for reservation expiry, while [readServiceOccurrenceTx](../../packages/system-worker/src/ServiceVersionRepo/utils/readServiceOccurrenceTx.ts) previously sampled a fresh finalizedAt for replay. Retained resource-application timestamps alone do not freeze authored guard time. A historically granted hold reconstructed after its deadline can therefore refuse and change later commitment/capacity decisions.

Original Service evaluation samples one logical finalizedAt; replay reuses the original retained outcome.finalizedAt. Scope a complete Effect wall Clock only around synchronous validation/evaluation, using the same time for source resources/outcome. Delegate monotonic timing and sleep to the live clock; leave remote requests, alarms and ordinary queries live. No caller timestamp, new SQL field or cross-owner clock is needed.

## Money and presentation

Integer cents eliminate whole-dollar-only arithmetic without introducing decimal storage. Product/CartItem/PurchaseItem prices, quote subtotal, discount and payment amount all share the unit. Convert authored seeds once and divide only for formatting. Discount floor(subtotal/2) leaves an odd cent payable; zero stays valid. Quote and provider evidence validation remain independent.

Observation queries exact Cart/Purchase reservation IDs after refresh. No newest-row selection, extra lookup endpoint or React-only identity is needed. Show deadline without a countdown. Missing projected row means no decision observed, and a stale browser row never authorizes commitment/payment. Aggregate controls remain outside the read-only observer initialization gate.

## Limits and deferred evidence

The prior [table finding](../reviews/storage-tables/shopping-promotion-service-version-repo-promotion-reservation.md) recommended removing a dormant simulator before the feature had an approved consumer. Plan 239 supplies that requirement and supersedes the recommendation. It does not justify keeping development gating, a global ledger query, caller availability/expected/deadline fields or unreachable transition branches.

The original 2026-10-17 research deferred verification and authorized no tests or
runtime changes. The maintainer subsequently authorized the explicit SDK harness
stories now recorded by completed Plan 239; all nineteen workspace scenarios and compiler checks pass.
Source/configuration review establishes exact reservation-ID observation,
read-only Actor/session declarations and verified-identity selection binding.
It does not establish Clerk cryptographic validation, generic projection privacy,
durable command delivery or historical replay. Those framework/provider checks
remain with their owners above and do not block application closure. No Shopping
browser journey, storage reset or deployment is authorized by this research.
