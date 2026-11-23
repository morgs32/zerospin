# Primitive design alternatives

**Date:** 2026-10-21
**Status:** Alternatives researched before Plan 250. The scalar descriptor design is implemented and verified in 21.0.0; publication and verified reconciliation of all four current consumer working trees are recorded in [Plan 250](../archive/plans/250-plan-scalar-primitives-and-model-ids.md).
**Question:** Which primitive interface removes duplicated concepts while keeping value codecs, portable declarations, SQLite constraints, model relationships and operation semantics clear?

## Module responsibilities and the preceding design

`@zerospin/shapes` currently declares Effect `4.0.2` and Drizzle `1.0.0-rc.4`. Its descriptors feed row codecs, portable codecs, serialized shape specifications and SQLite column builders. JSON and dates require different runtime/portable handling. These are real consumers of one declaration, so deleting the descriptor module would redistribute that work across its callers. [Manifest](../../packages/shapes/package.json), [codec compilation](../../packages/shapes/src/compileDescriptor.ts), [shape codecs](../../packages/shapes/src/makeShapeCodecs.ts), [shape encoding](../../packages/shapes/src/encodeShape.ts), [SQLite columns](../../packages/shapes/src/primitiveMaps.ts).

Before Plan 250, the enum mixed value representations and roles: `PrimaryKey`, `ForeignKey` and `Cursor` shared an abbreviation-prefixed string codec, and `Ref` carried relationship identity plus `targetKind`. Plan 250 replaces the first two with `Id`, deletes `Ref` and `targetKind`, and puts `primaryKey` and `references` beside the source scalar. Cursor retains move-operation eligibility. ID generation remains an explicit `makeIdFromAbbreviation`/model-operation call. [Value compilation](../../packages/shapes/src/compileDescriptor.ts), [column compilation](../../packages/shapes/src/primitiveMaps.ts), [move checks](../../packages/core/src/contracts/operationCodecs.ts), [ID construction](../../packages/shapes/src/makeIdFromAbbreviation.ts).

Stable model relationships are a current requirement. `modelRef` retains a model name, abbreviation and `id` relationship without a model version or `Table` object. An owner chooses the concrete model version. The scalar design preserves this independence; `modelId` derives only the abbreviation and value contract, while `modelRef` adds immutable local relationship metadata. [Current helper](../../packages/core/src/models/modelRef.ts), [binding](../../packages/core/src/drizzle/definition/bindDatabaseDefinition.ts), [release evidence and rationale](stable-model-reference-identity.md).

## Primary-source comparisons

| Source | Established behavior | Design implication for Zerospin |
| --- | --- | --- |
| [Drizzle SQLite columns](https://orm.drizzle.team/docs/sqlite/column-types), [constraints](https://orm.drizzle.team/docs/sqlite/indexes-constraints) | Scalar builders carry separate nullability, defaults, primary keys and foreign-key constraints. `$type` and enum inference do not validate runtime values. | Column roles need not become value kinds. Keeping only Drizzle declarations would still leave runtime validation work. |
| [Drizzle relations](https://orm.drizzle.team/docs/relations#foreign-keys) | Query relations and SQL foreign keys are independent. Query relations do not create database constraints. | Zerospin may generate both from one owned relationship declaration, but it must preserve both responsibilities. |
| [Effect canonical codecs](https://effect.website/docs/v4/schema/canonical-codecs), [annotations](https://effect.website/docs/v4/schema/annotations) | Effect derives canonical JSON codecs, supports custom codec hooks, and permits custom annotations. Opaque declarations need structural codec information. | A codec-first authoring interface is feasible; SQLite and relationship semantics still need owned metadata. |
| [Effect JSON Schema](https://effect.website/docs/v4/schema/json-schema), installed [Schema source](../../node_modules/effect/src/Schema.ts) | `toJsonSchemaDocument` describes the canonical JSON encoded side. Installed 4.0.2 documents conversion as best-effort/preliminary: Effect checks and JSON Schema do not always have identical semantics. | Arbitrary live Effect behavior cannot be assumed to survive export and reconstruction from JSON Schema. |
| [Kysely `ColumnType`](https://kysely-org.github.io/kysely-apidoc/types/ColumnType.html), [`Generated`](https://kysely-org.github.io/kysely-apidoc/types/Generated.html) | Select, insert and update types can differ. `Generated` is shorthand for making insertion optional while retaining the selected value type. | Value meaning, omission/default policy and column roles are separate axes. Zerospin should not conflate primary keys with implicit generation. |
| [Zod metadata](https://zod.dev/metadata), [JSON Schema conversion](https://zod.dev/json-schema#unrepresentable) | Registries associate metadata with schema instances; immutable transformations can return a new instance without prior metadata. Some runtime constructs have no JSON Schema equivalent. | A metadata registry changes where ownership lives; it does not remove ownership or solve portable behavior. |

The implications above are design inferences, not claims that these libraries implement Zerospin's ownership or replay rules. This research does not propose adopting Kysely or Zod.

## Baseline: scalar descriptors with inline relationships

The selected design places `references` beside scalar options, uses `modelId` for stable ID values and keeps `modelRef` for local relationships. The shared descriptor catalog and factory argument helper remove role-specific kinds, per-kind descriptor aliases, factory overload matrices and reference-driven table reconstruction. Payload construction rejects local references and primary-key roles. The alternatives below remain design comparisons, not additional implemented APIs.

## Alternative 1: Normalized data descriptors

**Proposed interface:** a small explicit value algebra, with table facts declared separately. Raw data replaces overload-heavy factory inference. `prefixedId` describes a value; primary-key status and move eligibility belong to table/model metadata.

```ts
const item = makeTable({
  name: 'item',
  shape: {
    id: { kind: 'prefixedId', abbreviation: 'itm', nullable: false },
    cartId: { kind: 'prefixedId', abbreviation: 'crt', nullable: false },
  },
  primaryKey: 'id',
  references: {
    cartId: {
      tableName: 'cart',
      columnName: 'id',
      relation: 'cart',
      inverse: 'items',
    },
  },
});
```

The catalog is integer, number, text, boolean, date, JSON, enum and prefixed ID. One compiler derives row, portable and SQL representations. Live JSON fields remain an honest exception: today they retain Effect codecs that export JSON Schema; this proposal does not claim every authored value is already pure data. [Current JSON encoding](../../packages/shapes/src/encodeShape.ts).

**Depth/locality:** a deep compiler owns the interpretations; authors can inspect the complete immutable declaration. Removing factories deletes machinery rather than replacing it with builders. The cost is spelling `cartId` and its key contract across sections, plus validating column names and compatible destination keys at table/database construction. Defaults, omission and move eligibility require explicit ownership rather than implicit classification by scalar kind.

## Alternative 2: Effect codecs first, explicit storage metadata

**Proposed interface:** `column` accepts the actual codec and the facts that a codec does not establish. This is an illustrative interface, not an implemented function.

```ts
const shape = {
  ownerId: column({
    codec: makeAbbreviationIdSchema(user.abbreviation),
    storage: 'text',
    references: {
      tableName: user.name,
      columnName: 'id',
      relation: 'owner',
      inverse: 'items',
    },
  }),
};
```

`column` would own codec validation, storage compatibility, immutable metadata capture and portable-contract production. Common model references could remain a focused `modelRef` convenience. All codecs used by synchronous command execution must be synchronous and require no Effect services. The portable contract must be explicit or restricted to codecs with supported portable representations; JSON Schema generation is not evidence of lossless behavior transfer. This restriction follows from the [Effect conversion caveats](../../node_modules/effect/src/Schema.ts) and is a required design choice, not a solved implementation detail.

Using `.annotate` instead of `column` is technically possible, but moves column facts inside Effect metadata and leaves typed query relation inference dependent on preserving those facts through schema composition. An explicit owned descriptor is easier to inspect than a global metadata registry. [Effect annotation mechanism](https://effect.website/docs/v4/schema/annotations), [Zod's instance-identity warning](https://zod.dev/metadata).

**Depth/locality:** highest flexibility for custom validation, but exporting and consuming portable declarations becomes the difficult seam. If every usable codec needs a parallel portable catalog and SQL mapping, much of today's descriptor module returns under another name. There is no remote dependency or new port to introduce: Effect and SQLite compilation are in-process dependencies.

## Alternative 3: Table-owned relationships synthesize their columns

**Proposed interface:** scalar attributes remain explicit, but a relationship owns its foreign-key column. A small stable key handle supplies value meaning without importing a selected model version.

```ts
const item = makeTable({
  name: 'item',
  attributes: {
    quantity: primitives.integer(),
  },
  relations: {
    cart: {
      column: 'cartId',
      key: cart.key,
      inverse: 'items',
      nullable: false,
    },
  },
});
```

Here `cart.key` means immutable logical table name, key-column name and scalar contract. It contains no runtime `Table` or selected model version. The compiler materializes `cartId` into the complete scalar shape and emits constraints and query relationships; drafts/resolved-table states do not become a public interface. Primary keys remain explicit table metadata, and key handles do not generate values.

**Depth/locality:** the key handle earns its existence by deleting repeated scalar contracts; the relation module owns both forward and inverse behavior. However, attributes now come from two authored sections, merged TypeScript inference becomes more demanding, and portable specifications must retain the expanded values and relationships. Query scoping, move eligibility and projection closure currently inspect reference descriptors, so they must consume the table/model relationship metadata. [Scoped query relationships](../../packages/core/src/contracts/make/makeContractReadDb.ts), [move validation](../../packages/core/src/contracts/operationCodecs.ts), [projection closure](../../packages/core/src/models/reads/readSelectedResources.ts).

**Hard tradeoff:** stable model IDs already have enough information for a key handle, but arbitrary inline sibling tables do not. Their source codec cannot derive the sibling key before that declaration exists. Supporting immediate standalone codecs therefore requires separately declared key handles or explicit source scalars; delaying codecs until graph compilation restores the unresolved-reference lifecycle this exploration seeks to delete. Self references can derive from their own key, but do not solve the sibling problem. This tradeoff motivated eager [table construction](../../packages/shapes/src/makeTable.ts) and direct [inline database binding](../../packages/core/src/drizzle/make/makeDbConfig/makeDbConfig.ts); Plan 250 deletes the old reference-resolution module. Broad automatic column synthesis does not win the deletion test here.

| Design | What actually disappears | New caller burden |
| --- | --- | --- |
| Baseline: scalar plus inline relationship | `Ref`, `targetKind`, destination-table pointers and reconstruction | Scalar and relationship contracts must agree; constructors still expose column options |
| Plain data catalog | Factory overload machinery and role-based scalar kinds | More explicit data; field identities and scalar contracts connect across sections |
| Codec first | Duplicate runtime value-codec DSL | Explicit SQL mapping and a portable contract or supported-codec restriction |
| Relationship-owned columns | Repeated scalar declaration for each reference | Key handles, split attributes and harder inferred merged shapes; generic inline siblings force extra declarations or delayed codecs |

## Current assessment

Prefer the normalized descriptor algebra internally, with the baseline scalar-plus-relationship interface for authoring. Separate value meaning, column constraints, relationship identity and operation eligibility; a fluent spelling or annotation registry alone does not accomplish that. Alternative 1 removes factory machinery but asks callers to connect more facts manually. Alternative 2 earns its portability burden only if arbitrary custom codecs are a current requirement. Alternative 3 adds key declarations or graph-dependent codec construction for generic tables, so its broad form loses more interface simplicity than it gains. Keep `modelRef` as the focused convenience justified by stable model identities. This recommendation became [Plan 250](../archive/plans/250-plan-scalar-primitives-and-model-ids.md). Its source implementation keeps immediate codecs, the live JSON codec and explicit scalar references, and adds modelId without key handles.

No extensibility hooks, compatibility decoding, migrations or new test framework were added. Plan 250 records the implementation, build/runtime evidence and completed exact package adoption and current-tree reconciliation. The alternatives remain unimplemented.
