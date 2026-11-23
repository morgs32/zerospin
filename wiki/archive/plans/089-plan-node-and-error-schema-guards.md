# Five Node and error schema guards

## Agreed behavior and scope

1. Implement the next five logical schema guards requested after plan 087: completed admission statuses, authentication rejection HTTP statuses, standalone parameter tokens, standalone parameter values, and excluded error-extra keys. Shared checks in aggregate and service code use one supporting schema.
2. Preserve existing behavior, dynamic comparisons, numeric coordinate checks, Error provenance, error codes, transactions, storage identity, and package API mappings. No broad conditional-to-schema policy is established.

## Implementation

1. Add `CompletedAdmissionStatusSchema` beside `AdmissionResultSchema`, deriving its union from existing succeeded/failed status fields. Use its negated status guard in both Node `admitted` methods. Keep the remaining coordinate checks and rejection before serialization. This guard does not validate timestamps or failure payloads.
2. Add shared browser `Node/AuthenticationRejectedHttpStatusSchema.ts` for `[401, 403]`. Replace the inner status membership test in both connection functions, retaining the outer `instanceof Error`/property-presence checks and code-based rejection branch.
3. In `standaloneIdentity.ts`, add a private minimal `StandalonePathParameterTokenSchema = Schema.Struct({ type: Schema.Literals([':', '*']) })`. Guard the whole parser token so TypeScript narrows its discriminated union and keeps `token.name` available; do not add name validation.
4. Add private `StandalonePathParameterValueSchema = Schema.Union([Schema.String, Schema.Number])` for claim values. Preserve acceptance of empty strings, NaN, and infinities; keep subsequent href behavior and existing errors.
5. In `encodeError.ts`, add private `ExcludedExtraKeySchema = Schema.Literals(['stack', 'cause'])` and negate its guard in the existing key filter. Keep filtering before recursive validation so invalid values and cycles under excluded keys do not cause failure.
6. After verification, record the outcome and archive this plan. These helper schemas do not introduce new domain terminology or a qualifying architectural decision; no glossary, ADR, or standing pattern change is expected.

`+` creates; `~` modifies.

```text
zerospin/
  packages/core/src/
    ~ contracts/AdmissionResultSchema.ts
    ~ AggregateNode/AggregateNode.ts
    ~ ServiceNode/ServiceNode.ts
  packages/browser/src/
    + Node/AuthenticationRejectedHttpStatusSchema.ts
    ~ AggregateNode/connectAggregateNode.ts
    ~ ServiceNode/connectServiceNode.ts
    ~ StandaloneNode/standaloneIdentity.ts
  packages/error/src/
    ~ encodeError.ts
  wiki/archive/plans/
    + 089-plan-node-and-error-schema-guards.md
```

## Verification

1. Compare actual original/revised predicates and functions in temporary in-memory checks. Cover all accepted literals, unknown/missing values, HTTP status type differences and Error provenance, code-based authentication failures, real parsed standalone tokens, and claim values including NaN/infinities.
2. Call the emitted AggregateNode and ServiceNode `admitted` methods with a receiver whose `serialized` method returns false. Completed statuses must reach serialization even with incomplete timing/failure payloads; pending/skipped/invalid statuses and invalid coordinates must reject first with the original error.
3. Verify error-extra filtering at nested levels and inside arrays, case-sensitive retained keys, excluded-only cycles and invalid values, retained cycles/nonplain objects/invalid JSON rejection, and repeated nonancestor references.
4. Run one scoped Nx graph for `ts` and `lint` across `@zerospin/core`, `@zerospin/browser`, and `@zerospin/error`, plus the existing core/browser `test:node` tasks, preserving dependencies and caching. Run scoped formatting and diff checks on the eight implementation files and this plan.
5. Preserve unrelated WIP and diagnose any external blocker before widening scope. No new permanent mirrored tests or browser harness is required.

## Outcome and verification — 2026-10-09

1. Implemented all five logical checks across eight implementation files. Shared schemas eliminate repeated admission and authentication status lists; the admission status schema reuses its existing authoritative literal fields.
2. Emitted Node methods passed 4 accepted and 46 rejected cases, preserving incomplete-result acceptance and rejection before serialization. The completed-status schema matched the old predicate for 11 inputs.
3. Browser equivalence checks passed 488 authentication cases across both connectors, 40 real parsed tokens, 19 claim values, and 240 standalone path outcomes. Error provenance, numeric extremes, existing errors, and href encoding are preserved.
4. Actual original/revised error filtering passed 48 helper and 48 encoder comparisons, including nested excluded keys, excluded-only cycles/invalid values, retained-key failures, repeated references, and ancestor cleanup after failure.
5. The main checkout's combined Nx graph hit concurrent transaction WIP: three worker type errors in aggregate/service delivery and service-registry narrowing, plus a staging-test failure (`models.item` is undefined). Core/error typechecks and lint passed; browser checks were blocked by the worker dependency. That refactor was left untouched.
6. Validated only these eight guard files in an isolated managed checkout of committed revision `33550606a0fb8a912bb7b2db6724d4b3d002b67e`. Each implementation file matched the primary checkout byte for byte before and after the checks. `pnpm nx run-many -p @zerospin/core @zerospin/browser @zerospin/error -t ts lint test:node` passed, including required dependencies, 32 core tests, and 67 browser tests. Lint retained 4 existing warnings in untouched files and no errors. Nx Cloud's access warning (401) was non-blocking.
7. Scoped formatting and diff checks passed in the primary checkout. No new glossary terminology, qualifying ADR, or standing pattern was introduced. The guard batch is complete and this plan is archived; the primary checkout's unrelated transaction-refactor failures remain outside its scope.

## Remaining work

None.
