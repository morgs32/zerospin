# Session command availability and canonical-only execution

**Superseded exploration — 2026-10-27:** Completed
[Plan 271](../archive/plans/271-plan-remove-connected-session-command-execution.md)
removed connected-browser `executeCommand`; [Plan 270](../archive/plans/270-plan-contract-release-names-and-command-kinds.md)
is also complete. The source descriptions and open questions below are historical.
They justify no pending fields, execution gates, private outcome API or further
implementation. **Remaining work: none.**

Working-tree source review, 2026-10-26. Design discussion; no implementation or
storage changes. Scope: connected Aggregate and Service browser sessions.

## Current evidence

1. Connected `executeCommand` returns a private `ICommandOutcome`. It is a
   capability added to the ordinary browser-session facade; the common
   Aggregate/Service stores currently expose lifecycle and Node state, without
   command-availability fields. Sources: [connected facade](../../packages/browser/src/browserSession/types.ts#L52),
   [Aggregate state](../../packages/core/src/aggregateSession/types.ts#L128),
   [Service state](../../packages/core/src/serviceSession/types.ts#L109).
2. The connected Service submission procedure already checks known-online Node
   synchronization and rejects blocked work before adding a local row. The row
   uses the ordinary session allocator and retains `stagingOutcome: null` and
   `inverseOperations: null`. This is existing online-entry enforcement, not an
   observable UI capability. Source: submission: `../../packages/browser/src/bootstrapServiceSession.ts#L296` (historical working-tree path; file removed).
3. Node state already carries synchronization, authentication, blocked work,
   push pause and correlated admission rejection. These facts should be reused
   rather than copied into another independent connection flag. Source:
   [INodeState](../../packages/core/src/aggregateSession/NodeState.ts#L4).
4. Reading the private outcome does not install a session view. ServiceChain
   checks the complete admitted command and can return its retained outcome
   directly; session view installation separately commits resource replacement,
   per-command final position/failure and the view checkpoint. Sources:
   outcome read: `../../packages/system-worker/src/ServiceChain/awaitActorCommandOutcome.ts#L34` (historical working-tree path; file removed),
   [Service installation](../../packages/core/src/serviceSession/installServiceNodeView.ts#L110),
   [Aggregate installation](../../packages/core/src/aggregateSession/installAggregateNodeView.ts#L122).
5. Session cancellation ends the caller's wait without retracting retained work.
   The documented contract also distinguishes outcome recovery from resource-view
   catchup. Source: [connected canonical execution](../glossary.md#connected-canonical-execution).
6. Automatic ServiceNode delivery stops when `pushPaused` is true. The current
   submission precondition does not check that field. Sources:
   [nextPush](../../packages/core/src/ServiceNode/ServiceNode.ts#L577),
   submission precondition: `../../packages/browser/src/bootstrapServiceSession.ts#L300` (historical working-tree path; file removed).

## Proposed direction, not an agreed implementation

1. Keep the command category **Actor command**. Describe `executeCommand` as
   **canonical-only execution**; staging also leads to canonical execution, so
   “canonical command” does not distinguish the two paths. Do not introduce a new
   command kind or duplicate execution-mode flag.
2. If execution becomes single-flight within the calling session, expose
   `pendingExecution: { id, contractName } | null`. It identifies retained
   canonical-only work that still prevents that session from staging against a
   stale view; it is not a count of active Promise waiters. Publish it from the
   session journal and installed-view facts rather than toggling an independent
   boolean around `await`.
3. Expose derived command capabilities, provisionally `canStageCommand` and
   `canExecuteCommand`, for UI use. The command methods must enforce the same
   rules. Staging can remain available offline when the local session is usable;
   new canonical-only execution requires a ready session and a known-online,
   authenticated, unblocked Node able to deliver. Disable new execution while
   automatic push is paused rather than silently creating a wait that cannot
   progress automatically.
4. Keep readiness, caller-wait lifetime, command finalization and local view
   installation distinct. For the proposed staging exclusion, final Success and
   Failure both release the exclusion only when their final evidence and
   corresponding view are installed. Abort, disconnect or an unclassified
   transport error cannot prove the retained command was withdrawn.
5. Keep this state on the calling connected session. A Node-wide prohibition
   would require a separate concurrency design because Aggregate staging is
   synchronous against the session's own database. Source:
   [Aggregate staging](../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts#L47).

## Decisions still open

1. Whether new `executeCommand` submissions are single-flight in one session.
   Recommendation: yes, with online same-ID/same-input retry able to recover the
   existing command instead of creating new work. This determines whether a
   singular `pendingExecution` field is truthful.
2. Before implementation, define refusal, identity replacement and disposal
   behavior explicitly. Do not clear retained work merely because its caller
   stopped waiting, and do not leave command capabilities enabled after a
   terminal session or Node refusal. Existing Node admission-rejection and
   lifecycle facts supply evidence; this note does not authorize deletion.
