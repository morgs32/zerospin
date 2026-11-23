# CartItem quantity and product uniqueness

**Date:** 2026-10-17

**Status:** Complete — application implementation and required verification passed on 2026-10-21. Generic framework verification remains with its owning plans.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [Shopping user AggregateVersionRepo.cartItem](../../reviews/storage-tables/shopping-user-aggregate-version-repo-cart-item.md).

## Objective and agreed design

Keep the eight-value CartItem model while using one term for its count and declaring one product line per Cart. Rename amount to quantity throughout the existing Model, add/update payloads, operation bodies and direct consumers. Add precisely this index to CartItemV1:

```ts
indexes: [{
  name: 'cartItem_cartId_productId_unique',
  columns: ['cartId', 'productId'],
  unique: true,
}],
```

SQLite enforces the pair through the existing table compiler; no application uniqueness layer is needed. Keep canonical cit-prefixed resource id alongside this constraint. Different Carts can contain the same Product; deletion frees the pair for later readdition with a new resource ID.

## Scope and behavior

1. CartItem's required integer field becomes quantity. All other row/resource fields keep their meaning. Model rows still omit modelName/version under Plan 236; full resource envelopes retain them.
2. addToCart.payload.quantity is the positive quantity to add. Compute the resulting line quantity separately, retain safe-integer/overflow checks, and update an existing product line or create one. Do not change copied name/price on the merge path.
3. updateCartItemQuantity.payload.quantity is the positive absolute desired count. Preserve exact line selection, parent checkout locks, refusal behavior and synchronous operation application.
4. ProductCard, CartItemQuantityControls and ShoppingCartSidebar use quantity in payloads, props, displays and subtotal arithmetic. Keep IDs generated once per click and validate/stage inputs identical. Use a clear setQuantity handler name rather than shadowing the quantity value.
5. Checkout reads item.quantity directly into the existing frozen snapshot. Payment compares PurchaseItem.quantity with CartItem.quantity before the same paid-only deletion. Preserve operationIndex, exact line identity, parent linkage and all transaction/savepoint boundaries.
6. Adapt the existing system-worker Shopping invocation fixture to the renamed payload. The original implementation deferred all checks and created no tests, fixtures, runners or configuration; that deferral is historical. New test/check machinery still requires separate authorization.
7. Update Shopping README, glossary, Plan 151 and the CartItem finding. Existing review details can remain as the dated pre-change source record, with a clear written/unverified implementation follow-up. No new ADR or framework abstraction is needed.

## Implementation steps

1. Change the Model field and add the exact named composite unique index using existing declarations.
2. Rename existing contract payload fields, operation attributes and checkout/payment reads. Keep additive versus absolute semantics explicit.
3. Update direct UI consumers and the existing worker invocation fixture; preserve unrelated work.
4. Reconcile docs and record implementation written, not verified. Keep the next Plan 151 review on Shopping marketplace ServiceVersionRepo.product; this implementation completes no other table review.
5. The original implementation deferred all checks. Verification resumed on 2026-10-21; use the smallest scoped checks that cover the payload/UI consumers and composite uniqueness/merge/delete behavior, and resolve failures before archival. Never verify Explorer.

## Files

```text
examples/shopping/
  ~ README.md
  src/
    components/
      ~ CartItemQuantityControls.tsx
      ~ ProductCard.tsx
      ~ ShoppingCartSidebar.tsx
    zerospin/aggregates/user/
      models/cartItem/
        ~ CartItemV1.ts
      contracts/
        ~ addToCartV1.ts
        ~ updateCartItemQuantityV1.ts
        ~ checkoutV1.ts
        ~ processExternalPaymentV1.ts
packages/system-worker/test/migratable-do-repo/
  ~ owners.worker.ts
wiki/
  ~ glossary.md
  plans/
    ~ 151-plan-storage-table-review.md
    + 237-plan-cart-item-quantity-and-product-uniqueness.md
  reviews/storage-tables/
    ~ shopping-user-aggregate-version-repo-cart-item.md
```

## Cutover and acceptance

1. There is one quantity field and one declared uniqueness rule. Add no amount alias, dual decoder, old field, runtime storage policy, custom query adapter or new uniqueness mechanism. No generic framework/schema-guard change is needed for this authored Shopping declaration change; exact model/declaration and physical-schema gates remain strict.
2. The Model/index, payloads and retained operation bodies change outright. Empty affected Shopping resource, history/pending delivery and persisted client storage, plus affected accepted-definition storage, is required before using this pre-release definition. This task performs no reset, migration, data translation or deployment. Other owners' fixed command/checkpoint models and earlier active-plan verification statuses remain separate.
3. Valid additions continue to merge by product. The index declares the existing rule; do not claim this fixes proven current duplicate corruption. Cart preview name/price remain advisory, while Marketplace independently determines the authoritative quote/payment total.
4. Quantity positivity, safe-integer checks, cart locks, canonical IDs, optimistic rebuilding, exact frozen-line payment comparison and paid-only clearing keep their existing responsibilities. Do not introduce new state or rebase machinery.

## Written implementation — historical report from 2026-10-17

1. CartItemV1 now declares required quantity and the exact named composite unique index above. It retains eight stored values, canonical line identity and the common Model/table/resource codecs.
2. Existing add/update payloads and operation attributes use quantity. addToCart computes resultingQuantity separately; the absolute update, checkout snapshot and payment comparison use quantity directly. Existing copied preview values, integer bounds, lock checks and operation sequencing retain their roles.
3. ProductCard, CartItemQuantityControls and ShoppingCartSidebar use quantity in validation/staging payloads, props, displayed counts and subtotal arithmetic. The setter is named setQuantity; click-owned ID generation retains its existing placement.
4. The existing system-worker Shopping invocation fixture now supplies quantity. No tests, fixtures, runners, configuration, runtime helpers, compatibility paths or schema-guard changes were added. Shopping README, glossary, Plan 151 and the dated CartItem finding describe the written/unverified cutover.
5. No checks ran: implementation source discovery and edits are not verification evidence. No storage reset, migration, deployment or data translation was performed. Plan 151's next table remains Shopping marketplace ServiceVersionRepo.product.

## Earlier verification — 2026-10-21

1. `pnpm nx run-many -t ts lint -p @zerospin/core @zerospin/browser system-worker @zerospin/native shopping tic-tac-toe` passed 29 tasks including dependencies and cache hits. Lint reported zero errors and 40 warnings: 33 in Core, two in system-worker, four in Shopping and one in Tic-tac-toe. This checks current type/lint consumers; it does not establish quantity or uniqueness behavior.
2. Historical run using retired target names: `pnpm nx run-many -t test-external-examples test-external-types -p zerospin` passed six existing tests and the external type checks. Two tests cover Shopping quotation success/refusal, two cover Tic-tac-toe and two cover receipt delivery. None exercises CartItem merge, quantity refusal or the composite unique index.
3. Bounded source inspection found the separate additive/resulting quantity calculation and the declared composite index. Source inspection is not execution evidence. The historical worker fixture listed above is absent from the current checkout; do not recreate it merely to satisfy the old file list.
4. No new test files, fixtures, runners or configuration, storage reset or deployment were performed. Authorization for focused missing behavioral tests and minimal wiring is pending.

## Application verification — 2026-10-21

1. `pnpm nx run zerospin:test` passed required library builds, strict compiler checks and all thirteen runtime cases, including eight Shopping scenarios. The three new explicit cart stories use `makeSystemHarness` from `@zerospin/sdk/testing`, normal SDK commands and typed selections, with no direct model writes or fixture DSL.
2. [The cart stories](../../../examples/shopping/tests/system.spec.ts) prove additive 2 + 3 merging into one original Product line with unchanged preview values; absolute update to 4; native overflow refusal with the original line unchanged; and removal followed by readdition under a new line ID. They check Shopping's exact declared `cartItem_cartId_productId_unique` index and `['cartId', 'productId']` columns through public model metadata.
3. The existing paid-checkout story also proves a quantity edit is refused while checkout is preparing, PurchaseItem retains the frozen quantity and successful payment clears CartItems. Existing Product and promotion cases still pass.
4. Scoped test lint and formatting pass. `pnpm nx run-many -t ts lint -p shopping` passed all eighteen tasks including dependencies; Shopping retains three existing worker-URL import warnings and no lint errors. Independent source/test review found no material app acceptance gap. Documentation links and whitespace were checked. No production code, schema, dependencies, storage reset or deployment changed in this verification batch.

## Application and framework boundary

1. Application tests assume the Zerospin framework works. This plan owns Shopping's quantity commands, rows and authored uniqueness declaration, not generic SQLite or distributed-runtime verification.
2. Generic model-index compilation and physical SQLite constraint enforcement remain under [Plan 236](236-plan-model-rows-and-resource-envelopes.md). Optimistic rebuilding and replication remain under [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md). Those framework obligations do not block this application's closure; no raw duplicate insertion or test-only command is needed here.
3. The removed worker fixture in the historical file list is not recreated. Current harness scenarios provide the required app seam, and schema-cutover storage requirements still apply without an automatic reset.

## Remaining work

None. Application behavior is verified; generic index and replication guarantees
remain with Plans 236/234 and are not prerequisites for this application's closure.
