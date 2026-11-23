# 105 — Immutable authored declarations

Status: Completed and verified on 2026-10-11. Immutable declaration publication, separate-copy refusal and self-reference construction/upgrades are verified.

## Problem and simpler ownership

1. Authored declarations are treated as canonical capabilities, yet construction retains mutable identity and metadata. [Model construction](../../../packages/core/src/models/make/makeModelVersion.ts) returns a mutable Model whose descriptors, indexes and spec share references. [Contract construction](../../../packages/core/src/contracts/make/constructContractVersion.ts) freezes only the outer spec; mapped and external constructors subsequently assign fields to the ordinary object. Releases likewise retain mutable maps. Changing an accepted object can make executable behavior disagree with the locked specification without changing its identity or version.
2. Construction policies differ between equivalent declarations. Contract/model SemVer decoding checks safe numeric components; service releases and actor versions use different predicates. Service actor construction omits the aggregate actor's claims requirement validation. [updateServiceActorVersion](../../../packages/core/src/serviceActor/updateServiceActorVersion.ts) inherits database/identity/authentication/selections but drops omitted contracts and guards, despite its declaration inheritance description. These discrepancies belong to declaration construction, not later admission.
3. Replace progressive object mutation with one completed immutable declaration per constructor. Decode authored shape once, establish canonical references, validate local domain bindings, derive owned metadata, then finish the declaration. Preserve executable callbacks, model/table identity, contract lineage and generic authoring inference. Do not create a second normalized executable registry.

## Required behavior and deliberate changes

1. Constructor schema checks own malformed props, unknown fields, callable/schema capabilities and version syntax. Domain procedures own model membership, claims availability, exact contract registration and selection provenance. `makeSystem` continues to own cross-release conflicts, owner registry identity and agent-to-system binding.
2. Snapshot and freeze only framework-owned metadata: identity fields, descriptor records and enum arrays, index configurations, declaration maps, specs and agent binding maps. Never recursively freeze Drizzle, Effect schemas, callbacks, table capabilities or user application services. Resolve self references before sealing owned descriptors; retain referenced table identity.
3. Treat all declaration identities as nonempty strings and all version declarations as the same safe-component SemVer grammar. This deliberately rejects previously accepted empty identities and permissive actor/service versions. Construction still throws synchronously before publishing a declaration. No runtime or transaction is opened by these constructors.
4. Validate supplied actor claims against every callable contract's requirements, including declared external continuations reached by mappings. Service actors receive the same required-field/domain compatibility check as aggregate actors. Runtime decoding remains necessary for actual admitted claims and refined codecs; construction does not prove arbitrary schema refinements satisfiable.
5. Actor updates inherit omitted fields and merge supplied declaration maps by key. Supplied scalar/capability fields replace the inherited value; unknown fields are rejected. Service contracts and guards are retained when omitted. The complete new declaration is validated and sealed through its ordinary constructor. Historical declaration objects are never mutated. Model upgrades continue to apply explicit null removals and rebuild a complete version; contract upgrades retain mandatory up adapters and optional down adapters.
6. Ordinary, mapped and external contract construction each finish once. Build external metadata and mapped metadata before freezing the result; eliminate `Object.assign(base, ...)` mutation after an ordinary constructor has returned. Contract lineage remains in the existing WeakMaps, so freezing a declaration does not prevent adding its one permitted successor.
7. Copies of `@zerospin/core` remain a meaningful identity boundary. Retain diagnostic detection in `assertSameCoreInstance`. Current exported `Model`/`Contract` prototypes plus `instanceof` do not prove construction: an empty instance or `Object.create(Model.prototype)` can pass. Register completed Model/Contract instances in private constructor-owned WeakSets and have their canonical predicates require membership. Register only after full construction/validation; immutable fields alone do not prove provenance. Replace touched prototype-only predicates with those canonical guards, preserving inferred public types and exact model/contract registration checks. This is local construction provenance, not a serialized executable registry. Structural release/actor input validation still has its own documented constructor rules. No compatibility aliases, old constructor paths or storage migrations are introduced.
8. Registry membership means an own authored key. [getByKeyOrThrow](../../../packages/core/src/utils/getByKeyOrThrow.ts) currently uses `key in record`, which also admits inherited prototype properties. Replace that membership check with `Object.hasOwn` and reconcile touched direct registry lookups with the same own-key rule. Keep exact object/version binding checks after lookup; a name alone never grants a declaration capability.

## Complete proposed parent shapes

```ts
function makeModelVersion(identity: unknown, props: unknown) {
  const declaration = decodeModelVersion(identity, props);
  const properties = composeModelProperties(declaration);
  const table = makeTable({ ...declaration, shape: properties });
  const model = deriveModelDefinition(declaration, table);
  return sealModelDefinition(model);
}

function constructContractVersion(
  definition: IContractDefinition,
  props: unknown,
) {
  const declaration = decodeOrdinaryContract(definition, props);
  validateContractModels(declaration);
  return finishContractDefinition(declaration);
}

function constructExternalContract(
  ownerKind: IContractOwnerKind,
  props: unknown,
) {
  const declaration = decodeExternalContract(ownerKind, props);
  validateContractModels(declaration);
  return finishContractDefinition(declaration);
}

function makeAggregateRelease(identity: unknown, props: unknown) {
  const declaration = decodeAggregateRelease(identity, props);
  const declarations = composeDeclarations(declaration);
  validateReleaseContracts(declarations);
  validateAggregateActors(declaration, declarations);
  validateAggregateGuards(declaration);
  return finishAggregateRelease(declaration, declarations);
}

function makeServiceRelease(identity: unknown, props: unknown) {
  const declaration = decodeServiceRelease(identity, props);
  validateReleaseContracts(declaration);
  validateServiceActors(declaration);
  const queries = bindServiceQueries(declaration);
  return finishServiceRelease(declaration, queries);
}

function constructAggregateActorVersion(identity: unknown, props: unknown) {
  const declaration = decodeAggregateActor(identity, props);
  validateAggregateIdentity(declaration);
  validateActorContracts(declaration);
  const selections = captureSelections(
    declaration.db,
    declaration.selections,
    declaration.identity.identitySchema,
  );
  return finishAggregateActor(declaration, selections);
}

function makeServiceActorVersion(identity: unknown, props: unknown) {
  const declaration = decodeServiceActor(identity, props);
  validateActorContracts(declaration);
  validateServiceActorGuards(declaration);
  const selections = captureSelections(
    declaration.db,
    declaration.selections,
    declaration.identity.identitySchema,
  );
  return finishServiceActor(declaration, selections);
}
```

1. Decoders contain schemas and meaningful defaults; they do not construct runtimes or perform business authorization. Validation procedures receive completed typed values. `deriveModelDefinition` owns table-derived codecs and metadata together, rather than separate copies of descriptor logic.
2. Finish procedures construct the actual canonical instance and seal its owned metadata. They are not forwarding wrappers around the old constructors. Keep small identity literals and absent-map defaults inline when clearer. The mapped constructor follows decode → exact original/external binding validation → finish, preserving original lineage without copying mutable live fields.
3. Retain owner-specific public generic signatures where they provide aggregateId/response/claims and result inference. Share invariant schemas and binding procedures rather than inventing an owner-mode runner to erase these distinctions.

## Machinery to delete and affected files

Legend: `+` create, `~` modify, `-` delete. Feature-local utility filenames may be combined when a cohesive procedure is small; no forwarding-only files.

```text
zerospin/
├── packages/core/src/
│   ├── + declaration/{SemVerSchema,validateActorContracts,sealOwnedMetadata}.ts
│   ├── ~ models/make/makeModelVersion.ts
│   ├── ~ contracts/make/constructContractVersion.ts — private publication for every decoded variant
│   ├── + contracts/make/ContractMapping.ts — mapper types
│   ├── - contracts/make/{constructExternalContract,constructMappedContractVersion}.ts
│   ├── ~ {aggregate,service}/make/*Release.ts
│   ├── ~ aggregateActor/{make/makeAggregateActorVersion/,updateAggregateActorVersion.ts}
│   ├── ~ serviceActor/{make/makeServiceActorVersion.ts,updateServiceActorVersion.ts}
│   ├── ~ {agent,module,guards}/ — construction and owned-record traversal
│   ├── ~ models/defineModel.ts — completed-instance provenance
│   ├── ~ contracts/definition.ts — completed-instance provenance
│   ├── ~ utils/getByKeyOrThrow.ts — own authored key membership
│   └── ~ system/make/makeSystem/ — retain only system-wide validations
├── packages/sdk/src/ — preserve and verify public authoring inference
└── wiki/
    ├── ~ architecture/ — authored declaration and release ownership
    ├── ~ patterns/ — actual constructor conventions after implementation
    └── ~ glossary.md — postimplementation reconciliation
```

1. Delete repeated SemVer expressions, post-return constructor mutation, repeated hand-written claims/model membership policies and forbidden record-entry loops in the touched construction workflow. Use `mapValues` for record traversal. Do not move all checks into a generic schema framework or weaken exact identity into name/version equality.
2. Affected callers include Shopping/Tic-tac-toe releases, Studio fixture declarations, browser public session declarations, SDK exports and SystemRepo spec acceptance. Existing first-party code has no call to either actor update helper or model upgrade helper beyond SDK exports; exported behavior still needs type and runtime verification. Changes to constructor acceptance are explicit above.

## Implementation order and verification

1. Establish the shared invariant schemas and ownership-aware metadata sealing. Implement model construction and contract variants before actors/releases; keep exact lineage, self-reference and relation behavior. Coordinate with [106](106-plan-canonical-authored-manifest-projections.md), [108](108-plan-model-operation-codecs.md) and [109](109-plan-bound-database-definition.md), which consume the completed declarations and own their derived projections/codecs/database graph.
2. Replace actor construction/update paths, then releases and agent bindings. Update all in-scope callers directly and preserve `makeSystem`'s compact ordered system checks. Verify attempts to mutate returned owned records cannot change executable identity or serialized metadata.
3. Use existing constructors and existing Shopping/Studio declarations to exercise malformed props, foreign instances, self references, claims requirements, external mapping membership, unsupported versions and inherited contracts/guards. Reuse existing verification seams and disposable in-memory probes; create no tests, fixtures, runner files or configuration.
4. The current resolved `@zerospin/core` Nx project has `lib`, `lint` and `tsc:typecheck`; it has no `ts` or test target. Run applicable resolved SDK/example gates once implementation exists. This review ran no production checks and makes no pass claim.
5. Reconcile module READMEs, local patterns, architecture citations and the existing glossary with the implemented result. Create an ADR only if the implemented immutability/public constructor trade-off meets all three repository criteria. No ADR or glossary change belongs to this proposal stage. Archive only after implementation and required verification finish.

## Implementation progress — 2026-10-11

Construction now captures and seals owned metadata, publishes Model/Contract capabilities through private completed-instance registries, validates exact binding/claims/version invariants, and preserves service actor update maps. Disposable constructor/source probes passed owned mutation isolation, empty/prototype-forged capability refusal, unsafe versions/identity refusal, claims closure, inherited service contracts/guards, and mapped/external construction. Scoped lint passed with zero warnings/errors. Descriptor-owned133/109 probes exercised real Table self-reference resolution, exact foreign Table capability identity, structurally equivalent unbound-Table refusal and physical remapping/foreign-key behavior. The108 operation-codec probe used completed factory Models and refused a wrong Model binding.

The explicitly permitted additional inline cases loaded independent source and emitted-core module graphs. Each graph recognizes its own completed Model/Contract, while the other graph's canonical predicate refuses it; `assertSameCoreInstance` reports the named multiple-copy diagnostic, and actual contract/agent constructors refuse the foreign capability. The complete named self-referencing Model case exposed two publication defects: the factory encoded an unresolved own-table name, and an upgrade retained the previous version's self Table. The factory now binds its own named `modelName.id` reference through the existing self-descriptor path before publication; upgrades rebind exact previous-table self edges through the ordinary constructor. Wrong self columns explicitly refuse, while concrete external Table capabilities remain intact.

Successful inline assertions establish the exact shared Model/Table/attribute/property descriptor identity, frozen metadata, nullable/unique/relation/inverse facts, matching serialized reference metadata, attribute and resource codec roundtrips, both self relations in the bound query graph, non-nullable null refusal, wrong-column refusal, and two upgrades binding self references to their new Tables. Exact external Table identity, both historical Model versions, and input mutation isolation also pass. These probes create no files, fixtures, runners, storage, or runtime owners.

### Verified source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

## Completion evidence — 2026-10-11

- The required declaration cases, including separately loaded core diagnostics and complete self-referencing Model publication/upgrades, are verified. The publication repair passes the final source/consumer gates; glossary, ADR, review-index and source citations are reconciled.

## Remaining work

None. Required bounded runtime cases, affected source and consumer checks, and documentation reconciliation are complete.
