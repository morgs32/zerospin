# Make `can` obvious through flat composition

## Why we got here

Nested execution wrappers, overlapping names, and hidden responsibilities made `can` require tracing execution, settlement, preparation, and guard enforcement. Use flat composition, one source of truth, narrow helper inputs, and put enforcement on its owner.

## Implementation

1. Build on completed plans 062 and 063 using `getInitializedSessionOrThrow({ session })`. Preserve lifecycle readiness and transaction disposal checks.
2. Add `getContractOrThrow({ contracts, contractName })` with precise selected-contract inference and typed `contract-not-found`. Read `initialized.declaration.contracts`.
3. Construct an always-callable `contract.guard`, bind declared failures, and default only an absent authored guard to no-op. Enforce synchronous execution, void success, and declared failures; preserve defects and service inference.
4. Apply construction to ordinary, external, mapped, and upgraded contracts. Delete `runContractGuard` and migrate all callers directly.
5. Implement `can` as one `Effect.fn` generator: initialized session, canonical contract lookup, input preparation, runtime context, provided guard. Its postprocessor owns scope, synchronous execution, and result conversion. No intermediate checking operation.
6. Replace `settleSessionCommand` with curried mechanical `makeSessionResult(contract)` and migrate callers. Preserve synchronous `IResult` and thrown defects.
7. Update affected documentation and archive after verification. Hard cutover, no storage changes or aliases.

## Planned hierarchy

```text
zerospin/
├── packages/core/              ~ construction, types, can, result adapter; + lookup
├── packages/system-worker/     ~ direct guard callers
├── packages/browser/checks/    ~ behavioral verification
└── wiki/                       ~ plan and affected documentation
```

## Verification

1. Verify readiness, missing contracts, payload/claims, absent guards, declared denials, invalid returns, async interruption, and defects.
2. Verify external/mapped/upgraded guards and precise contract, claims, query, and service inference. Confirm `can` runs no program, consumes no IDs, and writes nothing.
3. Run scoped Nx builds, types, lint, and behavioral checks for affected packages and consumers. Preserve concurrent work.

## Repeatable simplification loop

1. Find nested wrappers, overlapping names, repeated lookups, and hidden machinery.
2. Trace ordering, ownership, failures, and real callers.
3. Flatten into one ordered composition naming meaningful work.
4. Put guarantees with their owner.
5. Minimize inputs to the actual registry, value, or capability.
6. Delete redundant paths and verify observable behavior. Keep further refactors separate.

## Outcome

`can` is one flat `Effect.fn` generator composing initialized readiness, selected canonical contract lookup, prepared input, runtime context, and the constructed guard. Its postprocessor owns scope, synchronous execution, and `IResult` conversion; thrown defects retain their identity. Replacing the exposed definition does not change the initialized registry used by `can`. Existing staging/validation identity rules and transaction-owned disposal checks are unchanged.

`getContractOrThrow` accepts only the registry and contract name, retaining selected-contract inference and a typed missing-contract failure. `contract.guard` is always callable and binds failures at construction. Ordinary and upgraded contracts use the same construction rule, external contracts bind their authored continuation guard, and mapped contracts preserve the constructed callable. Guard calls enforce synchronous execution, void success, and declared contract failures. Removed `runContractGuard`; all execution and transaction callers invoke `contract.guard` directly. Replaced `settleSessionCommand` with the curried mechanical `makeSessionResult` adapter and migrated all callers.

The direct callable retains exact claims and model-query types. External guard callback inputs now use an explicit property shape so `Effect.fn` contextual inference retains response, claims, query, and service types instead of erasing them through `Omit`. No schema, storage, compatibility alias, or migration changes were needed. Updated the glossary and affected workflow documentation. This bounded, reversible simplification does not require an ADR.

## Completed verification

1. `pnpm nx run-many -t lib ts lint typecheck initialized-session:check claims:check -p @zerospin/core @zerospin/browser system-worker @zerospin/react @zerospin/devtools @zerospin/sdk @zerospin/studio explorer shopping` passed all 35 scheduled tasks, including dependencies.
2. The actual SQLite fixture verifies readiness, missing contracts, payload and claims validation before guards, absent authored guards, bound declared denials, invalid/undeclared/wrong-scope failures, non-void success rejection, async interruption without later continuation, invocation cleanup, and thrown-defect identity. An authored callback returning no Effect remains a defect, rather than becoming a no-op.
3. Direct external, mapped, and upgraded guard checks pass, including absent guards and mapped callable identity. Type assertions verify selected contract lookup and `can` result inference, precise claims/payload/query/response inputs, and service requirements across constructor variants. Existing readiness, lifecycle, transaction rollback, queued delivery, and React claims checks also pass.
4. The fixture confirms `can` never invokes the command program, consumes no real IDs, and changes no retained SQLite resources, commands, operations, or metadata.
5. Scoped formatting and `git diff --check` pass. Documentation checks verify 29 affected source hashes/ranges, 24 affected citation ranges, 444 source links without newly broken links, and 12 sequence/annotation pairs. Unrelated existing drift (41 stale metadata hashes and six missing source links in the inspected pages) remains unchanged.
6. All introduced lint warnings were removed. Three preexisting browser curly-brace warnings remain outside this change. Nx Cloud reports the existing workspace authorization error (`401`); the local verification graph succeeds.

## Remaining work

None.
