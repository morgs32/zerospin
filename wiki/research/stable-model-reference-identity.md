# Stable model reference identity

**Date:** 2026-10-21

**Status:** Stable model identity was published as `20.1.2` and adopted in QRK. [Plan 250](../archive/plans/250-plan-scalar-primitives-and-model-ids.md) now replaces its descriptor representation with scalar IDs and plain relationships while preserving that identity requirement. The release evidence below describes `20.1.2`; Plan 250 records the 21.0.0 scalar cutover and completed current consumer reconciliation.

**Scope:** Stable model relationships, owner-selected database binding, and QRK's Site/Page/Brick/Placement graph. Adding Site `stickyNavbar` originally forced a referencing model graph rebuild and roughly 40 contract declarations despite unchanged relationship semantics.

## Implemented authoring and ownership

`modelId` declares the ID value of a stable `defineModel({ name, abbreviation })`
identity. `modelRef` adds a local relationship to that identity's `id` key. The aggregate/service release selects the
concrete referenced model version. Its database configuration binds the reference
to that selected graph. An unrelated Site attribute does not change Page's
`siteId → site.id` relationship or require new versions of unchanged referencing
models and contracts.

```ts
import { defineModel, modelId, modelRef } from '@zerospin/sdk/browser';

const site = defineModel({ name: 'site', abbreviation: 'sit' });

const payloadSiteId = modelId({ model: site });
const pageSiteId = modelRef({
  model: site,
  relation: 'site',
  inverse: 'pages',
});
```

Both descriptors have `kind: PrimitiveKind.Id`, the literal abbreviation `sit`,
and canonical false `nullable`, `unique` and `primaryKey` flags when omitted.
Only `pageSiteId` has `references`, containing `{ tableName: 'site', columnName: 'id',
relation: 'site', inverse: 'pages' }`. Neither descriptor retains its authoring
`model`, another model's selected version, or a Table object. Payload and cross-owner
IDs use `modelId` because those values do not require local Site membership.
Both helpers belong to core and are exported by both SDK entrypoints;
`@zerospin/shapes` owns scalar descriptors and plain generic relationship metadata
without depending on core model declarations. [ID helper](../../packages/core/src/models/modelId.ts),
[relationship helper](../../packages/core/src/models/modelRef.ts),
[identity](../../packages/core/src/models/defineModel.ts),
[browser export](../../packages/sdk/src/browser/index.ts),
[server export](../../packages/sdk/src/index.ts).

## Binding and scalar codecs

`makeModelVersion` constructs codecs and the portable model specification before
an owner selects its complete database graph. Each ID scalar already supplies its
own abbreviation and value codec; a relationship does not determine its scalar
kind later. `encodeShape` serializes scalar flags and plain relationship
metadata without an object identity, another model's version, or its
unrelated attributes. The eager `model.drizzleSchema` supplies scalar columns for
model operations; the owner-bound database definition supplies SQL foreign keys
and relational query schemas. [Model construction](../../packages/core/src/models/make/makeModelVersion.ts),
[scalar codec](../../packages/shapes/src/compileDescriptor.ts),
[portable shape](../../packages/shapes/src/encodeShape.ts),
[Drizzle columns](../../packages/shapes/src/primitiveMaps.ts),
[operation application](../../packages/core/src/contracts/applyOperationTx.ts).

`makeResourceDbConfig` passes authored tables directly to `bindDatabaseDefinition`,
which looks up and validates their plain relationship identities within the selected
table graph. It then renders schemas, relations and provisioning metadata without
rebuilding tables or changing descriptor types.
Logical model names remain separate from physical SQL names. Binding requires a
registered, unambiguous referenced table with one compatible primary key: column,
integer/text/prefixed-ID kind and abbreviation must agree. Missing tables,
duplicate identities, duplicate relation/inverse names and invalid indexes reject.
[definition binding](../../packages/core/src/drizzle/definition/bindDatabaseDefinition.ts),
[database configuration](../../packages/core/src/drizzle/make/makeDbConfig/makeDbConfig.ts).

Forward and inverse relational query types derive from the selected graph using
the logical referenced model name. Scalar inference retains the abbreviation and
nullability, and type-level graph lookup uses the logical table name even when a
registry key differs. A source primary key counts as unique for inverse cardinality
without a redundant `unique: true`. [Relation types](../../packages/core/src/drizzle/types.ts),
[column types](../../packages/shapes/src/types.ts),
[relation rendering](../../packages/core/src/drizzle/definition/renderDrizzleRelations.ts).

## Authority, self references and versioning

A stable ID or relationship grants no direct read/write authority over another model
version. Contracts still bind exact canonical model objects, and operations retain
their exact model/version checks. A contract directly changing Site declarations
must evolve under the existing contract rules. A contract using unchanged
Brick/Placement declarations can retain its canonical identity when only Site's
unrelated attributes change. [Contract membership](../../packages/core/src/declaration/validateActorContracts.ts),
[contract identity](../../packages/core/src/system/make/makeSystem/validateAggregateContractVersions.ts),
[operation identity](../../packages/core/src/contracts/operationCodecs.ts).

Model self relationships use the same stable model definition and plain logical
table name as other local relationships. No self sentinel, placeholder Table,
descriptor rewrite or upgrade-time `previous.table` replacement is required.
They retain the model's `id` contract.
Multi-table reference cycles remain rejected. Stable identities do not introduce
cycle support. [Model construction](../../packages/core/src/models/make/makeModelVersion.ts),
[cycle rejection](../../packages/core/src/drizzle/definition/bindDatabaseDefinition.ts).

| Change                                                               | Required declaration evolution                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Site gains a non-key field such as `stickyNavbar`                    | Evolve Site and its owner release as required by immutable history. Reuse unchanged referencing models/contracts. |
| Referenced key column, kind or abbreviation changes                  | Reject the incompatible reference; explicitly evolve the relationship/model.                                      |
| Page's relation identity, inverse, nullability or uniqueness changes | Evolve Page because its portable reference specification changes.                                                 |
| Contract directly changes its model binding, payload or behavior     | Evolve the contract under its existing canonical identity rules.                                                  |

## Prior release evidence: 20.1.2

`19.1.0` published stable model references. The independent `20.0.x` line changed
React session initialization and UI context. `20.1.0` combined both; its Core,
Shapes and SDK artifacts retain the same reference implementation as `19.1.0`.
The `20.1.2` completion work reconciled those changes on `main` and corrected
reference typing. This evidence predates Plan 250's scalar descriptor cutover.

Producer verification confirms selected-version reuse, incompatible-key and graph
rejection, nested query typing, SQL relations, and transactional model operations.
Named columns retain required/nullable prefixed IDs; named references resolve
under logical model names despite aliased registry keys. Raw named integer keys
and model self references retain their behavior. The fixed-group package builds
and existing Shopping/Tic-Tac-Toe TypeScript tasks pass. Scoped reference lint and
formatting pass. Nx Cloud remote-cache authorization failed; the tasks themselves
succeeded using local execution/cache.

All nineteen packages were published from committed source `8eda3e0a44` in a clean
release worktree. Registry readback confirmed every `20.1.2` version, `latest` tag
and tarball integrity value. `20.1.1` only restored consumer skills; it contained
no additional runtime or declaration changes. QRK commit `6b6b23a72` updates its
26 exact direct package pins and lockfile to `20.1.2`. Installed versions, SDK
exports, frozen installation and existing App/API builds passed.

QRK's `ZerospinConfig` accepted its system specification. An authenticated local
browser session created the unpublished **modelRef verification** Site and its
Page, then added a Swatch and Icon Brick with the unchanged V1 contract. The
editor retained this graph after reload. Existing Vite dependency output initially
lacked `modelRef`; restarting only QRK App regenerated the dependency bundle.

| Admitted command   | Canonical ID                | `aggregateIndex` | `outcome.result._tag` |
| ------------------ | --------------------------- | ---------------- | --------------------- |
| `createSite@3.0.0` | `cmd_nJf5_wKNXtIiDcUOFxuMX` | 5                | `Success`             |
| `createPage@3.0.0` | `cmd_DnvmSfGhg_PSNe3WQfiUl` | 6                | `Success`             |
| `addBrick@1.0.0`   | `cmd_NXZzmwBMKVCZ9a11ylO8L` | 7                | `Success`             |

`AggregateChain` and `AggregateVersionChain` retain those admitted command IDs
and outcomes. `AggregateVersionRepo` and `AggregateActorVersionRepo` both contain
the Site, Page, Brick and four breakpoint Placements. Their `materializationHead`
rows are at index 7 with identical `dispositionChainHash`
`9222763b0738aeea72a12066c282798e5c134014d50ba08e78107ef9e64643ac`.
SQLite foreign keys and an exact resource join confirm `page.siteId → site.id`,
`brick.pageId → page.id`, `placement.brickId → brick.id` and
`placement.rowId → row.id`. Durable inspection used stable SQLite/WAL snapshots;
the source databases were not opened writable.

The optional App Storybook attempt encountered its existing `process is not
defined` error in Library's `MapCanvas.tsx`; authenticated App verification above
completed independently. No test files or runners were added. No storage reset,
migration, backfill or alternate model-data writer was introduced. The local
verification Site and Brick remain available for inspection and were not
published externally.

## Remaining work

The stable identity requirement remains in force. Scalar descriptor implementation,
runtime verification, publication and consumer adoption are tracked in
[Plan 250](../archive/plans/250-plan-scalar-primitives-and-model-ids.md).
