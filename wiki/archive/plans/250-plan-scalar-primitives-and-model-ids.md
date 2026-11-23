# Scalar primitives, model IDs and local relationships

**Date:** 2026-10-21

**Status:** Complete on 2026-10-21. Framework published as 21.0.0; all four current sibling working trees reconciled, verified and committed separately from their initial work snapshots.

**Research:** [Primitive design alternatives](../../research/primitive-design-alternatives.md). Preserve the implemented [stable model reference identity](../../research/stable-model-reference-identity.md) requirement.

## Result and boundaries

1. Primitive `kind` describes value meaning. Replace the separate prefixed primary-key, foreign-key and reference kinds with `PrimitiveKind.Id = 'id'`. Keep `PrimitiveKind` as the runtime registry, and retain Boolean, Integer, Number, Text, Date, Enum, Json and Cursor. Keep Cursor's existing move-operation meaning; this plan introduces no replacement ordering abstraction.
2. Put source-column constraints and local relationship identity beside the scalar descriptor: `nullable`, `unique`, `primaryKey` and optional `references: { tableName, columnName, relation, inverse }`. No descriptor retains a destination `Table`, selected model version, resolution state or second scalar classification.
3. Add `modelId({ model, nullable?, unique? })` for a stable model's ID value. Keep `modelRef({ model, relation, inverse, nullable?, unique? })` for that value plus a local relationship. Both consume the stable `defineModel` identity; the owning release selects concrete model versions. Neither constructor generates an ID, establishes resource existence or grants model authority.
4. Keep column declarations together, existing inline DB-config authoring, immediate standalone table codecs and existing synchronous transaction boundaries. No key handles, relationship-generated columns, fluent builders, arbitrary-codec registry or public draft/resolved table lifecycle.
5. Hard-cut over framework, authored consumers, documentation and package adopters together. Preserve command-driven model creation/change, exact canonical contract/model bindings, current relationship-cycle policy and existing storage ownership. This plan changes descriptor representation, not admission/execution/history responsibilities.

## Descriptor algebra and factory interface

The snippets specify the public type shape; they are not implementation or passing typecheck evidence. Use the existing `PrimitiveKind` members as the catalog keys so runtime and type discriminants agree.

```ts
type IReference = Readonly<{
  tableName: string;
  columnName: string;
  relation: string;
  inverse: string;
}>;

type IColumnOptions = {
  nullable?: boolean;
  unique?: boolean;
  primaryKey?: boolean;
  references?: IReference;
};

type IValueOptionsByKind = {
  [PrimitiveKind.Boolean]: { defaultValue?: boolean };
  [PrimitiveKind.Integer]: { defaultValue?: number };
  [PrimitiveKind.Number]: { defaultValue?: number };
  [PrimitiveKind.Text]: { defaultValue?: string | null };
  [PrimitiveKind.Date]: { defaultValue?: Date };
  [PrimitiveKind.Enum]: {
    values: readonly [string, ...string[]];
    defaultValue?: string;
  };
  [PrimitiveKind.Json]: {
    schema: Schema.Codec<unknown, unknown>;
    defaultValue?: null;
  };
  [PrimitiveKind.Id]: { abbreviation: string };
  [PrimitiveKind.Cursor]: { abbreviation: string };
};

type IPrimitiveDescriptor = {
  [KIND in keyof IValueOptionsByKind]: Readonly<
    { kind: KIND } & IValueOptionsByKind[KIND] & IColumnOptions
  >;
}[keyof IValueOptionsByKind];

type IFactoryArgs<OPTIONS> = {} extends OPTIONS
  ? [] | [options: OPTIONS]
  : [options: OPTIONS];

type IProvidedOptions<ARGS> =
  ARGS extends [infer OPTIONS] ? OPTIONS : {};

type IPrimitiveFactories = {
  [KIND in keyof IValueOptionsByKind]: <
    const ARGS extends IFactoryArgs<
      IValueOptionsByKind[KIND] & IColumnOptions
    >,
  >(...args: ARGS) => Readonly<
    { kind: KIND } & IProvidedOptions<ARGS>
  >;
};
```

1. `primitives` exposes boolean, integer, number, text, date, enum, json, id and cursor. Required scalar options make `id()`/`json()`/`enum()` invalid; ordinary scalars retain calls such as `integer()`. One shared argument helper replaces the nullable/default overload matrices. Retain supplied literals, including boolean flags, prefixes, enum values, JSON codecs and relationship names.
2. Absent flags mean false. Constructors validate exact allowed options and combinations once, own/freeze mutable metadata, and preserve fresh Date-default behavior. Permit key/reference roles only on ID, integer and text values. Primary keys remain nonnullable and without defaults; do not invent new default or key capabilities. JSON continues to reject `unique: true`; accepting a canonical false flag does not add JSON uniqueness. Default null still requires nullable text/JSON as currently supported. Preserve safe integers, finite numbers and enum-default membership. Invalid construction rejects before a table/configuration is usable; the compact generic types do not claim to statically encode every runtime rule.
3. Keep one decoded-value inference path, plus distinct row/portable representation inference. ID/Cursor prefixes yield template-literal strings, nullable fields admit null, and JSON retains the exact authored codec's decoded type. Payload omission is allowed only when a default is known to exist; optional/default-or-undefined options cannot promise a default. Handle absent `nullable`/`defaultValue` keys explicitly rather than treating indexed unknown values as enabled flags.
4. Keep the owned live Effect codec on JSON descriptors. `encodeShape` emits its existing JSON Schema document, Date defaults use ISO strings, and row Dates remain Dates. `captureDescriptor` supplies canonical false defaults once before freezing; `encodeShape` preserves that canonical form, so explicit false and omission do not produce different declaration identities. Do not claim arbitrary runtime transforms can be reconstructed from JSON Schema.
5. Framework model IDs become `id({ abbreviation, primaryKey: true })`; authored model attributes remain forbidden from declaring primary keys. Contract payload descriptors reject `references` and `primaryKey: true` regardless of scalar kind. IDs in payloads remain caller-supplied.

### Model-specific construction

1. Add a single-signature `modelId` in core. Its input is the stable model definition plus optional nullable/unique flags. Its result has `kind: PrimitiveKind.Id`, the literal `model.abbreviation`, and supplied flags. Strip `model` from the result; do not add model name, a relationship, a version or a runtime capability.
2. Revise the existing single domain operation `modelRef` to return the same ID value plus `references`, using `model.name`, column `id` and literal relation/inverse names. Strip authoring `model`, `relation` and `inverse` from the top-level result. Preserve existing nonempty identity/name validation and immutable ownership. It shares ID construction with `modelId` without forwarding through a table resolver.
3. Export both helpers from the SDK browser and server entrypoints. Shapes remains independent of core model declarations. Keep `primitives.id({ abbreviation })` for non-model IDs and `id({ abbreviation, primaryKey: true })` for generic prefixed table keys.

```ts
type IModelIdOptions = {
  model: Readonly<{ name: string; abbreviation: string }>;
  nullable?: boolean;
  unique?: boolean;
};

type IModelRefOptions = IModelIdOptions & {
  relation: string;
  inverse: string;
};

declare function modelId<const PROPS extends IModelIdOptions>(
  props: PROPS,
): Readonly<Omit<PROPS, 'model'> & {
  kind: PrimitiveKind.Id;
  abbreviation: PROPS['model']['abbreviation'];
}>;

declare function modelRef<const PROPS extends IModelRefOptions>(
  props: PROPS,
): Readonly<Omit<PROPS, 'model' | 'relation' | 'inverse'> & {
  kind: PrimitiveKind.Id;
  abbreviation: PROPS['model']['abbreviation'];
  references: Readonly<{
    tableName: PROPS['model']['name'];
    columnName: 'id';
    relation: PROPS['relation'];
    inverse: PROPS['inverse'];
  }>;
}>;
```

```ts
// CartItemV1: stable value identity and local relationship are distinct.
attributes: {
  productId: sdk.modelId({ model: product }),
  cartId: sdk.modelRef({
    model: cart,
    relation: 'cart',
    inverse: 'items',
  }),
  quantity: sdk.primitives.integer(),
}

// ServiceActorVersionChain.commandResolutions: source scalar is complete.
serviceIndex: primitives.integer({
  primaryKey: true,
  references: {
    tableName: 'exposedCommands',
    columnName: 'serviceIndex',
    relation: 'exposedCommand',
    inverse: 'commandResolution',
  },
})

// UpdateCartItemQuantity: a payload ID has no local SQL relationship.
payload: {
  cartItemId: sdk.modelId({ model: cartItem }),
  quantity: sdk.primitives.integer(),
}
```

## Compilation and exact deletion inventory

1. `Table` captures an already complete scalar shape and constructs codecs immediately. `makeTable` returns `ITable<TABLE_NAME, SHAPE>` without changing the shape type. Self relationships name their own logical table/column; model self relationships use their own stable model definition. No self sentinel or fabricated `Table` is needed.
2. `makeDbConfig`, `makeResourceDbConfig` and `makeActorContractReadDb` pass the authored tables directly to `bindDatabaseDefinition`. Keep registered logical-name lookup, sole-primary-key and scalar/prefix compatibility validation, duplicate identity/name/index/relation checks, physical-name overrides, cycle rejection and actor-visible CTE/selection authority. Registry keys may differ from logical table names; runtime and query-type lookup must both use the logical name.
3. Build scalar SQL columns first, then apply allowed source primary/unique and foreign-key constraints. Keep immediate SQLite foreign keys and current NO ACTION behavior. A primary key counts as unique for inverse cardinality even when `unique` was omitted. Preserve synchronous resource-change/checkpoint/pending-delivery commit boundaries.

| Delete | Current location | Replacement or retained responsibility |
| --- | --- | --- |
| `PrimitiveKind.PrimaryKey`, `.ForeignKey`, `.Ref` | `packages/shapes/src/primitiveKind.ts` | `.Id` plus source-column facts; retain the other kinds, including Cursor |
| `primitives.primaryKey`, `.foreignKey`, `.ref`, `.self` and their overloads | `packages/shapes/src/primitives.ts` | Scalar factories, `id`, core `modelId`/`modelRef` |
| `IPrimaryKeyDescriptor`, `IForeignKeyDescriptor`, `IRefDescriptor`, `IAnyRefDescriptor`, `INamedRefDescriptor` | `packages/shapes/src/types.ts` | One descriptor catalog and typed option intersections |
| The remaining per-kind generic descriptor declarations (`IBooleanDescriptor`, `IIntegerDescriptor`, `INumberDescriptor`, `ITextDescriptor`, `IDateDescriptor`, `IEnumDescriptor`, `IJsonDescriptor`, `IAnyJsonDescriptor`, `ICursorDescriptor`) | `packages/shapes/src/types.ts` | Catalog-derived narrowing/actual factory return types; no compatibility aliases; Cursor itself remains supported |
| Duplicate `IAnyPrimitiveDescriptor` and `IAnyShape` aliases | `packages/shapes/src/types.ts` and imports | Canonical `IPrimitiveDescriptor` and `IShape` |
| `targetKind`, descriptor destination `table` pointers, top-level `targetTableName`/`targetColumnName`, self markers/placeholders | Shapes/core consumers | Source scalar and nested plain `references` |
| Entire `resolveTableReferences.ts`, its index export, `resolveTableReferences`, `IPrimaryKeyColumn`, `IReferencedTable`, `IResolvedRef`, `INamedRefColumns`, `IResolvedTables`, `IReferenceError`, `IReferenceErrors`, `ICheckedTableReferences` | `packages/shapes/src/resolveTableReferences.ts` | Validation/query relation lookup directly over stable names; no rebound descriptor types |
| Resolver calls and `IResolvedTables` return transformations | DB-config factories and `makeActorContractReadDb` | Direct graph binding over the unchanged authored shape |
| `IPrimaryKeyColumns`, `IResolvedSelfShape`, self rewrite pass, graph-dependent deferred codec condition | `packages/shapes/src/makeTable.ts` | Complete scalar shape and immediate codec construction |
| Recursive reference-to-destination key chasing | `packages/shapes/src/resolvePrimaryKey.ts` | Retain a local scan for `primaryKey: true` and one valid scalar key |
| Ref-specific unresolved-state validation and scalar codec branches | `packages/shapes/src/compileDescriptor.ts` | Shared scalar compilation and ordinary option validation |
| Ref's integer/plain-text/prefixed-ID SQL dispatch and separate primary/foreign-key scalar cases | `packages/shapes/src/primitiveMaps.ts` | Ordinary scalar compilation followed by source constraints |
| Ref wire schema, `Omit<..., 'table'>` representation, pointer-stripping encoding branch, Ref/`targetKind` encoded-row codec branch | `encodeShape.ts`, `makeEncodedShapeRowCodec.ts` | Scalar wire descriptors plus plain relationship metadata; keep JSON/Date conversion |
| `IRefPrimaryColumn`, PK/FK/Ref branches in decoded/encoded/Drizzle inference and obsolete per-kind lookup entries | `packages/shapes/src/types.ts` | Catalog-driven scalar inference and shared primary-key modifiers; do not collapse row/portable distinctions |
| Model self-to-`primitives.self` conversion and upgrade-time `previous.table` rebinding | `packages/core/src/models/make/makeModelVersion.ts` | Stable immutable relationship names; primary-key checks inspect the flag |
| `IsUnion` imports and shapes' `type-fest` dependency | Shapes primitives/resolver and manifest | Remove through package-manager dependency maintenance; no replacement use is planned |

Do not delete `resolvePrimaryKey`, graph validation, relation type lookup, `compileDescriptor`, immutable capture, Date/JSON compilation, `makeEncodedShapeRowCodec`, or the other public shape/table helpers merely because their implementations become smaller. Replace their obsolete branches in place. Do not leave the deleted design behind as renamed wrappers, aliases or a compatibility decoder.

## Consumer cutover

1. **Core and storage consumers:** update model/resource types, `IAssertValidModels`, SQL relation types/rendering and actor-visible reads to recognize `references`, stable names and compatible selected keys. Preserve exact canonical model/contract authorization. Convert framework prefixed primary keys to scalar ID plus flag. Convert the four internal shared integer primary/foreign keys in Aggregate actor/agent and Service actor/agent command-resolution tables, dropping redundant `unique: true` while retaining one-to-one inverse behavior.
2. **Value consumers:** change `PayloadFieldDescriptorSchema` and payload types to reject local references/primary keys by metadata. Change `scopeContractReadDb`, move-property inference, `validateMoveValues` and projection reference closure to inspect `references`. Moves remain allowed for Cursor or local-reference attributes; an ordinary `modelId`/ID never becomes movable automatically. Projection closure follows local relationships only, so cross-owner Product IDs do not require local Product rows.
3. **Repository authoring/UI:** convert Shopping, Tic-tac-toe and external-work declarations, Studio fixtures, React primitive input maps and numeric coercion. Use `modelId` wherever an existing stable model definition owns the ID format, including payload IDs and cross-owner identities. Use `modelRef` for local model relationships. Use explicit scalar `references` for generic table relationships, and direct logical self names for table self relationships. Introduce stable definition modules only where needed to avoid importing a selected version or creating import cycles. Preserve Studio stories and supporting fixtures. Zod already delegates value compilation; update its public types/examples without inventing another mapping.
4. **Indirect consumers:** check Browser/Native portable definition locks, resource-table construction, row codecs, CLI/deployment declaration serialization and all SDK entrypoints. Update type imports to the single catalog; remove every live use of deleted kinds, helpers and fields. Do not verify Explorer.
5. **Published adopters:** plan one breaking fixed-group package release, then exact package and lockfile adoption in QRK (`apps/zerospin`, `apps/library`, `apps/app`), Stackshirts (`apps/zerospin`, `apps/app`), Mentor Mailbox (`apps/zerospin`, `apps/app`, `apps/admin`, `apps/hub`) and Red Rope Parking (`apps/zerospin`, `apps/admin`). These are package consumers, not `vendor/zerospin` subtree updates. Recheck manifests/roots when implementing. Preserve QRK's existing stable relationships and the other consumers' nullability, uniqueness, prefixes and local-versus-cross-owner meaning. E Pluribus Machina currently has no applicable dependency/callers and is outside this adoption.
6. **Publication hygiene:** choose the actual version through the repository's fixed-group release workflow; do not guess a version in advance. Publish/adopt committed in-scope code, using isolated checkouts where unrelated WIP exists. Update only affected package pins, lockfile resolutions and existing minimum-release-age exemptions. Release/adoption is unfinished until all four consumers compile against the exact published release and their representative behavior is established.
7. **Documentation after implementation:** update shapes/Zod/core module docs, SDK/browser reference material, packaged author-feature/external-work guidance, Fragment guides/handbook examples and active local patterns for inline primitives, DB configuration, stable references and shape encoding. Reconcile this research note and the existing glossary with the implemented result. Update governing ADR prose only where the actual decision changes; create an ADR only if it meets the repository's qualifying criteria. Leave historical archived evidence recognizable as history.

## Planned files and execution order

Legend: `+` create, `~` modify, `-` delete. Braces group named files; `**` covers authored consumers identified above, not vendored/generated copies.

```text
zerospin/
  packages/shapes/
    ~ package.json
    ~ README.md
    ~ src/{primitiveKind,primitives,types,captureDescriptor,index}.ts
    ~ src/{makeTable,resolvePrimaryKey,compileDescriptor,makeShapeCodecs}.ts
    ~ src/{primitiveMaps,encodeShape,makeEncodedShapeRowCodec}.ts
    - src/resolveTableReferences.ts
  packages/core/src/
    + models/modelId.ts
    ~ models/{modelRef,types}.ts
    ~ models/make/makeModelVersion.ts
    ~ drizzle/make/makeDbConfig/makeDbConfig.ts
    ~ drizzle/{types,definition/bindDatabaseDefinition}.ts
    ~ drizzle/definition/{renderDrizzleSchemas,renderDrizzleRelations}.ts
    ~ contracts/{moveOperation,operationCodecs}.ts
    ~ contracts/make/{constructContractVersion,makeContractReadDb,makeActorContractReadDb}.ts
    ~ **/*DbConfig.ts (actual primitive consumers)
  packages/sdk/
    ~ src/{index,browser/index}.ts
    ~ skills/{zerospin-author-feature,zerospin-external-work}/references/*.md
  packages/react/src/primitives/
    ~ {primitiveInputsMap,ShapeForm}.tsx
  packages/system-worker/src/
    ~ **/*DbConfig.ts (actual primitive consumers)
    ~ aggregateProjection/readSelectedResources.ts
  packages/studio/src/fixtures/
    ~ agents.ts
  packages/zod/
    ~ README.md
  examples/
    ~ {shopping,tic-tac-toe,external-work}/** (authored declarations only)
  fragment/content/
    ~ {guides,handbook,reference,skills}/** (affected authoring examples)
  wiki/
    ~ patterns/** (affected primitive/reference guidance)
    ~ glossary.md
    ~ research/primitive-design-alternatives.md
  ~ pnpm-lock.yaml
  ~ package manifests/release metadata required by the fixed-group release

qrk.sh/, stackshirts/, mentormailbox/, redropeparking/
  ~ authored model/contract/declaration modules listed in Consumer cutover
  ~ affected package.json, pnpm-lock.yaml and existing package-age exemptions
```

1. Establish the new catalog, immutable factories and inference; convert core model helpers and DB binding, then remove the old resolver/types/branches as one source cutover. Keep the factory parent procedures as short named domain steps; add no forwarding utilities or `ALLOWED_CAST` markers.
2. Convert internal declarations, authoring examples and all indirect consumers; update docs in the same implementation. Run the scoped existing checks only after inspecting resolved Nx project/target configuration. Follow actual dependency edges rather than repairing unrelated repository failures.
3. Establish the representation and behavioral acceptance below, identify affected stored definition/fixed-schema guards, and record any required empty-storage prerequisite. Only then publish the breaking release and adopt it in the four consumers. Finish the documentation reconciliation and record exact verification/adoption evidence before archival.

## Acceptance and storage cutover

1. **Inference/factories:** establish honest zero-argument and required-option call shapes; literal ID prefixes, enum values, nullable/default behavior and exact JSON decoded types; known defaults make payload input optional while resulting program values are present. Unsupported/malformed options, unsafe numbers, invalid defaults and nullable/defaulted primary keys reject at construction. Use existing verification surfaces; do not create tests, fixtures, compile-only assertion files, runners or configuration without separate explicit authorization.
2. **Tables/relationships:** establish eager standalone codecs, inline sibling and self references, integer/text/prefixed keys, nullable relationships, shared primary/foreign keys and correct inverse cardinality. Missing destinations, wrong key columns/prefixes, duplicate names and existing forbidden cycles reject during graph binding. Confirm runtime/typed queries agree when registry keys differ from logical table names and physical names are overridden.
3. **Models/payloads:** establish `modelId({ model: product })` behavior: same `prd_` value typing/validation without local membership or reference closure. Establish local `modelRef({ model: cart, relation, inverse })` behavior, owner-selected destination versions and unchanged referencing models/contracts when unrelated destination attributes evolve. Confirm payloads reject present `references` and `primaryKey: true` while accepting canonical `primaryKey: false`; ID decoding never generates values, opaque IDs stay ineligible for moves, and retained Cursor/local-reference moves still work.
4. **Representations/adapters:** establish row/portable Date behavior, fresh Date defaults, JSON transformation and encoded JSON strings, portable shape round trips, Zod decoded-value validation and React ID/numeric inputs. Package builds or typechecks alone are not portable-consumer or runtime evidence. Verify representative Shopping command execution and relationship queries, Tic-tac-toe/external-work declaration consumption and each sibling's actual new-package usage. Do not run Explorer checks.
5. **Hard cutover:** serialized model/contract specifications and definition locks change. Inventory the exact affected persistent stores/guards from the implementation; require empty storage for changed fixed schemas and update only justified schema/format stamps. Do not assume an unchanged SQL column layout makes old encoded definitions compatible, and do not guess a Browser/Native version bump. Preserve empty-storage refusal. No aliases, dual decoding, translation migration or automatic reset. Existing-storage resets require separate explicit authorization; fresh isolated acceptance stores are allowed.
6. **Completion evidence:** perform scoped Nx build/type/lint and existing permitted behavioral checks for the changed modules and actual consumers; inspect removed-symbol imports/exports and active docs; verify package contents/entrypoints and exact published lockfile resolutions. Preserve unrelated WIP and existing app/login/storage state. Record unrun/blocked checks accurately, then use the implement workflow to archive only after required work is complete.

## Implementation evidence

- Scalar descriptor catalog/factories, `modelId`/`modelRef`, immediate codecs, direct graph binding, payload/move/projection consumers, internal declarations and active authoring docs are cut over. The resolver file, removed kinds/factories/per-kind aliases and shapes-only `type-fest` dependency are deleted; executable removed-symbol scans are clean. Remaining `targetTableName` fields belong to Drizzle's relation API, not descriptors.
- Final scoped Nx graph: all 60 lib/type/lint tasks passed after Readonly inference and lint cleanup. Shapes lint has zero warnings; other successful lint tasks retain existing repository warnings. Nx Cloud upload was unavailable (ENOTFOUND); local results passed. Existing example acceptance passed all six success/rejection cases for Shopping quotes/payment, Tic-tac-toe external moves and receipt delivery, plus the existing type acceptance target.
- Inline built-API acceptance exercised defaults/nullability, Date ownership/portable representation, live JSON transformation, immutable metadata, explicit-false identity parity, standalone codecs and actual in-memory SQLite integer/text/prefixed-ID/self relationships, inverse cardinality, registry/logical/physical name differences, PK/FK refusals and eight graph-rejection cases. No new test/fixture/runner/configuration files were created.
- Strict `readAcceptedDefinition` acceptance: current scalar definition succeeds; old `primaryKey` kind rejects as `system-spec-invalid`; absent exact key returns undefined. The read seam performed zero writes and retained bytes were unchanged. `SystemRepo.acceptedDefinitions.spec` is affected even though SQL layout is unchanged. Definition hashes change Node/session identity and existing identity guards reject mismatches. No global SQL/Native format stamp or compatibility path was added.
- The user explicitly authorized empty storage on 2026-10-21. Removed only Shopping's current `.wrangler/zerospin/dev-worker/sys_shopping_20260907_pinned_replicas` state (88 files, verified zero remaining before startup). Tic-tac-toe's current `sys_tictactoe` path was already absent. Existing dated snapshots, unrelated processes, browser/native app data and production storage were preserved. Both local backends then reported `Ready on ... (system spec accepted)` on verification ports 22502/22503; only those verification processes were stopped.
- Fixed-group workflow selected and applied **21.0.0**. The release checkout is isolated from unrelated research edits; package build passed. All 19 packages were published from committed `a85c3edde6` to the configured local registry. Every exact registry version was checked; published SDK server/browser entrypoints export `modelId`, and the Shapes tarball contains no resolver artifact. Installed Intent guidance reports 21.0.0.

## Earlier isolated consumer evidence

The initial consumer changes were committed on `codex/plan250-scalar-primitives` in their isolated worktrees under `/tmp/zerospin250-consumers/`. The original dirty checkouts were not reset, stashed, patched or committed by this task. Independent edits appeared in their original working trees during this work; those edits were left intact. A final audit checked all **86** direct dependency pins, installed package versions and framework lockfile snapshots: every version is exactly **21.0.0**.

| Consumer | Commit | Verification |
| --- | --- | --- |
| QRK | `54c874025` (source/adoption), `84502289e` (current docs) | App client/SSR/prerender build; API Wrangler dry-run build; real config evaluation with 10 models and 41 contracts, opaque ID/local relationship metadata verified; 26 exact pins |
| Stackshirts | `fcc680a9` | Backend and App existing-tsconfig types; Next production build including 10 prerendered pages; fresh backend accepted system spec on 22512; 13 exact pins |
| Mentor Mailbox | `6d5a36282` | Existing typegen and five existing-tsconfig checks (backend/API/App/Hub/Admin); four Turbo builds; fresh backend accepted system spec on 19891; existing seed workflow passed with school, enrollment, assignment, direct-message and workspace commands; 25 exact pins |
| Red Rope Parking | `65e796ee8` | Frozen pnpm install; backend/Admin types; Web/Admin Nx production builds and `/` prerender; fresh backend accepted system spec on 49332; all 18 admitted seed commands retained `outcome.result._tag: Success`, expected materialized rows/relationship joins and empty `PRAGMA foreign_key_check`; 22 exact pins |

Necessary prior-package API cutovers were included rather than retaining aliases: removed schema helper callers use public `makeIdSchema`; older browser/React callers use current pure definitions, connection inputs, `createUI`, `Initializer`/`MockInitializer` and worker execution registrations. Stackshirts keeps public routes, both session owners and account selection mounted; readiness gates only design/payment readers. Existing stories were retained and migrated. Mentor's exact CLI deployment guard and current docs now say 21.0.0 after reviewing its six installed deployment helpers and stock orchestrator; no production deployment occurred. Verification backends were stopped and temporary copied environment bindings removed. Scoped diff checks and isolated worktree status checks passed.

## Verification limits

- Red Rope's extra standalone Web `tsc` attempt reports nine TS2322 diagnostics outside the changed callers: `/notes` links in `UserNav.tsx:48`, `Header.tsx:64,81,87,126,132`, `home/FooterHero.tsx:16` and `home/Hero.tsx:17`, plus `src/routes/_user.tsx:10` with an `Error`-specific error component where TanStack accepts unknown. Those files are byte-identical to its committed 15.0.1 baseline; route dependency versions remain unchanged. Its required existing Web/Admin production builds pass. This optional diagnostic pass did not become a new check gate or expand Plan 250 into unrelated routing work.
- Mounted browser lifecycle/authentication and production deployment were not exercised. Descriptor acceptance includes actual codecs/SQLite, existing evaluation checks, local accepted-spec startup and command-driven consumer seeds; it does not claim authenticated browser or production verification.
- Existing lint warnings outside Shapes and an unavailable Nx Cloud upload (ENOTFOUND) do not change the passing local task results. No new tests, fixtures, runners or check configuration were created.

## Current working-tree reconciliation

The user requested reconciliation against the actual current consumer working trees and explicitly authorized committing everything in those sibling repositories first. No previous isolated adoption commit is being applied wholesale.

| Consumer | Current-work baseline commit |
| --- | --- |
| QRK | `69f93b86a6eef1433a259df2521c53f1de1764a9` |
| Stackshirts | `a407fa720dbbf76bf827b18fb770d380475957d4` |
| Mentor Mailbox | `ca7aba5f12070fa5683d0830cad8a49801ac6992` |
| Red Rope Parking | `346326cdf256430a3f0052f6da1107f4eef3a3a9` |

Each baseline includes all existing tracked and nonignored untracked work. All four baselines were committed before reconciliation began. The earlier isolated commits were used only as reference: actual source/API state was inspected, existing migrations retained, and only missing Plan 250 changes applied on current `main`. Earlier build/runtime evidence above remains scoped to its named isolated branches; the following results establish the current-tree reconciliation.

| Consumer | Current-main Plan 250 commit | Current-tree verification and preservation |
| --- | --- | --- |
| QRK | `61512d843921a5c4aaf34f72b98d07df4432c8f8` | 59 scoped files; current App client/SSR/prerender and API Wrangler dry-run builds passed. All 765 guarded source/environment/installed-metadata inputs were unchanged during the final run. Real current config evaluation includes user releases 3.0.0/4.0.0/5.0.0, each with 10 models and 41 contracts. Existing modelRef/createUI/Initializer wiring, newer V2 command lineages and placement/release/session changes were preserved. 48 remaining value descriptors and nine schema-helper callers migrated. |
| Stackshirts | `2e22aca880433b98bed80e9ffd708205365a1084` | 45 explicit hash-guarded paths; current backend/App TypeScript checks and Next production build passed (10 prerendered pages). Exact commit accepted its system spec at 22522 in fresh temporary storage. Current 11002 connection, payment HTTP implementation, provider notification implementation and environment examples retained; every non-framework manifest value unchanged. Descriptor edits were applied at call/import boundaries, retaining unaffected function bodies and avoiding the earlier formatting churn. |
| Mentor Mailbox | `bd6f72554c2c1e6d19714389e06a12eaf2944a42` | Current typegen, five existing-tsconfig checks and four Turbo builds passed. Exact current commit accepted its system spec at 19991 and passed the existing development seed workflow in fresh temporary state. Completed pure-session-declaration and all eight worker-entry migrations were skipped. Current host/browser factories, credentials, claims, layers, worker URLs, providers and ports retained; only the missing descriptor/identity and 21.0.0 UI caller changes added. |
| Red Rope Parking | `6d09351cfade8e2e51f91cc5dac7bcbc6f4d2b73` | 85 explicit hash-guarded paths; current backend/Admin types, frozen install and Web/Admin Nx production builds with `/` prerender passed. Exact current commit accepted its spec at 49332 in fresh temporary state; 18 admitted seed commands retained finalized Success outcomes, expected rows/relationships materialized, and the foreign-key check was empty. Current 15002 scripts/ports, registry/authentication/provider code, SharedWorker wiring and all non-framework manifest values retained. Extra Web types still report the nine unchanged routing diagnostics listed above, with none in changed callers. |

A final audit of the actual four sibling directories checked **86 direct framework dependency pins**, their installed packages and every framework lockfile entry: all are exactly **21.0.0**. Each current Plan 250 commit has its recorded baseline commit as its direct parent. No sibling commits were pushed.

### Concurrent QRK work

Additional QRK work arrived after its baseline snapshot. One broad staging step initially mixed 22 unrelated Library paths into the adoption commit; this was audited and corrected using index-only operations. Final `61512d843` contains only the 59 owned Plan 250 files. The earlier mixed snapshot remains recoverable on `codex/plan250-qrk-mixed-snapshot`. No current source files were reset, stashed or overwritten during that correction. Later overlapping Library/V5/session/provider edits and new modules remain unstaged and intact. The final current-tree build included that work and passed with a stable input hash guard. QRK therefore intentionally remains dirty; the other three current working trees were clean after their scoped commits.

### Runtime and scope boundary

Current-tree compilation/builds ran in the actual sibling directories. Runtime verification used source aligned to the exact new current commits and fresh temporary storage; original application storage and unrelated processes were not reset or stopped during reconciliation. Only owned temporary runtimes were stopped. Mounted authenticated-browser lifecycle and production deployment were not exercised. No tests, fixtures, runners or check configuration were added. Unrelated Zerospin research and Plan 251 work were not included in this reconciliation's commits.

## Remaining work

None for Plan 250's current consumer reconciliation. Concurrent QRK work and the nine pre-existing Red Rope routing diagnostics remain outside this change.
