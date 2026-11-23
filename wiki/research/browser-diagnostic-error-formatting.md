# Safe automatic browser diagnostics without losing developer errors

**Research date:** 2026-11-02. **Scope:** PR #118 at `84e22f6a59`, with the installed Effect **4.0.2** implementation. Research only; no runtime changes are proposed as already implemented.

## Recommendation

Use a small, internal **safe automatic summary** at the existing logging boundary. Keep phase, last completed milestone, acquisition ID, sanitized worker URL, and the error category or recognized framework code. For a validation failure, use a fixed description such as `SchemaError: Session data failed validation`; do not automatically copy its rendered message, stack, issue object, or arbitrary cause text. Those existing connection fields already identify where startup failed. The current reporter assembles them before writing the record, so applications need no extra React hook or logging wrapper. [Reporter](https://github.com/morgs32/zerospin/blob/84e22f6a598d522b35514cb29d4f0e08ca4e93ce/packages/browser/src/Node/makeWorkerConnectionDiagnostics.ts#L109-L170).

Keep error propagation and session normalization unchanged. A private diagnostic summary is a projection for automatic logging, not the error that should replace the session/store error. This preserves the existing React integration and avoids making every consumer author remember a privacy callback. The current normalizer already converts a foreign error into a `ZerospinError`, retaining formatted diagnostic text in its string `cause`; consequently, the store should not be described as retaining the original structured `SchemaError`. [Normalizer](https://github.com/morgs32/zerospin/blob/84e22f6a598d522b35514cb29d4f0e08ca4e93ce/packages/error/src/makeZerospinError.ts#L74-L112).

Illustrative automatic output, retaining the current string-valued error field:

```ts
{
  scope: 'page',
  phase: 'replica.delivery',
  lastCompletedPhase: 'node.attachment',
  clientId: 'the-existing-acquisition-id',
  reason: 'exception',
  error: 'SchemaError: Session data failed validation',
}
```

This is a proposed logging policy, not a new public API or an implemented formatter.

## What the review found, and an important version distinction

The [review comment](https://github.com/morgs32/zerospin/pull/118#discussion_r4448885751) identifies a valid boundary risk: the current `failureText` reads both `error.message` and `error.stack`, then recursively reads `.cause`. `eventDetails` separately copies `event.message`. A narrowly placed replacement for only the top-level error message would leave other routes for the same private text. [Current formatting](https://github.com/morgs32/zerospin/blob/84e22f6a598d522b35514cb29d4f0e08ca4e93ce/packages/browser/src/Node/makeWorkerConnectionDiagnostics.ts#L54-L105).

However, **a default built-in decode does not always print the rejected value in this installed version**. Effect 4.0.2 defaults `reportInput` to false. Enabling it retains enumerable `input` values, while custom issue messages and annotations remain the author's responsibility regardless of that option. `SchemaError.message` invokes the default issue formatter. [Installed parse options](/private/tmp/zerospin-plan286/node_modules/effect/src/SchemaAST.ts:572), [installed SchemaError](/private/tmp/zerospin-plan286/node_modules/effect/src/Schema.ts:1174).

I ran this disposable Node probe against the installed dependency:

```ts
const claims = Schema.Struct({ email: Schema.Number });

// Default options: "Expected number\n  at [\"email\"]".
Schema.decodeUnknownSync(claims)({ email: 'private@example.com' });

// reportInput: true: the rejected email appears in message and stack.
Schema.decodeUnknownSync(claims, { reportInput: true })({
  email: 'private@example.com',
});
```

The probe caught each exception before inspecting its text. Thus the review's general safety concern stands, but claiming every plain default claims decode leaks its actual input would overstate the observed behavior. Sensitive text can still originate from input-reporting options, custom messages, wrappers, or already formatted string causes. [Parse-option ownership limits](/private/tmp/zerospin-plan286/node_modules/effect/src/SchemaAST.ts:581), [string-cause normalization](https://github.com/morgs32/zerospin/blob/84e22f6a598d522b35514cb29d4f0e08ca4e93ce/packages/error/src/makeZerospinError.ts#L74-L112).

## Is there an existing Effect formatter that solves this?

Effect offers a readable string formatter and a Standard Schema V1 formatter producing `{ path, message }` issues. The latter is convenient for structured consumers and forms. [Official error-formatter documentation](https://effect.website/docs/v4/schema/error-formatters).

The installed API is exactly:

```ts
SchemaIssue.makeFormatterStandardSchemaV1({
  leafHook: issue => 'Application-chosen terminal message',
  checkHook: issue => 'Application-chosen check message',
});
```

There is **no `showActual: false` option** on that formatter. More importantly, these hooks alone do not establish a complete privacy boundary: the empty-`AnyOf` branch bypasses both hooks and can emit reported input or a custom message. I verified that a constructed empty union issue with `reportInput: true` still emitted its fake email despite both hooks returning fixed messages. [Installed formatter signature](/private/tmp/zerospin-plan286/node_modules/effect/src/SchemaIssue.ts:1303), [empty-union branch](/private/tmp/zerospin-plan286/node_modules/effect/src/SchemaIssue.ts:1361).

Simply formatting to the Standard Schema shape is therefore insufficient. Default messages can contain reported input even though the result has no separate `input` property. Paths, ASTs, union successes, and custom annotations are also explicitly outside a general sanitization guarantee. A dynamic record key can itself be data, so “keep every path but remove values” needs an application-specific path policy. [Formatter caveat](/private/tmp/zerospin-plan286/node_modules/effect/src/SchemaIssue.ts:1270), [issue ownership limits](/private/tmp/zerospin-plan286/node_modules/effect/src/SchemaIssue.ts:122).

If field-level validation details become a real product requirement, project a bounded set of issue kinds and approved schema paths from the structured tree, without reading `input` or arbitrary custom messages. That is a separate, richer feature; this PR can fix the reported leak with a fixed validation summary and its existing connection context. This recommendation follows from the formatter's documented ownership limits, rather than assuming its default messages are sanitized.

## Causes, stacks, and React

Apply the automatic-summary policy recursively before any text is rendered. Effect 4 causes expose individual failure/defect/interrupt entries through `reasons`, with guards for their kind. Use those structured entries rather than `Cause.pretty` when producing privacy-constrained output. Native `Error.cause` and the framework's already formatted string causes require the same policy; a string no longer retains enough schema provenance to safely recover the rejected value by inspecting its type. [Installed Cause model](/private/tmp/zerospin-plan286/node_modules/effect/src/Cause.ts:45), [framework formatting](https://github.com/morgs32/zerospin/blob/84e22f6a598d522b35514cb29d4f0e08ca4e93ce/packages/error/src/makeZerospinError.ts#L74-L112).

Do not retain the original validation stack after replacing only its message: the probe reproduced the same input-bearing formatted message in `.stack`. Treat arbitrary messages and stacks as developer diagnostics, not automatically safe production metadata. Removing a first stack line is not a general solution to a multiline validation message; this is a policy inference from the observed output and current formatter's direct stack copying. [Current stack copying](https://github.com/morgs32/zerospin/blob/84e22f6a598d522b35514cb29d4f0e08ca4e93ce/packages/browser/src/Node/makeWorkerConnectionDiagnostics.ts#L65-L79).

React already supplies production root error callbacks and recommends keeping its default development handlers. Error boundaries do not catch arbitrary asynchronous callbacks. In Zerospin, nonterminal failures go to the managed hook's `onFailure`; terminal failures become the handle error and go to `SessionReady.renderError`. Therefore the practical fix belongs in the shared diagnostic formatter, with the current session/React channels preserved. **`diagnostics: true` must not mean “safe to reveal private values”** because it is a startup-tracing option that can be enabled in production. [React root error logging](https://react.dev/reference/react-dom/client/createRoot#error-logging-in-production), [React error-boundary limits](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary), [managed observer](/private/tmp/zerospin-plan286/packages/react/src/managedSession/makeManagedSession.ts:109), [terminal rendering](/private/tmp/zerospin-plan286/packages/react/src/SessionReady.tsx:69).

## Bounded follow-up for PR #118

1. Change only the automatic diagnostic projection; keep the original thrown/reported failure and existing React APIs.
2. Cover a schema failure carrying a fake email, a nested cause, an Effect cause, and a stack containing the duplicated message. Include a preformatted string cause and `event.message` so the fix cannot succeed only for the first field.
3. Keep the existing phase, client ID, public error outcome, one-record guarantee, and cancellation tests. Use a local debugger or the existing development/error-display workflow to inspect detailed original failures rather than adding another generic error-reporting subsystem.
4. Document the actual guarantee as safe selected fields. Do not claim regex replacements can make arbitrary error text private, and do not silently tie raw output to the existing success-tracing flag.

These are research recommendations. No implementation, error contract, React API, package version, publication, or PR discussion was changed by this research.
