# @zerospin/shapes

Zerospin primitive descriptors, table definitions, and Effect Schema/Drizzle mappings.

```ts
import {
  makeDrizzleSchema,
  makeEffectSchema,
  makeTable,
  primitives,
} from '@zerospin/shapes';
```

Value kinds describe values; column options describe constraints and local
relationships. A table column declares its complete scalar codec immediately:

```ts
primitives.integer({
  primaryKey: true,
  references: {
    tableName: 'commands',
    columnName: 'rowId',
    relation: 'command',
    inverse: 'pending',
  },
});
```

`tableName` names the destination's logical table name, independently of its
registry key or physical SQL name. `makeDbConfig` validates the complete graph,
including the destination's sole primary key and compatible scalar contract,
then creates immediate SQLite foreign keys with default NO ACTION behavior and
typed query relations. Declaration order does not matter. Self relationships
name their own table. Tables and their codecs need no resolution stage.

Use `modelId({ model })` from `@zerospin/sdk/browser` for a stable model's
prefixed ID value, including command payloads and cross-database identities.
Use `modelRef({ model, relation, inverse })` for a local model relationship.
The owning release selects the concrete model version. Both helpers discard
the model object; neither grants authority, proves a row exists or generates IDs.
For other prefixed values use `primitives.id({ abbreviation })`; add
`primaryKey: true` for a generic prefixed table primary key.

Integer and text primary keys use the ordinary scalar factories with
`primaryKey: true`. A primary-key relationship is both a local key and an
immediate foreign key; it is nonnullable and its inverse is one-to-one.
Primary-key flags and relationships do not change value codecs. IDs retain
literal abbreviation-prefix types. Integer values must be safe integers and
Number values finite. Cursor retains its explicit move-operation meaning.

Factories preserve literal options through one shared signature family.
Omitted flags mean false and are normalized before freezing. Defaults are
validated when authored; enum defaults must be declared values and Date defaults
are captured by value, then copied for each insertion. Payload descriptors
reject local relationship metadata and `primaryKey: true`; IDs remain supplied
by the caller. JSON retains its authored Effect codec and rejects uniqueness.

`compileDescriptor` exposes the decoded Type, the database row codec and the
portable codec. Row Dates remain Dates and JSON attributes retain their authored
Effect transformation through a persisted JSON string. Portable Dates use the
existing Date-string codec; portable JSON attributes remain JSON strings.
`makeShapeCodecs` derives the defaulted complete row codec and separate required
portable complete and optional portable patch codecs. Patches never insert
omitted defaults; null remains a value when declared nullable.

`decodeSync(codec, input, options?)` and
`encodeSync(codec, value, options?)` return Effects for schema boundaries
that must complete without application services or suspension. They preserve
schema failures and reject suspension with `program-must-be-synchronous`.
Suspended work is interrupted and synchronous cleanup failures are preserved;
asynchronous finalizers and uninterruptible work can outlive the call.

Tables own and freeze descriptor, relationship and index metadata without
freezing external Effect capabilities. Numeric, plain-string and prefixed-ID
primary keys use one local sole-key scan. IDs accept the exact abbreviation
prefix followed by any string, including an empty suffix; their generated JSON
Schema uses the same anchored, escaped prefix.
