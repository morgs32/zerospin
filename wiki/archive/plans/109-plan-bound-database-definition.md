# 109 — One bound database definition

Status: Completed and verified on 2026-10-11. Bound definitions, actual configuration imports, atomic provisioning and retained native database reopening are verified.

## Current responsibilities and simpler ownership

1. [makeDbConfig](../../../packages/core/src/drizzle/make/makeDbConfig/makeDbConfig.ts) resolves authored table references, builds persistence schemas, then calls a relation builder that builds another schema collection. [makeDrizzleSchemasRecordFromTables](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/core/src/drizzle/make/makeDrizzleSchemasRecordFromTables.ts) discovers table identities and physical names; [makeDrizzleRelationsFromTables](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/core/src/drizzle/make/makeDbConfig/makeDrizzleRelationsFromTables/makeDrizzleRelationsFromTables.ts) discovers them again, plus primary keys, reference metadata, relation names and cycles. It later rediscovers each validated edge while rendering Drizzle relations.
2. [assertValidModels](../../../packages/core/src/models/assertValidModels.ts) validates model names by constructing a whole database configuration. `makeResourceDbConfig` spreads model and other-table maps, allowing a colliding internal table key to silently replace a model. Validation, compilation and runtime configuration are coupled.
3. [provisionDbTx](../../../packages/core/src/drizzle/provisionDb/provisionDbTx/provisionDbTx.ts) reconstructs DDL and finds a missing index's statement by substring. [makeTableProvisioningStatements](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/core/src/drizzle/provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL.ts) interpolates unquoted names, rediscovers columns/keys, and discards foreign-key actions. These are different views of one database definition.
4. Bind and validate the authored table graph once. Its concrete bound tables, primary keys, reference edges, physical names and indexes feed persistence schemas, decoded relational schemas, relation definitions and structured provisioning statements. Expose one completed `IDbConfig`; do not retain independent registries that can disagree or discover dependencies by parsing generated SQL.

## Required behavior and deliberate changes

1. Preserve exact referenced table object identity, unique physical table names, valid primary-key metadata, named forward/inverse relations, inverse one-versus-many cardinality and nullable forward relations. Self references stay valid; preserve current cross-table cycle rejection unless a separately justified domain change is proposed.
2. Validate registry keys and collisions before merging model/internal tables. A reserved key collision must refuse construction; it can never replace a model. Reject duplicate relation names, unknown referenced objects, malformed indexes and unsupported descriptor/key metadata before a live database opens.
3. Keep persistence schemas encoded and relational query schemas decoded. They are intentional different representations, derived from the same graph; do not reuse the encoded columns as decoded query columns. Build each required representation once and pass that exact collection into its relation renderer.
4. Provisioning uses named table/index statements from structured metadata. Quote SQLite identifiers consistently, preserve authored foreign-key actions supported by the actual table contract, and derive index existence checks from their exact names. Delete SQL substring matching. Missing tables and indexes are created atomically; existing mismatched fixed schemas must be refused or handled by the documented empty-storage cutover, never silently migrated.
5. Keep runtime query handles, native database adapters and transaction lifetime independent of the immutable definition. The graph is construction-time metadata, not a schema-adaptation runtime or new global cache. Authored declarations from [105](105-plan-immutable-authored-declarations.md) provide stable owned metadata; referenced third-party table capabilities remain intact.
6. `assertValidModels` becomes validation of the authored model graph, without constructing throwaway schema/relations. Existing callers that need a real query database still compile it once. Public configuration internals deliberately change to include the bound definition/provisioning metadata as needed; replace callers directly without aliases or dual paths.

## Complete proposed parent shapes

```ts
function makeDbConfig(props: IDatabaseDeclaration) {
  const tables = resolveTableReferences(props.tables);
  const definition = bindDatabaseDefinition(tables, props.physicalTableNames);
  const schema = renderPersistenceSchemas(definition);
  const querySchema = renderDecodedQuerySchemas(definition);
  const relations = renderDrizzleRelations(definition, querySchema);
  return { tables, schema, relations, definition };
}

function makeResourceDbConfig(props: IResourceDatabaseDeclaration) {
  const tables = composeResourceTables(props.models, props.otherTables);
  return makeDbConfig({ tables });
}

function bindDatabaseDefinition(
  tables: IAnyTables,
  names: IPhysicalTableNames,
) {
  const identities = bindTableIdentities(tables, names);
  const keys = bindPrimaryKeys(identities);
  const references = bindReferenceEdges(identities, keys);
  validateRelationNames(references);
  validateReferenceCycles(identities, references);
  const indexes = bindIndexes(identities);
  return { tables: identities, keys, references, indexes };
}

const provisionDbTx = makeTx('provisionDbTx')(function* (
  tx: ITx,
  { definition }: IProvisioningInput,
) {
  for (const table of definition.tables) {
    const existing = readExistingTableDefinition(tx, table);
    validateExistingFixedTable(existing, table);
    if (existing === undefined) executeTableCreation(tx, table);
    provisionMissingIndexes(tx, table);
  }
});
```

1. Bound edge values carry the resolved source/destination table and columns. Renderers do not resolve a name again, rescan for a primary key, or add “missing registry” branches already proven impossible by binding. Keep valid third-party capability checks at the adapter boundary where they are still independently meaningful.
2. `composeResourceTables` owns the collision decision and canonical model-table extraction. It does not copy or resolve tables speculatively; model table identity must remain compatible with captured selections and authored read scopes.
3. Table existence/mismatch checks and missing-index creation stay focused procedures within one synchronous transaction. Infrastructure failures retain their provisioning/transaction categories. No object graph changes or SQLite DDL happen during `makeSystem` validation.

## File hierarchy and exact removal

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
├── packages/core/src/
│   ├── + drizzle/definition/{bindDatabaseDefinition,renderDrizzleSchemas,renderDrizzleRelations}.ts
│   ├── ~ drizzle/{types.ts,make/makeDbConfig/makeDbConfig.ts}
│   ├── - drizzle/make/makeDrizzleSchemasRecordFromTables.ts
│   ├── - drizzle/make/makeDbConfig/makeDrizzleRelationsFromTables/
│   ├── ~ drizzle/provisionDb/ — structured definition-driven provisioning
│   ├── ~ models/{assertValidModels.ts,make/makeQueryDbVersion.ts}
│   └── ~ all database-config constructors/callers
├── packages/system-worker/src/ — fixed/migratable Repo configuration integration
├── packages/browser/src/ — local/worker resource configuration callers
└── wiki/
    ├── ~ architecture/ — definition, projection and persistence boundaries
    └── ~ glossary.md — postimplementation reconciliation
```

1. Delete repeated schema compilation, duplicated identity/name/key discovery, edge re-resolution during rendering, throwaway configuration validation and SQL index-statement search. Replace superseded renderer entrypoints outright; retain no compatibility wrappers.
2. Actual consumers include authored query databases, model/contract read scopes, all server Repo configs, browser/standalone/native session configs, in-memory WASM/sql.js adapters and table introspection. Inventory callers before deleting existing exports. Retain the required separate synchronous driver adapters; they are runtime contracts, not duplicate declaration models.
3. Fixed schemas still require empty storage when changed. This plan neither erases storage nor adds schema migration support. Server projection/journal owner cutovers must consume the same definition and own their topology changes separately.

## Sequence and verification

1. Implement graph binding and structured statement rendering, then replace configuration compilation and pure model validation. Use current shapes `resolveTableReferences` as the authored-reference boundary; inspect its guarantees before deleting any independently required check.
2. Change provisioning consumers and ensure all encoded/decoded Drizzle tables refer to the bound physical identities. Coordinate operation codecs [108](108-plan-model-operation-codecs.md), canonical declarations [105](105-plan-immutable-authored-declarations.md), and selected-view/source-journal plans through the review index.
3. Reuse current self-ref/model relation declarations and existing in-memory/server seams for exact table identity, integer/string primary keys, duplicate keys/names, cycles, foreign keys, decoded JSON relations, physical remapping, quoted identifiers and atomic failed provisioning. Exercise existing schema mismatch refusal without storage deletion. Create no tests, fixtures or check/configuration files.
4. Resolved core Nx gates are `lib`, `lint`, `tsc:typecheck`; server/browser/shapes gates must be resolved before execution. This review ran no production checks. Portability of unsupported Drizzle expression indexes/defaults is not established; support only the actual authored table contract and refuse unsupported definitions explicitly.
5. Reconcile READMEs, local patterns and architecture source citations after implementation. Reconcile glossary and create an ADR only if the implemented data-definition trade-off meets all repository criteria. Archive after required verification completes.

## Implementation evidence — 2026-10-11

- Disposable pure-binding and actual SQL.js provisioning probes passed exact Table identity, self references, quoted identifiers, decoded JSON relationships, physical table remapping and fixed-schema mismatch refusal. The final graph-refusal command completed checks for duplicate exact tables, physical names and index names; unknown physical registry keys; unregistered references; duplicate relation names; cross-table cycles; malformed index columns; and model/internal registry collisions. The final SQL.js command completed seven assertion groups covering copied/frozen partial predicates, canonical quoted DDL, fresh/reopen phase uniqueness, equivalent quoted predicate/operator casing, changed-predicate refusal with retained rows untouched, actual aggregate/service session schema provisioning/reopening, and atomic rollback of earlier fresh table/index when the second DDL was fault-injected followed by successful clean retry. After the affected rebuild, the actual module-import command completed all 12 exported database config imports, checking frozen definitions and compiled table counts, and compiled both existing raw Node command/metadata declarations with their exact null-phase indexes. Core imports used rebuilt JavaScript; the declaration-only system-worker package used its published TypeScript source through existing Bun resolution and rebuilt core. These are bounded definition/provisioning evidence, not durable host acceptance. No permanent tests, fixtures, shims or runner files were created.
- Final quality8 fourteen-project library/type/lint, consumers5 Native/Shopping/TicTacToe, Explorer2 build/actual typecheck/lint, actual core typecheck5 with `--skipSync`, Swift3 and iOS-build3 gates pass. Explorer retains six pre-existing UI warnings; the shared framework graph has no source warnings. Existing Nx reference synchronization drift and Nx Cloud access remain separate workspace conditions.
- Actual native reopening initially refused current Node/session phase indexes because their declarations were separate from the compiled definition. The repair declares those exact indexes and null predicates canonically and removes separate phase DDL. Actual startup then exposed Drizzle's whole-expression null-predicate wrapper; the strict parser now accepts that supported form while refusing other expressions. The rebuilt backend accepts its executing spec, and the existing Swift/JavaScriptCore app reopens retained storage successfully, then reopens again without rebuilding or reinstalling. Both main SQLite files retain identical prelaunch hashes across the app update; no erase or translation occurred. The latest app also passes unchanged-installation warm reopening with readonly logical queries including WAL-backed metadata; Node/Session identities, actor origin, cursor/hash and empty resource/command counts remain stable. Screenshots and native/backend observations are recorded in Plan114, `/tmp/zerospin-goal-tictactoe-backend-reopen-2.log` and `/tmp/zerospin-goal-native-110-smoke-reopen-data.json`. Broader activation, overlap, suspension and recovery cases belong Plans114/126 and remain unverified there.
- Database README, local patterns and source-linked architecture/glossary are reconciled; current source hashes, links and documentation are reconciled. Only single-column `isNull`/`isNotNull` partial predicates are supported; arbitrary Drizzle expressions/defaults have no portability claim. Changed fixed schemas require empty storage.

## Remaining work

None. All required definition/provisioning cases, affected source and consumer gates, actual retained native reopening and documentation reconciliation are complete.
