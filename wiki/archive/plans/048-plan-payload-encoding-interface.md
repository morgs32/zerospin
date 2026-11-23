# One checked versioned payload encoding interface

Status: Complete — implemented and verified on 2026-10-06.

## Problem and agreed behavior

1. [encodePayload](../../../packages/core/src/contracts/encodePayload.ts) has separate current-version and version-map overloads followed by an erased implementation. Both signatures describe the same operation: select the payload schema for a requested supported contract version and encode that payload.
2. Use one checked generic implementation based on the existing `__payloads` version map. Keep `SOURCE_VERSION extends keyof NonNullable<CONTRACT['__payloads']> & string` and the corresponding `NoInfer` payload lookup. The version determines the accepted payload; an invalid payload must not widen the inferred contract or version to become acceptable.
3. Preserve the existing `Effect.Effect<string, IAnyError>` return, recursive ancestor traversal, schema validation, and excess-property rejection. Retain the existing conditional `any` only for erased contract payloads at their runtime-validation boundary; do not broaden it or add new erasure or cast exceptions.

## Implementation

1. Remove the separate current-version overload and broad implementation signature. Put the existing version-map signature directly on the implementation and keep `Effect.fn('contracts.encodePayload')`. Let TypeScript check the body and recursive call against that signature.
2. Preserve encoding with the selected version's schema, including `Schema.fromJsonString` and `onExcessProperty: 'error'`. Encoding historical input does not invoke `up` or `down` adapters.
3. Preserve both error paths exactly: `contract-payload-version-unsupported` after ancestor traversal is exhausted, and mapped `encode-command-payload-failed` parse errors. Keep their message prefixes and `extra` fields, including the final visited version for unsupported input.
4. Check core `encodeCommand`, system-worker actor-command validation and async-operation preparation, CLI aggregate/service seeding, and Shopping's worker, delivery, backend, and fulfillment callers. Preserve their existing runtime-validation boundaries; change only assumptions affected by the checked signature. Contract constructors, decoding, validation, adapters, and unrelated overloads are outside scope. No schema, protocol, or storage cutover is needed, and [getVersion](047-plan-contract-version-selection.md) is not a prerequisite.

## Verification

1. Extend the existing [contract-program fixture](../../../packages/system-worker/src/fixtures/contractPrograms.ts) with a two-version declaration: version 1 has a text payload and version 2 has a numeric payload. Assert valid current and historical calls infer an Effect producing `string` with `IAnyError`, and preserve the erased `encodeCommand` caller's compilation.
2. Add negative declaration checks for wrong text/numeric values, payloads paired with the wrong version, unsupported versions, missing required fields, and excess payload fields. Verify a payload cannot widen the selected contract or version to make itself valid. Keep the payload-to-version relationship enforced by `NoInfer`.
3. At the same runtime seam, verify current and historical JSON encoding, canonical schema selection through more than one ancestor, and that adapters are not called. Pass invalid values through the existing erased-contract boundary to verify malformed payloads, excess properties, and unsupported versions retain their exact error paths and data.
4. Run `pnpm nx run system-worker:contract-programs:check`, `pnpm nx run-many -t ts,lint -p @zerospin/core,system-worker`, and `pnpm nx run-many -t ts -p @zerospin/cli,shopping` for production-consumer inference. Allow Nx to run required dependency builds and lint CLI/Shopping only if their source changes. Follow with formatting checks and `git diff --check` on changed files; do not launch overlapping task graphs. In-memory checks already exercised the generic body, `encodeCommand`, a text/numeric versioned example, and six negative declarations; runtime and production-consumer checks remain required implementation work.

## Completion

1. After implementation, reconcile any affected API documentation and the existing glossary with the actual version-selection behavior. Avoid creating new domain terms for a signature cleanup. Create an ADR only if the implemented result meets all of the spec skill's criteria.
2. Record actual implementation and verification outcomes in this plan. Use the implement workflow and archive it with its filename intact only after all required work passes; preserve unrelated concurrent changes.

## Completion evidence

1. Replaced the current-version overload and erased body signature with one checked version-map implementation, preserving `NoInfer`, the existing erased runtime boundary, recursive schema selection, and exact encoding error paths.
2. Added exact current/historical Effect and negative payload/version declarations; a three-version fixture verifies canonical schema selection without adapter execution and malformed, excess-property, and unsupported failures through `encodeCommand`.
3. Core/system-worker TypeScript and lint, system-worker contract-program verification, and CLI/Shopping TypeScript passed with configured dependency builds. Production callers required no edits. Nx Cloud's access warning (401) was non-blocking. Changed-file formatting and `git diff --check` passed.
4. Updated the authored-system API documentation; glossary review required no new term or ADR.

## Remaining work

None.
