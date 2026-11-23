# Checked current-or-ancestor contract version lookup

Status: Complete — implemented and verified on 2026-10-06.

## Problem and agreed behavior

1. [getVersion](../../../packages/core/src/contracts/getVersion.ts) walks the supplied contract and its `previous` chain, but its public overload promises only `NonNullable<CONTRACT['previous']>`. Requesting the supplied version returns the supplied object, contradicting that promise.
2. Keep the public name and runtime behavior. One checked generic implementation must return `CONTRACT | NonNullable<CONTRACT['previous']>` and retain the `contract-version-unsupported` error type. This expresses the existing lookup honestly without introducing another selection API.
3. The lookup preserves canonical object identity and searches only the supplied version and its ancestors. This follows [plan 044's](044-plan-aggregate-agent-sessions.md) preference for retaining canonical declarations behind checked generic implementations.

## Implementation

1. Replace the overload and erased implementation with one generic function. Type both the traversal accumulator and successful result as `CONTRACT | NonNullable<CONTRACT['previous']>`; let TypeScript check the implementation directly. Do not add casts, new `any`/`unknown` erasure, or cast exceptions.
2. Preserve `Effect.fn('contracts.getVersion')`, traversal order, and the existing unsupported-version error code, message, and `extra` fields. The error currently reports the final visited contract's `commandName` and `version`; changing that provenance is outside this cleanup.
3. Check all four system-worker callers: session-lock validation, actor-command validation, direct aggregate execution, and direct service execution. The first two consume the selected contract; the latter two validate availability. Adapt only in-scope inference assumptions that incorrectly depended on a predecessor-only result. Keep exact declaration information rather than widening callers to an erased contract to silence errors.
4. Leave constructor representation, payload adapters, failure recognition, and other overloads outside this change. No schema, protocol, storage, compatibility, or import-path changes are needed. This plan is independent of [payload encoding](048-plan-payload-encoding-interface.md).

## Verification

1. Extend the existing [contract-program fixture](../../../packages/system-worker/src/fixtures/contractPrograms.ts) with type assertions for the current-or-ancestor success union and unchanged `contract-version-unsupported` error. Include a precise authored current contract so the added current branch cannot silently erase its declaration type.
2. In the same fixture, verify identity for the supplied version with no predecessor, the current version of a chain, its immediate predecessor, and an older ancestor. Verify that searching from an older contract cannot select a newer descendant.
3. Verify an unsupported version fails with the existing code, message, and exact error data, including final visited-version provenance. Exercise a single-version contract and a multi-version chain.
4. Run `pnpm nx run system-worker:contract-programs:check` and `pnpm nx run-many -t ts,lint -p @zerospin/core,system-worker`, allowing Nx to run required dependency builds. Confirm that the four callers compile with the accurate return union. Run formatting checks and `git diff --check` on changed files; do not launch overlapping task graphs. The investigation's in-memory body check is preliminary evidence, not completed runtime or consumer verification.

## Completion

1. After implementation, reconcile affected API documentation and the existing glossary with the actual lookup behavior. Add no terminology merely for this helper refactor. Create an ADR only if the implemented result meets all of the spec skill's criteria.
2. Record actual implementation and verification outcomes in this plan. Use the implement workflow and archive it with its filename intact only after the required work passes; preserve unrelated concurrent changes.

## Completion evidence

1. Replaced the erased overload with a checked generic return and traversal accumulator that include the supplied current contract and its ancestors. Preserved canonical identity, traversal order, and final-visited-version error provenance.
2. Added exact type assertions and fixture coverage for single-version/current/immediate/older identity, descendant rejection, and exact unsupported-version code, message, and extra fields.
3. Core and system-worker TypeScript/lint and system-worker contract-program verification passed with configured dependency builds. All four callers compile without changes. Nx Cloud's access warning (401) was non-blocking. Changed-file formatting and `git diff --check` passed.
4. Updated affected authored-system API documentation; glossary review required no terminology changes or ADR.

## Remaining work

None.
