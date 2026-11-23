# Development replica recovery and error messages

**Date:** 2026-10-15  
**Scope:** Current Zerospin source and the approved terminal-error cutover. This
note separates observed behavior from the proposed recovery policy; it does not
establish that recovery is implemented or verified.

## Findings from primary sources

1. **Opaque messages come from shared construction defaults.** `ZerospinError`
   uses `props.message ?? props.code`. `catchZerospinError` independently defaults
   its message to the code and normally substitutes an `Error` cause's message.
   Changing only the base constructor would miss wrappers that explicitly pass
   the code as a message. Existing factories demonstrate per-code defaults for
   `node-closed` and `node-command-input-conflict`.
   [Base constructor](../../packages/error/src/ScopedError.ts#L20-L28),
   [catch wrapper](../../packages/error/src/makeZerospinError.ts#L88-L110),
   [existing defaults](../../packages/error/src/NodeErrors.ts#L1-L10).

2. **This requires a framework-wide audit, beyond checkpoint conflicts.** An AST
   inspection of the working tree on this date found 818 `makeZerospinError`
   calls under `packages/*/src`, excluding `*.spec.ts` and `*.test.ts`; 609 had
   no inline `message` property. Browser source accounted for 189 calls, 184
   without one. Another 26 of 39 `catchZerospinError` calls omitted it. These
   counts include forwarding calls whose input can already contain a message;
   they are an audit estimate, not a count of defective runtime messages.
   Dynamic codes also exist, such as `${recordKind}-not-found`, so a finite
   catalogue alone cannot cover every construction path. Validation mapping
   already produces contextual prose and must retain it.
   [Construction entrypoints](../../packages/error/src/makeZerospinError.ts#L33-L59),
   [dynamic lookup failures](../../packages/core/src/utils/getByKeyOrThrow.ts#L17-L24),
   [validation formatter](../../packages/error/src/mapParseError.ts#L11-L21).

3. **`node-checkpoint-conflict` does not currently prove divergent history.**
   Both browser synchronizers translate the bare `state-required` control to
   that code. Aggregate replay emits it for a checkpoint/hash or issued-node
   mismatch; aggregate message handling also emits it for absent or mismatched
   connection state. Service handling catches any Cause and emits the same
   control. Resetting on the current code could therefore discard a DEV replica
   after an unrelated service defect. Exact refusal reasons must survive the
   protocol before destructive policy uses them.
   [Aggregate translation](../../packages/browser/src/AggregateNode/AggregateNodeSynchronization.ts#L338-L340),
   [service translation](../../packages/browser/src/ServiceNode/ServiceNodeSynchronization.ts#L335-L337),
   [checkpoint comparison](../../packages/system-worker/src/aggregateSessionChain/onMessage/replayAggregateSocketCommands.ts#L29-L49),
   [connection-state refusal](../../packages/system-worker/src/aggregateSessionChain/onMessage/onMessage.ts#L35-L45),
   [service catch-all](../../packages/system-worker/src/ServiceActorVersionChain/ServiceActorVersionChain.ts#L242-L254).

4. **Schema incompatibility already triggers destructive recovery without a DEV
   gate.** Both hosted worker runtimes catch `node-storage-reset-required`, reset
   the open database and initialize again. That code is emitted when stored
   tables have an unsupported SQLite `user_version`. `resetNodeStorage` drops
   all non-SQLite tables in a transaction and resets the version. Neither caller
   checks the deployment environment. Moving this existing behavior behind the
   same DEV policy is required to satisfy "never in production."
   [Aggregate recovery](../../packages/browser/src/AggregateNode/makeAggregateWorkerRuntime.ts#L127-L147),
   [service recovery](../../packages/browser/src/ServiceNode/makeServiceWorkerRuntime.ts#L122-L142),
   [schema rejection](../../packages/core/src/ServiceNode/ServiceNode.ts#L157-L179),
   [destructive reset](../../packages/browser/src/Node/resetNodeStorage.ts#L11-L43).

5. **The server knows its deployment mode; the browser does not yet have a
   verified recovery capability.** Deployment configuration sets
   `ZEROSPIN_ENVIRONMENT`, and Gateway authorization uses that value for DEV
   versus production key policy. The browser request and verified-admission
   shapes carry identity, snapshots and credentials, with no server-verified
   deployment mode. A DEV frontend build, localhost URL or publishable-key
   spelling cannot establish that the contacted backend is disposable.
   [Deployment binding](../../packages/dev-worker/src/makeWranglerConfig.ts#L105-L108),
   [Gateway policy](../../packages/system-worker/src/GatewayApi/checkPublishableApiKey/checkPublishableApiKey.ts#L9-L33),
   [browser request](../../packages/browser/src/AggregateNode/aggregateNodeRequest.ts#L3-L11),
   [aggregate admission](../../packages/browser/src/AggregateNode/verifiedAggregateAdmission.ts#L9-L13),
   [service admission](../../packages/browser/src/ServiceNode/verifiedServiceAdmission.ts#L9-L13).

6. **The shared worker owns the replicated database and its destructive lifetime.**
   `openNodeStorage` owns one SQLite engine, VFS and database per namespace; an
   exclusive Web Lock protects the namespace lifetime. The hosted worker owner
   combines storage, the node, authentication and synchronization, and serves
   multiple attachments. Authentication obtains a snapshot, but an initialized
   replica does not install it as a replacement baseline. Recovery therefore
   belongs alongside that owner, with old synchronization and node work drained
   before mutation; a React catch or individual tab cannot safely own it.
   [Persistent storage](https://github.com/morgs32/zerospin/blob/41b548a019ff1e08f65f60c9459e0908a80c64f5/packages/browser/src/Node/openNodeStorage.ts#L8-L15),
   [namespace lease](../../packages/browser/src/Node/makeNodeNamespaceLease.ts#L3-L19),
   [owner composition](../../packages/browser/src/AggregateNode/makeAggregateWorkerRuntime.ts#L150-L208),
   [baseline guard](../../packages/browser/src/AggregateNode/makeAggregateWorkerRuntime.ts#L249-L275),
   [ordered shutdown](../../packages/browser/src/Node/closeNodeStorageOwner.ts#L1-L29).

7. **Recovery must respect the terminal-error cutover.** A session retains its
   first original terminal error and disposes its lifetime; later reconnects may
   not restore that instance. Existing structured errors survive normalization;
   public encoding retains code/message/status/JSON extras while excluding
   diagnostic causes and stacks. DEV recovery must happen before terminal
   publication, or proceed through a fresh owner rather than reviving a failed
   one. Ordinary command refusals remain ordinary command outcomes.
   [Approved terminal-error findings](./session-fatal-errors-and-live-query.md),
   [first-error retention](../../packages/core/src/sessionFailures/makeSessionFailures.ts#L4-L23),
   [lifecycle fencing](../../packages/browser/src/makeSessionLifecycle.ts#L91-L117),
   [structured error retention](../../packages/core/src/Node/encodeNodeFailure.ts#L9-L19),
   [public codec](../../packages/error/src/encodeError.ts#L5-L11).

## Proposed direction

- **Explain framework errors centrally.** Add reviewed default prose for
  Zerospin-owned codes in `@zerospin/error`, preserve explicit contextual
  messages, and make catch wrappers use the same defaults. Audit dynamic
  construction sites separately. Application-authored business messages remain
  owned by their declarations and callbacks; do not put application domain
  knowledge in the framework catalogue.
- **Classify before resetting.** Preserve explicit server refusal reasons and
  public structured errors. Automatic destruction should initially cover only
  proven checkpoint/history incompatibility and unsupported local replica
  schema. Connection-state faults, authentication failures, transport outages,
  arbitrary defects and command refusals do not establish that wiping storage
  can repair the problem.
- **Make DEV an authenticated backend fact.** Recovery requires an explicit DEV
  capability from the same authorized backend used to obtain the replacement
  baseline. Production, absent capability, offline operation and failed
  authorization must preserve replica storage and follow normal failure
  behavior. Replace the current unconditional schema-reset path accordingly.
- **Keep one worker-owned recovery policy.** Both hosted node families should
  consult the same small decision point. The shared owner fences attachments,
  stops and drains old work, resets only its own replica, and creates a fresh
  baseline/runtime under its namespace lease. Bound recovery to avoid a reset
  loop, and retain the originating structured error if recovery cannot finish.
  This proposal does not authorize wiping standalone or native authoritative
  local data.
- **Pending DEV work may be discarded.** The user explicitly chose this policy:
  the affected replica's pending node commands and tab-local edits may be lost
  during DEV recovery. All affected attachments must retire their old journals
  rather than submit them into the replacement history. No destructive recovery
  is allowed against production.

An accurate default for the current broad checkpoint code is: "This replica
cannot resume from its saved checkpoint. Its history may differ from the
server's history for the same identity, for example after resetting or replacing
backend storage." Once the protocol identifies a particular mismatch, the
message can describe that observed mismatch directly.

## Verification boundary

Required acceptance scenarios are retained-browser/backend-reset recovery,
unsupported replica schema, multiple attached tabs, pending DEV commands,
bounded failure during recovery, and preservation of the original terminal
error. Repeat destructive candidates against a production backend and require
zero replica mutation. Arbitrary service defects and connection-state refusals
must not become reset-worthy checkpoint conflicts. Check explicit-message and
public-RPC preservation as well as defaults. This note adds no tests or runtime
verification; use repository-authorized existing checks and report their actual
results during implementation.

The installed Intent command was unavailable (`Command "intent" not found`).
No replacement was downloaded; research followed repository guidance and the
primary source files linked above.

## Implemented outcome

The pre-change findings above informed [Plan 155](../archive/plans/155-plan-descriptive-errors-and-dev-replica-recovery.md), now implemented and verified. Framework defaults preserve explicit/scoped wording and safe schema diagnostics. Connected aggregate/service workers recover only the two allowed failures after current authenticated DEV proof, discard acknowledged pending work, and preserve production storage. The archived plan records the final package, Workerd, protocol and real-SQLite recovery checks. Package publication and QRK installation remain a separate integration step.
