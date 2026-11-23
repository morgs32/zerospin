# Keep telemetry capture at its invocation boundary

Status: Implemented and verified in the approved goal on 2026-10-11.

[ErrorLayer](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/core/src/utils/ErrorLayer.ts) allocates one failed-spans array for a configured tracer lifetime and adds it to each root error by mutating error.extra. A later call can include earlier calls' spans, the array remains shared/unbounded, and frozen/reused authored errors are unsafe to annotate by mutation. The framework already has invocation-scoped makeRpcEnvelope/makeTelemetryLayer collectors, immutable failed-Cause attributes and persisted backendLog references. The unused [mock RPC proxy](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/logger/src/makeTraceableRpcTarget.ts) adds another partial envelope check/trace-context implementation with no authored caller. The clearer design has one diagnostic capture per actual boundary and canonical wire ancestry schemas.

1. Delete ErrorLayer and its makeConfig/agent-session infrastructure wiring. Do not replace it with another config-lived history array. makeFn/annotateFunctionSpan and makeTelemetryTracer already record bounded argument/exit snapshots, source locations and full Cause on completed spans; retain those exact guarantees. Config default logging and caller-provided logger/tracer layers remain. Browser connected session creation keeps its existing session-owned telemetry collector/layer; a core config without a telemetry consumer simply uses ordinary Effect diagnostics.
2. Keep invocation collectors created inside makeRpcEnvelope and Studio HTTP admission. They collect only that invocation's completed spans/logs/links and flush at its end. Concurrent requests never share arrays. Existing browser session telemetry is deliberately session-owned inspector history, clearable by the user; it is not an RPC collector to flush on every method. Do not silently clear that history or introduce arbitrary record caps during this ownership refactor.
3. Define trace ID/span ID/link/context/link-record schema ownership once in logger, reusing current prefix and kind semantics. Provide one pure valid-context projection from the current Effect span, returning null for native non-Zerospin IDs. Use it in getApi and worker causal link construction. A malformed incoming trace context stays inert diagnostic data and yields no link; it must not invalidate otherwise valid domain args, broaden public authorizations or create fake ancestry. rpcRequestSchema continues validating only args, with transport context handled internally.
4. Define the generic internal telemetry envelope and linked result envelope schemas next to logger's wire types. `readRpcEnvelope` and getApi consume those schemas while preserving their distinct error policy: internal malformed envelope is rpc-envelope-invalid; linked gateway malformed response is rpc-invalid-response with sanitized endpoint/method context. Error payloads follow the current shared error JSON codec and public domain scope semantics; success remains Schema.Unknown until the actual method/SDK success decoder. This schema consolidation must not duplicate domain input/output validation or normalize authored payload bytes.
5. Delete makeTraceableRpcTarget and its export after the verified no-caller check. Do not retain a deprecated adapter or move its permissive envelope guard to a new name. The supported native/HTTP boundaries remain worker makeRpcApi plus core getApi/readRpcEnvelope; makeRpcHandler likewise has no authored caller beyond its export and duplicates the supported worker request boundary; delete it and its export. Recheck exact imports before deleting, without keeping a compatibility API for conjectured consumers.
6. Extract causal-link construction from worker rpcMethod's outcome block into one substantial logger/worker-owned pure operation taking the settled persisted-root span and valid caller context. Only a successfully persisted root for this method yields a link. `persistApiTelemetry` continues returning a copied failure with backendLog only after persistence succeeds; persistence failure must not falsely advertise a log/link. Preserve its current best-effort diagnostic failure policy, domain outcome and callback order. Remote log writes stay outside domain SQL transactions.

The invocation/result parent remains short and preserves declared failures versus transport defects:

```ts
const executeRpcBoundary = Effect.fn(function* (
  request: unknown,
  invocation: IFunctionSpanSource | null,
) {
  const envelope = yield* runDeclaredRpcProgram(request, invocation);
  const settled = yield* persistDeclaredRpcTelemetry(envelope);
  const link = makePersistedRpcLink(
    settled.persisted,
    envelope.telemetry,
    methodName,
    readValidRequestTraceContext(request),
  );
  const result = convertDeclaredRpcOutcome(settled.result);
  return linked ? { result, link } : result;
});

const readRpcEnvelope = Effect.fn(function* (input: unknown) {
  const envelope = yield* decodeInternalRpcEnvelope(input);
  yield* mergeOptionalInvocationTelemetry(envelope.telemetry);
  return yield* envelope.result._tag === 'Failure'
    ? Effect.fail(envelope.result.failure)
    : Effect.succeed(envelope.result.success);
});
```

These are schematic valid generator bodies; generic success/failure inference must remain tied to the actual envelope methods, not widened to unknown in the public return. Keep small callback literals inline if named wrappers only forward values. The deleted machinery is the shared mutation tracer, unused proxy and repeated ancestry/envelope schema construction. Capture is not a new runtime registry or shared store.

Cause/lifetime rules: makeRpcEnvelope encodes only a sole typed failure; mixed/defect/interruption Causes retain the existing rejection/defect path. Current makeTx preserves full Cause after rollback, and telemetry must never convert its defect/interruption into a typed business refusal. Trace source/argument/result snapshot failures remain diagnostic markers rather than changing the wrapped exit. Error.extra is never mutated. Removing ErrorLayer's private extra.spans field is deliberate; backend diagnostics are completed telemetry records/backendLog and caller-owned logging. Exhaustive authored-source search found no extra.spans consumer. No compatibility error field or fallback tracer is retained.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/core/src/
    - utils/ErrorLayer.ts
    ~ system/make/makeConfig.ts
    ~ utils/getApi/getApi.ts
    ~ utils/readRpcEnvelope.ts
  packages/logger/src/
    + RpcTelemetrySchemas.ts
    + readValidTraceContext.ts
    ~ TelemetryBatchSchema.ts # reuse canonical record/ID schemas
    - makeRpcHandler.ts
    - makeTraceableRpcTarget.ts
    ~ index.ts
  packages/browser/src/makeBrowserSession/
    ~ createAggregateAgentBrowserSession.ts # remove ErrorLayer; Plan112 coordinates final owner path
  packages/system-worker/src/
    ~ makeRpcApi/makeRpcApi.ts
    + makeRpcApi/makePersistedRpcLink.ts
    ~ persistApiTelemetry/persistApiTelemetry.ts # only exact immutable outcome/root interface integration
```

Actual ErrorLayer consumers are makeConfig and createAggregateAgentBrowserSession. Generic getApi consumers include browser, CLI, Studio and examples; readRpcEnvelope serves internal worker/core/browser capabilities. The worker linked boundary and Studio backend error explorer continue using persisted log IDs. Public wire envelope discriminants, scoped failure data, invocation source annotations, backend link semantics and endpoint sanitization stay unchanged. No worker route, telemetry storage retention schema or public error category change is part of this plan.

Implementation order: settle canonical wire/context schemas; replace generic reader/ancestry duplication without changing domain decoding; isolate persisted-link creation; remove shared ErrorLayer and unused proxy/wiring; coordinate Plan107 and112 consumers; recheck exports/imports and actual error diagnostics; then run existing checks. No new tests/fixtures/runners/configuration are authorized.

Verification: `pnpm nx run-many -p core -t lib,lint,tsc:typecheck`, then `pnpm nx run-many -p @zerospin/logger,system-worker,browser,@zerospin/cli,@zerospin/studio -t lib,ts,lint` with actual project metadata/dependencies. Existing API/Studio error lookup and native session inspector flows provide cases: concurrent unrelated failures do not share spans, reused/frozen authored error remains unchanged, native Effect IDs produce no wire ancestry, valid prior context produces link only after persistence, malformed context is inert, invalid envelope retains each reader's code, typed refusal vs mixed Cause remain distinct, and snapshot/annotation failure cannot change a settled exit. Runtime cases were not run in review; there is no system-worker test target and no new runner may be created. Core and tooling type gates alone cannot prove concurrent capture or transport rejection behavior.

Postimplementation: remove ErrorLayer documentation references, update telemetry boundary/capture and immutable diagnostic ownership terms, and update the governing error/telemetry ADR where the private mutation model previously governed. Do not create a second ADR for schema extraction alone. Archive after all wire readers, config/browser consumers and required checks settle.

## Implementation progress — 2026-10-11

The approved ownership cutover is implemented in production source and its direct
consumers. Root coordination owns required Nx gates and plan archival.

Canonical trace/RPC boundary probes passed for valid/invalid native trace IDs, persisted ancestry and concurrent frozen error batches. Logger, worker, browser, CLI and Studio `lib`, `ts` and `lint` passed in `/tmp/zerospin-goal-quality-8.log`; the final worker lint task passed with zero source warnings. Package/module README changes are written. The actual Studio HTTP persistence checks below establish retained invocation records, and the existing headless client verifies returned gateway-link import. The controlled transport and persistence fault cases are verified below.

Fresh CLI `--clean` startup exposed telemetry persistence during bootstrap capability acquisition, before the accepted catalogue could authorize SystemLogRepo registration. `GatewayApi.getSystemApi` now explicitly uses the existing nonpersisted bootstrap policy, matching system-spec acceptance. It still captures the RPC outcome; ordinary admitted API methods retain persistence. Strict accepted-definition and failed activation gates are unchanged. The affected SystemWorker/dev-worker/production-worker/CLI library, TypeScript and lint graph passes all 24 tasks (`/tmp/zerospin-goal-bootstrap-telemetry-gates.log`). The existing actual CLI `--clean` fresh-start rerun accepts the system spec with POST200 and none of the prior uncaught diagnostics (`/tmp/zerospin-goal-cli-134-clean-fixed.log`); owned SIGINT shutdown releases its listener/config, and all original-backup files are unchanged. This verifies the bootstrap ordering repair, not the remaining end-to-end collector cases.

The existing `pnpm exec zerospin studio` command ran against the owned Shopping
backend on 3005 with `BROWSER=none` and the source-defined development credentials;
no browser journey, source change, build or fixture was used. Real SystemRepo and
SystemLogRepo registration GETs returned HTTP200. Two parallel-issued requests
for `telemetrySpans` and `telemetryLogs` on the actual SystemRepo returned the
expected `repo-explorer-table-not-found` refusal and distinct backend log IDs.
Both exact `/api/errors/<logId>` GETs returned HTTP200, with three finite completed
failed spans each. The concrete Repo span, `readRpcEnvelope` span and outer
SystemApi root were retained together; physical telemetry table GETs confirmed
both logs and every referenced span. Their failed-span sets were disjoint and
neither error record contained the other request's table name. The recorded
server-root intervals did not overlap, so this establishes isolation across
those requests without proving simultaneous server capture. The telemetryLinks
table returned zero rows. Studio flushes and discards its local request collector,
so these HTTP responses do not expose its imported gateway link or a persistence
failure. Evidence is in `/tmp/zerospin-goal-telemetry-138-observations.json`, the
matching `refusal-*`, `error-*` and `persisted-*` JSON/header captures, and
`/tmp/zerospin-goal-telemetry-138-studio.log`. Only the owned Studio PID47467 was
signaled; pnpm reported SIGINT and exited 1, and both that PID and its 5555 listener
were absent afterward. Backend shutdown remained with its independent owner.

One final bounded batch of eight parallel supported repo-table GETs established
actual overlapping capture after the same verified backend store reopened.
The requests used each real Repo's table names on the other real Repo kind;
all eight returned the declared table refusal with distinct backend log IDs.
Every exact error lookup returned HTTP200 with three finite failed spans. Seven
SystemApi roots shared the strict interval `1791734865340–1791734865344`, yielding
21 overlapping invocation pairs. All 24 failed-span IDs were disjoint; all eight
root IDs, concrete Repo span IDs and caller trace-context tuples were distinct.
Each retained failure and its root/concrete arguments kept its own requested
table, and every retained log's failed-span references matched its returned spans.
This proves unrelated overlapping invocations keep their imported Repo spans
and persisted failures separate. The batch was run once, with no forced faults,
new fixture, source change or build. Evidence is in
`/tmp/zerospin-goal-telemetry-138-batch-observations.json` and matching
`batch-*`/`batch-error-*` JSON/header files. Owned Studio PID48816 received SIGINT;
pnpm exited 1, the PID and 5555 listener were absent, and
`/tmp/zerospin-goal-telemetry-138-studio-batch.log` records its startup/termination.
Backend shutdown remained under the root/independent-owner coordination barrier.

The existing built `getApi` client and `makeRpcEnvelope` invocation collector then
ran an ordinary `SystemApi.getBackendError` read against the independently owned
Shopping backend on 3005. The real retained log
`lgr_668bc7fe0a7e9180` returned its three failed spans. The collector contained
exactly one completed local caller span and one imported `causedBy` gateway link,
`lnk_0126a9c759b88b26`. Its prior context exactly matched the actual caller
`trc_879d4602875bd35b0e22abffcbd6ece2` / `spn_eba638cdb611db89`.
An ordinary `SystemApi.getRepoTableRows` read of the actual SystemLogRepo's
`telemetrySpans` found the advertised server root
`trc_ac557d906b4a39afc875a80cd0c3d3b6` / `spn_f8f90094b2bbd703`:
`SystemApi.getBackendError`, null parent, status `ok`, and finite interval
`1791736626884–1791736626886`. That persisted root's request arguments retained
the exact caller context and real lookup log ID. The inline client invocation
exited 0 after those assertions, proving observable returned-link import and
ancestry to a successfully persisted method root. It used existing production
modules and ordinary public reads, with no new file, harness, declaration,
binding, fault, source change, configuration or build. No client runtime was left
running; the independent backend owner retained shutdown responsibility.

The direct production `readRpcEnvelope` boundary was also exercised with the
actual Studio HTTP refusal captured by
[Plan136](136-plan-studio-repo-query-ownership.md). That genuine public
`Failure`/`studio-request-invalid` response is not an internal
`result`/`telemetry` envelope. The existing reader returned a sole typed
`rpc-envelope-invalid` failure, imported zero spans/logs/links into the production
collector and left the original response unchanged. The inline invocation
exited 0; evidence is
`/tmp/zerospin-goal-telemetry-138-real-foreign-wire.log`. This uses a retained real
HTTP response and existing production modules, with no fabricated wire, server,
fixture, runner file, source change or build. It establishes direct internal
reader rejection/no-import policy; it does not establish malformed internal
transport delivery or the linked gateway reader's malformed-response policy.

### Authorized persistence and transport fault checks — 2026-10-11

Disposable `/tmp` verification exercised the production persistence/link, envelope, capture and linked-reader boundaries. A frozen authored domain failure and retained real root survived both typed and defect persistence failures unchanged: neither a backend log reference nor an advertised link was returned. Successful persistence created a diagnostic copy without mutating the authored failure; a root belonging to another method advertised no link. A typed failure combined with a cleanup defect retained both original reason identities in the complete rejected Cause; interruption remained outside the business-envelope path. A diagnostic snapshot accessor failure did not change an already settled program success.

A real ephemeral capnweb HTTP server then delivered a malformed linked envelope to production `getApi`. The caller received sole typed `rpc-invalid-response` with response-phase/sanitized endpoint details and imported no telemetry. A real mixed-Cause server rejection remained a transport defect and imported no telemetry. A subsequent valid response succeeded and imported exactly one valid link. This complements the genuine Studio persistence/concurrent capture, caller ancestry, internal reader code and frozen/canonical boundary checks above. The runner joined with exit0 and released its ephemeral HTTP listener; evidence is `/tmp/zerospin-framework-goal-tooling-138-telemetry.log`. Controlled fault responses were confined to `/tmp`; no production storage, server declaration or repository test/configuration was modified.

## Remaining work

None.
