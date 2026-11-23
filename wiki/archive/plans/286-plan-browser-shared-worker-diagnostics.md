# Diagnose browser SharedWorker connection failures

**Status:** Complete; verified against main after PR #117. **Date:** 2026-11-02.

## Agreed behavior

Implement framework-only browser diagnostics. Emit one bounded page-console
failure record per failed connection attempt in every environment; keep successful
startup traces opt-in. Record the awaiting phase, last completed milestone,
elapsed time, safe module URL, existing client ID, and the observed failure
reason. Worker-local bootstrap/global handlers retain available native evidence
without canceling browser reporting. The original Admin failure remains
undiagnosed.

Preserve public errors, bootstrap/attachment messages, storage, deadlines,
cancellation, retry and disposal. Add only a default-off `diagnostics` input for
connected Service tab-side tracing and register Service sessions with DevTools
before startup. No new Service telemetry bridge, release, publication, consumer
adoption, storage reset, or test infrastructure is in scope.

## Implementation

1. Add a synchronous contained internal reporter and instrument acquisition,
   readiness, artifact checks, attachment, and initial delivery.
2. Report caught owner/API bootstrap failures and worker-global failures locally,
   preserving original behavior and native reporting.
3. Extend existing tests and browser action fixtures; document usage and
   limitations in the existing browser reference and the
   [research note](../../research/browser-shared-worker-startup-diagnostics.md).

## Verification

Use existing browser specs and disposable-origin host fixtures to distinguish
timeout and worker/port failure, retain safe native evidence, exercise opt-in
success output and distinct retry IDs, and preserve cancellation/cleanup/error
semantics. Run scoped package checks and the focused existing runtime suite;
do not verify Explorer or modify existing application storage.

## Outcome and verification evidence

- Restored the saved diagnostics on an isolated branch based on main
  `3e8aa3c6da`. The main checkout's handbook, SDK, handoff, and research work was
  preserved. The implementation adds bounded failure records, acquisition IDs
  and milestones, worker-local bootstrap/global reporting, optional Service
  tracing, and early Service DevTools registration.
- Public error codes, RPC/bootstrap schemas, deadlines, cancellation, retry and
  storage formats remain unchanged. Standalone recovery notices from PR #117
  retain their callback ownership and nonterminal behavior.
- Review found and fixed two gaps: uppercase URL schemes now receive the same
  credential/query/fragment sanitization, and replica delivery failures log before
  terminal reporting can synchronously dispose the connection. Existing tests
  cover the sanitizer and a real MessageChannel/RPC view rejection whose terminal
  observer immediately aborts the connection. Cancellation remains quiet.
- CLI, Browser, and React library targets passed. Browser `ts` and `lint` targets
  passed with zero lint warnings or errors. The focused `zerospin:test` command
  selected `packages/browser/tests`,
  `packages/core/tests/node-history-recovery.spec.ts`, and
  `packages/react/tests/session-providers.spec.tsx` under the Node project. Its
  compiler step and all 40 tests across seven files passed; this is not a full
  repository-suite claim. Logs are `/tmp/plan286-libs.log`,
  `/tmp/plan286-static.log`, and `/tmp/plan286-tests.log`. Nx Cloud was unavailable;
  local verification completed.
- Existing Shopping Vite served disposable origin `http://127.0.0.1:14689`.
  In a fresh Chrome profile, loading the existing SVG asset as a SharedWorker
  produced the unchanged public `node-connection-unavailable` failure and exactly
  one page diagnostic: `worker-error`, awaiting `client.bootstrap`, with
  `worker.construct` completed and a sanitized module URL.
- The existing Service host worker then completed native bootstrap with the
  current worker-name version. Opt-in logs reported `lock.acquire`,
  `worker.construct`, and `client.bootstrap`; the successful acquisition used a
  distinct client ID. No page errors or IndexedDB databases were created. Ports,
  browser context, and the disposable server were closed afterward. Evidence is
  `/tmp/plan286-browser-evidence.json`. This verifies native module loading and
  bootstrap, not backend authentication or full live replica delivery.
- Scoped formatting and `git diff --check` passed. No application databases,
  Mentor Mailbox files, package versions, publications, consumer pins, or
  deployments were changed. The original Admin failure remains undiagnosed;
  subsequent failures now retain the available connection evidence.

## PR #118 privacy review follow-up

- Replaced arbitrary error text and regex redaction with a selected projection:
  fixed categories, recognized connection/snapshot codes, and a fixed validation
  summary. Native and Effect causes follow the same bounded policy. Messages,
  stacks, arbitrary names/codes, preformatted string causes, and event messages
  are excluded even with `diagnostics: true`. Original errors and existing React
  error presentation are unchanged. The
  [formatter research](../../research/browser-diagnostic-error-formatting.md)
  records the installed Effect behavior behind this decision.
- Extended the existing network error specs with actual input-bearing Schema
  errors, native/Effect causes, duplicate stack text, string causes, private
  labels, and changing getters. The default-off Service worker-error scenario
  also verifies event-message exclusion while retaining source coordinates.
  A second source review found no remaining issues in the automatic reporter or
  its optional phase collector.
- The focused compiler step and all 41 tests across seven files passed. Browser
  `ts` and `lint` passed. Logs: `/tmp/pr118-privacy-tests.log` and
  `/tmp/pr118-privacy-static.log`. Nx Cloud remained unavailable; local checks
  completed.
- Reran the existing disposable SharedWorker fixtures in a fresh Chrome profile:
  exactly one invalid-module failure, unchanged public error, successful Service
  bootstrap with a distinct client ID, and private nested-error/event projection
  retaining source location and original errors. No page errors or databases
  were created. Evidence: `/tmp/pr118-privacy-browser-evidence.json`.
- Updated the browser reference and session skill. Scoped formatting and
  whitespace checks passed. No package versions, consumers, or application
  storage changed.

## Remaining work

None.
