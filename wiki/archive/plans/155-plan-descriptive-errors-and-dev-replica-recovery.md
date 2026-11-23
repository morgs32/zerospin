# Descriptive errors and DEV-only connected replica recovery

**Status:** Complete; implementation and required verification passed. Package release and QRK installation remain a subsequent integration step.  
**Date:** 2026-10-15  
**Repository:** Zerospin; QRK consumes a subsequent exact package release.

## Problem and outcome

1. Framework errors frequently repeat their code as their message. Give every Zerospin-owned framework error a useful explanation while retaining its stable code, useful explicit messages, public details, and existing cause/privacy rules.
2. Resetting backend storage can leave an initialized browser Node referring to an earlier history under the same identity. Recover automatically against a verified development backend, including discarding pending development work, while production preserves local storage and reports the error.
3. The worker that owns the persistent Node owns recovery. Applications receive either a healthy session or the existing terminal session error; they acquire no reset/retry integration responsibility.

Research and current source: [error/recovery findings](../../research/development-replica-recovery-and-error-messages.md), [session-wide terminal errors](../../research/session-fatal-errors-and-live-query.md), [previous schema recovery](147-plan-browser-storage-recovery.md). The related chat is [Research useLiveQuery error handling](codex://threads/01a13d15-ca11-7523-a683-0b87a996e788). Preserve that work; it is already present as uncommitted changes in the primary checkout.

## Settled behavior and scope

1. **DEV may discard pending work.** The user explicitly selected automatic disposal of the affected Node's unsent edits and commands. Clear its durable journal and each attached tab's corresponding local staging; never replay old pending commands into the replacement history.
2. **Production never automatically wipes a connected replica.** Apply this restriction to both the new checkpoint recovery and the existing connected schema-incompatibility reset. Keep ordinary compatible storage, offline operation, command refusals, and business results intact.
3. **Authorize from the server.** Only a current successful authenticated snapshot from the requested backend, explicitly containing `environment: 'dev'`, authorizes deletion. Frontend build mode, hostname, key prefix, a tab-supplied flag, and remembered/offline metadata do not authorize it. Obtain and validate the complete replacement baseline before any destructive operation.
4. **Use a narrow initial policy.** Allow confirmed resume-checkpoint conflicts and `node-storage-reset-required`. Do not automatically erase for node identity mismatch, missing connection admission, server defects, replay/execution gaps, outcome conflicts, authentication failures, invalid snapshots, quota/I/O failures, or arbitrary application errors.
5. **Bound recovery.** Permit one destructive attempt per named connected worker runtime lifetime, shared across its concurrent attachments. Successful recovery does not replenish the budget. An in-progress recovery is joined, not counted as another attempt. A subsequent failure follows the existing terminal path.
6. **Recover in place across attached tabs.** Use existing subscription epochs, Node IDs, handoff epochs, and initialized-capability identity. No document reload, React remount API, general recovery engine, or additional persisted recovery-generation field is needed.
7. **Keep scope explicit.** Cover connected aggregate and service browser Nodes. Native, agents, standalone-only automatic reset policy, manual standalone reset, backend storage reset, and application-defined business-error wording are outside this change. The message audit still covers framework errors in those packages.
8. **Follow the pre-release cutover policy.** Change the existing protocol in place and update affected producers, decoders, fixtures, and docs together. Add no legacy packet decoder or compatibility path. Do not bump SQL schema versions merely for message or protocol changes.

## Interfaces and ownership

### 1. Human-readable framework errors

1. Add `packages/error/src/defaultErrorMessages.ts`, exporting an internal `Map<string, string>` named `defaultErrorMessages`. It contains reviewed explanations for framework-owned static codes, not application business codes. Its two direct consumers are `ScopedError.ts` and `makeZerospinError.ts`; no public barrel or error-registration mechanism is needed.
2. Resolve constructor messages as explicit instance message, then reviewed framework default, then the existing code fallback for unknown/application-defined codes. Known framework codes must not reach that fallback after the audit. Scoped contract/actor/aggregate business errors bypass the framework catalog even when their code matches a catalog key.
3. Make `catchZerospinError` use the same defaults. Change `preferCauseMessage`'s default to `false`; an explicit `true` remains an intentional opt-in. The precedence is explicit instance message, opted-in cause message, framework catalog, then code. Preserve the formatted cause separately. Do not make unrelated wrappers return a different error scope or change their declared code.
4. Inventory direct constructors, factories, catch helpers, generated code, and runtime-generated codes across package source. Supply contextual messages at dynamic construction sites such as `getByKeyOrThrow`; do not mechanically turn kebab-case into prose. Review existing explicit messages and retain useful validation/model/request details.
5. Preserve already-received structured errors through worker and session reporting. Continue excluding backend causes/stacks from public RPC; use the existing safe JSON `extra` for checkpoint facts. No new error wire field is required.

Annotated example of the default and an instance-specific diagnostic:

```ts
// 1. Reviewed framework prose is the default for every producer of this code.
export const defaultErrorMessages = new Map<string, string>([
  [
    'node-checkpoint-conflict',
    'The shared worker node cannot resume from its saved checkpoint. ' +
      'The server history for this identity may have been reset or replaced.',
  ],
]);

// 2. The producer supplies observed facts; it does not guess a backend reset.
throw makeZerospinError({
  code: 'node-checkpoint-conflict',
  extra: { reason, requested, retainedDispositionHash, current },
});

// 3. An explicit contextual message remains authoritative.
makeZerospinError({
  code: 'node-checkpoint-conflict',
  message:
    'The service replica checkpoint no longer matches the server history.',
});
```

### 2. Truthful synchronization rejection and backend mode

1. Extend the existing aggregate and service socket server-message unions with the two inline `state-required` branches below. Reuse existing position/hash validators and inferred protocol types; introduce no new named protocol interface.
2. Emit `checkpoint-conflict` only when the requested history position/hash is absent or different, or the server history ends before the requested position. Check ticket-bound Node identity separately and emit `node-identity-mismatch` for it.
3. Emit `connection-state-invalid` for missing/wrong retained admission or connection state. Service catch-all failures and the final post-replay hash invariant emit `server-failure`; they must never masquerade as a stale local checkpoint. Preserve their actual backend diagnostics through existing logging.
4. Map only the checkpoint reason to `node-checkpoint-conflict`. Map other reasons to `node-state-required` with reason-specific messages and safe `extra`. Neither `service-resume-checkpoint-conflict` nor a generic `state-required` packet is a deletion allowlist.
5. Add required `environment: ISystemEnvironmentId` to authenticated aggregate/service snapshot response contracts and their existing schemas. Populate it in the authorized session APIs from `ZEROSPIN_ENVIRONMENT`, whose current values are `'dev' | 'production'`. Carry it into verified admission privately; keep it out of Node identity hashing and persisted authorization decisions.
6. For every destructive recovery, including a warm checkpoint conflict, make a new authenticated snapshot request with `nodeId: null`; do not reuse authentication's snapshot for the old producer. Validate ownership, full claims, declarations, resource decoding, checkpoint, and mode before clearing, and require `resolvedThrough === 0`. An old-producer snapshot can carry nonzero resolved outcomes and is not a fresh Node baseline. This request must also work during cold incompatible-schema recovery without reading old Node metadata.

Annotated aggregate packet; service packets use `serviceIndex` in both checkpoint objects:

```ts
// 1. This is the only socket rejection eligible for DEV rebuilding.
{
  type: 'state-required',
  reason: 'checkpoint-conflict',
  requested: { aggregateIndex: 5, dispositionHash: '<requested 64-char hash>' },
  retainedDispositionHash: null, // No server record exists at requested index 5.
  current: { aggregateIndex: 3, dispositionHash: '<current 64-char hash>' },
}

// 2. These observations require an error, not a replica wipe.
{
  type: 'state-required',
  reason: 'node-identity-mismatch' | 'connection-state-invalid' | 'server-failure',
}
```

The union expression above documents the schema alternatives; emitted packets contain one literal reason. No credentials, full claims, resource contents, or private backend causes enter these diagnostics.

### 3. Worker-owned recovery and attached-tab invalidation

1. Add one internal `shouldResetConnectedNode` policy in `packages/browser/src/Node/shouldResetConnectedNode.ts`, called by the aggregate and service worker runtimes. Its inline props are the current verified `ISystemEnvironmentId`, the structured failure, and whether the destructive attempt has been spent. It accepts only DEV plus the two eligible codes. Each runtime retains its own attempt state and coalesced recovery promise because it owns its namespace and storage lease.
2. Handle an eligible socket rejection before publishing `connectionState('blocked', error)` or emitting a terminal failure. An outer synchronization driver receives both startup and already-live socket failures, retires the failed attempt and queued deliveries, then invokes runtime-owned recovery. Do not await recovery from the socket delivery queue or call `stop()` from its own connecting continuation: those paths await themselves.
3. Add an internal `reset(): Promise<void>` notification to connected browser subscription sinks. The general Node sink may expose that capability optionally for native/standalone callers, but connected-browser adapters must supply it. Missing support on a live connected attachment prevents destructive recovery; there is no compatibility fallback.
4. Extend `makeNodeSubscriptions` with `prepareReset()`: retire each old lease's delivery epoch, pause ordinary snapshots/state/commands, and await the connected sinks' reset acknowledgements. Keep the namespace lease held, but never hold the Node SQL gate across a remote callback. Bound acknowledgement waiting to 15 seconds, matching the existing connection-startup deadline, and observe runtime/attachment cancellation. A detached sink follows existing cleanup; an unresponsive still-attached sink aborts recovery before deletion. Opening leases participate in this barrier; new attachments and subscriptions wait for its completion. On success, capture the post-replay Node snapshot before releasing delivery so tabs initialize with the complete replacement. On recovery failure, release the delivery pause for terminal-state publication. A tab-local projection failure retires that attachment without failing another healthy tab.
5. A tab reset callback immediately makes the attachment unavailable, revokes `store.initialized`, resets the existing staged-command handoff epoch, clears originating-command tracking, and marks the next initialization as an announced Node replacement. It must not emit a terminal failure. Staging against a revoked initialized capability is refused through existing staging semantics.
6. Replace the affected persistent Node's journal/resources/checkpoint in its existing SQL transaction discipline, allocate a fresh Node ID and fresh append/push counters, and install the already-validated baseline. Add `resetConnectedBaseline(baseline)` to AggregateNode and ServiceNode as the runtime-owned core operation; it is not exposed as a connected browser session RPC. Preserve the existing standalone reset capability checks. Reuse the existing `resetNodeStorage` path only for cold incompatible-schema storage, under the same DEV authorization.
7. Replace every acknowledged tab's commands and session metadata in the same transaction as the existing projection initializer's resource/optimistic-table replacement. Add an internal `discardPending` boolean to the existing projection initialization props, default false; only the acknowledged DEV reset path passes true. Ordinary reconnect keeps its strict reconciliation checks. Build a fresh initialized capability object after replacement.
8. Existing `initialize(snapshot)` handles the announced replacement after `prepareReset`; keep ordinary, unannounced `node-epoch-changed` rejection. Ignore old-Node state/delivery callbacks after the announced reset. Resume tab command handoff only after the new baseline and replay complete and readiness is republished.
9. Replace the connected `stagedCommandSubscriber` getter with `getStagedCommandSubscriber(expectedNodeId)`. The tab supplies its observed Node ID; the returned subscriber retains it and validates it inside each Node acceptance transaction. Aggregate acceptance already has the expected-ID mechanism; add the equivalent to service acceptance. Old reset-era subscribers become the existing `outbox-source-replaced` retirement, so they cannot insert old work or terminate a successfully recovering tab. Do not accept the worker's new current ID on behalf of an old tab.
10. Make service staging and validation compare their captured initialized object with the current store object, matching aggregate staging. This fences asynchronous service work that resumes after a reset while the same DB handle/session ID remains in use.
11. Resume synchronization with a fresh ticket. Publish healthy state only after baseline durability and replay success; retain the spent attempt budget. A refused, failed, or repeated recovery follows the existing first-terminal-error lifecycle without clearing an already-retained terminal error. Pass the actual terminal structured failure through unchanged and retain the original rejection in the recovery diagnostic log.

Annotated lifetime example:

```text
1. Tab A and Tab B share Node N1; both have pending DEV commands.
2. Server rejects N1's checkpoint with reason=checkpoint-conflict.
3. Worker validates a fresh snapshot from that same backend: environment=dev.
4. Worker spends its single attempt and pauses old subscription deliveries.
5. A/B reset acknowledgements revoke readiness and retire their handoff epochs.
6. Worker commits replacement Node N2; old N1 subscribers cannot accept into N2.
7. A/B atomically discard old staging and initialize from N2's committed baseline.
8. Replay completes; A/B become ready and new commands use N2.
9. A late N1 receipt is ignored; another conflict becomes terminal, without a wipe.
```

## Implementation sequence

1. Re-read current terminal-error changes and relevant AGENTS/pattern guidance; preserve all unrelated checkout work. Finish protocol/error observations against current source rather than overwriting the related chat's lifecycle changes.
2. Implement the central message catalog and constructor/catch precedence. Audit all framework producers and dynamic codes; preserve authored error schemas and existing useful message details.
3. Implement the reasoned rejection packets and current authenticated environment field together across core, server, and browser. Eliminate service catch-all checkpoint classification.
4. Implement the two worker-runtime recovery owners and shared narrow policy, including authenticated cold schema recovery. Keep generic defects terminal and offline compatible storage intact.
5. Implement the reset acknowledgement, paused subscription delivery, atomic connected baseline replacement, tab replica discard, expected-Node subscriber fencing, and service initialized-capability checks. Cover cold attach and active reconnect without a new application integration API.
6. Extend the existing identity verifier and run the scoped checks below. Add no test files, fixture files, runners, or test configuration.
7. Update package READMEs, the failures/recovery handbook, synchronization docs, and browser reference. Reconcile the existing glossary only after implementation; create an ADR only if the implemented result meets the repository's hard-to-reverse/trade-off criteria. Document DEV data loss, production preservation, rejection diagnostics, and the one-attempt bound.
8. Record actual outcomes and remaining work in this plan. Keep it active until implementation and required verification finish; then archive it according to repository conventions. Release/publication and QRK dependency installation remain a subsequent explicitly scoped integration step, outside this implementation.

## Planned file hierarchy

Legend: `+` create, `~` modify. Braces group parallel aggregate/service files. Message-producer edits are limited to framework sites identified by the audit; do not mechanically rewrite every package.

```text
zerospin/
  packages/error/
    src/defaultErrorMessages.ts                                      +
    src/{ScopedError,makeZerospinError}.ts                            ~
    README.md                                                       ~
  packages/core/src/
    {aggregateSession,serviceSession}/types.ts                       ~
    aggregateSession/AggregateSocketProtocolSchema.ts                ~
    serviceSession/ServiceSocketProtocolSchema.ts                    ~
    {AggregateNode/AggregateNode,ServiceNode/ServiceNode}.ts           ~
    {AggregateNode/acceptAggregateOriginalTx,ServiceNode/acceptServiceOriginalTx}.ts ~
    Node/makeNodeSubscriptions.ts                                   ~
    {aggregateSession,serviceSession}/initialize*NodeProjection.ts    ~
    serviceSession/stageServiceSessionCommand*.ts                    ~
    utils/getByKeyOrThrow.ts                                         ~
    drizzle/provisionDb/validateDbSchema.ts                           ~
    {AggregateNode,ServiceNode,serviceSession}/README.md               ~
  packages/system-worker/src/
    {AggregateSessionApi,ServiceSessionApi}/getSnapshot/getSnapshot.ts ~
    aggregateSessionChain/onMessage/{onMessage,replaySocketCommands}.ts ~
    ServiceActorVersionChain/ServiceActorVersionChain.ts              ~
    ServiceActorVersionChain/onMessage/replayServiceSocketCommands.ts  ~
  packages/browser/src/
    Node/shouldResetConnectedNode.ts                                 +
    {AggregateNode,ServiceNode}/make*WorkerRuntime.ts                 ~
    {AggregateNode,ServiceNode}/*NodeSynchronization.ts               ~
    {AggregateNode,ServiceNode}/connect*Node.ts                        ~
    {AggregateNode,ServiceNode}/*BrowserSessionApi.ts                  ~
    {AggregateNode,ServiceNode}/receiveCommandRows.ts                  ~
    {AggregateNode,ServiceNode}/subscribe/subscribe.ts                 ~
    {AggregateNode,ServiceNode}/*NodeNetwork.ts                        ~
    fetch{Aggregate,Service}SessionSnapshot.ts                        ~
    sessionReplica/make{Aggregate,Service}ReplicaReceiver.ts           ~
    sessionReplica/makeServiceReplicaValidator.ts                     ~
    makeBrowserSession/create{Aggregate,Service}BrowserSession.ts     ~
    makeBrowserSession/README.md                                     ~
  packages/*/src/<remaining audited framework-message producers>      ~
  scripts/verify-session-identity.mjs                                 ~
  fragment/content/{handbook,reference}/<affected recovery docs>.md    ~
  wiki/glossary.md                                                   ~
  wiki/research/development-replica-recovery-and-error-messages.md     +
  wiki/archive/plans/155-plan-descriptive-errors-and-dev-replica-recovery.md +
```

The tree uses source-family globs for parallel implementations; resolve them against current source at pickup. Changes to existing shared subscription call sites required by their inferred types are in scope. No new public error type, named recovery context, or generic session engine is planned.

## Verification and acceptance

1. **Message coverage.** Use an ephemeral TypeScript AST audit of package source, not a new test runner, to enumerate static/dynamic framework producers. Every known framework code resolves to nonempty explanatory prose distinct from its code, or has an explicit contextual producer message. Check shorthand, direct constructor, factory, catch helper, explicit-message priority, `preferCauseMessage` opt-in, and JSON/RPC round trips. Unknown application codes and authored business messages retain their existing ownership.
2. **Truthful protocol classification.** Verify both aggregate/service history mismatch, missing requested position, server-behind progress, ticket Node mismatch, missing connection state, service catch-all, and final replay invariant. Only the first three history conditions can select destructive recovery; diagnostic checkpoints contain only public position/hash facts.
3. **Existing runtime seam.** Extend `scripts/verify-session-identity.mjs`, which already uses real SQLite and production worker-runtime code with stubbed admission/snapshot transport. Exercise cold incompatible schema and active checkpoint recovery for aggregate and service, multiple attached tabs, discarded Node/tab pending work, stale subscriber/receipt rejection, service asynchronous staging fences, snapshot replacement, and successful new command execution. Include warm recovery where the old producer has completed outcomes: require a fresh `snapshot(null)` and reject a nonzero `resolvedThrough` before mutation.
4. **Production preservation.** For the same two eligible errors with `environment='production'`, assert no reset helper, reset sink, destructive SQL, fresh Node ID, or readiness publication occurs. Compare logical table inventories, rows, user_version, and Node ID; include production snapshots served to a development-built frontend. Missing/malformed/offline/stale environment and rejected/mismatched admission likewise preserve storage. Use logical contents rather than file-byte comparisons for a live SQLite database.
5. **Bounds and interruption.** Cover one attempt shared by queued attachments, successful recovery followed by another conflict, second initialization/replay failure, cancellation before mutation, rollback and cleanup failure, detached sinks, stalled/late old deliveries, and lease retention. Assert no self-waiting socket/driver stop, old rows reappearing, empty ready Node, or late callback reviving a terminal instance.
6. **Existing behavior.** Preserve normal compatible reconnect, explicit offline recovery, ordinary command refusals, standalone reset behavior, and first-error terminal retention. Replace the existing verifier assertion that an offline incompatible attach already wiped tables with the new no-current-DEV-proof/no-write expectation.
7. **Scoped commands.** Use one Nx graph for the affected packages' `lib`, `lint`, and common `tsc:typecheck` targets: `@zerospin/error`, `@zerospin/core`, `system-worker`, `@zerospin/browser`, plus any actual message-producer package changed. `@zerospin/core` has no `ts` target. Run `system-worker:test-workerd` and `system-worker:test-workerd-ts` for the affected protocol, then the existing `node scripts/verify-session-identity.mjs` after required builds. Use current `pnpm nx show project` output to confirm any additional affected package targets, format only changed files, and run `git diff --check`.
8. **Contained manual check.** Use a disposable fixture on the existing framework verification seam, not QRK Library tests or a user's browser database. Reproduce retained checkpoint versus reset DEV history and verify two live attached replicas rebuild; repeat using a production-mode fixture and verify the verbose terminal error with intact storage. Do not reset an actual production backend or personal browser storage to prove the gate.

## Implementation outcome and verification

1. Implemented the reviewed framework message catalog and explicit/cause/default precedence; scoped business messages bypass the catalog, including code collisions. The ephemeral AST inventory found 1,098 producer calls and 541 finite codes; 286 reviewed defaults cover all finite message-free producers. Dynamic producers preserve received diagnostics or provide contextual prose. Constructor, factory, catch, scoped-codec, JSON and public-privacy probes passed.
2. Implemented required authenticated snapshot environment, truthful rejection reasons/checkpoint observations, fresh null-producer recovery baselines, DEV-only one-attempt worker recovery, cancellable tab acknowledgements, atomic Node/projection replacement, stale subscriber/receipt fencing, and service initialized-capability checks. No SQL version bump, public connected reset API, release, or QRK dependency change was made.
3. Final scoped verification passed: `pnpm nx run-many -t lib lint tsc:typecheck -p @zerospin/error @zerospin/core system-worker @zerospin/browser --skipSync --parallel=1` completed all 22 tasks. The affected browser/core/error files have no lint findings. Four unrelated existing system-worker warnings were preserved.
4. The final `system-worker:test-workerd` and `system-worker:test-workerd-ts` graph passed: 26 tests across six files, plus the test-source typecheck. The final `node scripts/verify-session-identity.mjs` passed all six groups against rebuilt outputs, including two actual SQLite tab projections, real worker-runtime code with stubbed admission, production preservation, one-attempt bounds, stale-work fencing, invalid/cancelled baseline preservation and runtime close during stalled reset acknowledgement. These fixtures replace retained history in disposable storage; no personal browser database or backend storage was reset.
5. Ephemeral protocol/connector probes passed 80 assertions using production replay/message procedures, snapshot codecs and connectors: mismatch/missing/behind diagnostics, Node-ticket mismatch before database reads, missing admission, final replay invariants, required dev/production environment, readiness withdrawal/republication and late old-Node callback rejection. Catch-all server-failure classification and Cause logging were inspected against source. Source-level reset probes covered the real 15-second deadline, missing support, detached sinks, cancellation and barrier joining. Detailed schema diagnostics remain intact through one deliberate `preferCauseMessage: true` at the schema validator; direct privacy probes and the full Workerd rerun passed. The explicit-message audit found no framework producer that merely repeats its code.
6. Nx sync independently proposes six pre-existing TypeScript reference updates, including browser's already-committed SDK dev dependency. No config was modified; scoped commands used documented `--skipSync` and serial scheduling because library cleanup and declaration typechecking share output paths. The concurrent service-origin work was left untouched and allowed to finish before final verification. Nx Cloud reports an access warning (401); local tasks run. Installed Intent is unavailable (`Command "intent" not found`); no replacement was downloaded.
7. Updated the affected Node/service/browser/error documentation, recovery/synchronization handbook and browser reference, and reconciled the existing glossary with implemented DEV recovery. No ADR was added: this bounded client recovery policy does not establish a new hard-to-reverse ownership decision.
8. Scoped formatting passed for the 81 matched source/documentation files, and `git diff --check` passed. The implementation is complete within this plan's scope; no package publication or QRK installation was performed.

## Remaining work

None.
