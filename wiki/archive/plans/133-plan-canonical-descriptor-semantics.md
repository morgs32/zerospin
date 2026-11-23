# 133 — One meaning for each authored primitive

Status: Completed and verified on 2026-10-11. Canonical descriptor, decoded Zod value and portable/default/reference semantics are verified.

## Current evidence and responsibility

1. [primitiveMaps](../../../packages/shapes/src/primitiveMaps.ts) treats `Integer` and integer-primary-key references as unrestricted `Schema.Number`, independently maps a Date to a portable Date-string codec, applies row defaults in another procedure, and maintains separate Drizzle and SQL renderers. [makeZodSchema](../../../packages/zod/src/makeZodSchema.ts) repeats primitive/null/default decisions and also treats Integer as Number. The descriptor says INTEGER while these runtime validators accept fractions and unsafe values.
2. Zod's JSON descriptor branch converts `Schema.toJsonSchemaDocument(descriptor.schema).schema` to a Zod schema, then casts the result to the descriptor's decoded type. A JSON document describes a portable encoded representation; it cannot reproduce arbitrary Effect transforms or runtime refinements. A Date-valued decoded field or a custom decoded class can therefore have different accepted values and output from the advertised Zod type. Definitions are also separated in Effect's document and are not passed to Zod's document converter. No current authored first-party caller of `makeZodSchema` or `descriptorToZod` was found; the exported package and its README still promise decoded schemas and must be correct.
3. [primitives.ref](../../../packages/shapes/src/primitives.ts) and [resolveTableReferences](../../../packages/shapes/src/resolveTableReferences.ts) recognize either the sole abbreviation string primary key or `integer({ primaryKey: true })`. [Table](../../../packages/shapes/src/makeTable.ts) self-reference resolution recognizes only the former, so a table with a valid numeric primary key cannot use `primitives.self`. `primitives.self` also constructs an otherwise empty fake Table merely to fill a reference field before its real owner exists.
4. [makeAbbreviationIdSchema](../../../packages/shapes/src/makeAbbreviationIdSchema.ts) accepts every string with the exact prefix, including an empty suffix. Its published JSON Schema uses an unanchored, unescaped, narrower character pattern. The advertised schema and executable schema disagree. [encodeShape](../../../packages/shapes/src/encodeShape.ts) separately describes defaults, including Integer defaults as Number and Date defaults as strings; authored primitive constructors do not consistently validate those default domains.
5. Shapes owns each primitive's value meaning and representation codecs. [108](108-plan-model-operation-codecs.md) consumes them for model operations; it must not rediscover primitive meaning. [109](109-plan-bound-database-definition.md) owns table graph binding, physical columns, references, relation construction and DDL. [105](105-plan-immutable-authored-declarations.md) owns declaration publication/sealing and [106](106-plan-canonical-authored-manifest-projections.md) owns canonical manifest projections. This plan does not absorb those owners or merge decoded values with persisted or portable encodings.

## Canonical semantics and deliberate changes

1. Integer and numeric primary-key references accept only JavaScript safe integers. Fractions, NaN, Infinity and integers outside the safe range are refused. General Number accepts finite numbers, including fractions. These are deliberate acceptance changes: SQLite/JavaScript/JSON cannot preserve the rejected values as a reliable authored scalar. Defaults must satisfy the same domain at declaration construction. No coercion, truncation or fallback decoding.
2. Keep three precise uses. A decoded Type schema validates already-decoded authored/runtime values. A row codec maps database-facing values to decoded values: Date remains a Date on the Drizzle side, JSON remains an encoded JSON string on the persistence side, and its authored Effect codec performs the JSON transformation. A portable model codec uses the established Date-string encoding and the established JSON-string attribute encoding required by model operations. Nullability and exact key/ref domains are shared meanings; representation choices remain explicit. Do not convert all JSON attributes to raw nested JSON, all stored Dates to strings, or decoded Date values to strings.
3. Defaults belong to full row/payload construction where they currently fill omitted keys. Required complete operation/replay schemas must validate all required values; patch schemas allow omitted changed keys and must not insert defaults for unchanged attributes. Compile these shape policies from the same descriptor semantics; do not infer required-versus-patch from a null/default flag or copy a defaulting full-row schema into a patch operation.
4. Boolean/Text/Enum retain their authored domains and nullable/default behavior. Validate Enum's nonempty values and that its default is a declared value. Date values/defaults must be valid Dates; preserve the established portable Date codec rather than quietly changing accepted date text. Capture Date defaults without sharing a caller-mutable Date; produce a fresh Date for each default insertion. JSON permits only its current nullable-null default and retains its exact authored codec and decoded Type, including transformations and refinements.
5. A decoded Zod descriptor is an adapter over the canonical **Type** schema and decoded default policy. Delete its primitive switch and JSON Schema round trip. For a JSON descriptor it accepts the decoded value, validates the authored Type's constraints, and returns that decoded value. It does not promise to decode an encoded JSON string or run an Effect transform from wire input. Keep object-key/default behavior explicitly as currently exposed by Zod's object schema; do not introduce a generic bidirectional Zod codec or an alternate runtime.
6. Resolve self, named and concrete references through one sole-primary-key interpretation that handles abbreviation string and numeric integer keys. Preserve exact concrete table identity, column name, relation/inverse names and nullable/unique flags. Construction-only self markers carry no fake Table capability; resolve them to the actual Table before any codec or sealed definition is published. Reject missing/multiple primary keys or mismatched selected key columns before mutation/publication. Named-reference graph binding and immutable binding copies remain [109](109-plan-bound-database-definition.md)'s responsibility.
7. Preserve the current identifier prefix contract: `${abbreviation}_` followed by any string. Derive a regex-escaped, start-anchored JSON Schema prefix pattern from that same contract. This fixes the published claim without inventing a new suffix alphabet, nonempty-suffix restriction or UUID/CUID-only requirement. Concrete generated identifier uniqueness still belongs to the existing factories; prefix validation does not prove uniqueness.
8. Unsupported/malformed descriptor kinds fail at construction/compilation; remove the current Drizzle/DDL fallback-to-text behavior as [109](109-plan-bound-database-definition.md) replaces those renderers. Ref codec compilation refuses construction-only/unresolved metadata. Do not expose a weak kind-only predicate as proof that an arbitrary object is a complete valid descriptor; use validated descriptor values or a schema that actually proves required metadata.
9. Incompatible fixed descriptor/row schemas require empty storage under the pre-release policy. Implementation changes current callers directly, without aliases, old codecs, fallback decoders or translation migrations. Do not delete or reset user storage during this review or as a silent implementation step.

## Complete proposed parent shapes

```ts
function compileDescriptor(descriptor: IResolvedPrimitiveDescriptor) {
  const meaning = validatePrimitiveMeaning(descriptor);
  const codecs = makePrimitiveRepresentationCodecs(meaning);
  return { ...codecs, defaultValue: meaning.defaultValue };
}

function makeShapeCodecs(shape: IResolvedShape) {
  const descriptors = mapValues(shape, descriptor =>
    compileDescriptor(descriptor),
  );
  const rowCodec = makeDefaultedRowCodec(descriptors);
  const portableCompleteCodec = makePortableCompleteCodec(descriptors);
  const portablePatchCodec = makePortablePatchCodec(descriptors);
  const decodedSchema = Schema.toType(rowCodec);
  return { rowCodec, decodedSchema, portableCompleteCodec, portablePatchCodec };
}

function makeTable(props: ITableDeclaration) {
  const declaration = decodeTableDeclaration(props);
  const ownedShape = captureOwnedDescriptors(declaration.shape);
  const table = constructTableIdentity(declaration, ownedShape);
  resolveSelfReferences(table);
  validateResolvableTableCodecs(table);
  return finishTableDeclaration(table);
}

function descriptorToZod<D extends IResolvedPrimitiveDescriptor>(
  descriptor: D,
) {
  const compiled = compileDescriptor(descriptor);
  const decoded = Schema.toType(compiled.rowCodec);
  const value =
    makeDecodedZodValueSchema<IPrimitiveDescriptorDecoded<D>>(decoded);
  return applyDecodedZodDefault(value, compiled.defaultValue);
}

function makeZodSchema(shape: IResolvedShape) {
  return z.object(mapValues(shape, descriptor => descriptorToZod(descriptor)));
}
```

1. These are complete schematic construction parents with proposed internal types. The real exported signatures retain descriptor/shape inference. The canonical meaning procedure owns scalar validation, ref-key interpretation and default/null rules; representation construction uses that completed meaning. Keep trivial scalar schema choices inline within that single domain procedure. Do not build an abstract converter registry or callback/plugin framework.
2. `portableCompleteCodec` and `portablePatchCodec` describe only attributes. [108](108-plan-model-operation-codecs.md) owns action envelopes, model/release binding, modelId and forward/inverse operation requirements, then derives their schemas from these attribute codecs. It must reuse the distinction between required complete values and patches.
3. Unresolved named refs remain authored construction inputs until [109](109-plan-bound-database-definition.md) binds the graph; they are not usable executable row/operation codecs. Coordinate Table's lazy codec acquisition with [105](105-plan-immutable-authored-declarations.md)'s sealing and [109](109-plan-bound-database-definition.md)'s owned binding copies. Do not mutate a sealed authored descriptor to add a later reference or freeze foreign Effect/Table capabilities recursively.
4. The Zod adapter validates already-decoded Type values synchronously, just as its current `z.date()` branch does. `makeDecodedZodValueSchema` owns this actual validation boundary; a bare `Schema.is` predicate that loses the distinction between invalid data and unsupported execution is insufficient. Evaluate the canonical Type in an empty service context using a synchronous Exit boundary. If it suspends, interrupt its AsyncFiberError Fiber and flush its dispatcher before returning an explicit unsupported synchronous-Type-codec issue. A missing service is an explicit unsupported service-dependent Type-codec refusal. Ordinary Schema issues become ordinary Zod value issues; preserve unrelated defects, interruption and mixed Causes rather than calling them invalid values. An asynchronous or service-dependent codec cannot be reconstructed from JSON Schema or hidden behind a Promise-returning Zod API. Preserve the authored portability requirements established by [107](107-plan-contract-evaluation-phases.md); this is a Zod decoded-value boundary, not another general runtime runner.

## File hierarchy and machinery to remove

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
├── packages/shapes/src/
│   ├── + compileDescriptor.ts
│   ├── + makeShapeCodecs.ts
│   ├── + resolvePrimaryKey.ts
│   ├── ~ primitives.ts
│   ├── ~ makeTable.ts
│   ├── ~ resolveTableReferences.ts
│   ├── ~ primitiveMaps.ts — retain only definition-driven storage integration
│   ├── ~ makeAbbreviationIdSchema.ts
│   ├── ~ encodeShape.ts
│   ├── ~ {types,index}.ts
│   └── - duplicated primitive/default/ref switches replaced above
├── ~ packages/zod/src/makeZodSchema.ts
├── + packages/zod/src/makeDecodedZodValueSchema.ts
├── packages/core/src/
│   ├── ~ models/make/makeModelVersion.ts — consume completed shape codecs
│   ├── ~ contracts/ — operation codecs108 and prepared contract codecs107
│   └── ~ drizzle/ — bound physical definition109
├── packages/{system-worker,browser}/src/ — affected codec consumers
├── ~ packages/{shapes,zod}/README.md
└── wiki/
    ├── ~ architecture/ — implemented representation boundaries
    ├── ~ patterns/ — primitive and reference conventions
    └── ~ glossary.md — postimplementation reconciliation
```

1. Delete the duplicated decoded-Zod primitive switch, Effect-to-JSON-Schema-to-Zod conversion, fake self-ref Table, independent key-kind discovery and conflicting identifier regex. Delete repeated descriptor semantics from operation serializers under108 and physical/DDL renderers under109; retain genuinely different required representations.
2. Current exact consumers include Table's row codec; core model attributes/portable attributes; `decodePayload`, `encodePayload`, `validatePayload`, payload adapters, external response codecs and resource serialization; aggregate/service snapshot application; selected-view resource reads; command/admission/async codecs; Node/session identifiers and ticket/telemetry/log boundary schemas. SDK barrels export primitives and IDs unchanged. `@zerospin/zod` has no authored first-party caller outside its own source/README, but is an exported public package; external usage was not inspected.
3. Concrete first-party integer requirements include Shopping prices/amounts/quantities, tracking sequences, command/replay/session positions and system telemetry millisecond positions. Fullsource review found no requirement for fractional Integer values or nonfinite Number values. Preserve zero/negative safe integers where the descriptor permits them; nonnegative position policy belongs to the concrete protocol schema, not the generic Integer primitive.

## Ordered implementation and verification limits

1. Establish the canonical primitive domains/default validation and sole-key resolver; correct numeric self refs and remove fake Table construction. Reconcile type inference and construction-only/ref-bound types with105/109 before sealing or publishing codecs. Use `mapValues` for owned record traversal and remove forbidden `Object.entries` loops in touched Table/ref/column construction.
2. Compile full row, decoded Type and portable complete/patch attribute codecs, then replace model and prepared contract consumers. Implement108 operation codec consumption after these meanings exist;109 physical definition consumes the same validated descriptors. Replace Zod conversion with canonical decoded validation and align encoded descriptor/default/ID JSON Schema claims through106.
3. Reuse existing authored Shopping/Tic-tac-toe model/contract schemas, in-memory database seams, existing relation/self-ref examples, existing contract/payload/operation verification and disposable in-memory probes. Exercise integer fractions/safe bounds/nonfinite values, transformed/refined JSON Type values, nested Date JSON codecs, nullable/default missing keys, independent mutable Date defaults, complete-versus-patch omission, numeric/text self refs, unresolved named refs, shared exact Table identity and escaped ID prefixes. Create no test files, fixtures, runner files or configuration.
4. Resolved shapes and zod Nx targets include real `lib`, `ts`, `lint`, `tsc:typecheck`; the `ts` target uses their existing extra-source typecheck configuration. After implementation run `pnpm nx run @zerospin/shapes:lib`, `pnpm nx run @zerospin/shapes:ts`, `pnpm nx run @zerospin/shapes:lint`, and the corresponding zod targets, then core `lib`/`lint`/`tsc:typecheck` and actual browser/system-worker `lib`/`ts`/`lint` integration gates. Resolve project commands before execution; an inferred disabled echo task is not verification. This review ran no production checks or new probes and makes no pass claim.
5. This source review establishes the semantic divergence; it has not measured external Zod users, existing persisted invalid values or all possible third-party Effect refinements. The hard cutover refuses newly invalid values and requires empty changed fixed storage. Preserve exact current Date/JSON codec behavior except the explicitly listed acceptance changes.
6. Reconcile module READMEs, local patterns, architecture citations and glossary after implementation. An ADR is appropriate only if the implemented representation/accepted-number trade-off meets all repository criteria. Archive once implementation and required verification finish.

## Completion evidence — 2026-10-11

- Successful disposable descriptor/Zod checks establish safe integer domains/defaults, independent mutable Date defaults, full-versus-patch omission, numeric/text self and unresolved named references, exact Table binding, escaped executable/published ID prefixes, decoded transformed/refined JSON with nested Dates, and suspension/service-dependent refusal with cleanup and defect preservation. The final permitted inline checks completed seven assertion groups across two commands: Integer safe bounds versus Number finite fractions in decoded/row/portable schemas; Boolean/Integer/Number/Text/Enum/Date/nullable-JSON defaults without patch/complete insertion; nullable scalar and invalid default refusal; refined decoded JSON and nested Date rejection of portable substitutes; numeric/text self key domains; malformed concrete/named key metadata; and escaped ID prefix agreement. An initial reference-equality assertion against Effect Struct decoding was incorrect and aborted after the first three successful groups; the corrected remaining four groups completed successfully.
- Actual SQL.js checks additionally establish quoted names, decoded relations, physical references, fixed-schema mismatch refusal, canonical null-predicate index provisioning/reopening and atomic failed provisioning: a fault-injected second DDL rolled back the earlier fresh table/index, then a clean retry succeeded. No required descriptor-specific bounded case remains identified. These are bounded descriptor/codec/SQL evidence, not durable host acceptance. The original plan permits these inline checks without new files; no permanent test, fixture or runner files were created.
- Final quality8 framework library/type/lint and consumers5 Native/Shopping/TicTacToe checks pass after all repairs. Core's actual typecheck5 passes with `--skipSync` for existing Nx project-reference drift; Swift3/iOS-build3 and Explorer2 gates pass. The framework graph has no source warnings; Explorer retains six pre-existing UI warnings.
- Module READMEs, local descriptor patterns and source-linked architecture/glossary are reconciled. The final documentation/source-citation audit and affected integration gates pass.

## Remaining work

None. Required bounded runtime cases, affected source and consumer checks, and documentation reconciliation are complete.
