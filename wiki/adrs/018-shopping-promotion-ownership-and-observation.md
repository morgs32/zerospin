# Shopping promotion ownership and independent observation

**Date:** 2026-10-17; amended 2026-10-18 and 2026-10-21

**Status:** Accepted and governing. [Plan 239](../archive/plans/239-plan-shopping-promotion-reservations.md) records application implementation and verification; its expanded harness batch passed all nineteen workspace scenarios and compiler checks; the application plan is complete. Generic framework/integration checks retain separate owners and do not block application closure.

**Context:** [Promotion resource finding](../reviews/storage-tables/shopping-promotion-service-version-repo-promotion-reservation.md), [ownership research](../research/shopping-promotion-reservation-ownership.md), [ADR 015](015-service-delivery-history-and-projection-ownership.md), [ADR 016](016-aggregate-original-operations-and-external-work.md).

## Decision

Shopping restores one concrete Promotion feature: 50% off, 100 lifetime redemptions and ten-minute uncommitted reservations. Customer-facing browser mutation uses the existing User Aggregate session. Reserve, release and redeem use existing command operations bound to the corresponding registered Promotion release. Commitment retains an external request/continuation because automatic checkout needs the exact Service decision before payment. A separate authenticated read-only Promotion session observes only that shopper's reservation resources and exposes no commands.

| Component                   | Durable responsibility                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| User Aggregate              | Cart selection, frozen Purchase identity/quote, commitment request, payment evidence and current fulfillment state |
| Promotion Service           | Reservation decisions, capacity, deadlines, Purchase commitment, release and lifetime redemption                   |
| Read-only Promotion session | Projection of owned reservation resources selected by verified Clerk identity                                      |
| Shopping UI                 | Render Aggregate intent/payment progress and independently projected Service allocation facts                      |

Service observation never writes back into Cart/Purchase, retries a mutation or starts checkout. No subscription-driven coordinator, generic retry contract or new framework delivery mechanism is introduced. Cart/Purchase retain no duplicate reserve/release/redeem response progress. A saved Service commitment and a failed commitment request are compatible facts: Promotion Service may have committed its resource before its response was lost.

## Resource and identity model

Cart retains one nullable `promotion` value containing reservationId and action (`apply`/`remove`). Apply selects the reservation; Remove removes the selection while retaining cancellation identity. Reservation status/deadline remain exclusively Service facts. There is no Aggregate application-history table or request-progress field.

Purchase freezes cartId and nullable reservationId at creation. It retains nullable subtotal/discount and the exact payable total in integer cents. A reservation is claimed exactly when reservationId and subtotal are both non-null, including a zero subtotal. AggregateVersionRepo commits valid quotation and commitment emission atomically; these retained facts survive later refusal, payment, release and redemption. This derived condition distinguishes a claimed reservation from a reusable quote-only refusal; it is not proof of Promotion admission or commitment. Its identities remain usable after Cart.checkoutPurchaseId changes. PurchaseItem retains original quoted unit prices; the discount belongs on Purchase.

Promotion Service's reservation has exactly eight SQL fields: id, createdAt, updatedAt, aggregateId, cartId, nullable purchaseId, nullable expiresAt and status. Bound Model name/version remain in complete resource envelopes through the existing codecs. No constant promotionId, custom resource-storage adapter, new history table or expiry job is required.

A reservation ID is one-use business identity, distinct from canonical admitted command identity. For reserve/release/redeem, makeCommandOperation delegates stable command identity, immutable input and transport retries to the framework. AggregateChain delivers outside source transactions and deletes its pending delivery only after durable Promotion admission acknowledgement. Admission is distinct from destination execution and its retained outcome; destination refusal neither changes source success nor resubmits the command. Cart-scoped release and Purchase-bound release carry their own exact business binding.

Commitment uses requestPromotionCommitment with an explicit Promotion release version, stable command identity and receipt/result validation. The Aggregate continuation consumes a small reservation decision, never Service history or serviceIndex. This is the sole Promotion response path retained by Shopping.

The shopper Actor derives identity from existing Clerk verification and selects only rows with matching aggregateId. The read-only session uses current SessionDefinition APIs. Reservation IDs come from the Aggregate session's existing ID factory and public Service Model declaration; generating an ID does not require a ready Promotion session and does not make the Service Model Aggregate-owned.

## Capacity, transitions and partial failure

Capacity usage is committed + redeemed + unexpired reserved. Ten-minute expiry applies only to reserved holds. Committed allocations never expire automatically: an unknown payment cannot release capacity. Within its synchronous transaction, Promotion Service grants at most one active reservation for an Aggregate/Cart and never exceeds 100 allocations. Redemption changes committed to redeemed without adding another allocation.

Terminal reservation resources remain. Redeemed rows account for lifetime consumption; denied/released rows retire IDs and preserve cancellation. A release before reserve creates a released tombstone. Purchase-bound cancellation may also retire an absent/unbound reservation before delayed commitment and must reject any conflicting Purchase binding. Delayed Reserve or Commit cannot reopen a retired ID. Redeemed allocations cannot be released.

Checkout carries the exact nullable intended reservation ID. It refuses a stale Cart selection instead of silently changing price. Marketplace quotation receives product lines and returns an undiscounted subtotal; it knows no promotion policy. A selected promotion requires Service commitment to the exact frozen Purchase before payment. Commitment succeeds, or Purchase becomes refused with no payment and one conditional Purchase-bound cancellation. Late observation cannot start payment for a refused Purchase.

The discount is Math.floor(subtotal / 2); payable total is subtotal minus discount, leaving an odd cent payable. Paid evidence, matching CartItem deletion, matching selection clearing and redemption emission share one Aggregate commit. Decline retains items/selection and emits release. Unknown payment retains the Cart lock and commitment through needs_reconciliation. Quote-only refusal before attempted commitment may leave a reusable hold; a reservation claimed by a Purchase cannot be reused by a later Purchase.

Bounded commitment request retries retain existing external-delivery semantics. Exhaustion records externalOutcome.Failure; the continuation records Purchase refusal and emits conditional release without payment. Reserve/release/redeem command deliveries instead use the framework's retry-until-admission path. Service refusal after admission does not undo payment, free capacity locally or restart the command. Unresolved committed allocations may consume capacity until an explicit matching Service release/redemption succeeds. No timer guesses payment outcome.

All resource evaluation remains inside owner-local synchronous transaction boundaries. No remote call, transaction or exclusive execution gate spans AggregateVersionRepo and ServiceVersionRepo.

## Reservation claim amendment — Plan 151

Remove promotionCommitRequested from Purchase. Every writer preserves the
same claim through reservationId and subtotal, so no additional lifecycle flag
is required. The zero-subtotal case is claimed. No Service decision, command
admission acknowledgement or execution outcome is inferred from those fields.
This changes storage directly under the hard-cutover policy; it authorizes no reset.

## Administrative release amendment — Plan 246

Current Shopping registers only integer User, Marketplace and Promotion revision
`1`, with the unversioned Reservations Agent bound to Promotion `1`. The following Plan 246
cutover describes the historical multi-release setup; it is not the current
release registry.

[Plan 246](../archive/plans/246-plan-shopping-reservations-service-agent.md) added
`reservations@1.0.0`, bound to Promotion `1.1.0`, through the existing explicit
Service Agent APIs and Studio broker. It selects all shoppers' reserved rows with
null `purchaseId`, including expired rows, and exposes only
`releaseUncommittedReservation@1.0.0` with payload `{ id }`.

ServiceVersionRepo's authoritative transaction requires that existing row still
be reserved and uncommitted, otherwise it refuses with
`promotion-reservation-not-releasable`. Successful execution records only
`status: 'released'`; the canonical reservation remains retained. No Cart,
Purchase or provider mutation follows. Existing broad `releasePromotion` keeps
its customer cancellation/Purchase-bound cleanup responsibility. The shopper
Actor still exposes no commands. Agent browser Sessions only observe selected
rows. The System automatically executes scheduled Agent behavior registered in
`system.agents`; Studio opening and closing cannot change execution ownership.
Canonical retained outcomes and pending automatic delivery stay with the
Chain and Agent Node Repo owners.

Plan 246 moved then-current producers and observation to User/Promotion `1.1.0` with
release-local quotation/payment/promotion continuations. Both User development
releases bound command operations to their corresponding Promotion release;
the commitment-only request also receives that explicit version. New
materializations replay command history without copying model rows or emitting
external work. The current schema/contract cutover requires empty affected storage
and does not preserve superseded pending requests through compatibility code.

Promotion `1.0.0` has no administrative release command and can retain an older
reserved view after `1.1.0` releases that allocation. Administrative use therefore
requires retired old shopper producers, settled old work and caught-up
materialization/publication. Empty external-request queues alone do not prove an
admitted continuation has executed. If that local cutover or existing storage
activation fails, preserve data and report the blocker rather than add version
fallbacks, model backfills or automatic resets. This amendment authorizes no
new data or release submission for verification. Its checks/startup evidence
belongs to Plan 246 and does not complete Plan 239's deferred verification.

## Independent presentation

Aggregate controls remain usable outside the read-only observer initialization gate. Observation queries the exact reservationId retained by Cart/Purchase, never the newest historical row. Missing projected resource means no decision observed; it does not establish denial or prove no Service mutation occurred.

The UI renders reserved, denied, released, committed and redeemed allocation facts, deadline and Purchase binding from the Promotion session. It has no request-progress or request-retry controls. Apply generates a fresh reservation ID. Display a deadline timestamp without a countdown timer. A stale browser projection never authorizes payment; the commitment response remains authoritative for checkout. Preserve each session's terminal-error behavior independently of ordinary commitment request failure.

## Money and replay time

Product, CartItem, PurchaseItem, quotations, discounts and payments all use integer cents. Authored seeds are converted once to retain their displayed prices; only display formatting divides by 100. Zero remains valid and createProduct's negative-price refusal remains independent of quote validation. Provider evidence states its units explicitly.

ServiceVersionRepo original execution samples one logical finalizedAt. Replay reuses the retained original outcome.finalizedAt. A frozen Effect wall Clock is scoped to synchronous Service validation/evaluation and source resource writes use the same timestamp. Live Clock still supplies monotonic timing/sleep; external requests, alarms and ordinary queries keep live time. No new durable timestamp or caller clock protocol is introduced. This amends ADR 015's earlier fresh-replay-time wording and follows up Plan 214 without rewriting its historical report.

## Consequences and completion

The pre-release cutover replaces the simulator, its development gate and global ledger query outright. Changed authored schemas/protocols require empty affected storage; no compatibility aliases, decoders, translations, migration or automatic reset are provided. This decision authorizes no reset or deployment.

Plan 151's earlier removal recommendation is superseded by this explicit business requirement and ownership design. Terminal reservation resources are retained business state, not forbidden Repo audit history. Resource owners still retain no command/execution history beyond their complete pending publications; Chain histories keep their existing responsibility.

Plan 239 records application behavior through explicit SDK harness stories and
source/configuration review of exact-ID, read-only observation. The expanded
promotion batch passes and Plan 239 is complete. Clerk-token/provider validation and generic
command delivery remain parent Plan 151 follow-ups; Service replay belongs to
Plan 214, Actor admission/selection privacy to Plans 218/221, and Agent Node Repo
recovery to Plans 249/151. None is claimed as harness-verified or an application
closure prerequisite. This ADR remains governing after the application plan closes.
