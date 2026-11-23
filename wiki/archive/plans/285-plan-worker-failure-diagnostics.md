# Readable Worker failure diagnostics

**Status:** Complete; implemented, verified, released locally, and ready for review.
**Date:** 2026-11-02.
**Scope:** Zerospin source in the isolated diagnostics worktree, a coherent package
release, and QRK adoption in its isolated worktree. Open ready-for-review PRs;
leave the users' primary checkouts and unrelated work intact.

## Problem and agreed behavior

1. Wrangler can reduce an escaping object exception to `Uncaught #<Object>`.
   Zerospin must print a readable diagnostic while the complete Effect Cause is
   still available, before native execution reduces it to the thrown value.
2. Use one System Worker-local synchronous reporter,
   `reportWorkerFailure({ boundary, cause }): void`. It formats through existing
   `prettyUnknownFailure`, writes a labelled string to `console.error`, skips
   interruption-only cancellation, and contains formatting or console failures.
   It runs for server execution in every environment without requiring OTLP.
   Keep it out of the public package index.
3. Preserve the original Cause, success values, thrown/rejected failures, and
   public RPC encoding. A resolved business `Failure` result remains quiet.
   Report defects that escape RPC encoding or public outcome callbacks.
4. Keep synchronous identity/database construction and existing asynchronous
   activation, schema, bootstrap, alarm, and delivery lifetimes. Capture remains
   separate from optional asynchronous telemetry export. Do not promise one
   global log record for a failure that traverses multiple native seams.
5. Add no request/payload logging, public setting, persistent schema, storage
   reset, or compatibility path. This work reveals the actual error; the pasted
   summaries alone do not establish its cause or retry source.

## Implementation steps

1. Add the internal synchronous reporter beside System Worker runtime helpers.
   Observe the complete Cause, preserve existing bounded formatting, and prevent
   diagnostic failure from changing operation behavior.
2. In `makeMigratableDORepo`, execute identity/database initialization through
   `runSynchronousExit(..., managedRuntime.runSyncExit)`. Report its final failed
   Exit, including any synchronous cleanup reasons, then preserve the existing
   `Effect.runSync(exit)` throw/value behavior. Do not move eager owner fields
   into the asynchronous gate or bypass synchronous completion policy.
3. Report escaping failures from the complete provided Effects in
   `runWorkerInvocation`, `makeWorkerRpcEnvelope`, and `Api[execute]`. Place
   observation after required services are provided, so execution, encoding,
   service acquisition, and callback defects are visible at the owning seam.
   Keep invocation/internal-RPC observers inside their existing uninterruptible
   masks so cleanup defects remain visible before pending cancellation resumes.
   Leave ordinary encoded refusals and optional export failure containment alone.
4. Update the existing runtime/lifecycle architecture sections and run focused
   existing tests and required package checks. Verify readable object/native
   errors, interruption silence, original failure preservation, reporter failure
   containment, and quiet encoded business failures through the affected seams.
   Include actual fiber interruption with a failing finalizer and a real
   synchronous suspension whose cleanup adds an independent failure reason.
5. Commit the scoped upstream implementation and documentation, publish a clean
   coherent release, and update QRK's exact framework pins and lockfile through
   its package manager. Run the relevant frozen-install and consumer checks;
   verify the live development output exposes a readable failure if one occurs.
6. Open ready-for-review upstream and QRK PRs. Record evidence and release/adoption
   pointers here, set Remaining work to None, and archive this plan only when all
   required work is complete.

## Annotated examples

The synchronous constructor keeps its result available before derived field
initializers consume `this.db` or `this.schema`:

```ts
// 1. Finish the existing synchronous completion/cancellation policy first.
const exit = runSynchronousExit(initialize({ ctx }), managedRuntime.runSyncExit);
if (Exit.isFailure(exit)) {
  // 2. Print the full final Cause without replacing it if diagnostics fail.
  reportWorkerFailure({ boundary: `${namespaceBinding}.initialize`, cause: exit.cause });
}
// 3. Preserve the original constructor value or throw.
const { db, dbConfig, key, name, schema } = Effect.runSync(exit);
```

For example, an `initialize` Cause containing an object failure and a cleanup
defect must retain both in the diagnostic; the constructor still fails. A public
method that returns an encoded `Failure` must return that same result without a
crash log. If its outcome callback itself defects, the complete provided method
Effect reports that escaping Cause before its Promise rejects.

## Implementation and verification evidence

- Implemented the internal reporter, final synchronous Exit observation, and
  three asynchronous reporting seams. Focused source review found no remaining
  findings after moving invocation/encoder observers inside their masks.
- Existing Workerd projects `repo-lifecycle` and `native-system-api`: 22 tests
  passed, including actual interruption cleanup and synchronous suspension cleanup.
- `system-worker` typecheck and lint passed. The fixed release group's 19 library
  build targets passed at version 38.2.1. Nx Cloud cache upload reported an
  existing authorization warning; local tasks passed.
- Generated CLI artifacts had to be built first in the fresh worktree for existing
  test imports. No test configuration or dependency workaround was added.
- The upstream Intent executable is unavailable and was reported. No replacement
  was installed.

## Delivery

- Upstream implementation/release commit: `ddff926ab52be39e73889c5ec11473f84c154db6`.
  [Ready Zerospin PR #114](https://github.com/morgs32/zerospin/pull/114).
- Fixed release **38.2.1** published successfully to the configured local registry
  from that clean committed revision (20 publish targets).
- QRK exact-version adoption and lockfile: [ready PR #51](https://github.com/morgs32/qrk.sh/pull/51).
  Frozen install, 17 backend tests, and App production build passed.
- Isolated development smoke test on port 18888 accepted the authored System spec
  and returned `healthy` through the real published RPC client. The original
  repeated exception did not recur; its underlying cause remains undiagnosed.
- Primary checkouts and their runtime dependency versions remain unchanged.
  No production deployment or storage reset was performed.

## Remaining work

None.
