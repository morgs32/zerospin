# Shopping promotions with command delivery and independent Service observation

**Date:** 2026-10-17; authored-flow simplification approved 2026-10-21.

**Status:** Complete — application implementation and required verification passed on 2026-10-21. Generic framework and provider-integration verification remains with its owning plans; application tests assume framework correctness. No storage reset, publication or deployment occurred.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [Shopping promotion ServiceVersionRepo.promotionReservation](../../reviews/storage-tables/shopping-promotion-service-version-repo-promotion-reservation.md). **Decision:** [ADR 018](../../adrs/018-shopping-promotion-ownership-and-observation.md). **Research:** [Shopping promotion ownership](../../research/shopping-promotion-reservation-ownership.md).

## Goal and ownership

Preserve the fixed **50% promotion, 100 lifetime redemptions and ten-minute reservations**, explicit Apply/Remove controls, integer cents and automatic checkout. Simplify Shopping's authored code using existing APIs; change no SDK or system-worker capability.

| Component                   | Responsibility                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| User Aggregate              | Cart selection, frozen Purchase identities, commitment intent and payment lifecycle                |
| Promotion Service           | Allocation, capacity, expiry, commitment, release and redemption                                   |
| Source AggregateChain       | Frozen reserve/release/redeem command delivery until durable destination admission acknowledgement |
| Read-only Promotion session | Authenticated reservation status, deadline and Purchase binding                                    |
| Shopping UI                 | Render Aggregate intent and independently observed Service facts                                   |

The registered User revision `1` addresses Promotion revision `1`; the current System registers only integer revisions. Existing Promotion administrative-release and Agent behavior remain unchanged. All model writes occur through command execution or replay. Queries and session callbacks never populate Aggregate models or initiate checkout.

## Aggregate resources and public commands

Cart retains nullable `promotion: { reservationId, action: 'apply' | 'remove' }`. Apply selects a fresh reservation; Remove immediately clears selection while retaining its cancellation identity. Delete `requestState` and its progress/retry presentation.

Purchase freezes `cartId` and nullable `reservationId`, retains nullable `subtotal`, `discount` and exact payable `total`, and replaces `promotionRequest` with boolean `promotionCommitRequested`:

1. Initialize false at Purchase creation.
2. Set true in the same AggregateVersionRepo transaction that retains a valid discounted quote and records commitment work.
3. Never clear it after refusal, payment, release or redemption. It proves that the Aggregate recorded commitment work, not that Promotion admitted or executed it.
4. Apply and checkout reject reuse once any Purchase for that reservation has this fact. Remove derives its exact Purchase binding from those Purchases. A quotation-only refusal leaves the fact false and the reservation reusable.

Public commands remain `applyPromotion({ cartId, reservationId })`, `removePromotion({ cartId })` and `checkout({ cartId, purchaseId, reservationId: string | null })`. Generate fresh reservation IDs synchronously with the Aggregate session's existing ID factory. No new public commands, coordinator or automatic retry controls are added.

## Delivery and commitment

Reserve, release and redeem use `makeCommandOperation` in their source adapter or continuation. Map the selected reservation to Promotion's `payload.id`; retain the executing Aggregate identity and frozen Cart/Purchase identities. Delete all six response-only external contracts and their release registrations.

Original source execution records model changes and freezes complete destination commands atomically. AggregateChain delivers outside the source transaction, retries the identical command and deletes pending delivery only after durable destination admission acknowledgement. Destination execution and its retained `outcome` are independent; acknowledgement is not a business decision. Source replay does not allocate or dispatch new destination commands.

Commitment keeps its external contract and one shared commitment-only request procedure with explicit Promotion `serviceVersion`. The procedure owns immutable command encoding, version-scoped stable command identity, bounded transport retries, exact receipt matching and business-decision decoding. Delete the two general action-switching request helpers. The canonical commitment ID includes service version, reservation, commit action and Purchase identity; this is an empty-storage hard cutover, with no old-ID fallback.

## Apply, Remove and checkout lifecycle

1. Apply validates a nonempty editable Cart and unused reservation identity, records selection, and emits reserve atomically. The Promotion session supplies any eventual reservation status.
2. Remove records removed intent and emits conditional release. Before commitment it uses null Purchase identity; after a definitively refused or declined Purchase it uses that Purchase's frozen identity. Reject uncertain payment, paid allocations and conflicting Purchase bindings.
3. Checkout verifies exact nullable selection, creates frozen Purchase/PurchaseItems and requests the independent Marketplace quote. Retain exact line, quantity, price, arithmetic and safe-integer validation.
4. Without promotion, record zero discount and subtotal as total, then emit payment. With promotion, record priced lines/subtotal, set promotionCommitRequested and record commitment work atomically.
5. The commitment continuation requires exact Aggregate/Cart/reservation/Purchase identities, promotionCommitRequested and paymentState preparing. Commitment for a different Purchase or a stale continuation cannot start payment.
6. Successful commitment records `discount = Math.floor(subtotal / 2)`, total and pending payment and emits payment in one transaction. Commitment refusal/request failure makes Purchase refused and emits conditional Purchase-bound release with no payment. A late response cannot revive a refused Purchase.
7. Paid evidence clears matching CartItems/selection and emits redemption. Definitive decline retains CartItems and emits release. Unknown payment preserves the Cart lock and commitment through needs_reconciliation.
8. Release/redemption use frozen Purchase identities even after Cart.checkoutPurchaseId changes. Their delivery acknowledgement does not update Purchase or assert Service success. The Promotion session shows actual allocation state.

## Promotion Service resources and transitions

Retain the eight-column resource: id, createdAt, updatedAt, aggregateId, cartId, nullable purchaseId, nullable expiresAt, status. Statuses remain reserved, denied, committed, released and redeemed. Terminal rows retire reservation IDs and preserve lifetime consumption; capacity usage is committed plus redeemed plus unexpired reserved. At most one active reservation per Aggregate/Cart is enforced inside the Service transaction.

1. Reserve grants or denies fresh IDs and never reopens an existing ID. Promotion assigns and retains the original ten-minute deadline.
2. Commit requires a live reserved row and binds it to Purchase; repeated same-Purchase commitment is idempotent. Committed allocations do not expire automatically.
3. Cart-scoped cancellation retires absent/uncommitted IDs, including a tombstone before delayed reserve, and refuses committed/redeemed allocations.
4. Purchase-scoped cancellation retires absent/unbound IDs before delayed commitment or releases the exact committed allocation. It refuses conflicting Purchase bindings.
5. Redeem changes exact-Purchase committed to redeemed and is idempotent for that same Purchase. Redeemed allocations cannot be released.

## Read-only session, money and time

The Promotion shopper Actor remains authenticated, selects only the verified shopper's rows and exposes no commands. UI observation queries the exact reservation ID retained by Cart/Purchase and displays status, deadline and Purchase binding. Missing rows mean no decision observed. Remove transport-progress messages and Retry Apply/Retry Remove controls. Keep controls outside observer initialization, preserve session terminal errors and add no countdown, polling or query-driven mutation.

Keep all monetary values in integer cents and format only at display. Preserve zero-price validity, odd-cent rounding, unsafe-arithmetic refusal, stable payment keys and exact provider amounts. Marketplace quotation remains independent of Promotion policy.

Preserve ServiceVersionRepo's retained original outcome.finalizedAt for replay and the frozen wall Clock during synchronous Service evaluation; ordinary queries, external requests, alarms and monotonic timing retain live time. No new clock protocol is added.

Changed authored schemas require empty affected storage. Add no aliases, fallback decoders, translation migrations or automatic storage resets. Existing active releases, administrative cutover restrictions and partial-verification records remain applicable.

## Application acceptance and framework boundary

Application tests assume the Zerospin framework works. The former mixed matrix
is satisfied at the app seams below, with generic platform/provider verification
tracked separately rather than required again for application closure.

| Area                      | Application evidence / separate owner                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/privacy          | Read-only Actor/session declarations and verified-identity selection binding reviewed; generic enforcement belongs to Plans 218/221, Clerk integration to Plan 151.                                     |
| Capacity                  | 100 allocations, duplicate-Cart denial, released/expired capacity reuse, terminal IDs and lifetime redemption accounting pass through real commands; concurrent serialization is a framework guarantee. |
| Refresh/observation       | Source review confirms exact retained Cart/Purchase reservation IDs, missing-decision rendering and no query-driven commands; no browser verification is claimed.                                       |
| Cancellation              | Release before queued reserve creates a terminal row; delayed reserve/commit cannot revive it.                                                                                                          |
| Stale decisions/selection | Another Purchase's valid commitment decision refuses without payment; a changed nullable selection refuses before Purchase creation.                                                                    |
| Commitment                | Expired/wrong-Purchase decisions refuse without payment and release using the exact Purchase binding; quote-only refusal leaves the hold reusable.                                                      |
| Payment/later checkout    | Paid clears matching items; decline retains them and releases; uncertainty preserves lock/commitment past expiry; old release cannot affect a later checkout.                                           |
| Money                     | Zero-price creation remains covered; odd-cent discount/provider totals and stable payment keys match; unsafe arithmetic refuses before commitment/payment.                                              |
| Time/replay               | Holds remain reserved at 599 seconds and release at 600; committed allocations do not expire. Historical reconstruction/frozen replay Clock belongs to Plan 214.                                        |

1. Keep tests explicit and concise using the public System harness, SDK commands,
   typed selections and existing provider/API Layer seams. No browser, Clerk
   sign-in, raw model writes, fixture DSL or harness API changes are required.
2. Source `AggregateChain` command-operation delivery/restart/acknowledgement
   verification remains in Plan 151's named framework follow-up. Plan 249 owns
   automatic Agent host recovery. None is claimed as harness-verified.
3. Changed schemas still require empty affected storage under pre-release
   policy. No compatibility path, automatic reset, release or deployment occurs.

## Written implementation report — historical, unverified on 2026-10-17

1. Cart/Purchase now retain promotion intent, request progress and frozen reservation/Cart identity through existing Model/table codecs. Apply/Remove and the four Aggregate external contracts use exact identity/action checks. requestPromotionCommand owns stable Service command identity, immutable input, bounded retries and receipt-to-business-decision decoding.
2. Checkout carries the exact nullable reservation selection. Marketplace returns independently validated subtotal. Quotation-only refusal leaves promotionRequest null and its hold reusable; attempted commitment claims the reservation for that Purchase. Commitment success atomically retains discount/total and emits payment, while refusal/request failure makes Purchase refused with no payment and conditional Purchase-bound cancellation.
3. Payment evidence includes exact total and USD-cents units, with explicit amount comparison. Paid/declined/unknown behavior retains the existing Cart/Purchase lifecycle and adds exact-identity redemption/release or conservative commitment. Release/redemption progress uses frozen Purchase identity and cannot depend on Cart's later checkout pointer. A denied release response counts as successful ID retirement.
4. Promotion Service replaces the simulator with eight-column reservation resources, fixed policy/decision declarations, explicit transition rules and authenticated shopper selection. The read-only Promotion session shares the existing SharedWorker, exposes no commands and queries exact Cart/Purchase IDs. Aggregate controls stay independent of observer readiness. UI renders Service status and failed Aggregate request observations separately.
5. Product/CartItem/PurchaseItem/quotation/provider money uses integer cents, with authored seeds and display formatting adjusted once. Zero-price validity, negative-price refusal and independent quote/provider checks remain.
6. ServiceVersionRepo retains original logical finalization time for replay and scopes a frozen evaluation wall Clock while live monotonic/sleep/request/query/alarm timing remains independent. No new durable timestamp or caller clock input is added.
7. Removed PromotionDevelopment/config wiring and the unused global ledger query. ADR 018, research, ADR 015, Plan 214 follow-up, Plan 151, glossary, Shopping findings/README and ServiceVersionRepo README record the new responsibilities. Plan 151's next-table marker stays Tic-tac-toe game AggregateVersionRepo.game.
8. No verification was run. No new test files, fixtures, runners or configuration, compatibility path, migration, reset, deployment or plan archival was performed. Written implementation is not passing acceptance evidence.

## Verification resumed — 2026-10-21

1. `pnpm nx run-many -t ts lint -p @zerospin/core @zerospin/browser system-worker @zerospin/native shopping tic-tac-toe` passed 29 tasks including dependencies and cache hits. Lint reported zero errors and 40 warnings: 33 in Core, two in system-worker, four in Shopping and one in Tic-tac-toe. These checks include the current Shopping consumers and ServiceVersionRepo types; they do not establish reservation or replay behavior.
2. Historical run using retired target names: `pnpm nx run-many -t test-external-examples test-external-types -p zerospin` passed six existing tests and the external type checks. Two Shopping cases exercise a valid full-price quote emitting payment and a refused quote emitting none, with integer-cent values and lazy provider invocation. The other four cases cover Tic-tac-toe and receipt delivery. No existing case exercises promotion transitions or replay time.
3. Bounded source inspection found exact Cart/Purchase continuation guards, Purchase-bound release/redemption, paid-only CartItem deletion, retained original `outcome.finalizedAt` during replay and a frozen evaluation wall Clock with live monotonic timing/sleep. Those findings are source evidence, not passing behavioral acceptance.
4. No Shopping browser journeys, Explorer checks, new test files, fixtures, runners or configuration, storage reset or deployment were performed. Authorization for focused missing behavioral tests and minimal wiring is pending.

## Shopping simplification — historical scoped verification, 2026-10-21

This report records the earlier release names and source snapshot. The current
registry contains only integer revision `1`, as recorded above.

1. Both User releases now emit reserve, release and redeem through existing command operations bound to their corresponding exact Promotion releases. Deleted six external response contracts (426 lines) and consolidated two general transport helpers into one commitment-only procedure. Including the new helper, Shopping source is 593 lines smaller.
2. Removed Cart requestState and Purchase promotionRequest, response-only updates and UI retry/progress plumbing. Purchase.promotionCommitRequested preserves the durable claim distinction without duplicating Service status. Quote-only refusal leaves it false; valid promotion quote and commitment work record true atomically; it remains true thereafter.
3. Preserved exact identity/preparing/commit-requested guards, atomic discount/payment emission, refusal-before-conditional-release, uncertain-payment retention, frozen Purchase binding and paid/declined follow-ups. An independent source review found no actionable regressions or completed-release import cycle. This is source evidence, not runtime Promotion lifecycle evidence.
4. Restored local dependencies with pnpm install --frozen-lockfile. No manifests or lockfile changed. Final pnpm nx run-many -t ts lint -p shopping passed 18 tasks including dependencies/cache hits. Lint has zero errors and three existing shared-worker URL import warnings in untouched connection files; two warnings in touched files were resolved.
5. Historical run using retired target names: `pnpm nx run-many -t test-external-examples test-external-types -p zerospin` passed six tests and the external typecheck, with six dependency tasks served from cache. The two Shopping tests still establish only full-price quotation success/refusal and payment-operation construction. They do not prove Promotion delivery, User 1.1 runtime behavior or restart recovery. Nx reported remote-cache DNS/upload warnings after successful tasks.
6. Scoped Oxfmt formatting/checks, git diff --check and new/changed local documentation links passed. Refreshed affected source citations and marked superseded research as historical. Existing unrelated SDK skill edits were preserved; no SDK or system-worker source changed. No test files, fixtures or runners were created; the existing Purchase fixture was updated.
7. No Shopping browser verification, storage reset, release submission, deployment or plan archival occurred. Changed authored schemas require empty affected storage before activation; existing application storage was left intact.

## Application verification — 2026-10-21

1. `pnpm nx run zerospin:test` passed required library builds, strict compiler checks and all nineteen runtime cases, including fourteen Shopping scenarios. Six new promotion stories use real SDK commands and typed queries with `makeSystemHarness`; the existing expiry story now proves the exact deadline boundary.
2. [Reservation stories](../../../examples/shopping/tests/promotion.spec.ts) prove cancellation before queued reserve delivery and refused delayed commitment, one active hold per Cart, 100-allocation capacity, denied-ID retirement, idempotent redemption, released-slot reuse and expiry without losing lifetime redemption state.
3. [Payment stories](../../../examples/shopping/tests/promotion-checkout.spec.ts) prove exact odd-cent totals/keys, decline and later-checkout isolation, uncertainty with retained items/commitment and blocked cancellation, exact Purchase binding, and refusal of a well-formed decision for another Purchase without payment. The stale-decision test first asserts the real commitment succeeded before replacing its decision.
4. [System stories](../../../examples/shopping/tests/system.spec.ts) additionally prove stale selection refuses before creating a Purchase, an unsafe quote leaves the hold unclaimed/reusable, and a corrected checkout reuses it successfully. Existing paid/redemption, quantity, Product and unavailable-Product outcomes still pass.
5. Scoped lint/formatting pass for all three Shopping test files. `pnpm nx run-many -t ts lint -p shopping` passed eighteen tasks including dependencies, with zero lint errors and three existing worker-URL import warnings. Independent app review found no material gap after strengthening the stale-decision assertion.
6. Source/configuration review confirms exact-ID read-only observation, controls outside observer initialization, verified-identity selection binding and current integer revision `1`. This is configuration evidence, not a claim of Clerk-token, projection/privacy or browser runtime verification. Documentation links and whitespace were checked. No production source, framework API, dependencies, storage or deployment changed in this batch.

## Remaining work

None. Unverified framework/provider obligations remain
explicitly assigned to Plans 151/214/218/221/249. Application closure assumes
those guarantees and does not claim their verification passed.
