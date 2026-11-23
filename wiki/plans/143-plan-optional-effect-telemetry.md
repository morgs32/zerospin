# Optional Effect telemetry: cleanup and hosted verification

**Status:** Active. Cleanup and local Grafana setup are implemented and verified.
The maintainer selected local Grafana first; actual hosted-provider verification
remains deferred and unverified until a named application needs it. It does not
block Plan 151 storage reviews.

**Parent:** [Plan 151](151-plan-storage-table-review.md).

**Local-first scope — 2026-10-27:** Use one pinned Grafana development container,
opt-in telemetry in the existing examples, and their existing System names as
OTLP `service.name`. No hosted account or deployment is needed for this local
step. This addition leaves the hosted proof below open.

**Design review — 2026-10-27:** Source reviewed at
`de041946f17923ce80db8fbb9bc841fd179cd759`. That review changed plans only.
The implementation and current checks are recorded below.

## Problem and agreed direction

Zerospin captures Effect spans and logs locally, then optionally sends them to a
configured provider using OTLP, the standard telemetry export protocol. Keep that
implementation. The remaining delivery question is whether the provider stores
those records and makes their identifiers searchable.

The current [Studio guide](../../docs/content/guides/studio.md) defers trace
pages and provider links. That supersedes this plan's original local Studio
navigation feature. Two remnants remain: `TelemetryConfigSchema` accepts an
unused `investigationUrlTemplate`, and `ErrorPage` can link to Studio's removed
`/traces/...` route. Remove those remnants and preserve the displayed trace and
span identifiers. The provider's own UI or API can supply the remaining delivery
proof.

## Scope and constraints

1. Keep one application tracer/collector. Local capture remains complete;
   optional hosted export samples each invocation and sends only records produced
   by that invocation. Imported records are available locally without being
   exported again.
2. Keep telemetry configuration outside authored System definitions. Existing
   application OTLP and Cloudflare-native settings remain independent. Resolve
   secret headers in Worker composition and keep credentials out of client
   metadata, diagnostic output and verification evidence.
3. Preserve the original domain result and complete failure Cause when export
   fails or is interrupted. Keep export outside synchronous SQL transactions,
   retain the owning invocation/drain lifetime and the existing bounded
   five-second cleanup. Trace identifiers establish correlation; they do not
   establish command admission, execution commit or provider indexing.
4. This plan originally retained mandatory admission auditing as a scope boundary.
   Completed [Plan 222](../archive/plans/222-plan-remove-system-log-repo-and-admission-audit.md)
   and [ADR 017](../adrs/017-admission-without-durable-audit.md) retire that
   requirement. Optional diagnostics do not replace the durable audit guarantee.
5. Keep the cleanup within the deferred Studio scope: no replacement trace UI,
   second tracer, provider SDK, diagnostic table/outbox or compatibility path.
   No storage reset is needed. New test files, fixtures, runners or configuration
   require explicit authorization; use existing verification seams first.

## Implementation and verification

1. **Remove unused configuration.** Delete `investigationUrlTemplate` and its
   private `InvestigationUrlTemplateSchema` from
   [TelemetryConfigSchema.ts](../../packages/core/src/system/TelemetryConfigSchema.ts).
   Search current in-scope consumers and update any declarations or configuration
   that supply the field. Keep the working endpoint, sampling and header settings.
2. **Remove the broken Studio link.** Delete the `studioUrl` prop, default and
   forwarding from [ErrorPage](../../packages/error-boundary/src/ErrorPage.tsx)
   and [ZerospinErrorPage](../../packages/error-boundary/src/ZerospinErrorPage.tsx).
   Always display a present `backendTrace.traceId`/`spanId`, as the existing
   no-URL branch does. Retain `getBackendTrace`, its schema and SDK exports.
3. **Verify the cleanup and reconcile documentation.** Review the remaining
   ErrorPage JSX for identifier display and absence of the retired link. Run the
   affected existing typing/lint checks and confirm current callers/configuration
   no longer supply the removed fields. This small removal needs no new UI test
   harness. Correct the stale Error README, glossary and SystemApi architecture
   promises after source edits;
   keep public guidance in Fragment and runtime guidance in architecture. Format
   changed files and check affected links. This routine cleanup needs no new ADR.
4. **Select the hosted check.** Identify an existing application/Worker and provider
   account, the trace/log endpoints, sampling and secret binding names, and an
   existing operation suitable for the checks below. Obtain missing configuration
   and authorization for any required external changes before making them. No
   hosted provider is selected; local Grafana is authorized separately below.
   Record scope without recording credential values.
5. **Check only the relevant current execution path.** Trace the chosen operation
   through its collector, `WorkerTelemetry.emit` and host lifetime. Reuse the
   evidence below. If changed Repo/queue wiring crosses a boundary without
   applicable proof, verify that boundary using an existing current spec. Do not
   reopen the exporter matrix merely because its old test files were removed.
6. **Prove provider arrival and lookup.** Use the fewest existing sampled
   invocations that produce a root/child span, a non-secret application log, an
   existing linked-RPC causal edge and a failure exposing `backendTrace`. One
   suitable failing invocation may suffice. Find the actual trace/log records in
   the provider. Check matching identifiers, names, parent relationships, causal
   links and structured failure data; look up the advertised `backendTrace`
   coordinates. Compare each returned domain result with its expected result.
   HTTP 2xx from the OTLP endpoint or receipt by a local collector does not prove
   provider indexing. If no existing operation supplies a required record,
   identify that specific gap before proposing a fixture. Local Studio and
   joined native/Effect ancestry are not prerequisites.
7. **Record completion.** Save the operation, deployment revision, non-secret
   identifiers, provider lookup evidence and exact checks/results in this plan.
   Reconcile Plan 151 and archive Plan 143 only after both the cleanup and hosted
   proof are complete. Keep an unavailable provider or unresolved check explicit.

## Planned file hierarchy

`~` means modify an existing file; `+` means create. The local setup changes
only the resource identity passed into the existing export path. Any additional current consumer found in steps 1–2 must be
updated in the same hard cutover.

```text
zerospin/
├── + compose.telemetry.yaml
├── ~ README.md
├── examples/
│   ├── shopping/
│   │   ├── ~ README.md
│   │   └── ~ zerospin.config.ts
│   └── tic-tac-toe/
│       ├── ~ .env.example
│       ├── ~ README.md
│       ├── ~ zerospin.config.ts
│       └── src/
│           └── ~ chooseComputerMove.ts
├── packages/
│   ├── core/src/system/
│   │   └── ~ TelemetryConfigSchema.ts
│   ├── error-boundary/
│   │   ├── ~ README.md
│   │   └── src/
│   │       ├── ~ ErrorPage.tsx
│   │       └── ~ ZerospinErrorPage.tsx
│   ├── error/
│   │   └── ~ README.md
│   └── system-worker/src/
│       ├── repoServices/
│       │   └── ~ WorkerTelemetryLive.ts
│       └── exportTelemetryBatch/
│           ├── ~ exportTelemetryBatch.ts
│           └── ~ makeOtlpTelemetryBatch.ts
└── wiki/
    ├── ~ glossary.md
    ├── architecture/
    │   ├── ~ AuthoredSystem.md
    │   └── ~ SystemApi.md
    └── plans/
        ├── ~ 143-plan-optional-effect-telemetry.md
        └── ~ 151-plan-storage-table-review.md
```

## Evidence to reuse

1. **Local proof, dated 2026-10-12/13.** The original Workerd checks exercised actual
   HTTP delivery, span/log conversion, imported-record exclusion, failure
   containment, timeout/cancellation and invocation/drain cleanup. The final run
   passed eighteen tests in five files, including eleven telemetry tests. Earlier
   Fetch probes that failed to intercept delivery remain excluded. These results
   did not prove hosted indexing. The full implementation and results remain in the
   [pre-review record](https://github.com/morgs32/zerospin/blob/de041946f17923ce80db8fbb9bc841fd179cd759/wiki/plans/143-plan-optional-effect-telemetry.md#implemented-result-and-verification-evidence).
   Its retired Studio, audit, runner and file-tree instructions are historical.
2. **Preservation review before implementation, dated 2026-10-27.** Comparison with original telemetry
   commit `2a2b51b3703a74c3bb429c854737ab05ee8595cd` and Plan 222's checkpoint
   `ff3ef7b82e21d6be568e0ac2cdfd8c91a5fe1495` found the capture, collector,
   tracer, conversion and reporting algorithms unchanged. `exportTelemetryBatch`
   and `WorkerTelemetryLive` changed only props destructuring; the invocation
   runner changed a type name. Effect remains `4.0.2`. This supports reuse of the
   old primitive checks,
   without claiming that later Repo/queue composition was rerun.
3. **Current verification seam.** The existing
   [native SystemApi spec](../../packages/system-worker/tests/native-system-api/native-system-api.workerd.spec.ts)
   checks imported context/links and Aggregate/Service admission with a failing
   `WorkerTelemetry.emit`. It proves diagnostic containment at those boundaries,
   not actual OTLP Fetch delivery or finalization. Completed
   [Plan 257](../archive/plans/257-plan-direct-system-worker-verifications.md)
   establishes the current real-Repo Workerd lane through `zerospin:test`.
   Use scoped owning Nx targets with required dependencies; do not restore the
   retired telemetry harness or rerun unrelated checks. Exclude Explorer entirely.
4. **Source anchors.** Follow
   [WorkerTelemetryLive](../../packages/system-worker/src/repoServices/WorkerTelemetryLive.ts),
   [exportTelemetryBatch](../../packages/system-worker/src/exportTelemetryBatch/exportTelemetryBatch.ts)
   and [runWorkerInvocation](../../packages/system-worker/src/runWorkerInvocation/runWorkerInvocation.ts)
   for export ownership. Use the existing
   [Effect/Cloudflare research](../research/effect-v4-cloudflare-native-tracing.md)
   for the protocol rationale; recheck version-sensitive APIs only if the selected
   deployment or a required change depends on them.

## Implementation result — 2026-10-27

1. Removed `investigationUrlTemplate` and its private validator, plus `studioUrl`
   from `ErrorPage` and `ZerospinErrorPage`. Present backend trace/span identifiers
   remain displayed. The cleanup changes no storage schema or correlation contract;
   the later local setup also binds the existing exporter resource as described below.
2. Corrected the root README, both Error package READMEs, glossary and the
   SystemApi/AuthoredSystem architecture. The additional README and AuthoredSystem
   references were discovered during implementation; their obsolete promises and
   deleted-source citations are removed. Updated affected live source ranges and
   hashes. No new ADR, fixture or test harness was needed.
3. Passed `pnpm nx run-many -t lib lint ts -p @zerospin/core @zerospin/error-boundary @zerospin/dev-worker`, including required dependencies:
   twelve tasks, one reused cache result. Core lint reports thirty warnings in
   unchanged files and zero errors; no changed source file has a warning. The
   Core and Dev Worker library builds check the configuration declaration and its
   deployment consumer together. This is typing/lint evidence, not a provider
   delivery run. Log: `/private/tmp/plan143-scoped-checks.log`.
   Cleanup-stage formatting passes for eleven files; the twenty-five added
   relative links and affected source hashes/ranges validate, and
   `git diff --check` passes. Narrow source review confirms strict configuration
   decoding rejects the removed field and the remaining ErrorPage JSX displays
   both identifiers. Those cleanup checks alone establish no runtime delivery proof.
4. Before local setup, source discovery found both examples omitted `telemetry`;
   README endpoints were placeholders. Public RPC capture still flows through
   `reportRpcTelemetry` and `WorkerTelemetry.emit` within the awaited configured
   runtime. No new lifetime mechanism is required. Public RPC/example bodies
   did not naturally emit application logs at that checkpoint. The local setup
   adds the meaningful chooser log described below instead of forcing an internal
   socket failure or creating a synthetic fixture.
5. **Local Grafana implemented and verified.** The maintainer selected local
   Grafana first. `compose.telemetry.yaml` runs `grafana/otel-lgtm:0.38.1`, digest
   `sha256:0df9bc14142000b161344bd24caf6ddd319b7319055aedaf9b0692b125730af7`,
   with Grafana at `http://127.0.0.1:12300`, OTLP HTTP at loopback port `4318`
   and a persistent named volume. Docker health and the whole-stack readiness
   signal passed. Grafana remains running; existing application stores were not
   reset. Both example configs opt in with `ZEROSPIN_TELEMETRY=1` in `.env.local`
   (and `.dev.vars` if used). Disabled configs omit telemetry. The exporter uses
   `config.system.name` for both signals' resource, with no new configuration knob.
6. **Actual example behavior and indexed records.** The production CLI ran the
   unchanged example declarations from fresh development directories under
   `/private/tmp/plan143-local-94z4jdcl`, with isolated SQLite storage. Both Workers
   reported whole-SystemSpec acceptance. Shopping traces are indexed under
   `shopping`, including trace `66be0aa597500eb794a452d476f7188a`. A real TicTacToe
   browser game executed X in the center and O in square 1. The chooser now logs
   its selected move index as useful application diagnostics, without logging the
   board or changing its result. Loki indexed `Computer move selected`,
   `moveIndex: 0`, log `lgr_c6ebced38191008f`, trace
   `61736ac58b2d8491f54a85a671eace2c` and span `fba0e313aaa77f97`. Tempo contains
   that exact span within eighteen named spans with parent relationships; the
   rendered Grafana waterfall also shows all eighteen.
7. **Actual framework failure and correlation.** A public
   `SystemApi.executeServiceQuery` request with missing required fields returned
   `system-api-arguments-invalid` with backend trace
   `5bddc6ea423ea3aa6d96e9ae4c0cd610` and span `3ad616438e9c76b6`. Tempo lookup
   returns that exact error span, structured failure data, full captured
   `error.cause`, and the source-owned `causedBy` link to caller trace
   `dcd31d9835d4b9c6c963cb651c1c89e0`/span `de063fdbba2b473f`. This uses the
   real RPC/capture/export path, not a fabricated telemetry batch or local HTTP
   acknowledgement. The original failure remains on the RPC failure channel.
8. **Current checks and evidence.** System Worker typing and its library graph
   passed. After fixing Shopping's exact-optional-property opt-in shape,
   `pnpm nx run-many -t ts lint -p shopping tic-tac-toe` passed twenty tasks, four
   from cache. The five remaining example warnings are in unchanged files. A
   final `system-worker:lint` graph passed six tasks with only two warnings in
   unchanged source, after fixing the introduced import-order warning. Earlier
   failed attempts are superseded by these checks. No new test fixture, runner
   or framework was created. Evidence includes indexed JSON, comparison summary
   and Grafana screenshot under `/private/tmp/plan143-local-94z4jdcl`; check logs
   are `/private/tmp/plan143-example-checks.log` and
   `/private/tmp/plan143-worker-lint-final.log`. Temporary example processes are
   stopped after verification; their storage and Grafana's telemetry are retained.
   Final formatting covers twenty source/documentation/Compose files. Compose
   validation and whitespace checks pass; affected links and source metadata
   are reconciled after formatting.

9. **Publication check on current main.** After Plans 236/241 merged, the PR was
   rebased onto main `0579a08926`. All nine changed TypeScript files remained
   byte-identical through that rebase. Refreshed Core, Error Boundary, Dev Worker,
   System Worker, Shopping and TicTacToe typing/lint with required library
   dependencies passed all twenty-seven tasks. All thirty-seven warnings are in
   unchanged files. Log: `/private/tmp/plan143-pr-checks.log`. The local trace/log
   run above remains dated pre-rebase evidence; the rebase adds no hosted proof.

## Remaining work

1. **Hosted-provider verification is deferred until a named application needs it.**
   On 2026-11-03, the maintainer removed its dependency from Plan 151 storage
   reviews: hosted indexing establishes no storage-table lifecycle invariant.
   For a concrete application need, select and authorize a hosted endpoint/account and verify actual
   trace/log arrival, indexing and backend-coordinate lookup there. The verified
   local Grafana store does not close this hosted requirement. No account,
   credentials or cloud deployment has been created.
2. Record the hosted result and archive this plan only after
   that remaining verification is complete.
