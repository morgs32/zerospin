# Give CLI development startup one scoped lifetime

Status: Implemented and verified in the approved goal on 2026-10-11.

The [development parent](../../../packages/cli/src/dev/devFn.ts) combines project/environment resolution, generated secret-bearing configuration, local storage cleanup, Wrangler acquisition, process signals, runtime events and accepted-spec readiness. Its cleanup is substantial and must stay ordered, but those responsibilities currently share one large generator and private Wrangler details leak through it. The clearer owner is one development invocation containing a project, temporary workspace and running Worker, with readiness owned by the exact executing reload.

1. `loadDevelopmentProject` owns dotenv precedence, optional port validation, config loading, development Worker resolution and the installed project's Wrangler adapter. Return exact immutable project/config/port values. Keep the existing `loadZerospinConfigFn` authority; do not create a second config loader. Replace the forbidden record loop in [jiti aliases](../../../packages/cli/src/deploy/jitiAliasesFromTsconfigPaths.ts) with `mapValues` while preserving path resolution and record ordering.
2. `openDevelopmentWorkspace` owns the scoped generated directory, mode0600 config write, project-root local environment binding lookup and exact system-specific persist directory. Register removal before a later write can fail. `--clean` continues to remove only that system's development storage. It is an explicitly requested destructive option, not an automatic startup action. Preserve Wrangler .dev.vars/.env precedence independently of the generated config directory.
3. `openDevelopmentWorker` owns one DevEnv, reload queue, runtime failure signal and installed event handlers. Attach reload/error/teardown before startWorker. Install the caller's process-signal ownership before acquiring Wrangler so Miniflare cannot exit before asynchronous cleanup. Release event listeners, queue and DevEnv exactly once when acquisition fails, a runtime error wins, a process signal arrives, or the scope closes. Do not hide the DevEnv inside an unscoped Promise or launch a detached reload loop.
4. `serveAcceptedDevelopmentReloads` serially consumes reload notifications, waits for the actual Worker URL and runtime proxy update completion, then calls its authenticated SystemApi.acceptSystemSpec before reporting readiness. Retain both existing30second readiness/acceptance timeouts and public failure codes. A failed acceptance stops the invocation and closes its resources; no ready message follows. Notifications received during acceptance stay queued. Each message means the Worker actually reached acceptance, not merely that Wrangler emitted reloadComplete.
5. Place the exact Wrangler integration contract in one adapter next to acquisition. The current source intercepts Miniflare immediate-exit signal hooks by listener name/source and uses proxy.runtimeMessageMutex.drained; both are private/version-sensitive facts. This refactor preserves that installed integration until an actual supported Wrangler replacement is established. It must not replace the proxy fence with a guessed timer or remove signal ownership. The adapter is the one place to diagnose an unsupported runtime API without spreading structural assumptions across domain steps.
6. Delete [obsolete CLI API types](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/cli/src/types.ts). Exhaustive current authored-source search finds no consumer of ICliApis/ICliClientApi/IDeployWorkerResponse; deployWorkerBundle/getCliApi are the removed deployment design. Do not retain exported compatibility types. Keep current Cloudflare candidate deployment procedures, seeds and Studio lifetime independent. Fix the existing seed help text to describe its real exported command array while Plan130 adapts its actual RPC request.
7. Bind [useProgram](../../../packages/cli/src/ProcedureStep/useProgram.ts) to the mounted ProcedureStep lifetime with an AbortController passed to runPromiseExit and abort on unmount. Keep its initial fetcher fixed so Ink rerenders cannot restart a program. Ignore completion after disposal, and let cancellation close the program's existing Effect scopes rather than leaving a Worker or deployment task orphaned. Display a typed failure only for a sole FailReason; a mixed Cause must be reported through the existing unexpected-error diagnostic with its full Cause, rather than dropping defects/interruption through findErrorOption. Unmount interruption produces no stale UI update. Production compensation remains owned by its existing scoped deployment procedures.

The proposed parent is a complete schematic TypeScript generator body, with exact phase return types defined from the existing interfaces during implementation:

```ts
const devFn = Effect.fn('devFn')(function* (request: DevelopmentRequest) {
  const stopped = yield* ownDevelopmentSignals();
  return yield* Effect.gen(function* () {
    const project = yield* loadDevelopmentProject(request);
    const workspace = yield* openDevelopmentWorkspace(project, request.clean);
    const worker = yield* openDevelopmentWorker(project, workspace, stopped);
    yield* serveAcceptedDevelopmentReloads(worker);
    return { port: project.port };
  }).pipe(Effect.raceFirst(Deferred.await(stopped)));
}, Effect.scoped);

const acceptDevelopmentReload = Effect.fn(function* (
  worker: DevelopmentWorker,
) {
  const apiUrl = yield* awaitExecutingDevelopmentWorker(worker);
  const systemApi = yield* getApi<GatewayApi>(apiUrl)(gateway =>
    gateway.getSystemApi({ zerospinSecretKey: 'sk_dev' }),
  );
  yield* requireDevelopmentSpecAcceptance(systemApi);
  yield* reportDevelopmentReadiness(apiUrl);
});
```

No SQL transaction contains filesystem work, Wrangler startup, process events or RPC. The invocation scope owns all native resources. The current teardown reports its own failure without replacing the original program exit; preserve that explicit cleanup policy and complete cleanup of other resources even when teardown fails. Full mixed/defect/interruption Causes must not be flattened by a new phase wrapper. Startup failures after acquisition still release the Worker and temporary config. Keep private keys/binding values out of failure messages and telemetry; the config mode and existing sanitized errors remain required.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/cli/src/
    ~ dev/devFn.ts
    + dev/loadDevelopmentProject.ts
    + dev/openDevelopmentWorkspace.ts
    + dev/openDevelopmentWorker.ts
    + dev/serveAcceptedDevelopmentReloads.ts
    + dev/ownDevelopmentSignals.ts
    + dev/developmentTypes.ts
    ~ ProcedureStep/useProgram.ts
    ~ deploy/jitiAliasesFromTsconfigPaths.ts
    - types.ts
    ~ commands/seed.tsx # correct the existing command-array help text
```

Affected callers are the existing CLI dev command and ProcedureStep program invocation; their visible options, return and failure codes stay unchanged. `makeWranglerConfig` remains framework-owned in dev-worker and accepts the same resolved config values. The temporary config, event listeners and reload processing move to cohesive owners; there is no extra public runtime/controller/state registry. Do not modify production deployment, worker routes, seed concurrency or Studio server machinery as part of this plan. The current seed example creates independent product commands; it does not establish a dependent-command ordering promise.

Implementation order: define exact phase/native adapter interfaces; introduce project/workspace lifetime phases; move signal/runtime ownership with acquisition-failure cleanup; move the accepted-reload program; simplify devFn; delete obsolete API types and correct command help; review actual CLI callers; then run existing gates. No new tests, fixtures, runners or configuration are authorized.

Verification: existing CLI targets include lib,ts,lint and existing dev-worker targets include lib,ts,lint. Run `pnpm nx run-many -p @zerospin/cli,@zerospin/dev-worker -t lib,ts,lint` with normal dependencies. Existing project `zerospin:dev`/CLI development commands provide startup, real reload, rejected spec, clean option, SIGINT/SIGTERM/SIGHUP and failed-start/teardown seams. Establish that readiness follows accepted executing spec, storage cleanup stays within the exact system directory, reload events are serialized and shutdown removes handlers/config. These native lifecycle cases were not run during review; type/lint success cannot prove signal or private Wrangler ordering. Reuse actual current project commands and installed Wrangler, with no created harness.

Postimplementation: update CLI development lifecycle documentation and source annotations. Add a glossary term only if a lasting development invocation ownership term is useful; an extraction alone does not warrant an ADR. Record an ADR only if the supported Wrangler integration or shutdown policy changes. Archive after phase ownership, removed-type references and required checks are complete.

## Implementation progress — 2026-10-11

The approved ownership cutover is implemented in production source and its direct
consumers. Root coordination owns required Nx gates and plan archival.

CLI and dev-worker `lib`, `ts` and `lint` passed in `/tmp/zerospin-goal-quality-8.log` after full-Cause display serialization was repaired. Package/module README changes are written.

The existing TicTacToe `zerospin:dev` command ran on port 3006. `/tmp/zerospin-goal-tictactoe-backend.log` records nine framework readiness reports, each following `POST / 200` and successful system-spec acceptance, including accepted reloads. A later reload received 503; the invocation reported failure and Wrangler shutdown, with no subsequent readiness report for that attempt. This establishes actual startup, accepted reload and failed-acceptance shutdown observation, but does not establish release of every handler or temporary file. The existing web command also reported Vite readiness on 3021; that is not mounted-session verification.

A subsequent stable invocation accepted its spec and served the actual native app.
Root sent SIGINT to its owned CLI process (PID 8404, session 7416); it exited 0 with
`Zerospin dev stopped`, and Nx reported successful completion in
`/tmp/zerospin-goal-tictactoe-backend-final.log`. The listener on 3006 disappeared
and its exact generated `dev-config-jkgmGe` directory was removed. All 17
pre-existing development-config directories remained unchanged. This establishes
actual successful-invocation signal shutdown and scoped temporary-config release.

Both remaining signal cases were exercised sequentially through the existing
`pnpm nx run tic-tac-toe:zerospin:dev` command with current built outputs and no
rebuild while the server was live. SIGTERM was sent only to owned CLI PID 37387
after POST200 and executing-spec acceptance; the invocation exited 0, reported
`Zerospin dev stopped`, closed port 3006 and removed only its generated
`dev-config-lvvSq6`. All 17 prior config-directory names, inodes and mtimes
remained identical. Evidence is `/tmp/zerospin-goal-cli-134-sigterm.log` and
the corresponding sigterm-config-before/during/after.json snapshots.

The next invocation used the supported `--clean` option after confirming the
authored systemId is exactly sys_tictactoe. It recreated only the goal's disposable
`.wrangler/zerospin/dev-worker/sys_tictactoe` namespace (directory inode changed
319446317 to 319592774; 38 retained same-path files had new inodes), while all
56 files in the original sibling sys_tictactoe.before-framework-goal-20261011
kept identical SHA256, inode, mtime and size before, during and after. Following
POST200 and spec acceptance, SIGHUP was sent only to owned CLI PID 37950; the
invocation exited 0, reported `Zerospin dev stopped`, closed port 3006 and removed
only `dev-config-c51hZ4`. All 17 pre-existing config-directory records again
remained identical. Evidence is `/tmp/zerospin-goal-cli-134-sighup.log` and
the corresponding sighup-before/during/after.json snapshots. Fresh startup
also emitted three Wrangler `Uncaught #<Object>` messages before the successful
acceptance; those diagnostics were reported to root and are not an error-free
startup claim. No user service, original storage or authored source/configuration file
was changed by these checks.

Root diagnosed those fresh-start diagnostics as premature bootstrap telemetry
persistence before SystemLogRepo registration. GatewayApi.getSystemApi now uses
the existing bootstrap `persistTelemetry: false` policy while strict registration
remains intact. The affected worker/development/production/CLI lib/type/lint graph
passed in `/tmp/zerospin-goal-bootstrap-telemetry-gates.log`. After that gate, the
same actual CLI `--clean` startup was repeated with current built outputs. It
accepted POST200 and the executing spec, with no Uncaught, Wrangler ERROR,
failure marker or Failed-to diagnostic anywhere in the full lifecycle log
`/tmp/zerospin-goal-cli-134-clean-fixed.log`. SIGINT was sent only to owned
CLI PID 40669; the invocation exited 0, reported `Zerospin dev stopped`, closed
3006 and removed only its `dev-config-cgpIZe`. All 17 prior config-directory
records and all 56 original-backup file records remained identical, while the
disposable namespace was recreated (inode 319592774 to 319601375; 37 retained
same-path file inodes replaced). Before/during/after snapshots are
`/tmp/zerospin-goal-cli-134-clean-fixed-before.json`,
`/tmp/zerospin-goal-cli-134-clean-fixed-during.json` and
`/tmp/zerospin-goal-cli-134-clean-fixed-after.json`. This provides actual clean
startup and shutdown evidence after the bootstrap ordering repair.

Worker acquisition failure was also exercised using two owned warm invocations
of the same existing command, with no `--clean`, rebuild or catalogue change.
The primary actual PTY invocation (CLI PID 43058) first accepted POST200 and its
executing spec. The secondary failed with exit 1 and ERR_ADDRESS_IN_USE/
zerospin-dev-wrangler-failed on occupied port 3006, without any readiness or
spec-acceptance report. Its exact generated config dev-config-IkHhJ1 is recorded
in Wrangler's native log and was absent after failure; the surviving config and
backup snapshot then matched the ready primary snapshot exactly. The primary
CLI/Worker PIDs and listener were unchanged, and its gateway still responded
with the expected HTTP400 refusal to a GET on its POST/WebSocket-only endpoint.
Evidence is `/tmp/zerospin-goal-cli-134-occupied-port.log`, native Wrangler log
`/Users/morgs32/Library/Preferences/.wrangler/logs/wrangler-2026-10-11_15-50-21_305.log`
and `/tmp/zerospin-goal-cli-134-pty-secondary-after.json` compared with
`/tmp/zerospin-goal-cli-134-pty-primary-ready.json`.

The primary was then stopped with actual Ctrl+C bytes on its owned PTY, rather
than an external kill call. It exited 0, reported stopped/Nx success, closed
3006 and removed only its dev-config-aD2vjM. All 17 prior config-directory
records and all 56 original-backup file records matched the pre-start snapshot
exactly. The captured PTY transcript is `/tmp/zerospin-goal-cli-134-pty-primary.log`;
before/final snapshots are `/tmp/zerospin-goal-cli-134-pty-before.json` and
`/tmp/zerospin-goal-cli-134-pty-after.json`. This is actual terminal SIGINT
verification: termios showed icanon/isig with intr=^C in
`/tmp/zerospin-goal-cli-134-pty-termios.txt`. The current CLI/Pastel dev component
does not request raw input, and installed Ink enables its input-driven exit
through a raw-input hook. Consequently this existing PTY path cannot distinguish
an independent Ink unmount while the owned program remains live; that case is
still unverified. Both owned invocations and their Worker processes were stopped.

Independent Ink unmount was subsequently exercised through the actual built
`commands/dev` component and its own `options.parse({ port: 3006 })`, which
defaults `clean` to false. Installed Ink's public `render` mounted that real
component in a Node REPL with native stdio and the exact `NODE_PATH` supplied by
the installed pnpm CLI shim. Renderer PID26856 reached POST200 and executing-spec
acceptance. Calling its returned `unmount()` while the Worker was live, followed
by repeated public `unmount()` and `cleanup()`, triggered native Wrangler
shutdown without a process signal or terminal Ctrl+C. Both Workerd children
26896/26898 and the exact mode0600 `dev-config-3cDpK7` were released while the
REPL was still alive. Captured framework SIGTERM/SIGHUP handler references and
the `newListener` adapter hook were absent afterward; the original
`newListener` reference set was restored. Node REPL evaluation temporarily
suppresses SIGINT listeners, so this does not establish an independent capture
of that handler's release.

The ordinary REPL exit returned 0; renderer26856 and children26895/26896/26898
were then absent, with 3006 free. All 17 prior config-directory identities and
all 56 original-backup file hashes/inodes/mtimes/sizes matched the pre-render
inventory exactly. Esbuild's installed process-wide service26895 remained
alive until the REPL exit; it is not claimed to have stopped at Ink unmount.
Ink's `waitUntilExit()` settles its own renderer and is not an Effect finalizer
join API. Repeated public Ink calls demonstrate their normal idempotent guard,
not reentrant inner teardown under a forced cleanup fault. Evidence is
`/tmp/zerospin-goal-cli-134-ink-unmount-ready.log`,
`/tmp/zerospin-goal-cli-134-ink-observations.json` and the matching
`ink-before.json`, `ink-ready.json` and `ink-after.json` inventories.

The first direct Node import lacked the shim's `NODE_PATH` and correctly
reported `zerospin-dev-wrangler-not-found` before Worker/config acquisition;
its renderer was unmounted and that REPL exited1. The actual CLI shim was then
read and its resolver context used for the successful case above. This was a
direct-invocation environment mismatch, with no production source/configuration
change or rebuild. It does not establish rejected-spec or arbitrary cleanup
fault behavior.

### Authorized controlled lifetime checks — 2026-10-11

The human explicitly authorized disposable `/tmp` verification fixtures, runners and configuration. The controlled invocation used the production workspace, Worker, signal and accepted-reload owners with the actual first-party TicTacToe configuration, a temporary project directory, an installed Wrangler-shaped acquisition capability and a real ephemeral capnweb HTTP boundary. No repository test/configuration or original storage was changed.

Pending native acquisition was interrupted twice; releasing that acquisition joined exactly one teardown. Its generated config had mode0600, owned listeners were removed before teardown, and reentrant SIGINT/SIGTERM/SIGHUP emitted during a forced teardown failure could not duplicate cleanup. The original interrupted exit survived; the existing cleanup diagnostic reported the teardown failure and the workspace still removed its config. Acquired-environment startup rejection also released handlers, config and environment exactly once. All three signal and `newListener` reference sets returned to their initial identities.

The production reload owner withheld readiness while actual spec acceptance was pending, retained three queued reload events and processed acceptance serially with peak concurrency one. A subsequent genuine HTTP refusal produced the existing `zerospin-dev-system-spec-check-failed` boundary with its original refusal cause and no false readiness. Scope release closed its queue, fiber and ephemeral listener. Together with the actual Ink duplicate unmount/cleanup and native signal checks above, these establish guarded repeated/reentrant cleanup and attempt-all release under acquisition and teardown faults. The runner joined with exit0 and removed its temporary project. Evidence is `/tmp/zerospin-framework-goal-tooling-134-faults.log`; this controls the installed native capability boundary and does not claim a real Wrangler fault was manufactured.

## Remaining work

None.
