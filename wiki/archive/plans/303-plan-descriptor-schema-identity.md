# Simplify operation definitions

**Status:** Complete, 2026-11-15.

## Problem and agreed behavior

An **operation definition** combines an operation's schema and `make` method.
A recorded operation is the value it constructs. A contract release's
`operations` map grants permission to record named operations. An external
contract definition owns its external operation definition; the two definitions
are distinct. `IOperationSpec` remains the portable SystemSpec projection.

The current `makeOperationDescriptor` reads a codec's registered facts and
stores the same facts against the operation descriptor. An external operation's
facts contain its exact external contract definition, but that definition also
owns the operation descriptor. The two external definers use local classes to
construct that cycle.

1. Rename the operation descriptor concept to **operation definition** across
   its modules, types, methods, callers, and current documentation. Keep the
   author-facing `model.operations.create` and `externalOperation` properties,
   recorded operation types, and `IOperationSpec` unchanged. Primitive and
   attribute descriptors are separate concepts and keep their names. Use a
   hard cutover without compatibility aliases.
2. Operation definitions own the domain references required for validation and
   projection: an exact model and operation name; an exact command destination
   and contract; or an external contract name, version, and payload shape.
   Remove operation facts registries and their lookups, the duplicate
   descriptor-to-facts map, and schema-provenance checks. Do not replace them
   with a new operation-definition registry or authenticity protocol.
3. Validate external ownership by resolving the emitting release's external
   implementation by name and version and checking that its external contract
   definition owns the exact operation definition:
   `implementation.external.definition.externalOperation === operationDefinition`.
   Keep exact model ownership, command destination and contract registration,
   Aggregate/Service family checks, and ordinary structural input validation.
4. Construct aggregate and service external contract definitions as plain
   objects, each with one `.externalOperation` operation definition bound to
   that exact external contract definition. Remove the local classes. Retain
   separate aggregate and service construction.

## Implementation

1. Rename `operationDescriptor.ts` to `operationDefinition.ts` and
   `modelOperationDescriptors.ts` to `modelOperationDefinitions.ts`. Rename
   `IOperationDescriptor`, `IAnyOperationDescriptor`, `IOperationDescriptors`,
   `IAggregateOperationDescriptors`, `IServiceOperationDescriptors`, and the
   Aggregate and Service external operation descriptor types to their
   corresponding `...Definition` or `...Definitions` names. Rename
   `makeOperationDescriptor` and `modelOperationDescriptors` consistently.
   Update operation-specific local names, error text, imports, and in-scope
   callers, including contract release and model construction. Preserve
   `IInferOperation` and the recorded operation types.
2. Remove all operation schema-facts maps, descriptor-facts maps, related
   registration and lookup functions, and schema-provenance checks. Delete the
   now-obsolete command and external schema-facts modules. Pass the already
   known model and operation name directly to model operation construction;
   retain the existing model codec cache, which has a separate purpose. Put the
   command destination and contract directly on the command operation definition.
   Replace the current `isOperationDescriptor` provenance guard at contract
   construction with ordinary structural validation of the operation
   definition's schema, callable `make`, and applicable domain data. Do not
   require copied definitions, replaced schemas, or unregistered schemas to
   fail merely because of their provenance.
3. Derive operation ordering, deduplication, `operationsSchema`, and portable
   `IOperationSpec` directly from operation definitions and their domain data.
   Preserve current portable fields and deterministic ordering, including
   projection before an owner release is available. Update model ownership,
   command destination/System grant, Agent, and external ownership validations
   to use those direct domain references. Preserve the Aggregate/Service
   external-family check at contract-release construction and the existing
   claims-free Agent check. Use explicit domain methods and the existing family
   concepts; do not add `ownerKind` or an equivalent general owner discriminator.
4. In [defineAggregateExternalContract.ts](../../../packages/core/src/contracts/defineAggregateExternalContract.ts)
   and [defineServiceExternalContract.ts](../../../packages/core/src/contracts/defineServiceExternalContract.ts),
   capture the payload shape once and build the codec from it and the decoded
   name and version. Codec and `make` callbacks can close over an explicitly
   typed external contract definition declared later; do not invoke those
   callbacks before it exists. Construct the plain external contract definition
   with its operation definition. The operation definition carries captured
   external contract name, version, and payload for projection; it has no
   back-reference to the external contract definition. The codec and `make`
   callbacks still close over the completed definition so recorded external
   operations retain that exact contract. Preserve the existing external
   contract definition identity checks used elsewhere. Use no assertions,
   temporary incomplete definitions, getter, local class, or new shared
   aggregate/service helper.
5. Preserve portable operation fields and encoding, exact external contract
   definition identity, payload cloning and frozen domain operations,
   `external-emission-unregistered`, and existing release registration and
   family checks. No storage, pending work, request, continuation, or replay
   behavior changes.
6. Move `bindRecordingOperations` into contract evaluation as inline code or a
   local helper, preserving deferred construction, failures, and the fresh
   per-evaluation collector. Do not export a general binding helper from the
   operation definition module.
7. After implementation, reconcile terminology and source links in
   [AuthoredSystem](../../architecture/AuthoredSystem.md), the glossary, local
   patterns and index, Fragment, the root README, and relevant SDK skills.
   Preserve historical changelog and archived records. Coordinate changes to
   concurrently active plans, including Plan 306, without disturbing their
   unrelated work. Create an ADR only if an implemented decision is hard to
   reverse, surprising without context, and the result of a real trade-off.

## Alternatives

1. Keep schema facts and local classes: this retains indirect lookups and the
   construction cycle for information already known by operation definitions.
2. Add an operation definition registration phase or schema-provenance registry:
   neither is needed for the agreed direct ownership and release identity checks.

## Verification

1. Run `pnpm nx run zerospin:test -- packages/core/tests/receipt-delivery.spec.ts`.
   Its shared ordinary-program scenarios exercise model, command, Aggregate
   external, and Service external operation definitions; the Nx target also
   compiles the existing test program and in-scope renamed callers.
2. Use a small runtime probe through existing validation seams to confirm the
   registered external operation definition is accepted and a different
   definition with the same name and version is rejected. Check an operation-only
   lookalike model is rejected and retain the Aggregate/Service family check.
   Existing command coverage must still reject lookalike destination owners and
   contracts. Verify both external families' portable encoding and invalid
   payload failure if existing coverage does not establish them. Do not create
   test files, fixtures, or runners.
3. Search in-scope source and live documentation for stale operation descriptor
   names and removed import paths. Keep unrelated primitive descriptors and
   historical wording intact.

## Planned files

`~` modifies, `+` creates or is the destination of a rename, and `-` removes
the old path after a rename.

```text
zerospin/
├── ~ README.md
├── fragment/content/
│   ├── handbook/~ contracts-and-operations.md
│   └── reference/~ sdk.md
├── packages/
│   ├── core/src/
│   │   ├── contracts/
│   │   │   ├── - operationDescriptor.ts
│   │   │   ├── + operationDefinition.ts
│   │   │   ├── - modelOperationDescriptors.ts
│   │   │   ├── + modelOperationDefinitions.ts
│   │   │   ├── - commandOperationSchema.ts
│   │   │   ├── - externalOperationSchema.ts
│   │   │   ├── ~ ContractOperationsSchema.ts
│   │   │   ├── ~ defineAggregateExternalContract.ts
│   │   │   ├── ~ defineServiceExternalContract.ts
│   │   │   ├── ~ evaluateContract.ts
│   │   │   ├── ~ makeCommandOperation.ts
│   │   │   ├── ~ operationCodecs.ts
│   │   │   ├── ~ operationSchema.ts
│   │   │   ├── ~ types.ts
│   │   │   └── make/
│   │   │       ├── ~ constructContractRelease.ts
│   │   │       ├── ~ makeAggregateContractRelease.ts
│   │   │       ├── ~ makeAggregateExternalContractRelease.ts
│   │   │       ├── ~ makeServiceContractRelease.ts
│   │   │       ├── ~ makeServiceExternalContractRelease.ts
│   │   │       ├── ~ upgradeAggregateContractRelease.ts
│   │   │       ├── ~ upgradeAggregateExternalContractRelease.ts
│   │   │       ├── ~ upgradeServiceContractRelease.ts
│   │   │       └── ~ upgradeServiceExternalContractRelease.ts
│   │   ├── models/
│   │       ├── make/~ makeModelVersion.ts
│   │       └── ~ types.ts
│   │   ├── declaration/
│   │   │   ├── ~ makeContractSpec.ts
│   │   │   ├── ~ validateActorContracts.ts
│   │   │   └── ~ validateOwnerAgents.ts
│   │   └── system/make/
│   │       ├── makeSystem/~ validateCommandOperations.ts
│   │       └── ~ makeSystemSpec.ts
│   ├── system-worker/src/AggregateVersionRepo/authorizeSession/
│   │   └── ~ authorizeSession.ts
│   └── sdk/skills/
│       ├── zerospin-author-feature/~ SKILL.md
│       ├── zerospin-evolve-declarations/references/~ declaration-evolution.md
│       └── zerospin-external-work/
│           ├── ~ SKILL.md
│           └── references/~ recorded-external-work.md
└── wiki/
    ├── architecture/~ AuthoredSystem.md
    ├── ~ glossary.md
    ├── patterns/
    │   ├── ~ index.md
    │   └── contracts/
    │       ├── ~ contract-mutations-stay-in-owner-models.ts
    │       └── ~ contract-program-emission-and-result.ts
    └── plans/
        ├── ~ 303-plan-descriptor-schema-identity.md
        └── ~ 306-plan-contract-read-projections.md
```

## Outcome and verification

Operation definitions now carry their domain references directly. The facts
registries, schema-provenance checks, and external definition classes were
removed; external ownership compares the registered external contract's
operation definition by identity. Contract evaluation owns its recording
methods. Operation selection validates each distinct definition, deduplicates
schemas for codec composition, and projects distinct domain operations with
collision-free identities and deterministic ordering.

The final focused Nx run compiled the test program and passed 55 core and System
Worker tests. The Native library build passed. Runtime probes checked external
definition identity, family and model ownership, shared-schema validation,
portable encoding, invalid payloads, and deterministic projection of names
with delimiters. All eight SDK skill files passed validation. No test files were
created.

## Remaining work

None.
