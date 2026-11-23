# Build diagnostic trace presentation once from retained telemetry

Status: Implemented and verified in the approved goal on 2026-10-11.

The [session logs route](../../../packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsRoute.tsx) performs grouping, ordering, trace/span selection, timing and orphan attachment before rendering a large waterfall/details UI. [buildTraceTree](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/logger/src/TraceStore.ts) repeats span scans recursively, while [renderTraceDag](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/logger/src/renderTraceDag.ts) builds its own adjacency/index/order and traversal addresses. The exported in-memory TraceStore has no authored consumer. Current authored-source search also finds no renderTraceDag consumer or surviving snapshot caller. Delete that unused renderer rather than inventing a second consumer for a shared abstraction. The clearer model is one pure browser diagnostic presentation with local graph procedures and no second telemetry store.

1. A local `buildBrowserTraceGraph` procedure consumes completed records and builds exact trace/span lookup, parent adjacency, sorted root/child order and attached logs once. Use compareSpanStarts for start/invocation ordering and stable input position as the final tie breaker. Parent membership requires the same trace, not merely a matching spanId. Keep missing parents as roots. Record identities/order/timestamps stay unchanged; this is display data only.
2. Guarantee finite traversal for malformed diagnostic relationships. Parent cycles, cross-trace parents and duplicate record identities cannot make the pane hang or disappear silently. Treat invalid parent relationships as visible detached roots and retain conflicting duplicate records as explicit diagnostic data; exact duplicate records may coalesce by stable identity. Preserve all unique retained records. Specify these invalid-graph diagnostics in the implementation rather than changing TelemetryBatchSchema into a domain refusal. No new durable schema or telemetry interpretation that influences command authority is introduced.
3. `makeBrowserTracePresentation` owns the existing browser-specific semantics: trace rows are ordered by earliest local span start, falling back to logs only when a trace has no spans; null timestamps sort after timed traces. Requested existing trace wins, otherwise newest trace. Unscoped logs remain separate. Server boundary links group through priorTraceId/priorSpanId; server spans remain external destinations and are never fabricated as a local browser tree. Logs and links whose span is unavailable remain visible under Unattached.
4. The presentation returns selected trace, one timing range, span lookup, roots, attached details and diagnostic orphans. Select the requested retained span or current root fallback through a small pure selection procedure. UI owns only requested trace/span selection, clear operation and rendering. It does not rebuild the graph or scan for details on every child. Reuse a single trace-wide waterfall axis and minimum visible instant-span bars.
5. Split meaningful rendering responsibilities into trace list, waterfall, span details and diagnostic records. Keep existing aggregate/service adapters subscribing to the original session-owned telemetry values and their clear callbacks. Reuse one diagnostic log/link renderer for span and unattached sections. Do not add a new generic session store or broaden service inspector callbacks. Existing accessibility/data-testid hooks remain.
6. Delete the unused renderTraceDag, makeTraceStore/ITraceStore and old buildTraceTree implementation/exports after adapting the one real logs-route caller. Current source contains no snapshot consumer; a historical snapshot comment does not justify keeping an inactive public utility. Relocate the honest ISpanTreeNode shape with the DevTools presentation and adapt SessionsLogsSpanNode's type import. Do not retain compatibility wrappers or add a generic logger graph/store API for this one UI consumer.

The pure parent shapes are schematic valid TypeScript; record grouping and graph validation are cohesive procedures, not an arbitrary transformation pipeline:

```ts
function makeBrowserTracePresentation(batch: ITelemetryBatch, request: TraceSelection) {
  const graph = buildBrowserTraceGraph(batch);
  const traces = orderBrowserTraceRows(graph, batch.links);
  const trace = selectBrowserTrace(traces, request.traceId);
  const view = bindBrowserTraceDiagnostics(graph, trace, batch.links);
  const span = selectRetainedTraceSpan(view, request.spanId);
  return { traces, view, span, unscopedLogs: graph.unscopedLogs };
}

function SessionsLogsRouteBody({ telemetry, onClear }: SessionLogsProps) {
  const selection = useTraceSelection();
  const presentation = useMemo(() => makeBrowserTracePresentation(telemetry, selection),
    [telemetry, selection.traceId, selection.spanId]);
  return <SessionTraceInspector presentation={presentation} onSelect={selection.select}
    onClear={onClear} />;
}
```

The second snippet is TSX in the implementation; it is a render composition, not an Effect generator. No callbacks execute during pure graph construction. No SQL/native RPC, lifecycle registry or mutable cache is created; memoization may be dropped safely without changing behavior. Do not mutate batches or Cause/error objects. Capture ordering, source-mapped invocation/definition attributes, full failed-Cause snapshots and persisted backend links remain owned by existing capture138 and server storage.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/logger/src/
    - TraceStore.ts
    - renderTraceDag.ts
    ~ index.ts
  packages/devtools/src/sessions/sessions/sessionId/logs/
    ~ SessionsLogsRoute.tsx
    ~ SessionsLogsSpanNode.tsx
    + makeBrowserTracePresentation.ts
    + SessionTraceInspector.tsx
    + TraceList.tsx
    + TraceSpanDetails.tsx
    + TraceDiagnosticRecords.tsx
```

The real consumer is DevTools session logs. Exhaustive authored-source search finds no makeTraceStore or renderTraceDag consumer; the only buildTraceTree consumer is this logs route. Recheck source imports at implementation and delete unused public exports outright, rather than preserving a conjectured historical consumer. Deliberate behavioral changes are finite visible handling of invalid relationships/conflicting records and removing unused in-memory storage; ordinary trace ordering, missing-parent visibility, orphan records and external links stay unchanged.

Implementation order: settle local graph invariants/types; build one graph/index/order and finite traversal; build browser presentation and small render owners; delete old store/tree/index exports; inspect actual telemetry subscribers and attributes; then run existing checks. Do not add tests, fixtures, runners or configuration.

Verification: current logger/devtools/browser gates are lib,ts,lint. Run `pnpm nx run-many -p @zerospin/logger,@zerospin/devtools,browser -t lib,ts,lint`. The actual permitted DevTools host UI and existing session telemetry store are the behavioral seams; no logger snapshot caller or current logger test target was found. Required cases are tied timestamps with invocation order, missing/cross-trace/cyclic parents, log-only/link-only traces, requested trace/span fallback, unattached/unscoped records, external server links and clear followed by new telemetry. No current Studio stories directory exists; do not invent a story or claim build-storybook demonstrates these behaviors. Runtime cases were not executed during review; source gates alone do not establish presentation. Preserve actual existing supporting UI fixtures.

Postimplementation: update diagnostic presentation source comments and README; remove unused TraceStore documentation. No ADR is required for presentation extraction. Document graph anomaly visibility if it becomes a lasting telemetry interpretation term. Archive after actual consumers, dead exports and checks settle.

## Implementation progress — 2026-10-11

The approved ownership cutover is implemented in production source and its direct
consumers. Root coordination owns required Nx gates and plan archival.

Finite pure-presentation probes passed for cycles/orphans/conflicting IDs, stable order, unchanged inputs and removed selected spans. DevTools `lib`, `ts` and `lint` passed in `/tmp/zerospin-goal-quality-8.log`. Package/module README changes are written. Mounted trace replacement, clear, selection disposal and unmount are verified in the authorized controlled checks below.

The deleted `TraceStore` and `renderTraceDag` files and exports have no surviving authored consumer: source/package searches for `renderTraceDag`, `makeTraceStore`, `buildTraceTree`, `ITraceStore`, `DAGRenderer` and `d3-dag` return no matches. The current [logs route](../../../packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsRoute.tsx), [trace inspector](../../../packages/devtools/src/sessions/sessions/sessionId/logs/SessionTraceInspector.tsx), row/details/diagnostic components and presentation install no `ResizeObserver`, `IntersectionObserver` or native event listener. There is therefore no surviving trace viewport owner to exercise or release. This is removed-owner source proof, not mounted UI evidence. Popup, keyboard and drag listeners belong to the shell under [Plan135](135-plan-devtools-mounted-owners.md); its mounted cleanup checks remain required.

An additional headless integration used the actual retained error responses from
[Plan138](138-plan-telemetry-capture-ownership.md), decoded with the production
`BackendErrorSchema` and collected through `makeTelemetryCollector`. The first
real invocation (`lgr_e7c1fa952bbecc60`) produced three spans across two finite
traces and one log. `makeBrowserTracePresentation` retained its requested actual
SystemApi root, attached the log to that root and retained `readRpcEnvelope` as
its child. The collector's next empty flush produced zero traces and null
trace/span selections. Collecting the second actual invocation
(`lgr_b567e2246c312adc`) while requesting the former selection produced a valid
fallback within the replacement records, with no former trace or span retained.
The first returned batch and both source response files remained byte-identical.
The inline invocation exited 0; evidence is
`/tmp/zerospin-goal-trace-137-retained-clear.log`. It used existing built modules
and retained real records, without a DOM, authored telemetry, fixture, runner
file, source change or build. This proves production collector/pure-presentation
clear and replacement behavior; it does not exercise the mounted session store,
React selection disposal or unmount.

A genuine `SystemApi.getRepoRegistrations` read against the existing TicTacToe
backend then exercised external-link presentation with newly captured production
records. `makeRpcEnvelope` retained one completed local caller span and the
returned `causedBy` link `lnk_4791ee12a76ae29c`.
`makeBrowserTracePresentation` attached that link to its exact local caller
`trc_dbb551d501ede19cae06c31faf6d0991` / `spn_e4068677a767113f`, with no unattached
link and without inventing a local copy of the external server span. An ordinary
registered SystemLogRepo table read found the advertised successful server root
`trc_1cdaa7e1561c4f27cb804d03ba3af8f9` / `spn_6235f6ba988fd265`, with matching
caller context. The inline invocation exited 0; evidence is
`/tmp/zerospin-goal-trace-137-live-server-link.log`. These were ordinary public
reads using the existing invocation collector and presentation, with no authored
telemetry, DOM, fixture, runner file, source change or build. External-link graph
attachment is verified; mounted link rendering remains unrun.

### Authorized mounted trace checks — 2026-10-11

The actual production `SessionsLogsRoute` and inspector were mounted with installed ReactDOM19/Happy DOM, MemoryRouter and the original session-store subscription boundary using the retained real Plan138 telemetry. Exactly one telemetry subscription was installed. Selecting a retained span, replacing the batch with another real invocation and retaining the former requested selection produced a valid new fallback with no former span/trace displayed. Public Clear reset the original telemetry store and trace/span/query selection; collecting new telemetry rendered the new records. Unmount removed the exact store subscription, and later telemetry could not render. The original retained batch remained unchanged.

Finite presentation checks additionally used actual retained record identities with controlled cyclic/cross-trace parent relationships, missing selection, and log-only/link-only external records; all remained visible and finite. These complement the prior stable-order/timestamp/conflicting-record probes and genuine persisted external-link proof. The runner joined with exit0; evidence is `/tmp/zerospin-framework-goal-tooling-137-mounted.log`. No trace viewport listener exists to verify; the shell's separate popup/drag/keyboard ownership is checked by Plan135. These are production mounted component checks, without an actual Chrome DevTools UI claim or a new repository telemetry store.

## Remaining work

None.
