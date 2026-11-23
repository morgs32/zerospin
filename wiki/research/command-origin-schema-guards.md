# Command origin checks and Effect Schema

**Updated:** 2026-10-25

**Status:** The original three-object-origin recommendation is superseded by
[Plan 265](../archive/plans/265-plan-flat-command-origins.md) and
[ADR 023](../adrs/023-flat-command-origins-and-claims-free-continuations.md).
The Effect 4.0.2 API observations below remain dated research evidence.

## Implemented guidance

Canonical commands are a flat union discriminated by scalar `origin`:
Actor, Agent, System or Continuation. Concrete `ActorCommandSchema` includes
required identity/claims and the complete Node tuple. `Schema.is(ActorCommandSchema)`
therefore checks the whole decoded Actor shape and narrows its required fields.
Direct `command.origin === 'actor'` remains appropriate after canonical decoding.
There is no requirement to add an unused generated matcher.

```ts
// The codec owns the submitted envelope invariant, including required Node fields.
if (Schema.is(ActorCommandSchema)(command)) {
  command.nodeId; // string
  command.pushIndex; // positive safe integer by schema
}
// This check establishes shape, not authenticated ownership or permission.
```

Default schema predicates permit extra properties. Ordinary ingress decodes the
complete page with `onExcessProperty: 'error'`; it rejects mixed root fields,
old object origin and caller-supplied Continuation input before transactional
admission. A valid parent ID supplies no authority. Only exact retained pending
work permits the Chain's atomic observation/child-admission transaction.

SQL row decoders require inactive provenance columns to be null, then reconstruct
a logical variant with inactive fields absent. Duplicate recovery compares every
immutable flat field before current declaration resolution. Claims-free
Continuations use `originCommandId` for their immediate cause, canonical reads
and their own guard/program; no Actor claims or Actor-specific guard is inherited.
Stable session/ticket/snapshot identities remain separate object schemas.

- [Command variants](../../packages/core/src/contracts/CommandSchema.ts)
- [Aggregate ordinary boundary](../../packages/system-worker/src/AggregateChain/admitAggregateCommands/validateAggregateSubmission.ts)
- [Service ordinary boundary](../../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommands.ts)
- [Relational row codec](../../packages/system-worker/src/AggregateVersionChain/evaluatedAggregateCommand.ts)
- [Trusted observation recording](../../packages/system-worker/src/ServiceChain/recordExternalOutcomeAndAdmitCommandTx.ts)
- [Current consumer responsibilities](../reviews/command-origin-consumers.md)

## API findings from primary sources

| Operation                                     | Established behavior                                                                         | Implication for this review                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Schema.is(schema)`                           | Validates the schema's decoded type side. Schema mismatches become false; defects can throw. | Appropriate when a full-shape boolean guard is required. It does not decode a wire value or establish authorization.       |
| `.guards.actor` after `toTaggedUnion('kind')` | Generated from a type-side schema guard.                                                     | It is also full-shape validation, not a cheaper spelling of a tag comparison.                                              |
| `.isAnyOf(['actor'])`                         | Reads the selected discriminator on a typed union value.                                     | A classification option after decoding; it is not an unknown-input validator.                                              |
| `.match(origin, handlers)`                    | Selects the handler by discriminator; the type requires a handler for each variant.          | Useful for complete dispatch where an implicit final branch would otherwise select System. It does not validate its input. |
| `Predicate.isTagged('actor')`                 | Examines `_tag`.                                                                             | Does not match the repository's `kind` discriminator.                                                                      |

Sources: installed [SchemaParser guard implementation](../../packages/core/node_modules/effect/src/SchemaParser.ts#L143), [tagged-union utilities and implementation](../../packages/core/node_modules/effect/src/Schema.ts#L6302), and [Predicate implementation](../../packages/core/node_modules/effect/src/Predicate.ts#L1452). Official version-tag corroboration: [SchemaParser](https://github.com/Effect-TS/effect/blob/effect%404.0.2/packages/effect/src/SchemaParser.ts), [Schema utilities](https://github.com/Effect-TS/effect/blob/effect%404.0.2/packages/effect/src/Schema.ts), [Predicate](https://github.com/Effect-TS/effect/blob/effect%404.0.2/packages/effect/src/Predicate.ts). Local published files are the authority for the installed package; upstream line positions differ.

The installed `isAnyOf` signature's `Keys` parameter is unconstrained. A misspelled discriminator can construct a predicate that narrows to `never`; its existence is not a reason to replace TypeScript's ordinary literal comparison. Use it when grouping variants improves an actual caller. [Installed signature](../../packages/core/node_modules/effect/src/Schema.ts#L6317).

TypeScript directly narrows discriminated unions through their literal property. An exhaustive switch with a `never` check is another supported option; this codebase already has the schema, so its generated complete matcher avoids a second declaration of the variant set. [TypeScript handbook: discriminated unions and exhaustiveness](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions).

## Historical installed-package observations (2026-10-15)

A single in-memory Node probe exercised the installed package without writing files, adding test infrastructure or contacting a running application. It used actor/agent/System structs with the then-current object origin field shapes.

| Observation                                                                                 | Result                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete actor value through `Schema.is`, generated actor guard and discriminator predicate | All true.                                                                                                                                                                       |
| Incomplete `{ kind: 'actor' }`                                                              | Full guard and generated guard false; discriminator predicate true. This deliberately supplied malformed input to the JavaScript predicate to demonstrate its validation limit. |
| Extra property on a complete actor value                                                    | Default full guard true; explicit `onExcessProperty: 'error'` decode returned Failure.                                                                                          |
| `Schema.is(Schema.FiniteFromString)`                                                        | Decoded number accepted, encoded string refused. No string-to-number decoding occurred.                                                                                         |
| `Predicate.isTagged('actor')` on the `kind`-tagged actor value                              | False.                                                                                                                                                                          |
| Generated complete matcher on the valid actor value                                         | Selected the actor handler.                                                                                                                                                     |
| Tagged-union augmentation                                                                   | Same union object and AST reference; existing discriminants remained actor, agent, System.                                                                                      |
| Input mutation                                                                              | No mutation observed for the tested value.                                                                                                                                      |

The guard results agree with the [installed parser](../../packages/core/node_modules/effect/src/SchemaParser.ts#L143), [generated utilities](../../packages/core/node_modules/effect/src/Schema.ts#L6404), and the [official explanation of decoded type checking](https://effect.website/docs/v4/schema/introduction#understanding-decoding-and-encoding). These are bounded API observations, not a performance benchmark, a TypeScript compilation probe, or runtime verification of Zerospin's permission/recovery behavior.

## Snapshot

- Effect version: `4.0.2`, as installed for [core](../../packages/core/package.json) and [system-worker](../../packages/system-worker/package.json).
- Checkout HEAD at inspection: `7184c8ed01f6a78e84b7818186fcb0a9b3c6f98b`; concurrent uncommitted changes were present.
- Installed `Schema.ts` SHA-256: `47ebb600a218f58fba80836e9e8d9b063ef0e21efa975d087d8e6a0399a1cd2f`.
- Installed `SchemaParser.ts` SHA-256: `d21b52ffc0cdaf86d6735fb9682e2a0066b5db6a81b1d60d62ebc85eacc5cad2`.
- Existing origin schema SHA-256: `85919da94215f8e7619a88ac810e4a1ea5a86bfbd227bb8e8e8130eaa5e454fe`.
- Consumer search refreshed: 45 explicit check lines across 27 production files. This count is navigation evidence, not a required removal count.

Research was performed directly in this side conversation under its no-subagent constraint. Only primary sources support the API conclusions. The probe does not verify Plan 265. Its source/runtime evidence is recorded separately in that plan.
