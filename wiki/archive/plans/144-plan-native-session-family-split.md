# 144 — Native session family split

**Status:** Implemented and verified on 2026-10-12.
**Date:** 2026-10-12.

## Problem and starting evidence

1. At planning, `makeNativeSession` accepted only `IAnyAggregateSessionRelease` and performed aggregate session construction, replica reconciliation, command handoff, staging, and connected lifecycle control. That implementation now lives in [`createAggregateNativeSession`](../../../packages/native/src/createAggregateNativeSession.ts); [`makeNativeSession`](../../../packages/native/src/makeNativeSession.ts) selects the native family.
2. The former `decodeNativeSessionBinding` and `openNativeNodeOwner` names also hid aggregate-only responsibilities. Their implementations now live in [`decodeAggregateNativeSessionBinding`](../../../packages/native/src/decodeAggregateNativeSessionBinding.ts) and [`openAggregateNativeNodeOwner`](../../../packages/native/src/openAggregateNativeNodeOwner.ts). The configuration still requires the same `aggregateId` field under its accurate `AggregateNativeConfigurationSchema` name.
3. Browser already keeps one [`makeBrowserSession`](../../../packages/browser/src/makeBrowserSession/makeBrowserSession.ts) entry with internal `createAggregateBrowserSession`, `createServiceBrowserSession`, `createStandaloneBrowserSession`, and `createAggregateAgentBrowserSession` implementations. [`makeSharedWorker`](../../../packages/browser/src/makeSharedWorker.ts) likewise selects concrete aggregate, service, and standalone worker implementations.
4. Native consumes a different release shape: the core [`IAnyAggregateSessionRelease`](../../../packages/core/src/aggregateSession/types.ts) has `kind: 'aggregate'`; browser host declarations use `sessionType`. Copy the browser ownership structure while retaining native's existing core release contract.
5. Native construction is asynchronous and resolves only after `runtime.initialize` succeeds. [`nativeGameSession`](../../../examples/tic-tac-toe/src/nativeGameSession.ts) awaits that promise before retaining or publishing the session. Preserve this behavior instead of adopting the browser's synchronous cold facade.
6. Existing ownership constraints are documented in [Plan 114](114-plan-native-persistent-owner.md), [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md), and the [native README](../../../packages/native/README.md). Use current source to establish acquisition and cleanup ordering; the archived plan is historical evidence.

## Agreed behavior and scope

1. Keep `makeNativeSession` as the package's public async entry. Make its body a small dispatch on `sessionRelease.kind`, with the implemented aggregate branch delegating to `createAggregateNativeSession`.
2. Move the existing aggregate implementation into the internal `createAggregateNativeSession` function. It owns binding validation, core session construction, the shared lifecycle, the aggregate Node owner, the persistent replica, handoff, projection, and controls.
3. Preserve the existing supported release type and application-services restriction. Accept aggregate releases only; do not widen the input union to families that lack native implementations. Unsupported runtime kinds reject before acquiring resources. Keep the dispatcher async so such refusals are promise rejections.
4. Preserve the returned controls and their meanings: `snapshot`, `stage`, `resume`, `suspend`, `pushNow`, `clearAuthentication`, and `dispose`. Construction still resolves to initialized controls; disposal remains terminal and repeated disposal joins the same drain.
5. Preserve core `makeSessionLifecycle`, authentication, synchronization, handoff, failure observation, and replica receiver reuse. Keep the shared native host and SQLite driver in their current locations. This split introduces no new runtime owner, generic adapter, or native lifecycle abstraction.
6. Implement the aggregate extraction and naming cutover only. Service, standalone, and aggregate-agent support require their own subsequent implementation scopes; create no placeholder files or branches for them. A future family must have a real declaration, typed inputs, and owner before entering the public union. Standalone's native declaration must be settled with that feature; do not assume browser `sessionType` exists on today's core releases or that standalone requires a new core Node class.
7. Make no persistence or protocol changes. Retain configuration fields, JSON snapshots, identity hash inputs, `node_${key}` / `session_${key}` file names, fixed schema version, journal rows, checkpoints, and transaction boundaries. Renaming TypeScript symbols does not require storage reset or row translation.
8. Preserve the Swift executor's directory lease, serialization, initialization/publication fencing, and teardown. No Swift or host source change is required by this extraction. Preserve unrelated working-tree changes.

## Names and public surface

1. Use `createAggregateNativeSession` to match the internal browser creator convention. Export only `makeNativeSession` as the constructor from the native package entry.
2. Rename `decodeNativeSessionBinding.ts` / `decodeNativeSessionBinding` to `decodeAggregateNativeSessionBinding.ts` / `decodeAggregateNativeSessionBinding`. Rename `INativeSessionBinding` to `IAggregateNativeSessionBinding`.
3. Rename `NativeConfigurationSchema` and `NativeConfiguration` to `AggregateNativeConfigurationSchema` and `AggregateNativeConfiguration`. Export the new names from `index.ts` and update the existing TicTacToe schema import/use. Delete the old exports; provide no compatibility aliases.
4. Rename `openNativeNodeOwner.ts` / `openNativeNodeOwner` to `openAggregateNativeNodeOwner.ts` / `openAggregateNativeNodeOwner`, including its `Effect.fn` label. Rename `INativeNodeOwner` to `IAggregateNativeNodeOwner`.
5. Keep the already accurate `openPersistentAggregateReplica` and family-neutral `openNativeSqlite` names. Update the replica's binding/owner type imports.
6. Keep input and output typing precise without inventing a general family union. The dispatcher can derive its props from `Parameters<typeof createAggregateNativeSession>[0]` and infer the same awaited controls. A separate types module is unnecessary for this single implementation.

## Alternatives and rationale

1. Keeping all future families inside one constructor would distribute family checks across binding, storage, staging, and synchronization. Select the concrete implementation once at the public entry instead.
2. Exporting separate public family constructors would make applications choose framework internals. Retaining the established public `makeNativeSession` call follows the browser package's existing entry structure.
3. Adopting browser release wrappers or adding unsupported-family types now would change native's authored contract without implementing the corresponding behavior. Preserve `kind` and expand the contract only with real native support.
4. Introducing shared native orchestration helpers now would have only one family consumer. Reuse the existing focused owners; consider further shared extraction only when another implementation exposes an actual common responsibility.

## Implemented source hierarchy

Legend: `+` create, `~` modify, `-` delete. The new decoder and Node owner replace the deleted files; their implementation is retained under the accurate names. Documentation changes occur after implementation.

```text
zerospin/
├── packages/native/
│   ├── src/
│   │   ├── ~ makeNativeSession.ts
│   │   ├── + createAggregateNativeSession.ts
│   │   ├── + decodeAggregateNativeSessionBinding.ts
│   │   ├── - decodeNativeSessionBinding.ts
│   │   ├── + openAggregateNativeNodeOwner.ts
│   │   ├── - openNativeNodeOwner.ts
│   │   ├── ~ openPersistentAggregateReplica.ts
│   │   └── ~ index.ts
│   └── ~ README.md
├── examples/tic-tac-toe/src/
│   └── ~ nativeGameSession.ts
└── wiki/
    └── ~ glossary.md
```

## Ordered implementation

1. Recheck the scoped working tree and current native callers. Keep unrelated changes intact; use the existing native, browser, and SharedWorker boundaries already reviewed here.
2. Move the aggregate constructor body into `createAggregateNativeSession.ts`, change its function name, and retain operation order. In particular, preserve binding validation before file acquisition; Node acquisition before replica acquisition; the accepted-delivery finalizer before file closure; abort-listener removal; and the startup catch that awaits disposal before rethrowing the original failure.
3. Replace `makeNativeSession` with the typed async `kind` dispatcher. It performs no acquisition, staging, or transport work itself. Its aggregate branch returns the creator promise; its default rejects unsupported runtime kinds before opening either SQLite file.
4. Rename the binding and Node owner files/functions/types and the aggregate configuration exports. Update creator and replica imports, the native package entry, and the TicTacToe schema import/use in the same cutover. Keep the application's `makeNativeSession` call and `Awaited<ReturnType<typeof makeNativeSession>>` usage.
5. Review the moved body against the original, separating symbol/import changes from behavioral changes. Remove superseded files and exports. Do not change the native bundle entry, Swift API, host bridge, synchronization algorithms, storage schemas, or cleanup sequence.
6. Run the existing scoped verification below and resolve regressions caused by this change. Report unrelated failures with evidence instead of broadening the refactor.
7. Reconcile the native README and the existing **Native session host** glossary entry against the implemented result. Describe `makeNativeSession` as the entry and point aggregate composition evidence to `createAggregateNativeSession`. Keep the domain definition about native ownership and delivery, rather than adding glossary entries for helper functions. Preserve archived plans and review snapshots as historical records.
8. Create an ADR only if implementation produces a decision that is hard to reverse, surprising without context, and the result of a real trade-off. This routine extraction is not expected to need one. Record actual verification and any limits in this plan, then archive it only when implementation and required checks are complete.

## Verification and acceptance

1. No new tests, fixtures, check runners, or configuration are authorized. This structural extraction uses source comparison and the existing compiler, bundle, and lint seams.
2. Reconfirm resolved Nx targets if their configuration changes. Current `@zerospin/native:ts` runs real TypeScript, includes the TicTacToe native entry, and depends on the actual native bundle build plus dependency libraries. Run:

   ```sh
   pnpm nx run-many --targets=ts,lint --projects=@zerospin/native --parallel=1
   pnpm nx run tic-tac-toe:lint
   ```

   Keep the calls sequential. The first graph verifies the public export, family implementation, renamed imports, and actual JavaScriptCore application bundle. The second covers the changed application source. Native's disabled `tsc:typecheck` target supplies no TypeScript evidence.

3. Format/check only changed files using the existing formatter, and run `git diff --check`. Search active source and documentation for the removed decoder/owner/configuration/type names; only historical archived records and snapshots may retain them.
4. Inspect the extracted body to establish that suspend/resume, authentication withdrawal, handoff/push, publication fences, and failure/cleanup ordering remain identical. Confirm that the dispatcher remains async and returns the same initialized control type, and that the family creator remains internal to the public package entry.
5. Compare persistence constants and identity derivation before/after. This plan is complete only with unchanged durable file keys, schema version, encoded rows, and transaction boundaries; a proposed change to any of those is outside this scope.
6. `zerospin-swift:build` and `tic-tac-toe:ios:build` are existing integration gates available if bundle consumption exposes a concern. Neither native nor Swift has a permanent test suite. The example's documented `ios:test` target is absent and cannot be used as verification. Compilation and source comparison are sufficient for this extraction; do not claim fresh runtime persistence, suspension, or disposal evidence from them, and do not add a host fixture to obtain it.

## Completion checklist

1. `makeNativeSession` contains only async family selection and delegates its aggregate branch to the concrete creator.
2. Aggregate-only bindings, configuration exports, and Node ownership have aggregate-specific names, with all current callers updated and no compatibility aliases.
3. Native startup still resolves after initialization, existing controls and lifecycle behavior are preserved, and storage/protocol identity remains exact.
4. Existing scoped gates and formatting pass; source comparison and removed-name checks are recorded.
5. README/glossary references describe implemented ownership, no unimplemented families or unnecessary ADRs are added, and the completed plan is archived with its verification evidence.

## Implementation outcome and verification

1. `makeNativeSession` is now a typed async `kind` dispatcher with one implemented aggregate branch. The internal `createAggregateNativeSession` owns the previous constructor. Binding, configuration, and Node owner names are aggregate-specific; public exports, the TicTacToe caller, the native README, and the existing glossary entry are updated. Superseded helper files and configuration exports are removed without aliases.
2. Comparing the previous source at `d79e9508ab39ce3a4ed15a46315b648bd2679957` with the final source after only planned names and formatter output confirms identical aggregate construction, binding, Node owner, and replica implementations. The caller additionally required named-import ordering. Acquisition/finalization, startup failure cleanup, durable identities, file names, fixed schema version, and transaction boundaries remain unchanged.
3. The initial primary-checkout native graph passed all 11 tasks (`/tmp/zerospin-plan-144-native-20261012.log`). The example's in-scope import-order warning was corrected, and its final lint passed without source diagnostics (`/tmp/zerospin-plan-144-tic-tac-toe-lint-final-20261012.log`). A subsequent native rerun encountered concurrent, unrelated telemetry WIP: both core session collectors lacked the newly required `ITelemetryCollector.flushOwn` method (`/tmp/zerospin-plan-144-native-final-20261012.log`). That work was preserved; no telemetry repair is part of this plan.
4. Final verification therefore used a managed checkout of the starting commit with exactly this plan's seven production files copied in and the two superseded helpers removed. Frozen-lockfile installation succeeded, and all 87 workspace dependency links resolved inside that checkout. The fresh checkout initially lacked SDK browser declarations consumed by the existing TicTacToe entry; `pnpm nx run @zerospin/sdk:lib` supplied that existing prerequisite without source or graph changes (`/tmp/zerospin-plan-144-isolated-sdk-lib.log`, exit 0).
5. The final isolated `pnpm nx run-many --targets=ts,lint --projects=@zerospin/native --parallel=1` passed all 11 tasks (`/tmp/zerospin-plan-144-isolated-native.log`, exit 0). The actual native bundle and lint had passed on the first attempt; the final graph reused their valid cached output and ran real TypeScript successfully. Subsequent `pnpm nx run tic-tac-toe:lint` passed without source diagnostics (`/tmp/zerospin-plan-144-isolated-tic-lint.log`, exit 0).
6. All seven verified production files match the primary checkout byte-for-byte, and the old helpers are absent (`/tmp/zerospin-plan-144-isolated-file-audit.log`). Scoped formatting, relative source links, removed-name searches, and `git diff --check` pass. Active source/docs contain no compatibility names; archived plans and snapshots retain their historical names. The temporary verification checkout has been archived through the managed worktree tool; only its recoverable snapshot remains attached.
7. Nx Cloud reported access code 401 while the local checks exited successfully. Nx also labeled the initial missing-declaration failure followed by a successful prerequisite-backed run as flaky; the observed cause was absent generated dependency output in a fresh checkout. No permanent tests, fixtures, runners, configuration, or ADRs were added. Swift/iOS runtime behavior was not newly exercised; the verified claim is structural preservation plus bundle/type/lint success for this patch, rather than a claim that the evolving primary checkout passes all projects.

## Remaining work

None.
