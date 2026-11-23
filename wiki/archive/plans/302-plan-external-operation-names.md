# Standardize external operation names

**Status:** Complete, 2026-11-14.

## Problem and agreed terminology

External operation names alternate between `ExternalAggregate` and
`AggregateExternal`, and the authored and prepared descriptions have names
that differ only in word order. Use the Aggregate or Service family first and
make the preparation stage explicit:

1. `IAggregateExternalOperation` and `IServiceExternalOperation` are the
   authored, payload-only descriptions recorded through `.externalOperation`.
   Name their descriptor and props types `IAggregateExternalOperationDescriptor`,
   `IAggregateExternalOperationProps`, and their Service counterparts.
2. `IPreparedAggregateExternalOperation` and
   `IPreparedServiceExternalOperation` are the prepared descriptions with an
   external command ID and original context. Name their schemas
   `PreparedAggregateExternalOperationSchema` and
   `PreparedServiceExternalOperationSchema`. Name the shared prepared base
   `IPreparedExternalOperation` and `PreparedExternalOperationSchema`.
3. Name the preparation methods `prepareAggregateExternalOperation` and
   `prepareServiceExternalOperation`. Keep shared names such as
   `makeExternalOperationQueue` when they do not identify a family.

The existing `defineAggregateExternalContract`,
`makeAggregateExternalContractRelease`, and Service equivalents already use
family-first names. External command schemas retain their command-kind-first
names, consistent with Actor, Agent, and System command schemas.

## Implementation

1. Rename the authored operation type modules to `aggregateExternalOperation.ts`
   and `serviceExternalOperation.ts`. Rename their types and the associated
   descriptor and props types in the two definers. Update every in-scope import
   and reference; remove the old names without aliases.
2. Rename the prepared external operation schemas and types in
   [externalOperation.ts](../../../packages/system-worker/src/externalOperations/externalOperation.ts).
   Update their uses in external preparation, contract resolution, the pending
   request queue, and the AggregateVersionChain and ServiceVersionChain
   evaluated-operation schemas. The queue and contract resolver currently use
   subsets of the shared prepared type; retain their existing input shapes.
3. Rename the two preparation methods and their Effect span names. Update
   AggregateVersionRepo, ServiceVersionRepo, and existing test callers. Search
   the repository for remaining old operation names and update current callers
   and live documentation; preserve historical records where their original
   wording is evidence.
4. After implementation, reconcile [the glossary's external operation
   entry](../../glossary.md#external-operation) and relevant architecture source
   links with the implemented names. Update other live documentation only where
   affected. Do not create an ADR unless the implemented decision is hard to
   reverse, surprising without context, and the result of a real trade-off.

## Scope and alternatives

This is a source-level naming cutover, including package import paths and
in-scope callers. Do not add compatibility aliases. Keep the codec fields,
operation discriminators, schema structure, retained history, pending rows,
transaction boundaries, exact-definition checks, and provider request behavior
unchanged. No storage reset or migration is part of this plan.

Keeping both word orders would preserve an ambiguity between authored and
prepared descriptions. Renaming every `ExternalAggregateCommand` would also
break the existing command-kind-first pattern without clarifying this change.

## Verification

1. Run the existing test-program typecheck and focused aggregate and service
   external preparation coverage through the repository's Nx test target. Run
   the existing Tic-Tac-Toe external-work harness coverage in the same graph.
2. Confirm source imports and live documentation contain no stale renamed
   symbols or paths. Verify that only TypeScript names, import paths, and Effect
   span labels changed; the schema fields and portable representation remain
   unchanged. Do not create test files, fixtures, or runners.

## Planned files

`+` creates or is the destination of a rename, `~` modifies, and `-` removes
the old path after a rename.

```text
zerospin/
├── packages/core/src/contracts/
│   ├── ~ defineAggregateExternalContract.ts
│   ├── ~ defineServiceExternalContract.ts
│   ├── - externalAggregateOperation.ts
│   ├── + aggregateExternalOperation.ts
│   ├── - externalServiceOperation.ts
│   ├── + serviceExternalOperation.ts
│   ├── ~ operationDescriptor.ts
│   └── ~ types.ts
├── packages/system-worker/
│   ├── src/
│   │   ├── AggregateVersionChain/~ evaluatedCommand.ts
│   │   ├── AggregateVersionRepo/utils/~ prepareAggregateOutput.ts
│   │   ├── ServiceVersionChain/~ evaluatedServiceCommand.ts
│   │   ├── ServiceVersionRepo/utils/~ prepareServiceOutput.ts
│   │   └── externalOperations/
│   │       ├── ~ externalOperation.ts
│   │       ├── ~ makeExternalOperationQueue.ts
│   │       ├── ~ prepareExternalOperation.ts
│   │       └── ~ resolveWorkContract.ts
│   └── tests/
│       ├── aggregate-adapter-failures/~ aggregate-adapter-failures.workerd.spec.ts
│       └── service-external-settlement/~ service-external-settlement.workerd.spec.ts
└── wiki/
    ├── ~ architecture/AuthoredSystem.md
    ├── ~ glossary.md
    └── + plans/302-plan-external-operation-names.md
```

## Outcome

The authored and prepared external operations, descriptor types, preparation
methods, and their callers use the agreed names. Schema fields and portable
representations remain unchanged. The glossary and architecture source hashes
were reconciled; no ADR was needed.

The focused Nx graph compiled the test program and passed all 43 selected
aggregate, service, and harness tests. A names-only comparison of the authored
operation types and prepared schemas confirmed their structures are unchanged.

## Remaining work

None.
