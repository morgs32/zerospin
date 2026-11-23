# Report automatic standalone resets through onFailure

**Status:** Complete; implementation and required verification passed. **Date:** 2026-11-02.

## Problem and agreed behavior

1. Automatic standalone recovery can replace an invalid retained document with captured seed resources, through opt-in retained-state recovery or the existing incompatible-storage reset path. The caller must be able to tell the user that saved local work was reset.
2. Deliver that notice through the existing managed `onFailure(error)` observer and session store, using nonterminal `origin: 'recovery'`. Add no public `onReset` callback or separate React lifecycle.
3. Emit only after an actual automatic replacement succeeds and its replacement snapshot validates. An unsuccessful replacement remains a terminal failure; a preservation fence or concurrent repair that avoids replacement emits no reset-success notice.
4. Report once to each affected live connection, including the connection whose initial attachment caused recovery and clients already attached to the same standalone owner. A healthy later attachment must not receive an old reset notice.
5. Keep notification delivery independent of owner readiness. A frozen/disposed tab or rejecting notification handler must not block or undo successful recovery. This is an in-memory notification, not durable event history or exactly-once delivery across crashes.
6. Preserve the existing reset eligibility, seed/identity validation, one-attempt limit, storage formats, and manual reset behavior. The earlier `recovery: "reset"` naming suggestion is separate; this plan retains the existing `discardUnrestorable` option.

## Current source and decisions

1. [`makeStandaloneWorkerRuntime.ts`](../../../packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts) has three automatic replacement paths: opt-in recovery during cold initialization, opt-in replacement of an already-open owner, and the existing cold `node-storage-reset-required` branch that uses `resetNodeStorage` followed by `initializeNode`. Cold replacement finishes inside `attach`, before the page has a session capability or snapshot subscription. Include all three successful automatic paths in notification coverage without widening their reset eligibility; explicit `request.reset` stays quiet.
2. [`makeConnectedAggregateConnection.ts`](../../../packages/browser/src/AggregateNode/makeConnectedAggregateConnection.ts) already passes a private recovery-notice RPC callback before attachment. Its runtime retains live notice recipients. Reuse that pattern for standalone; a snapshot-subscriber callback alone cannot cover cold recovery.
3. [`makeSessionFailureObserver.ts`](../../../packages/browser/src/Node/makeSessionFailureObserver.ts) already reports `origin: 'recovery'`. [`makeManagedSession.ts`](../../../packages/react/src/managedSession/makeManagedSession.ts) subscribes before initialization and forwards new nonterminal occurrences to `onFailure`. No new managed observer API is needed.
4. Use the framework error code `standalone-state-reset`, with the message: “Your saved local document could not be restored and was reset to its initial state.” Encode it with the existing error codec; include no model contents, claims, storage paths, or raw private exception in the notice.
5. Reconstruct the sanitized wire error as a runtime ZerospinError in the page callback before forwarding it to `replica.recoveryWarning`. Passing plain JSON directly into the current observer would replace the specific reset code/message with generic `node-recovery-work-unconfirmed`.
6. Give each `StandaloneSharedWorkerApi` instance (one port/client) one retained notice RpcStub and one stable runtime forwarding callback. Register once before its first attach and reuse that registration across automatic reattachment. Release it in that API's `[Symbol.dispose]` or failed-first-attachment cleanup. Retiring a `StandaloneBrowserSessionApi` must not remove the port-level registration. The page guard follows the connection lifetime, not the retired attachment's `isCurrent` predicate. This ownership provides per-connection delivery without event IDs or a separate deduplication mechanism.
7. Avoid a generic event bus, persistent recovery receipts, new storage tables, new runtime wrappers, or new named types. Extend the existing concrete standalone attachment wiring with the same private callback shape used by connected sessions.

## Planned files

Legend: `~` modify; `+` create. Existing tests and documentation are extended.

```text
zerospin/
  packages/
    browser/
      src/StandaloneNode/
        ~ makeStandaloneAggregateConnection.ts
        ~ StandaloneSharedWorkerApi.ts
        ~ attach/attach.ts
        ~ makeStandaloneSharedWorker.ts
        ~ makeStandaloneWorkerRuntime.ts
      tests/
        ~ node-network-errors.spec.ts
      skills/zerospin-browser-sessions/
        ~ SKILL.md
        ~ references/instance-inputs-and-worker.md
    core/tests/
      ~ node-history-recovery.spec.ts
    error/src/
      ~ defaultErrorMessages.ts
    react/
      ~ README.md
  fragment/content/reference/
    ~ browser.md
  wiki/plans/
    + 287-plan-standalone-reset-recovery-notices.md
```

## Implementation steps

1. Thread the private notice callback through the existing standalone connection, SharedWorker API, attachment procedure, and runtime composition. `StandaloneSharedWorkerApi` owns the retained RpcStub and stable runtime forwarding callback for its port; register once before awaiting the first `attach`, reuse it on reset-driven reattachment, and remove/dispose it on port close or failed first attachment. Follow the existing connected implementation's capability duplication rules, but do not tie this registration to a replaceable `StandaloneBrowserSessionApi`. Keep that session-capability class unchanged unless an actual cleanup dependency requires a scoped edit. Add no public hook.
2. At each automatic replacement path, construct the reset warning only after replacement and snapshot validation succeed. This includes successful `resetNodeStorage` followed by `initializeNode` in the incompatible-storage branch, which does not call `node.reset(clean)`. For an open owner, finish the successful `release(true)` and `readCurrent` path before scheduling delivery. Snapshot the affected live recipients and dispatch without awaiting their completion. Keep the initial `preservePending` fence, concurrent-repair early return, fresh initialization, ordinary attachment, and explicit `request.reset` paths quiet.
3. Register the default error message and forward each received warning through `replica.recoveryWarning({ error: makeZerospinError(wireError) })`. Preserve the existing session store transition and managed observer behavior. A later terminal startup failure still owns failed readiness; a reset notice must never convert it to success.
4. Extend the existing tests below, then run the scoped checks. Keep scenarios local; do not add test files, fixtures, runners, or dependencies.
5. Update the browser reference, browser-session skill, and React README with the user-visible notice and the existing observer example. Reconcile terminology with the existing glossary after implementation; add a glossary entry only if a domain term actually changed. This routine notification extension does not warrant an ADR. Record the verified outcome and archive this plan only after implementation and required verification finish.

## Annotated examples

1. Application notification uses the existing third argument. The reset policy remains a constructor option; the callback observes the completed replacement.

```tsx
useStandaloneAggregateSession(guestSessionDefinition, guestOptions, {
  onFailure: error => {
    // 1. A completed automatic reset is a warning while the session recovers.
    if (error.code === 'standalone-state-reset') {
      toast.warning(error.message);
      return;
    }
    // 2. Other nonterminal failures keep the application's existing presentation.
    reportError(error);
  },
});
```

2. The existing private callback is registered before the fallible attachment. This sketch illustrates ordering, not a new helper or alternate runtime API.

```ts
// 1. Allocate/retain the callback before cold recovery can happen in attach.
const recoveryCallback = new RpcStub(async wireError => {
  // 2. Guard the whole connection, including automatic reattachment transitions.
  if (!disposed && !broken) {
    replica.recoveryWarning({ error: makeZerospinError(wireError) });
  }
});
// 3. Pass the callback as the standalone attach RPC's private second argument.
const attached = await currentApi.attach(attachment, recoveryCallback);
// 4. Existing connection cleanup releases the callback and runtime registration.
```

## Verification and acceptance

1. Extend the existing cold-discard and warm concurrent-repair cases in `packages/core/tests/node-history-recovery.spec.ts`. Check one reset notice after successful replacement, including the existing incompatible-storage replacement branch; confirm that the original document/checkpoint remains replaced as expected and there is no notice for the preserving/concurrently-repaired branch, explicit manual reset, or a replacement that fails. Retain the existing identity/environment safeguards and one-attempt assertions.
2. Extend `packages/browser/tests/node-network-errors.spec.ts` using its existing connection/RPC doubles. Prove the callback is available during the initial `attach`, preserves the specific code/message, survives reset-driven reattachment, and is ignored/released after disposal or failed attachment. Prove an old notice is not replayed to a later healthy connection and a rejecting recipient cannot fail recovery. Exercise two affected connections within the existing runtime tests to check recipient fanout and cleanup.
3. Reuse `packages/browser/tests/aggregate-replica-lifetime.spec.ts` and `packages/react/tests/session-providers.spec.tsx` for the established nonterminal store and startup `onFailure` behavior. Extend them only if the standalone-specific path exposes a missing guarantee; do not duplicate the generic managed-hook implementation in tests.
4. Run the owning browser/error package type/lint targets and the focused existing Node test files through Nx, including the test target's compiler step. Use the current resolved target configuration and Nx/Vitest help for project/filter arguments. Do not run Explorer checks or a full repository suite for this bounded change.
5. Exercise the actual standalone callback through an existing disposable browser fixture/origin if available. Verify a successful automatic replacement remains usable and is observable through the normal store/managed observer, without a success notice on failed replacement. Do not damage application databases to manufacture evidence; report any runtime evidence that remains unavailable.
6. Check formatting and `git diff --check` for changed files. Preserve unrelated SharedWorker diagnostic WIP and the existing recovery prerequisite. Plan completion requires implementation and all required checks; writing this file alone proves no runtime behavior.

## Implemented outcome

1. Created `codex/standalone-reset-notices` from Zerospin `main` in an isolated checkout. Commit `f0d9ef207` brings source, tests, and documentation from prerequisite `965444f463`, excluding release metadata and unrelated diagnostics. The main checkout's work in progress was preserved.
2. Successful cold, warm, and incompatible-storage replacements schedule one nonterminal `standalone-state-reset` notice per affected live port after replacement snapshot validation. The wire codec preserves the specific message through the existing recovery observer and managed `onFailure` path.
3. `StandaloneSharedWorkerApi` retains the callback before attachment, reuses one registration across session-capability retirement and reattachment, and releases it on disposal or failed first attachment. The existing attachment procedure needed no change because the registration belongs to the port. Rejecting and stalled recipients cannot block recovery.
4. Extended the existing runtime/network tests and disposable browser fixture. Preservation fences, concurrent repair, manual reset, failed replacement, disposed clients, and healthy later attachments stay quiet. Updated the browser reference, browser-session skill, and React README. No domain term changed, so no glossary entry or ADR was needed.
5. Retained `discardUnrestorable`; added no public `onReset` callback. No version bump, publication, deployment, consumer update, or application storage reset occurred.
6. Addressed PR #117 review feedback by validating retained unresolved commands before the authored projection error wrapper. Missing payloads and unknown commands preserve their specific validation codes and permit opt-in recovery. Authored projection failures remain ineligible even when they throw the same corruption code. Removed inherited browser/React skill-version changes to retain the base metadata until release.
7. Added `AggregateNode.assertStandaloneRetainedCommands()` inside the cold initialization and warm attachment recovery boundaries. Its gated transaction audits all retained originals and finals independently of browser interests, including resolved originals. The warm post-fence recheck uses the same audit. Recurring subscription snapshots do not scan the full retained history.

## Verification outcome

1. `pnpm nx run zerospin:test --args='--project=node packages/core/tests/node-history-recovery.spec.ts packages/browser/tests/node-network-errors.spec.ts packages/browser/tests/aggregate-replica-lifetime.spec.ts packages/react/tests/session-providers.spec.tsx'` passed its compiler step and all 24 tests across four files after the review fixes. Coverage includes resolved-original corruption, authored projection failure preservation, and cold/warm final corruption. Healthy finals stay quiet; opt-out preserves damaged rows; opt-in reports one reset notice. The warm browser retains its pending command until destructive reset acknowledgement, then successfully resubscribes to the replacement. This is a focused run, not a full-suite claim.
2. `pnpm nx run-many -t ts lint --projects=@zerospin/browser,@zerospin/error` passed without lint warnings. The prerequisite libraries and CLI/React/browser builds passed. After the final-command audit, `@zerospin/browser:ts` and `pnpm nx run-many -t lint --projects=@zerospin/browser,@zerospin/core` passed with zero errors and the same 22 existing core warnings confined to unchanged files.
3. Ran the existing `aggregate-host.browser.ts` / `aggregate-host.worker.ts` fixture in a fresh Chrome profile on a disposable loopback origin. The fixture verified that its newly seeded namespace contained a persisted invalid checkpoint before public initialization. Successful replacement emitted exactly one specific notice while initializing, reached `ready`, and staged a counter increment from 7 to 8. Forced replacement failure remained `failed` with no success notice. There were no page errors; application storage was untouched.
4. Independent production review found no actionable correctness issues. Changed-file formatting and `git diff --check` passed. No Explorer checks were run.

## Remaining work

None.
