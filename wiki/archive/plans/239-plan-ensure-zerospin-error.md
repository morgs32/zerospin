# Replace catchZerospinError with ensureZerospinError

**Date:** 2026-10-17

**Status:** Complete and verified on 2026-10-17.

## Agreed behavior

1. Introduce `ensureZerospinError({ code, error })`, accepting unknown input and the existing optional message, extra, status, and preferCauseMessage settings.
2. Return an existing local ZerospinError instance unchanged, including scoped subclasses, with all fallback settings ignored. Otherwise construct one using the fallback code, current message precedence, and bounded diagnostic formatting.
3. Return IAnyError. Keep makeZerospinError, runtime fields, diagnostic/public schemas, and transport-owned public-error recognition unchanged.
4. Remove catchZerospinError and migrate production callers and SDK exports without aliases or compatibility paths. Preserve unrelated work; create no tests, fixtures, runners, configuration, or storage migrations.

## Implementation sequence

1. Define ensureZerospinError in the existing error-construction module. Delegate message catalog defaults to makeZerospinError. Update both SDK barrels and remove the old export.
2. Migrate ordinary catches and collapse redundant preserve-or-wrap guards. Preserve actor unsupported/conflict errors. Broaden affected error declarations honestly rather than casting preserved codes into the fallback code.
3. Use mapParseError at credential decoding, retained service command preparation, and aggregate query response decoding. Preserve credential acquisition failures.
4. In finalizeCommandRows, map typed failures with catchCause, Cause.map, and failCause so every sibling failure, defect, and interruption survives.
5. Keep retryable outbox transport and recognized RPC network classifications explicit through makeZerospinError and diagnostic formatting. Preserve their downstream retry/offline policy and authored-callback classification.
6. Update current error/API documentation and record the chosen implementation separately from dated research findings. No new glossary concept or governing ADR is needed for this helper API cutover.

Grouped edit locations (`~` means modify existing files):

```text
zerospin/
  ~ packages/error/                         API and README
  ~ packages/{core,browser,system-worker}/  affected callers and declarations
  ~ packages/sdk/                           public entrypoints
  ~ fragment/content/reference/             SDK and browser documentation
  ~ wiki/research/                          existing research conclusion
```

## Required verification

1. Build the explicit graph: `pnpm nx run-many -t lib -p @zerospin/error,@zerospin/core,system-worker,@zerospin/browser,@zerospin/sdk`.
2. Lint the changed implementation packages: `pnpm nx run-many -t lint -p @zerospin/error,@zerospin/core,system-worker,@zerospin/browser`.
3. Evaluate the built API directly without persisted test/check files: scoped-error reference identity despite conflicting fallback settings; foreign-error fallback code, message precedence and bounded diagnostics; complete composite Cause preservation.
4. Confirm both SDK entrypoints export ensureZerospinError and current production/API references contain no catchZerospinError. Keep historical research and archived-plan references identified as historical.

## Verification outcome

1. The explicit five-project lib graph passed, including its required dependencies and both SDK declaration entrypoints.
2. The four-project lint graph passed with zero errors. It reported 26 warnings in untouched core files and one introduced system-worker import-order warning. After correcting that import, the system-worker lib/lint graph passed without code warnings. The untouched warnings are outside this cutover.
3. Direct evaluation of the built error package passed: a declared scoped error retains reference identity despite conflicting fallback settings; foreign native and primitive failures receive fallback codes and diagnostics; default, opted-in, and explicit message precedence is retained; diagnostic truncation is bounded; complete Fail/Fail/Die/Interrupt reasons survive mapping.
4. Both generated SDK entrypoint declarations export ensureZerospinError. The built error package has no catchZerospinError export, and current production/API references have no old helper references.
5. Independent source review found no actionable correctness issues. Runtime/wire error schemas and authored-callback classification have no diff. No tests, fixtures, runners, configuration, migrations, or compatibility paths were created by this work.
6. Formatting and scoped whitespace checks passed. The current error/API docs and research conclusion describe the implemented contract; historical findings remain identified as historical.

## Remaining work

None.
