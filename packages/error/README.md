# @zerospin/error

Structured framework and scoped business errors for Zerospin's Effect programs,
with stable codes, human-readable messages, and explicit serialization boundaries.

## Installation

```bash
npm install @zerospin/error effect
```

## Framework errors

Declare distinct framework failures with `ZerospinError.schema`. The declaration
owns its code, default message, and diagnostic schema; `.make()` validates the
decoded diagnostics and the public codec validates transported diagnostics:

```ts
import { ZerospinError } from '@zerospin/error';
import { Schema } from 'effect';

const BackendTimeoutError = ZerospinError.schema({
  code: 'backend-timeout',
  message: 'Backend is not responding. Try again shortly.',
  extra: Schema.Struct({ timeoutMs: Schema.Number }),
});
const failure = BackendTimeoutError.make({ extra: { timeoutMs: 10_000 } });
// failure.code is 'backend-timeout'; failure.extra.timeoutMs is a number.
const received = Schema.decodeUnknownSync(BackendTimeoutError)(
  failure.toJson(),
);
```

Omitting `extra` selects `Schema.Null`, so `.make()` needs no options and produces
`extra: null`. A non-null diagnostic schema makes `extra` required. Framework
errors have no business scope. `.toJson()` and `encodeError` preserve the exact
declared public type, excluding private causes and stacks. Non-JSON diagnostics
cannot be serialized. A known code with invalid diagnostics remains unknown to
`recognizeZerospinError` and `matchZerospinErrorCode`.

Existing generic failures can use `makeZerospinError`. The shorthand and direct
`new ZerospinError({ code })` constructor use the same reviewed internal defaults:

```ts
import { makeZerospinError } from '@zerospin/error';

const error = makeZerospinError('node-storage-reset-required');
// error.message explains that this runtime cannot use the retained Node schema.

const contextual = makeZerospinError({
  code: 'node-checkpoint-conflict',
  message: 'The service replica checkpoint no longer matches server history.',
  extra: { requestedServiceIndex: 5, currentServiceIndex: 3 },
});
```

For newly constructed errors, message precedence is explicit instance message,
opted-in cause message during normalization, reviewed framework default, then
the code for an unknown code.
The catalog is internal; application-defined codes keep their own wording.
Dynamic framework producers supply contextual messages when a finite reviewed
code does not describe the lookup or operation.

`makeZerospinErrorFactory({ code, message? })` binds a code and optional default
message. Instance options can override the factory message, status, cause, and
extra; they cannot override the code.

## Normalizing unknown failures

`ensureZerospinError({ code, error, ... })` returns an existing runtime
`ZerospinError` unchanged, including scoped business errors. It preserves the
same instance and all its fields and methods; fallback settings are ignored.
For another value, it constructs an error using the fallback code and retains
the formatted failure in `cause`. Its return type is `IAnyError`, since a
preserved error can have any code.

For a newly constructed error, the default public message describes the
framework operation. An explicit message always wins, including when
`preferCauseMessage: true` is supplied:

```ts
import { ensureZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

const read = Effect.try({
  try: readCheckpoint,
  catch: error =>
    ensureZerospinError({
      code: 'aggregate-result-checkpoint-invalid',
      error,
    }),
});
```

Use `makeZerospinError` when an operation deliberately assigns a new code.
Normalization recognizes local error instances; public JSON failures still
require their transport/declared codecs. It does not extract an error from an
Effect Cause or change the caller's failure-handling policy.

Use `preferCauseMessage: true` only when intentionally exposing an `Error`'s
message. `prettyUnknownFailure` formats Effect Causes, native errors, and other
unknown values for diagnostic text and bounds it to 8,000 characters.
`formatZerospinError` includes the code, distinct message, and retained cause.
For Schema failures, use `mapParseError({ code, prefix, extra? })` to keep the
validation details in an explicit contextual message.
It maps only `SchemaError`; other typed failures, defects and interruption retain
their original causes.

## Scoped business errors

Declare business failures inline in a contract or reusable guard's `failures`
record, using camelCase keys. Callbacks receive the declared schemas:

```ts
failures: {
  purchaseNotFound: ContractError.schema({ code: 'purchase-not-found' }),
  amountInvalid: ContractError.schema({
    code: 'amount-invalid',
    extra: Schema.Struct({ amount: Schema.Number }),
  }),
},
guard: Effect.fn('purchase.guard')(function* ({ failures, payload }) {
  if (payload.amount < 0) {
    yield* failures.amountInvalid.make({ extra: { amount: payload.amount } });
  }
  if (!purchaseExists()) yield* failures.purchaseNotFound.make();
}),
```

`ContractError`, `ActorError`, and `AggregateError` own business-error wording.
Their constructors and schemas bypass framework defaults, even when an authored
code happens to match a framework code. An omitted message remains the authored
code; an explicit message is preserved.

The scoped schemas default `extra` to `Schema.Null`. For that schema, `.make()`,
`.make({})`, or a message override produces `extra: null` in runtime and JSON
values. Custom extra schemas require their decoded value. Wire decoding still
requires all encoded fields. The record key does not replace the wire `code`.

## Serialization and privacy

`stringifyZerospinError` and `parseZerospinError` round-trip the framework's
canonical fields, including diagnostic `cause`. They are for full diagnostic
values, not public backend responses.

`encodeError` creates public JSON for RPC and session reporting. Framework JSON
retains code, message, status, and safe JSON extra, while excluding backend
causes, stacks, and nested `cause`/`stack` keys in extra. Scoped business errors
serialize through their declared codec and retain their scope. Serialization
failure produces `error-serialization-failed` instead of exposing private data.

Declared schema `.toJson()` output and codec round trips preserve authored
messages and validated extra; scoped schemas also preserve their scope.
`recognizeZerospinError` recognizes a
received public failure against a local declared codec;
`matchZerospinErrorCode` dispatches recognized declared failures while retaining
unknown failures for the caller's fallback.

## Backend diagnostics

Completed invocation telemetry captures failed Causes and bounded source
snapshots. Error instances are never mutated to attach shared span history.
Configured, sampled backend diagnostics can add
`extra.backendTrace = { traceId, spanId }` to a copied encoded framework failure;
a valid originating reference is retained. Scoped business failures keep their
declared extras and are excluded from this framework reference.

[`getBackendTrace`](./src/getBackendTrace.ts) returns that reference or `null`.
[`BackendTraceSchema`](./src/BackendTraceSchema.ts) and its `IBackendTrace` type
describe raw nonzero hexadecimal OTLP IDs: 32 digits for `traceId`, 16 for
`spanId`. The Worker uses the same identities as its local spans, removing only
the `trc_` and `spn_` prefixes. The helper is also exported from both SDK
entrypoints. It never mutates the error and ignores malformed references.

```ts
import { getBackendTrace } from '@zerospin/error';

const trace = getBackendTrace(error);
const diagnosticReference =
  trace === null ? null : `${trace.traceId}/${trace.spanId}`;
```

A reference identifies a captured backend invocation. Delivery, retention and
provider indexing can be unavailable; displaying the identifiers does not prove
any of them. `ZerospinErrorPage` displays a present reference, which can be used
to search the configured provider. Studio trace pages and provider links are
deferred. Full failed Causes remain in captured spans rather than being added
to public error codecs.
