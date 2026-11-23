# External operation descriptor

**Status:** Complete, 2026-11-14.

## Outcome

Each pure external definition owns one `.externalOperation` descriptor, built
when `defineAggregateExternalContract` or `defineServiceExternalContract` creates
the definition. The descriptor's codec closes over that exact definition.
Aggregate and service remain separate implementations.

The descriptor's `make` validates and clones the payload, returns a frozen
domain operation, and retains `external-emission-unregistered` for invalid
input. Its portable codec retains the `external` operation name, definition
name and version, and payload, and rejects a different definition object.
Keep schema-fact registration so operation descriptors continue to participate
in contract validation and schema derivation.

## Implementation

1. Construct each descriptor directly in its corresponding definer. Use a local
   helper only if it makes the code clearer. Remove the getter, public
   descriptor factories, codec and descriptor caches, and the redundant brand
   checks inside codec construction. Retain the definition identity checks
   used by other callers. Keep descriptor types where they are useful, removing
   obsolete modules if their types move.
2. Encode original external work in
   [prepareExternalOperation](../../../packages/system-worker/src/externalOperations/prepareExternalOperation.ts)
   and harness work in
   [prepareHarnessOutput](../../../packages/core/src/testing/systemHarness/prepareHarnessOutput.ts)
   using `operation.contract.externalOperation.schema`. Preserve the existing
   release registration and family checks.
3. Update source links in
   [AuthoredSystem](../../architecture/AuthoredSystem.md) to match the resulting
   implementation. Update the glossary only if its wording no longer matches.

The existing TypeScript `readonly` declaration is sufficient. Do not add
runtime freezing or mutation safeguards for the definition or descriptor.
There is no storage, pending-work, provider request, continuation, or
registration identity change. No ADR is needed for removing the redundant
factories.

## Verification

Run the existing relevant typecheck and aggregate and service external-work
preparation coverage. Use a small focused runtime check through existing seams
if those checks do not establish descriptor construction, portable encoding,
and rejection of a different definition or invalid payload. Do not create test
files, fixtures, or runners. Verify the changed harness preparation path using
an existing seam if available.

## Planned files

`~` modifies; `-` removes if no longer needed.

```text
packages/core/src/contracts/
  ~ defineAggregateExternalContract.ts
  ~ defineServiceExternalContract.ts
  ~/- externalAggregateOperationDescriptor.ts
  ~/- externalServiceOperationDescriptor.ts
packages/core/src/testing/systemHarness/
  ~ prepareHarnessOutput.ts
packages/system-worker/src/externalOperations/
  ~ prepareExternalOperation.ts
wiki/architecture/
  ~ AuthoredSystem.md
```

## Outcome and verification

Both definers now construct their descriptor once. The redundant factory and
cache modules were removed, and both preparation paths use the definition's
descriptor. Architecture source links were updated.

The focused Nx test run compiled the test program and passed 43 aggregate,
service, and harness tests. A focused runtime check passed for both descriptor
families, covering encoding, exact-definition rejection, payload cloning, and
invalid-payload failure.

## Remaining work

None.
