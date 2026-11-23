# Simpler system-worker verifications

**Research snapshot:** 2026-10-22. The original primary-source research and
source inspection ran no upstream or Zerospin runtime checks. Its local fixture
observations are historical. Subsequent implementation uses the direct
[Workers suite](../../packages/system-worker/tests/README.md), with fixture removal and verified completion recorded in [Plan 257](../archive/plans/257-plan-direct-system-worker-verifications.md).
Historical research observations below are not current passing-test evidence.

**Historical working inference:** put runtime ownership behind one small host, keep actual
Durable Object methods visible, and name the exact durable transition each
scenario proves. Removing a test-only HTTP protocol is a larger simplification
than putting helper names around its URLs.

**Refined direction after the concrete interface comparison:** Cloudflare's
Vitest integration is itself the runtime host to evaluate first. The upstream
examples below use ordinary stubs and stock `cloudflare:test` controls. A new
facade of inspection, publication, fault, and restart methods would add another
interface to learn. Prefer direct methods, `runInDurableObject` for inspection,
and the standard alarm/eviction helpers. The former Node/Miniflare arrangement
did not provide those in-runtime test callbacks automatically. The current
[Vitest configuration](../../vitest.workerd.config.mts) supplies that runtime.
Local spy-based lost-reply injection applies the documented inspection/spy
facility; it was not a lost-publication-reply example found in the upstream suites.
[Official test controls](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/#durable-objects),
[PartyServer test configuration](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/partyserver/src/tests/vitest.config.ts),
[Agents direct RPC](https://github.com/cloudflare/agents/blob/cbf047d020ba7470517e82822765e5f2057cca57/packages/agents/src/tests/native-rpc-initialization.test.ts#L15-L28).

## What the local source suggests

`makeSystemHarness` earns its small interface: `push`, `flush`, and `query` use
ordinary authored commands and query selections, while the harness owns lazy
owner/release databases, synchronous execution transactions, pending work, and
scoped disposal. Its Shopping caller reads as application behavior because it
does not repeat storage or execution setup.
[Interface](/Users/morgs32/GitHub/zerospin/packages/core/src/testing/systemHarness/types.ts:96),
[execution and progress](/Users/morgs32/GitHub/zerospin/packages/core/src/testing/systemHarness/makeSystemHarness.ts:156),
[database lifetime](/Users/morgs32/GitHub/zerospin/packages/core/src/testing/systemHarness/openHarnessDb.ts:16),
[Shopping caller](/Users/morgs32/GitHub/zerospin/examples/shopping/tests/system.spec.ts:19).

The transferable idea is **own the machinery once; keep actions and evidence
visible**. The same three verbs would not describe system-worker's promises:
the authored harness retains command results in Maps and has no distributed
runtime. System-worker must distinguish admitted command retention, execution
commit, receiver commit, dispatch acknowledgement, and retained `outcome`.
[Harness scope](/Users/morgs32/GitHub/zerospin/packages/core/src/testing/systemHarness/makeSystemHarness.ts:51),
[in-memory results](/Users/morgs32/GitHub/zerospin/packages/core/src/testing/systemHarness/makeHarnessExecutor.ts:76),
[direct delivery evidence](../../packages/system-worker/tests/chain-command-delivery/chain-command-delivery.workerd.spec.ts).

The retired `agent-runtime.spec.ts` and `agentRuntimeWorker.ts` fixtures exposed
three concrete reader burdens at the research snapshot. Current direct examples
show the resulting simplifications:

| Historical reader burden                                                                                                                                     | Direct approach                                                                                                          | Current source                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request<A>` plus a URL, operation string, JSON body and caller-selected return type routed through a second test protocol.                                  | Obtain typed Durable Object stubs and call production methods; inspect their Drizzle tables inside `runInDurableObject`. | [Command delivery](../../packages/system-worker/tests/chain-command-delivery/chain-command-delivery.workerd.spec.ts)                                                                                                                                           |
| `options(1, false, 2)` and `setOptions` encoded reconstruction through whole-Worker configuration changes.                                                   | Evict the named Durable Object, reacquire its stub and compare retained rows before retry.                               | [Publication reply loss](../../packages/system-worker/tests/service-publication/service-publication.workerd.spec.ts), [Agent rebinding](../../packages/system-worker/tests/agent-node-service/agent-node-service.workerd.spec.ts)                              |
| A long scenario mixed retention, publication, reply loss, reconstruction and replay; `repo-names.spec.ts` also held connection and external-operation cases. | Keep subject-named suites with the relevant durable facts visible.                                                       | [Actor connections](../../packages/system-worker/tests/service-actor-connections/service-actor-connections.workerd.spec.ts), [external settlement](../../packages/system-worker/tests/service-external-settlement/service-external-settlement.workerd.spec.ts) |

**Concrete current scenario:** “ServiceVersionRepo keeps pending output when
ServiceVersionChain commits but its reply is lost.”

1. Execute an admitted command and capture its complete evaluated command.
2. Lose the reply after the real `ServiceVersionChain.appendEvaluatedCommands`
   commits. Assert that ServiceVersionChain retained the evaluated command and
   ServiceVersionRepo still owns the same pending output.
3. Evict ServiceVersionRepo, reacquire its stub and retry publication.
4. Assert that receiver acknowledgement removes the pending delivery row,
   while the retained evaluated command remains identical and evaluation was not
   repeated.

The [direct publication case](../../packages/system-worker/tests/service-publication/service-publication.workerd.spec.ts)
expresses that sequence with native stubs, a prototype spy and direct Drizzle
reads. The [projection cases](../../packages/system-worker/tests/service-projections/service-projections.workerd.spec.ts)
use the same standard controls at the selected-history publication boundary.
No additional fault or inspection interface is needed.

The historical fixture bundled an entry module and resolved `config` to one
shared authored configuration module, because declarations contain executable
programs. [Plan 260](../archive/plans/260-plan-per-file-workerd-systems.md) replaces that
shared application with behavior folders. The
[Vitest configuration](../../vitest.workerd.config.mts) creates a separate
`workerd/<behavior>` project for each `.workerd.spec.ts`, with an exact spec
include and a `config` alias pointing to the sibling `system.ts`. Each System
composes only the declarations its spec requires. The
[production Worker entry](../../packages/system-worker/src/index.ts) exports the
actual Durable Object classes; no duplicate test entry is needed.

Reusable [authored declarations](../../packages/system-worker/tests/declarations)
remain ordinary definitions, with one concrete version per file and direct
imports. Scenario-specific declarations and resettable controls stay beside
their owning spec. Node and Workerd discovery are recursive and mutually
exclusive; the [test guide](../../packages/system-worker/tests/README.md)
documents file and project filtering through Nx. These wiring descriptions do
not establish runtime passing evidence; Plan 260 records its implementation
and verification status.

The old fixtures also overrode `onDOActivation` with `Effect.void`. Their explicit
recovery calls established only that explicit path. Current lifecycle evidence
belongs to the actual production classes and standard runtime controls in
[repo-lifecycle.workerd.spec.ts](../../packages/system-worker/tests/repo-lifecycle/repo-lifecycle.workerd.spec.ts)
and the subject-specific suites. A claim about automatic activation, explicit
alarm dispatch or forced eviction must still name the exact seam exercised.

These observations preserve the original research's motivation. The original
research itself changed no production code, tests, fixtures, runners or
configuration; the later migration and its checks belong to
[Plan 257](../archive/plans/257-plan-direct-system-worker-verifications.md).

## Upstream techniques worth borrowing

### PartyServer: use the actual runtime interface directly

PartyServer now lives in `cloudflare/partykit`. Its core suite calls the real
`worker.fetch(request, env, ctx)`, takes named Durable Object stubs from bindings,
and uses ordinary Vitest assertions. One focused check uses
`runInDurableObject` solely to inspect `ctx.getWebSockets().length`; other checks
call native RPC such as `stub.readStoredName()` directly. There is no requirement
that every assertion pass through a bespoke scenario language.
[Core tests](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/partyserver/src/tests/index.test.ts#L43-L92),
[native RPC and alarm](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/partyserver/src/tests/index.test.ts#L780-L803).

The alarm check holds one stub throughout setup, explicit alarm execution, and
inspection. `runDurableObjectAlarm(stub)` replaces wall-clock waiting. Its
configuration delegates runtime setup to Cloudflare's Vitest integration and
Wrangler configuration.
[Alarm check](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/partyserver/src/tests/index.test.ts#L739-L767),
[configuration](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/partyserver/src/tests/vitest.config.ts).

**Limit:** this is useful prior art, not a uniformly minimal suite. The same file
still contains test-specific HTTP setup routes and repeated WebSocket plumbing.
Borrow direct calls and explicit lifecycle control; copying its fixture whole
would preserve some of the complexity we want to remove.
[Examples of both](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/partyserver/src/tests/index.test.ts#L53-L70),
[HTTP alarm setup](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/partyserver/src/tests/index.test.ts#L746-L754).

### Cloudflare Agents: separate method behavior from recovery evidence

Agents' native RPC suite creates a named stub, calls `applicationRpc()`, and
asserts a small descriptive object. The concurrency case calls the same RPC
twice and checks that startup happened once. It does not require JSON operation
routing to reach the application method.
[Native RPC initialization](https://github.com/cloudflare/agents/blob/cbf047d020ba7470517e82822765e5f2057cca57/packages/agents/src/tests/native-rpc-initialization.test.ts#L15-L28),
[concurrent RPC](https://github.com/cloudflare/agents/blob/cbf047d020ba7470517e82822765e5f2057cca57/packages/agents/src/tests/native-rpc-initialization.test.ts#L84-L96).

The eviction suite explicitly distinguishes persisted state from instance-only
state: write through the Agent, evict its Durable Object, then assert that the
hook log vanished while persisted state survived. Its introductory comment
correctly limits this to forced-eviction recovery; it does not claim to prove
natural idle hibernation. Its schedule recovery case additionally checks the
persisted schedule and a fresh instance counter before running one alarm.
[Recovery suite](https://github.com/cloudflare/agents/blob/cbf047d020ba7470517e82822765e5f2057cca57/packages/agents/src/tests/agents-core-eviction.test.ts#L1-L115).

Agents also separates pure schedule parsing from Durable Object scheduling:
`parseWhen`, `parseInterval`, and `nextCronTimeMs` receive a fixed `NOW_MS` and
run without the runtime. **Inference:** keep combinatorial arithmetic and
validation in small direct checks; retain actual DO checks for storage,
initialization, delivery, and reconstruction boundaries.
[Pure schedule checks](https://github.com/cloudflare/agents/blob/cbf047d020ba7470517e82822765e5f2057cca57/packages/agents/src/tests/schedules/timing.test.ts).

**Limit:** some Agents alarm scenarios backdate internal scheduling rows. That
demonstrates a runtime-control technique, not permission for Zerospin helpers to
populate or repair parallel model rows. Seed is the only model setup exception;
after seed, use admitted command execution or command replay.
[Alarm setup](https://github.com/cloudflare/agents/blob/cbf047d020ba7470517e82822765e5f2057cca57/packages/agents/src/tests/alarms.test.ts#L74-L103),
[Zerospin rule](../../AGENTS.md#zerospin-parallel-models).

### tldraw sync: a tiny behavioral host with explicit delivery

tldraw's `TestServer` constructs the real `TLSyncRoom` over
`InMemorySyncStorage`, connects a socket pair, and exposes one meaningful flush
operation. `TestSocketPair` queues real protocol messages separately in each
direction and exposes `flushClientSentEvents`, `flushServerSentEvents`, and
`flushAllEvents`. Disconnect clears queued messages and changes connection
status. The harness provides control over scheduling without inventing another
command language.
[TestServer](https://github.com/tldraw/tldraw/blob/71e9eae0502a06b8299b9a67b881539d28516f0d/packages/sync-core/src/test/TestServer.ts),
[TestSocketPair](https://github.com/tldraw/tldraw/blob/71e9eae0502a06b8299b9a67b881539d28516f0d/packages/sync-core/src/test/TestSocketPair.ts).

Its SQLite storage checks reopen a new storage object over the same real
in-memory SQLite database. Its Durable Object SQL wrapper checks deliberately
use a minimal fake that records forwarding calls. **Inference:** a readable
scenario should declare which seam it exercises; reopening an object over SQLite
proves a different property from reconstructing an actual Durable Object.
[SQLite reopening](https://github.com/tldraw/tldraw/blob/71e9eae0502a06b8299b9a67b881539d28516f0d/packages/sync-core/src/lib/SQLiteSyncStorage.test.ts#L32-L50),
[DO wrapper fake](https://github.com/tldraw/tldraw/blob/71e9eae0502a06b8299b9a67b881539d28516f0d/packages/sync-core/src/lib/DurableObjectSqliteSyncWrapper.test.ts#L1-L30).

### Keep process restart machinery narrow

Y-PartyServer puts `start`, `stop`, `restart`, readiness polling, and the
persistence directory behind an approximately 100-line `WranglerServer`. Its
restart scenarios explicitly await disconnect, reconnect, and sync; providers
are disposed in hooks. This demonstrates a useful ownership boundary for the
small subset that genuinely needs whole-process restart.
[Process host](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/y-partyserver/src/tests/server-harness.ts),
[restart scenario and cleanup](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/y-partyserver/src/tests/hibernation.test.ts#L1-L179).

**Limit:** that suite also contains fixed sleeps, broad cleanup catches, and
readiness based on HTTP availability. These do not establish application
readiness or durable delivery. Keep the ownership boundary; prefer an explicit
domain observation for progress and include its last observed state on timeout.
[Source of limitations](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/y-partyserver/src/tests/server-harness.ts),
[sleeping scenario](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/y-partyserver/src/tests/hibernation.test.ts#L143-L179).

## Platform affordances and compatibility boundary

Current Cloudflare docs describe `@cloudflare/vitest-plugin`; PartyServer's
pinned configuration still imports `@cloudflare/vitest-pool-workers`. The docs
provide `env` and Worker exports through `cloudflare:workers`. The
`cloudflare:test` helpers run in the Workers runtime, not ordinary Node tests.
[Current integration](https://developers.cloudflare.com/workers/testing/vitest-integration/),
[test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/),
[PartyServer configuration](https://github.com/cloudflare/partykit/blob/f0a2e97d233f24545b2648aec2ed6a191e11074e/packages/partyserver/src/tests/vitest.config.ts).

`runInDurableObject` executes a callback against the actual instance and state;
`runDurableObjectAlarm` consumes a scheduled alarm immediately. Both require a
stub for a DO defined in the main Worker. Forced eviction preserves storage,
resets instance state, and by default drains in-flight requests and hibernates
eligible sockets. Abrupt abort and graceful eviction therefore exercise
different failure boundaries.
[Official helper contracts](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/#durable-objects).

These are public platform affordances, **not checked drop-in APIs for Zerospin's
installed Miniflare `5.20260828.0-alpha` and Node/Vitest host**. A small host over
the installed direct binding/eviction APIs may remove the fixture HTTP protocol
without migrating test runners. Check that version's types and a representative
real-DO call before choosing the backend; do not make a runner migration a
prerequisite for readability. No compatibility experiment was performed here.

## Proposed application to Zerospin

1. **One runtime owner.** Own bundling, bindings, temporary persistence, logs,
   and disposal in one host. Scenario code should receive typed handles, not
   construct transport requests or reproduce Wrangler configuration.
2. **Existing methods remain the action vocabulary.** Call the actual
   `AggregateChain`, `AggregateVersionRepo`, `ServiceChain`, and
   `ServiceVersionRepo` methods. Add narrowly named observations only where the
   durable fact has no usable read surface. Ordinary `expect` stays sufficient.
3. **One explicit progression boundary per step.** Run the relevant alarm or
   await a named durable fact. A universal `flush()` must not silently collapse
   admission, execution commit, dispatch acknowledgement, and retained
   `outcome`. Explicit message flushing is useful because it exposes a boundary.
4. **Faults name the lost operation.** Distinguish a failure before execution
   commit from a lost reply after commit, and a lost dispatch acknowledgement
   from missing `outcome` retention. Put the fault at the actual seam, then
   inspect the corresponding durable row/cursor. Avoid boolean fault bags whose
   names hide when failure occurs.
5. **Readable evidence, not a hidden assertion engine.** Return small structured
   observations with canonical fields such as admitted command `id`,
   `serviceIndex`, `outcome`, and `dispositionChainHash`; let each scenario assert
   exactly the fact its name promises. On bounded waits, retain the last
   observation and recent runtime diagnostics.

These recommendations are architectural inferences from the cited seams and
Zerospin's existing ownership rules. They do not establish that every existing
verification needs a new helper, that every runtime control is available in the
installed backend, or that forced eviction proves natural hibernation.

## Inspected revisions

- `cloudflare/partykit`: `f0a2e97d233f24545b2648aec2ed6a191e11074e`.
- `cloudflare/agents`: `cbf047d020ba7470517e82822765e5f2057cca57`.
- `tldraw/tldraw`: `71e9eae0502a06b8299b9a67b881539d28516f0d`.

Revisions identify inspected source, not successful upstream execution. Current
documentation was read on the date above and can evolve independently.
