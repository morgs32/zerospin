# Zerospin error normalization: research and implemented decision

**Date:** 2026-10-17  
**Scope:** Historical investigation of Zerospin source, installed Effect 4.0.2,
and official Effect v4 and ECMAScript references. The historical sections below
record the pre-cutover API and alternatives, not the current API.
`@zerospin/error` declares Effect 4.0.2 for development
and `^4.0.2` as its peer dependency.
[Package manifest](../../packages/error/package.json#L27-L35).

## Implemented decision

The approved replacement is `ensureZerospinError({ code, error, ... })`.
It returns an existing local ZerospinError instance unchanged, including scoped
business errors and their declared methods. Otherwise it constructs a new error
using the fallback code, optional settings, and bounded diagnostic formatting.
The return type is IAnyError because the preserved code can differ from the
fallback code. makeZerospinError remains the explicit constructor for intentional
classification. Runtime fields and wire schemas are unchanged.
[Current implementation](../../packages/error/src/makeZerospinError.ts),
[API documentation](../../packages/error/README.md),
[completed implementation plan](../archive/plans/239-plan-ensure-zerospin-error.md).

The caller cutover preserves credential acquisition errors, maps schema errors
at their decoding boundary, and keeps complete Causes during finalization.
Retryable outbox transport and recognized network errors still receive the
explicit classifications required by retry/offline handling. Package builds,
lint, and direct built-API identity, fallback, message-precedence, diagnostic-bound,
and composite-Cause evaluations passed. Lint reported 26 warnings in untouched
core files and no remaining warnings from this cutover. The completed plan
records the verification evidence.

## Historical behavior of the removed helper

`catchZerospinError({ code, ... })` returns an ordinary function from `unknown`
to a newly constructed `ZerospinError`. It does not catch an exception, recover
an Effect, log anything, retry work, or decide whether an error is expected.
The surrounding `Effect.try`, `Effect.tryPromise`, `Effect.mapError`, or caller
owns those decisions. Its actual value is a concise callback that assigns an
operation-specific code and formats arbitrary diagnostic input consistently.
[Implementation](../../packages/error/src/makeZerospinError.ts#L89-L110),
[RPC use](../../packages/core/src/utils/getApi/getApi.ts#L81-L125).

The returned function:

1. Chooses `message` in this order: explicit message; an `Error` input's message
   when `preferCauseMessage` is true; the shared catalogue; the code. The option
   currently defaults to false. The base `ZerospinError` constructor already owns
   catalogue defaults as well.
   [Adapter](../../packages/error/src/makeZerospinError.ts#L96-L106),
   [constructor](../../packages/error/src/ScopedError.ts#L22-L31).
2. Renders an Effect `Cause` with `Cause.pretty`, an existing `ZerospinError`
   with `formatZerospinError`, another native `Error` using its stack when
   available, and other inputs as text. It keeps the first 8,000 characters and
   appends a truncation marker when necessary. Existing `ZerospinError` stacks
   are not included by that branch. The native `Error` branch does not explicitly
   traverse `Error.cause` or preserve custom properties.
   [Formatter](../../packages/error/src/makeZerospinError.ts#L65-L86).
3. Constructs a fresh error with the caller's `code`, `status`, and `extra`.
   The original input remains only in the diagnostic string. Yieldability comes
   from `ZerospinError` extending `Data.Error`, not from the adapter.
   [Adapter](../../packages/error/src/makeZerospinError.ts#L97-L110),
   [base class](../../packages/error/src/ScopedError.ts#L14-L32),
   [Effect yieldable errors](https://effect.website/docs/v4/error-management/yieldable-errors).

This is **lossy translation**, not generic error preservation. Wrapping an
existing scoped business error replaces its code, scope, concrete error type,
status, and structured extra unless the caller supplies replacement fields.
Only formatted code/message/cause text survives automatically. The caller must
therefore own the decision that the new code is a better public description.
[Scoped error classes](../../packages/error/src/ScopedError.ts#L40-L51),
[adapter construction](../../packages/error/src/makeZerospinError.ts#L97-L110).

The helper is also **not the public serialization boundary**. `encodeError`
exposes code/message/status/JSON extra, excludes diagnostic cause and stack,
and sanitizes framework extra. The helper itself accepts `extra: unknown`.
Separately, `stringifyZerospinError` uses the full schema, which includes the
diagnostic cause string. Which codec is used matters. Excluding the dedicated
diagnostic field does not make arbitrary prose private: explicit `message`,
`preferCauseMessage: true`, and permitted `extra` still expose selected values.
[Public schema](../../packages/error/src/encodeError.ts#L5-L11),
[public encoding](../../packages/error/src/encodeError.ts#L34-L115),
[full schema](../../packages/error/src/makeZerospinError.ts#L8-L29),
[full stringify/parse](../../packages/error/src/makeZerospinError.ts#L113-L118).

## Historical caller audit

A production-source audit found 38 helper factory invocations across 25 files:
23 passed to `Effect.try`, four to `Effect.tryPromise`, four to `Effect.mapError`,
and seven used directly. One factory is reused for two `Effect.try` operations.
No production call passes the helper directly to `Effect.catchCause`. These are
source counts, not execution measurements.
[Example synchronous adaptation](../../packages/core/src/drizzle/provisionDb/validateDbSchema.ts#L35-L46),
[Promise adaptation](../../packages/core/src/utils/getApi/getApi.ts#L98-L125),
[typed mapping](../../packages/system-worker/src/AggregateVersionRepo/finalizeCommand/finalizeCommandRows.ts#L15-L25),
[direct adaptation](../../packages/core/src/Node/encodeNodeFailure.ts#L10-L19).

`getApi` demonstrates a meaningful boundary: it adds RPC endpoint/method/phase
context, and its invocation catch converts only specifically recognized network
`TypeError` messages. Unrecognized inputs are thrown onward. The classification
is explicit in `getApi`; the helper merely builds the chosen error.
[RPC boundary](../../packages/core/src/utils/getApi/getApi.ts#L80-L139).

There are also wrappers that erase a distinction which the inner method already
established. `getAggregateActorVersion` deliberately throws
`actor-version-unsupported`; `resolveAggregateActorVersion` immediately turns
that into `actor-version-invalid`. `makeCredentialsAdmissionProvider` maps both
credential acquisition failures and schema failures to
`session-credentials-invalid`. Neither example alone proves an incorrect public
contract, but both show why blanket wrapping requires an owner-specific reason.
[Actor resolver](../../packages/core/src/aggregateActor/getAggregateActorVersion.ts#L19-L30),
[credential provider](../../packages/browser/src/makeBrowserSession/makeCredentialsAdmissionProvider.ts#L30-L40).

Some classification must happen before transport. After its command savepoint
finishes, `executeAggregateCommandTx` examines the complete failure shape and
the single failure's `scope` and `code` to distinguish a retainable refusal from
a failure that must propagate. `makeEvaluatedCommand` then places the selected
failure in `outcome.result`, with `finalizedAt` outside the result branches;
`materializeCommandTx` retains the evaluated command in its transaction.
Erasing a meaningful scope or code before that decision can therefore change
durable command semantics, not just the text eventually sent over RPC. This is
a requirement for the architecture, not a claim that the actor-resolver example
currently causes such a defect.
[Aggregate classification](../../packages/system-worker/src/AggregateVersionRepo/utils/executeAggregateCommandTx.ts#L38-L137),
[outcome construction](../../packages/system-worker/src/AggregateVersionRepo/utils/makeEvaluatedAggregateCommand.ts#L21-L43),
[transactional retention](../../packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts#L33-L43).

Telemetry retains the `Exit` and complete `Cause` that exist at capture time.
`makeWorkerRpcEnvelope` captures before reporting/encoding; `encodeRpcExit`
encodes only an exactly single typed failure, preserving non-failure causes or
retaining a composite cause as a defect. This does not recover structure that an
earlier catch adapter already converted into text. Bounded diagnostic formatting
therefore has value independent of optional diagnostic delivery.
[Capture](../../packages/logger/src/captureTelemetry.ts#L16-L33),
[worker envelope](../../packages/system-worker/src/runWorkerInvocation/runWorkerInvocation.ts#L38-L55),
[RPC cause policy](../../packages/logger/src/encodeRpcExit.ts#L37-L55).

## Alternatives and tradeoffs

| Alternative | What it improves | Cost or limitation |
| --- | --- | --- |
| Keep the adapter at unknown-input boundaries | Keeps concise `catch:` callbacks and one bounded diagnostic formatter. | Does not solve indiscriminate relabeling. Every use still needs a legitimate operation code and an explicit preservation policy. |
| Let `makeZerospinError` accept an unknown cause and normalize it | Removes the separate curried API and duplicated message-default selection while retaining one constructor. | The constructor must distinguish omitted/null cause from a supplied value. This is an API change; accepting unknown input must not accidentally change retained cause into arbitrary objects. |
| Preserve typed failures internally; translate only at the owner/API boundary | Retains actionable distinctions for recovery and makes unexpected inputs visible. | Requires a real boundary decision. Preserving every `ZerospinError` automatically can also be wrong when scope or declared business-error validation matters. |
| Retain a native/raw runtime cause and format only for output | Preserves object identity, nested native causes, structured Effect reasons, and richer diagnostics until formatting. | Changes the runtime error model and diagnostic codec. Arbitrary causes need explicit serialization, redaction, retention, and telemetry decisions. This is larger than removing a helper. |

The first two alternatives concern construction ergonomics. The third concerns
error ownership. The fourth concerns diagnostic fidelity. They can be evaluated
separately; changing the function name alone fixes none of these responsibilities.
The current constructor, adapter, and two codecs establish those separate seams.
[Constructor and adapter](../../packages/error/src/makeZerospinError.ts#L34-L110),
[runtime fields](../../packages/error/src/ScopedError.ts#L14-L32),
[public codec](../../packages/error/src/encodeError.ts#L5-L11).

### A smaller construction API

A reasonable simplification is to accept `cause?: unknown` as **constructor
input**, normalize a supplied non-null cause once, and continue retaining
`cause: string | null`. A call would read:

```ts
// Proposed API; not implemented or compiled by this research.
Effect.try({
  try: readCheckpoint,
  catch: cause => makeZerospinError({ code: 'checkpoint-read-failed', cause }),
});
```

This preserves the formatter's actual value and gives the base constructor one
message-default policy. It removes the curried convenience, not diagnostic
formatting. It can retain the current public and full diagnostic wire shapes;
raw cause retention is a separate proposal. Today `makeZerospinError` accepts
only a string/null cause and delegates directly to the constructor, so the
example above requires an intentional API change.
[Current input](../../packages/error/src/makeZerospinError.ts#L34-L46),
[default policy](../../packages/error/src/ScopedError.ts#L22-L31),
[formatter](../../packages/error/src/makeZerospinError.ts#L75-L86).

### Typed errors, selective recovery, and transport boundaries

Effect v4 tracks unions of typed errors. `Effect.catchTag` handles selected
`_tag` variants; `Effect.catchIf` selects by a predicate or type guard.
`Effect.mapError` translates typed failures. These let an owner preserve known
failures and map only the cases it intends to rename.
[Expected errors](https://effect.website/docs/v4/error-management/expected-errors),
[error-channel operations](https://effect.website/docs/v4/error-management/error-channel-operations).

Zerospin already has literal `code` types and scoped error declarations. Its
errors all share `_tag: 'ZerospinError'`, so `catchTag('ZerospinError')` does not
select a particular code; code-specific recovery needs code discrimination or
an appropriate type guard. Introducing one new class per code is unnecessary
unless it creates a useful domain distinction. Existing schema-backed business
errors also own their declared JSON codec.
[Generic code type](../../packages/error/src/ScopedError.ts#L14-L20),
[scoped declaration and codec](../../packages/error/src/ScopedError.ts#L201-L249),
[Effect selection rules](https://effect.website/docs/v4/error-management/expected-errors).

For domains that genuinely need separate tags, `Data.TaggedError` supplies a
yieldable tagged error; `Schema.TaggedError` additionally supplies a schema-backed
class. Neither by itself replaces Zerospin's public shape or its deliberate
exclusion of diagnostic causes. Adopt either where its declaration/validation
responsibility is needed, not as a blanket rewrite of framework codes.
[Effect Data](https://effect.website/docs/v4/data-types/data),
[Effect schema classes](https://effect.website/docs/v4/schema/classes),
[public encoding](../../packages/error/src/encodeError.ts#L75-L115).

### Cause-aware failure handling

Effect v4's `Effect.catchCause` sees typed failures, defects, interruptions, and
multiple failure reasons. Its `Cause` has a flat `reasons` array; guards include
`Cause.hasInterruptsOnly`, and `Effect.failCause(cause)` propagates a cause.
An unconditional conversion of such a cause into an ordinary typed error can
erase cancellation or defect semantics. Formatting a cause is appropriate for
diagnostics after the owning boundary decides what may be converted; formatting
is not that decision.
[Unexpected errors](https://effect.website/docs/v4/error-management/unexpected-errors),
[Cause](https://effect.website/docs/v4/data-types/cause),
[current formatter](../../packages/error/src/makeZerospinError.ts#L75-L86).

The repository already shows the appropriate separation: `mapParseError`
uses `Cause.map` and `Effect.failCause` to rewrite schema failures while
preserving other reasons. `runAuthoredCallback` propagates non-failure and
composite causes, validates a single scoped business failure, and translates
an eligible single unscoped failure. These owner-specific policies should not
be replaced by a universal “preserve known errors” or “wrap everything” rule.
[Schema mapping](../../packages/error/src/mapParseError.ts#L12-L32),
[authored callback](../../packages/core/src/execution/runAuthoredCallback.ts#L54-L90).

### Native causes

JavaScript's `Error(message, { cause })` stores the supplied cause value in a
non-enumerable property. `Data.Error` and `Data.TaggedError` support native
causes already; Zerospin deliberately narrows that field to string/null today.
Keeping the raw value would avoid early loss of object structure, but native
cause support does not define a public JSON contract or preserve Effect
execution semantics after conversion to a typed error.
[ECMAScript InstallErrorCause](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-installerrorcause),
[Effect native causes](https://effect.website/docs/v4/data-types/data),
[Zerospin runtime field](../../packages/error/src/ScopedError.ts#L14-L30).

## Research assessment before the decision

The behavioral priority is **narrow conversion of unknown failures at a boundary
whose owner can classify them**, with explicit propagation or validation of
known failures and complete Causes. `catchZerospinError` remains defensible as a
small adapter at its 27 `Effect.try`/`Effect.tryPromise` factory sites. Its bounded
diagnostic formatting and contextual code assignment do useful work. The largest
correctness improvement is to challenge unjustified rewrapping of known failures
and make each remaining translation belong to a named boundary. That conclusion
follows from the useful RPC classification and the lossy actor and credentials
examples above; it does not require a new error hierarchy or moving every
classification to RPC.
[RPC classification](../../packages/core/src/utils/getApi/getApi.ts#L105-L125),
[actor translation](../../packages/core/src/aggregateActor/getAggregateActorVersion.ts#L19-L30),
[credential translation](../../packages/browser/src/makeBrowserSession/makeCredentialsAdmissionProvider.ts#L30-L40).

An optional API simplification is one constructor accepting an unknown diagnostic
input while retaining the current string/null field. Currying and repeating
message defaults are optional; duplicating `prettyUnknownFailure` at every call
site or renaming the helper would add little value. Preserve typed and scoped
failures according to their owner's contract; use Cause-aware handling where
interruption, defects, or several reasons matter. Consider raw runtime cause
retention only if structured diagnostic inspection is a required capability.
This research does not establish that broader requirement.

## Follow-up: catch only non-Zerospin failures in Effect v4

**Yes, for errors already in an Effect's typed error channel.**
`Effect.catchIf` can exclude recognized Zerospin errors before the wrapping
handler runs. An unmatched error re-fails with its original cause; ordinary
typed catches do not handle a pure defect or interruption. This uses existing
APIs and does not require changing the constructor.
[Effect selective recovery](https://effect.website/docs/v4/error-management/fallback),
[installed catchIf signature and contract](../../node_modules/.pnpm/effect@4.0.2/node_modules/effect/src/Effect.ts#L5874-L5978).

```ts
// Illustrative use of current APIs; not production changes.
program.pipe(
  Effect.catchIf(
    error => !isZerospinError(error),
    error => Effect.fail(catchZerospinError({ code: 'checkpoint-read-failed' })(error)),
  ),
);
```

The handler is runtime-selective, but its TypeScript error type depends on the
input. A refinement can remove a member of a concrete union. A boolean predicate
does not prune that union, and `unknown` cannot express “everything except
`IAnyError`”: `unknown` absorbs union members and
`Exclude<unknown, IAnyError>` remains `unknown`. `Predicate.not` returns a plain
predicate rather than a negative refinement.
[TypeScript narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates),
[TypeScript unknown](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#new-unknown-top-type),
[Predicate.not](https://effect.website/docs/v4/api/effect/Predicate#not),
[installed overloads](../../node_modules/.pnpm/effect@4.0.2/node_modules/effect/src/Effect.ts#L5920-L5978).

If the boundary starts with `E = unknown` and needs an accurate remaining error
type, `catchFilter` can use a partition whose rejected values are `IAnyError`:

```ts
const nonZerospinError = Filter.make((error: unknown) =>
  isZerospinError(error) ? Result.fail(error) : Result.succeed(error),
);

program.pipe(
  Effect.catchFilter(nonZerospinError, error =>
    Effect.fail(catchZerospinError({ code: 'checkpoint-read-failed' })(error)),
  ),
);
```

Here `Filter`'s rejected type is independent of its passing type, so the known
errors remain typed as `IAnyError` while only the passing unknown values reach
the handler. This adds machinery; use it when that type improvement matters.
There is no runtime `excludeTag`/`reject`/`flip` combinator exported by the
installed `Filter` module. `catchTag` handles the selected tag, and
`Filter.tagged` validates only `_tag`, so neither is a general negative
Zerospin-error classifier.
[Filter model and constructors](https://effect.website/docs/v4/api/effect/Filter),
[installed catchFilter return type](../../node_modules/.pnpm/effect@4.0.2/node_modules/effect/src/Effect.ts#L6134-L6140),
[installed Filter exports](../../node_modules/.pnpm/effect@4.0.2/node_modules/effect/src/Filter.ts#L1).

**A JavaScript throw/rejection boundary is different.** `Effect.try` and
`Effect.tryPromise` catch the thrown/rejected `unknown` and require their
`catch:` callback to return the typed error. They have no predicate option to
skip selected exceptions. Preserve a recognized error by returning the same
instance; wrap only the other branch:

```ts
Effect.try({
  try: readCheckpoint,
  catch: error =>
    isZerospinError(error)
      ? error
      : catchZerospinError({ code: 'checkpoint-read-failed' })(error),
});
```

Throwing the known error from the mapper creates a defect (`Die`); it does not
continue the original typed failure. Using the default constructor and applying
a predicate afterward also tests `UnknownError`, not the original thrown value.
The preservation decision therefore belongs inside that mapper, or in a
dedicated unknown-input adapter used there.
[Effect construction](https://effect.website/docs/v4/getting-started/creating-effects),
[installed try/tryPromise implementation](../../node_modules/.pnpm/effect@4.0.2/node_modules/effect/src/internal/effect.ts#L1065-L1128).

Two boundaries still matter:

- **Runtime errors versus public error data.** `isZerospinError` ultimately
  checks `instanceof ZerospinError`, recognizing local scoped subclasses but
  not plain public JSON. `getApi` can fail directly with a decoded public error
  object. Transport code must use the public/declared codecs to recognize those
  values before applying an instance-based preservation rule; checking a lone
  `_tag` on untrusted input does not validate the error.
  [Runtime guard](../../packages/error/src/makeZerospinError.ts#L17-L18),
  [guard export](../../packages/error/src/makeZerospinError.ts#L63),
  [received public failure](../../packages/core/src/utils/getApi/getApi.ts#L154-L155),
  [public-code recognition](../../packages/error/src/matchZerospinErrorCode.ts#L27-L50).
- **One error versus a complete Cause.** In installed Effect 4.0.2,
  `catchIf`/`catchFilter` inspect the first typed failure. When no match occurs,
  they preserve the original Cause; when the handler runs, its replacement can
  discard sibling failure/defect/interruption reasons. For reason-preserving
  normalization, use `Cause.map` inside `catchCause`/`failCause`, as
  `mapParseError` already does, and return recognized errors unchanged from the
  mapping callback. The owner still decides which errors are legitimate in its
  scope.
  [installed selective catch implementation](../../node_modules/.pnpm/effect@4.0.2/node_modules/effect/src/internal/effect.ts#L2866-L2949),
  [repository Cause mapping](../../packages/error/src/mapParseError.ts#L19-L32),
  [authored-callback scope policy](../../packages/core/src/execution/runAuthoredCallback.ts#L62-L90).

**Validation:** Source inspection and primary-source research only. This research
authored only this note and ran no repository checks, builds, or tests. The
follow-up examples were checked against installed API signatures and source,
not compiled or executed.
