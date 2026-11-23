# Command origin consumers

**Reviewed:** 2026-10-25

**Status:** Source review reconciled with [Plan 265](../archive/plans/265-plan-flat-command-origins.md)
and [ADR 023](../adrs/023-flat-command-origins-and-claims-free-continuations.md).
The 2026-10-15 inventory of 45 `origin.kind` checks in 27 files described a
superseded object-origin command format. That count is not a removal target or
current runtime proof. [Schema research](../research/command-origin-schema-guards.md)
distinguishes shape validation from permission and ownership.

## Consumer dispositions

1. **Canonical shape and persistence:** [CommandSchema](../../packages/core/src/contracts/CommandSchema.ts)
   owns the four flat variants, required Actor Node tuple and non-null Continuation
   observation/parent. [Aggregate](../../packages/system-worker/src/AggregateVersionChain/evaluatedAggregateCommand.ts)
   and [Service](../../packages/system-worker/src/ServiceVersionChain/evaluatedServiceCommand.ts)
   row codecs map inactive fields to SQL null and reject contradictory rows.
   The existing `(nodeId, pushIndex)` unique indexes remain scalar.
2. **Ordinary admission and retained recovery:**
   [Aggregate boundary](../../packages/system-worker/src/AggregateChain/admitAggregateCommands/validateAggregateSubmission.ts)
   and [Service boundary](../../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommands.ts)
   strictly decode Actor/Agent/System only. Exact immutable retries recover before
   current declaration checks through [Aggregate retained input](../../packages/system-worker/src/AggregateChain/admitAggregateCommands/readRetainedCommand.ts)
   and [Service retained input](../../packages/system-worker/src/ServiceChain/admitServiceCommands/readRetainedServiceCommand.ts).
3. **Administrative and producer permission:** both [SystemApi command methods](../../packages/core/src/systemApi/ISystemApiRpc.ts)
   accept ordinary System commands only. Actor sockets bind complete authenticated
   identity, claims, owner/release, session, Node and declared capability before
   admission. Automatic Agent Nodes resolve their owner-local registered behavior;
   an origin discriminator alone supplies no submission permission.
4. **Execution:** [Aggregate resolution](../../packages/system-worker/src/AggregateVersionRepo/utils/resolveAggregateExecution.ts)
   and [Service resolution](../../packages/system-worker/src/ServiceVersionRepo/utils/resolveServiceExecution.ts)
   interpret Actor claims only for Actor commands. Continuations use canonical
   reads and their own guard/program with `claims: null`, without Actor guards.
5. **External work and causality:** [preparation](../../packages/system-worker/src/externalOperations/prepareExternalOperation.ts)
   freezes child ID, exact contract, payload and owner release. Pending work stores
   the immediate parent's ID. [Aggregate recording](../../packages/system-worker/src/AggregateChain/recordExternalOutcomeAndAdmitCommandTx.ts)
   and [Service recording](../../packages/system-worker/src/ServiceChain/recordExternalOutcomeAndAdmitCommandTx.ts)
   stamp Continuation/parent from exact retained work and atomically delete it.
   No parent traversal, claims hydration or caller proof flag exists.
6. **Stable sessions and local drafts:** [OriginSchema](../../packages/core/src/contracts/OriginSchema.ts)
   retains Actor/Agent session identity objects. [Session staging](../../packages/core/src/aggregateSession/stageCommand/makeSessionCommand/makeSessionCommand.ts)
   produces a flat Actor draft; [Node retention](../../packages/core/src/AggregateNode/acceptAggregateOriginalTx.ts)
   allocates its required producer position. Locks/snapshots gain no `pushIndex`.
7. **Private completion:** [Aggregate projection](../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts)
   and [Service public filtering](../../packages/core/src/serviceSession/filterServiceBrowserCommand.ts)
   compare explicit Actor identity/claims plus Node/session. Public browser frames
   remain minimal; schema classification cannot replace these ownership checks.
8. **Local execution and recovery:** browser Node readers and
   [standalone execution](../../packages/browser/src/StandaloneNode/executeStandaloneCommand.ts)
   consume flat Actor commands after allocation. Exact input equality and stable
   session ownership survive reconnect/replay; no object-origin compatibility path
   remains. [Harness external execution](../../packages/core/src/testing/systemHarness/runHarnessExternal.ts)
   uses the same claims-free immediate-parent continuation semantics.
9. **Ordinary recorded destination commands:** [recorded command preparation](../../packages/core/src/contracts/prepareCommandOperation.ts)
   retains System origin. Emission by another command does not make an ordinary
   command an external continuation.

## Maintenance and evidence

Search both scalar command discrimination and stable object identity; inspect
whole-command equality and row reconstruction as well as branches. A remaining
`origin.kind` on a lock/session is expected. Do not revalidate an already decoded
command merely to replace a readable discriminator comparison. Plan 265 records
actual scoped checks; this document is a source ownership review.
