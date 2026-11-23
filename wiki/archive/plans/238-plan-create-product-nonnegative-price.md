# createProduct nonnegative price

**Date:** 2026-10-17

**Status:** Complete — application implementation and required verification passed on 2026-10-21. Generic Service Failure-outcome retention verification subsequently completed on 2026-10-22 in [Plan 214](214-plan-service-ordered-operations-and-finalized-at.md).

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [Shopping marketplace ServiceVersionRepo.product](../../reviews/storage-tables/shopping-marketplace-service-version-repo-product.md).

## Agreed change

1. Declare createProduct's typed invalidPrice business failure with code `product-price-invalid` using the existing ContractError facility.
2. Add one named `Effect.fn` guard. Refuse `payload.price < 0` before the program can record its create operation. Zero and positive safe integers continue through the existing program; primitive integer decoding retains its signed-safe-integer validation.
3. Preserve quotePurchase's independent checks for missing Products, negative/unsafe prices, quantities and total arithmetic. Preserve Product's six-column resource model, current price units, payload shape and source transaction boundaries.
4. Update Shopping README, the dated Product finding and Plan 151 with written versus verified status. Keep promotionReservation as the next table review. Add no schema primitive, helper layer, SQL constraint, storage guard, compatibility path, test, fixture, runner or configuration.

## Implementation sequence

1. Modify only `examples/shopping/src/zerospin/services/marketplace/contracts/createProduct/CreateProductV1.ts` for runtime behavior: import Effect, declare the failure and add the guard. Keep the current create program and operation descriptor.
2. Document the creation refusal, zero-price support and retained quote validation. Record the implementation in this plan and its parent/finding without claiming checks passed.
3. The original implementation deferred all verification; that instruction is historical. Verification resumed on 2026-10-21. Use the smallest scoped seams for typed negative refusal and no create emission, zero/positive creation, and unchanged quote rejection. Resolve in-scope failures before archival; never verify Explorer.

## Acceptance and cutover

1. A negative price returns the declared contract failure before recording or applying Product creation; no catalogue resource is created by that invocation. Zero remains valid. Admission, execution refusal and retained outcome keep their existing distinct meanings.
2. Creation and quotation each retain their own validation responsibility. No SQL schema, payload format, resource codec, money-unit conversion or fixed-storage guard changes are needed.
3. The new failure changes authored contract facts. Existing accepted-definition comparison stays strict; existing pre-release definition acceptance rules apply without fallback decoding, migration or automatic reset. This task performs no storage reset or deployment.
4. Preserve current Plan 151/Product review documentation work and all earlier active-plan statuses. No new ADR is warranted for this local validation repair.

## Written implementation — historical report from 2026-10-17

1. CreateProductV1 declares invalidPrice with code `product-price-invalid` and uses the named createProduct.guard to refuse price < 0 through the existing ContractError facility. Its existing payload codec, create program and operation descriptor remain in place; zero passes this guard.
2. Shopping README, the dated Product finding and Plan 151 describe the written/unverified change. Quote validation was left intact. No SQL schema, payload format, price-unit or framework changes were introduced.
3. No checks ran, and no tests, fixtures, runners or configuration were created. No storage reset, migration or deployment was performed. The new authored failure follows strict accepted-definition handling; no compatibility path was added.

## Earlier verification — 2026-10-21

1. `pnpm nx run-many -t ts lint -p @zerospin/core @zerospin/browser system-worker @zerospin/native shopping tic-tac-toe` passed 29 tasks including dependencies and cache hits. Lint reported zero errors and 40 warnings: 33 in Core, two in system-worker, four in Shopping and one in Tic-tac-toe.
2. Historical run using retired target names: `pnpm nx run-many -t test-external-examples test-external-types -p zerospin` passed six existing tests and the external type checks. The two Shopping cases cover valid quotation/payment emission and quotation refusal; they do not invoke createProduct or prove its typed price refusal. The other four tests cover Tic-tac-toe and receipt delivery.
3. Bounded source inspection found the named negative-price guard before create operation recording. That inspection and the passing type/lint checks do not establish guard execution, failure retention or zero/positive creation behavior.
4. No new test files, fixtures, runners or configuration, storage reset or deployment were performed. Authorization for focused missing behavioral tests and minimal wiring is pending.

## Current verification — 2026-10-21

1. `pnpm nx run zerospin:test` passed its required library builds, strict compiler checks and all ten runtime scenarios. [Shopping's five explicit Effect tests](../../../examples/shopping/tests/system.spec.ts) prove negative-price native `product-price-invalid` with empty Product storage, zero-price creation, positive-price creation through paid checkout, and independent unavailable-Product quotation refusal. The existing paid and reservation-expiry stories still pass.
2. The public harness compiler example now checks exact command-result and selected-field types, retaining its intentional rejection assertion. Scoped lint and formatting passed for all six changed test/support files.
3. Independent source/test review found no material defect: `createProduct.guard` runs before the create program; Marketplace retains its own quotation validation. No production code, schema, dependencies, storage or deployment changed in this verification batch.
4. Application verification assumes the Zerospin framework works. At the maintainer's direction, the generic production Service failure-encoding and durable outcome-retention requirement is transferred to [Plan 214](214-plan-service-ordered-operations-and-finalized-at.md); it is not an application closure prerequisite or verified by the harness's in-memory cache.
5. `pnpm nx run-many -t ts lint -p shopping` passed all 18 tasks including dependencies. Shopping retains three existing `node.worker?sharedworker&url` import warnings and no lint errors. Scoped documentation references and whitespace were checked; earlier source-review reports remain historical.

## Remaining work

None. Product creation and independent quotation behavior are verified. Framework
Failure-outcome retention subsequently completed at the scoped Workerd seam under Plan 214; other
plans keep their independent obligations. No storage reset or deployment occurred.
