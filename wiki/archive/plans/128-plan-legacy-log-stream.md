# Remove the unconnected second system log stream

Status: Implemented and verified in the approved goal on 2026-10-11.

The active backend telemetry model stores telemetrySpans/telemetryLogs/telemetryLinks and supports getBackendError plus admissionAttempts. A separate `logs` table and SystemLogAgent have no producer: exhaustive rg finds appendLogRow and pushLogRows only in their declarations/wrappers. getSystemLogRows is called only by SystemLogAgent.onStart. There is no browser/Studio/CLI consumer for `/ws-system-logs`. Worker entrypoints forward `/ws-system-logs/<segment>` while SystemRepo accepts only literal `/ws-system-logs`, so the old route cannot reach its Agent through the authored worker path. Repairing its routes would create a second telemetry feature; deleting it makes ownership obvious.

Source: [Agent](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/SystemLogAgent/SystemLogAgent.ts), [old append](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/SystemLogRepo/appendLogRow/appendLogRow.ts), [old tables](../../../packages/system-worker/src/SystemLogRepo/systemLogRepoDbConfig.ts), [SystemRepo route](../../../packages/system-worker/src/SystemRepo/handleFetch/handleFetch.ts), [production route](../../../packages/production-worker/src/ProductionWorker.ts), [dev route](../../../packages/dev-worker/src/DevWorker.ts).

1. Delete SystemLogAgent and its start/live-tail/readonly procedures. Delete SystemLogRepo.appendLogRow/getSystemLogRows wrappers and implementations and the `logs` table. Remove obsolete ISystemLogRow/ISystemLogState/ISystemLogLevel core types only when all actual references disappear. Preserve admissionAttempts and active telemetry tables/methods, SystemLogRepo identity, API telemetry persistence and backend error lookup.
2. Remove SystemLogAgent exports, namespace binding/types and deployed binding/migration declaration, generated worker-type references regenerated through existing targets, and unreachable `/ws-system-logs` forwarding branches. Existing session socket routing/tickets remain governed by their separate plan. Do not introduce a replacement socket or log-table adapter.
3. Remove only old log-specific abbreviations/types after exhaustive caller checks. Logger's telemetry log IDs/source/payload remain unchanged. Historical archived docs and graft generated summaries are not runtime callers; do not preserve dead code to satisfy them.

The resulting SystemRepo HTTP parent has only admitted session sockets:

```ts
const handleFetch = Effect.fn(function* (request: Request) {
  const route = yield* decodeSessionSocketRoute(request);
  const admission = yield* consumeSessionSocketAdmission(request, route);
  return yield* forwardAdmittedSessionSocket(request, admission);
});
```

This shape integrates the ticket plan if approved; without that plan, keep the two current session branches and simply remove the log branch. Do not force an unrelated ticket refactor as a dependency. Worker fetch retains native session upgrade checks and Gateway RPC fallback. A request to the removed log route receives ordinary unsupported-route/RPC behavior; no undocumented compatibility route is retained. This intentional hard removal is the sole observable change to an unreachable/unproduced feature.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/
    - SystemLogAgent/ # delete entire authored module (4 files)
    - SystemLogRepo/appendLogRow/appendLogRow.ts
    - SystemLogRepo/getSystemLogRows/getSystemLogRows.ts
    ~ SystemLogRepo/SystemLogRepo.ts
    ~ SystemLogRepo/systemLogRepoDbConfig.ts # modify remove logs
    ~ SystemRepo/handleFetch/handleFetch.ts
    ~ makeFixedDORepo/makeFixedDORepo.ts # modify remove namespace
    ~ index.ts
  ~ packages/system-worker/wrangler.jsonc # modify binding/class declaration
  ~ packages/core/src/system/types.ts # modify unused old types
  packages/dev-worker/src/
    ~ DevWorker.ts # modify export/route
    ~ makeWranglerConfig.ts # modify binding list
    ~ cloudflare-workers.d.ts # regenerate existing types target
  packages/production-worker/src/
    ~ ProductionWorker.ts # modify export/route
    ~ cloudflare-workers.d.ts # regenerate existing types target
```

No SQL transaction algorithm or active telemetry lifetime changes. The obsolete table is removed under the fixed-storage empty-storage cutover policy; no translation migration or pruning copy. SystemLogRepo bootstrap/registration continues for active telemetry/admission audit, and its existing atomic telemetry batch/retention remains untouched.

Implementation order: rerun exhaustive rg over first-party packages/examples for all old symbols/routes; confirm no new concurrent WIP callers; delete old module/table/API; trim namespace/binding/export/type declarations; regenerate only relevant existing worker types; scope docs/citations; run gates against fresh storage. Generated graft output need not be hand-maintained unless its existing generator is part of the approved review tooling scope.

Verification: current system-worker targets `lib`, `ts`, `lint`; obtain worker metadata with `pnpm nx show project @zerospin/dev-worker --json` and production equivalent and run their existing relevant gates including generated types. Core `lib,lint,tsc:typecheck` covers removed exported types. Static rg must leave no runtime binding/old-route/old-type references. Existing SystemApi backend-error and actor admission flows establish live telemetry/audit still persist; native aggregate/service sockets establish socket routes still forward. Runtime checks are unrun during review; no tests/fixtures/runners/config may be added. Deploy config edits described here are intentional feature removal, not new runner configuration.

Postimplementation: remove obsolete log live-tail glossary/workflow citations, preserve active telemetry docs and governing ADR. An ADR is unnecessary for deleting code with no producer/consumer unless a governing ADR explicitly promises this feature, in which case mark it superseded by the active telemetry design. Archive after binding/type cleanup and verification.

## Implementation progress — 2026-10-11

Dead SystemLogAgent, legacy log rows, append/read APIs, socket messages/routes and bindings are deleted. Active telemetry persistence and admission audits remain owned by SystemLogRepo. No undocumented log socket was restored. Worker library compilation passes; telemetry/dispatch integration remains required.

### Verified existing runtime workflows — 2026-10-11

Aggregate session socket forwarding passed on the two retained-storage native warm launches, including a terminate/relaunch of the same installed app and retained database files. The observed backend POST200/WebSocket101 is corroborated by HTTP200/101 responses in `/tmp/zerospin-goal-native-114-fixed-reopen-host.log` and `/tmp/zerospin-goal-native-114-fixed-second-reopen-host.log`; the corresponding screenshots show the host online. This establishes aggregate forwarding.

The actual Studio HTTP broker and Shopping backend passed retained backend-error lookup and physical telemetry inspection. Eight typed unavailable-table failures have distinct durable log IDs and disjoint completed spans; seven server roots overlap for a strict four-millisecond interval. Exact `/api/errors/<logId>` lookups return all eight failures. The raw observations are in `/tmp/zerospin-goal-telemetry-138-batch-observations.json`; [Plan138](138-plan-telemetry-capture-ownership.md) records the complete bounds. Active telemetry/backend-error persistence is verified.

The administrative Shopping seed establishes successful command admission and result journals, but does not invoke actor authentication's `auditAdmission`. Read-only inspection after shutdown found zero rows in its physical `admissionAttempts` table. Command journal retention does not establish actor-admission audit persistence.

Actor-admission audit persistence is now verified through the actual existing native TicTacToe app. Its cold start and warm reopen retain five distinct completed `succeeded` records matching the app-generated aggregate/instance claims, exact selection and actorPath, with failure null and every claimsHash equal to the retained canonical claims JSON's SHA256. Actual backend requests return POST200 and two aggregate WebSocket101 connections. Evidence: `/tmp/zerospin-goal-native-110-smoke-first-data.json`, `/tmp/zerospin-goal-native-110-smoke-reopen-data.json` and `/tmp/zerospin-goal-native-110-smoke-backend.log`. Owned app, simulator and backend resources are cleaned up; protected user storage and devices remain unchanged.

### Final source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Authorized isolated service forwarding — 2026-10-11

The human authorized disposable `/tmp` verification fixtures. Actual production factories declare a claims-bearing service actor and canonical session lock in an isolated Workerd system with fresh storage. The public Gateway authenticates the fixture credentials, authorizes the exact service lock and returns the selected two-model snapshot at serviceIndex1. Its genuine ticket receives HTTP401 on the wrong aggregate family without spending it, then HTTP101 on the service route, followed by the exact retained replay-complete index/hash and private outcome0. Closing that connection and reusing the ticket returns HTTP401. This exercises SystemRepo forwarding into ServiceActorVersionChain; it does not claim Shopping or Clerk authentication. The owned fixture logs are `/tmp/zerospin-framework-goal-server-qvh4z87h/service-ticket.log` and `service-socket.log`, both runner exit0. Together with the existing aggregate forwarding, admission audit, telemetry and removed-route/type checks above, all required verification passes.

## Remaining work

None.
