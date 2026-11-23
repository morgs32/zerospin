# Zerospin telemetry

Completed spans and logs retain the named span hierarchy and full failed Causes
without mutating authored errors. `makeFn` delegates function tracing and stack
diagnostics to Effect v4. RPC envelope collection is
invocation-owned; unrelated concurrent calls do not share collector arrays.
Browser session inspectors deliberately retain clearable session-owned history.

Production and ordinary tests do not automatically record function arguments or
results. Diagnostic test runs select the bounded argument/result/exit annotator:

```sh
pnpm nx run zerospin:test -- --mode profile \
  packages/system-worker/tests/native-system-api/native-system-api.workerd.spec.ts
```

The private `#function-span-annotation` alias selects that annotator only with the
`zerospin-profile` condition; its default implementation is Effect's `identity`.
Diagnostic snapshots redact raw RPC transport requests through Effect `Redacted`
and mask sensitive properties and returned WebSocket `ticket` fields. Source
diagnostics come from Effect's failure stacks; `makeFn` adds no custom authored
definition/invocation file, line, or column snapshots.

[`makeTelemetryLayer`](./src/makeTelemetryLayer.ts) installs the one Effect v4
application tracer. [`captureTelemetry`](./src/captureTelemetry.ts) records the
complete execution Exit and returns local inspection history together with the
records produced by that execution. The collector's `merge` imports remote
history for inspection; `flushOwn` drains only source-owned records, while
`flush` drains the complete local snapshot. Imported batches do not become new
source records. Profiles and Devtools keep the complete captured hierarchy even
when hosted export is disabled or sampled out.

`TraceContextSchema` owns canonical trace/span identifiers, caller ancestry and
causal links. Native Effect IDs and malformed incoming context project to null
and cannot create wire ancestry. `RpcTelemetrySchemas` owns internal telemetry
and linked result envelopes; method success validation stays with its API/SDK.
An actual method root and valid caller context establish a causal link
independently of hosted delivery. Invalid context remains inert. Local and wire
IDs are nonzero hexadecimal identities with `trc_` and `spn_` prefixes. The
Worker's [OTLP converter](../system-worker/src/exportTelemetryBatch/makeOtlpTelemetryBatch.ts)
removes only those prefixes for spans, parents, logs, links and backend references.
It preserves captured names, structured JSON attributes, failed Causes and
millisecond timestamps; current record formats export application spans as
INTERNAL and Effect log records as logs.

Diagnostic graph presentation belongs to DevTools. Logger keeps capture and wire
validation; it does not keep another in-memory trace store or tree renderer.
Optional [Worker export](../system-worker/src/exportTelemetryBatch/exportTelemetryBatch.ts)
uses Effect's OTLP serialization, exporter and fetch client on completed records,
without installing a second live tracer. Its bounded resources belong to the
execution producing the records. Export failures preserve the domain Exit,
and an export response makes no provider persistence or indexing promise.
Diagnostic SQL and mandatory admission auditing are removed under
[ADR 017](../../wiki/adrs/017-admission-without-durable-audit.md). Optional delivery
does not replace permanent acknowledged audit retention.
Cloudflare-native observability is independently configured platform visibility,
with no promised joined native/Effect tree.
