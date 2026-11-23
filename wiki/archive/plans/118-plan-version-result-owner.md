# 118 — One canonical version owns resources and its result journal

Status: Implemented and verified in the approved goal on 2026-10-11.

Original review context — 2026-10-11: This ownership decision followed implemented Plan103 and replaces ownership rather than extracting its materializer procedures again. Empty affected storage is required.

## Problem and source evidence

AggregateVersionRepo and AggregateVersionChain have the same `(systemId, aggregateId, aggregateName, aggregateVersion)` identity. ServiceVersionRepo and ServiceVersionChain likewise have the same `(systemId, serviceName, serviceVersion)` identity. A Repo commits the business result, queues its complete final command, transfers it to its Chain, deletes local publication material after acknowledgement, then asks the Chain to recover the result. No independent authored authority or state transition requires that second owner.

1. [AggregateVersionRepo](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts) constructs the final-result outbox and binds its sole receiver to AggregateVersionChain. [Local result recovery](../../../packages/system-worker/src/AggregateVersionRepo/readEvaluatedCommand/readEvaluatedCommand.ts) reads pending output, then switches to a remote history RPC once it has been deleted. [Flush](../../../packages/system-worker/src/AggregateVersionRepo/flush/flush.ts) waits for publication and rereads the second owner's checkpoint.
2. [ServiceVersionRepo](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts) has the same transfer. [Acknowledgement](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceVersionRepo/acknowledgeExecutedCommands.ts) deletes its only local final-command row and model output. Plan103 correctly removed an extra local final mirror; this proposal replaces that remaining outbox with the immutable journal rather than adding a mirror back.
3. [AggregateVersionChain](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts) and [ServiceVersionChain](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts) retain results and fan them out. Their large receive methods validate a same-identity transfer, with no independent program execution: [aggregate](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts), [service](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts).
4. Current [aggregate occurrence checks](../../../packages/system-worker/src/AggregateVersionRepo/utils/readAggregateCommandTx.ts) and [service checks](../../../packages/system-worker/src/ServiceVersionRepo/utils/readServiceOccurrenceTx.ts) require source index `previous + 1`. Every outcome increments [aggregate executedIndex](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateVersionRepo/utils/retainAggregateFinalizationTx.ts) or [service executedIndex](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceVersionRepo/utils/retainServiceFinalizationTx.ts) once from zero. Refusals and empty successes still get positions. Consequently `executedIndex === aggregateIndex/serviceIndex` is an invariant, not a separate ordering facility. The `head` table also duplicates the final journal row.
5. [Projection hash](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/executedDispositionHash/executedDispositionHash.ts) hashes the same occurrence/finalization sequence as the version disposition hash, with a different genesis seed. Selection filtering never removes an occurrence from that prefix. A second ordinal and a second hash do not describe a second domain history.

## Decision and removed machinery

Keep AggregateChain and ServiceChain as the shared admitted input/original-order owners. Keep one AggregateVersionRepo or ServiceVersionRepo per deployed release as the owner of its resources, immutable final results, immutable model/async output, producer lifecycle, and result-fanout subscriber cursors. Delete AggregateVersionChain and ServiceVersionChain, their namespace bindings, physical registrations, client service tags and transfer receivers.

Replace `executedCommandOutbox` with retained `executedCommands`, keyed by the source `aggregateIndex` or `serviceIndex`, with unique command ID. Retain source version and execution version explicitly because replay can execute a different release. Retain exact submitted payload string and immutable original identity. Model and async output remain keyed by `(commandId, operationIndex)`; ordered output readers never expose mutable producer lifecycle. Do not delete committed output after fanout acknowledgement. Pruning remains deferred, as it already is for the current Chain journals.

Use the source occurrence index as the sole confirmed cursor throughout version result pages, selected projection checkpoints, browser command journals, Node metadata, snapshots and wire messages. Preserve the private `outcomeIndex` separately: private outcomes can lag a public snapshot or occur below its captured confirmed cursor. Use the per-version `dispositionHash` as the confirmed prefix hash throughout. Delete `executedIndex`, projection-only `executedHash/serviceHash`, `executedDispositionHash`, redundant head initialization, and duplicate prefix calculations. This changes fixed schemas and wire names outright; do not supply aliases, old-field readers or hash translation. Empty local/browser affected storage and fresh affected DO namespaces are required.

Delete final-result producer leases, cross-DO publication alarms, acknowledgement deletion, two-location result lookup, publication-dependent flush checks, forwarded command shape guessing, dead `forwardCommand`, and generic `readOwnerResultsPage` sorting/slicing of an already ordered one-owner page. Keep durable fanout cursors/failures and activation reconciliation; they represent actual independent selected consumers.

## Required behavior and transactions

1. A command transaction validates the next admitted occurrence, evaluates guards/programs in its business savepoint, prepares/applies ordered output, and retains its final command and complete output atomically. The last final journal row supplies the cursor/hash. Business refusal rolls back business writes/output and commits its direct finalization; infrastructure failure, defect or interruption preserves its complete Cause and does not commit progress. Keep Plan103's synchronous execution fence.
2. Original delivery still routes to the retained original version and replays predecessors before execution. Replay still waits for a contiguous finalized input prefix and evaluates each version's own guards/programs. Result reads and fanout pages do not initiate originals. `awaitCommandResult` explicitly progresses originals and replay, then reads one local journal.
3. Async emissions and original producer lifecycle commit with the result. Producers run after commit; replay never starts producers. Recorded observation plus minimal child queue entry remains atomic. Keep ADR001's emission/lifecycle storage decision; this plan does not split it into a second work table.
4. Result fanout is armed before a transaction that can produce output, using the shared queue recovery primitive approved by the root review. A postcommit wake is recoverable after interruption. Neither a subscriber RPC nor waiting for downstream catchup holds a business transaction or the version execution permit. A failed selected subscriber does not undo business commit or block later originals.
5. An original acknowledgement to AC/SC recovers the exact committed final command even if the caller lost its previous reply. Duplicate occurrence identity checks read the local immutable journal and never reexecute. Complete operation codecs belong to the root operation-codec plan; no parallel hand-coded decoder belongs here.
6. `flush(through)` progresses through its fixed source occurrence and returns the locally retained checkpoint for that occurrence. A result at a greater current tip does not silently replace the requested boundary. Delete publication-missing errors that exist only because of the removed transfer; preserve source gaps, identity/hash mismatches, malformed RPC/output and business refusals.

## Parent method shapes

Schematic TypeScript; existing Plan103 procedures remain the substantive implementation. Aggregate and service implementations are explicit, without a generic callback-driven owner framework.

```ts
const materializeAggregateCommandTx = makeTx('materializeAggregateCommandTx')(
  function* (tx, row, key, mode) {
    const occurrence = yield* readAggregateOccurrenceTx(tx, row, key, mode);
    if (occurrence === undefined) return;
    const evaluated = yield* executeAggregateOccurrence(
      tx,
      occurrence,
      key,
      mode,
    );
    const finalCommand = yield* finalizeAggregateOccurrence(
      occurrence,
      evaluated,
    );
    yield* retainAggregateResultTx(tx, finalCommand, key.aggregateVersion);
    return finalCommand;
  },
);

const awaitAggregateCommandResult = Effect.fn('awaitAggregateCommandResult')(
  function* (props) {
    yield* executeAggregateOriginalsThrough(props.aggregateIndex);
    yield* replayAggregateThrough(props.aggregateIndex);
    return yield* readAggregateResult(props.db, props.aggregateIndex);
  },
);

const flushServiceVersion = Effect.fn('flushServiceVersion')(function* (props) {
  yield* executeServiceOriginalsThrough(props.serviceIndex);
  yield* replayServiceThrough(props.serviceIndex);
  return yield* readServiceCheckpoint(props.db, props.serviceIndex);
});

const receiveAggregateOriginals = Effect.fn('receiveAggregateOriginals')(
  function* (props) {
    const rows = yield* decodeAggregateOriginalPage(props.rows, props.key);
    yield* replayAggregatePredecessors(rows, props.key);
    const results = yield* props.execution.withPermits(1)(
      retainAggregateOriginalPage(props.db, rows, props.key),
    );
    yield* recoverAggregateAsyncProductions(props.db);
    yield* wakeAggregateResultSubscribers();
    return results;
  },
);
```

`retainAggregateOriginalPage` performs ordered local synchronous command transactions, not one remote-spanning transaction. The fanout recovery registration occurs during construction; the wake shown after commit is not the only durability mechanism. Result RPC and socket codecs bind the exact release once and decode output at the receiving trust boundary.

## Files and affected consumers

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/
    - AggregateVersionChain/**
    - ServiceVersionChain/**
    - forwardedCommands.ts
    - readOwnerResultsPage/**
    - executedDispositionHash/**
    - ServiceVersionRepo/acknowledgeExecutedCommands.ts
    ~ AggregateVersionRepo/{AggregateVersionRepo.ts,aggregateVersionRepoDbConfig.ts,
        readCommandResult/**,flush/**,catchupMaterialization/**,onDOActivation/**,
        utils/readAggregateOccurrenceTx.ts,utils/retainAggregateFinalizationTx.ts}
    ~ ServiceVersionRepo/{ServiceVersionRepo.ts,serviceVersionRepoDbConfig.ts,
        readCommandResult.ts,readExecutedCommandsPage.ts,flush/**,progressServiceVersion.ts,
        utils/readServiceOccurrenceTx.ts,utils/retainServiceFinalizationTx.ts}
    + AggregateVersionRepo/readAggregateResultsPage.ts
    + ServiceVersionRepo/readServiceResultsPage.ts
    ~ ownedOperations.ts (remove transfer decoder and pass-through encoder; retain meaningful schema)
    ~ asyncOperations/readOperationOutput.ts (two authoritative readers, no Chain variants)
    - repoServices/{AggregateVersionChains.ts,ServiceVersionChains.ts}
    ~ repoServices/{AggregateVersionRepos.ts,ServiceVersionRepos.ts,RepoServicesLive.ts}
    ~ aggregateProjection/** and ServiceActorVersionRepo/** (bind journal/result source)
    ~ aggregateSessionChain/** and ServiceActorVersionChain/** (single confirmed cursor/hash)
    ~ index.ts
    ~ SystemApi/getRepoTableRows/utils/resolveRegisteredRepo.ts
```

Other exact consumer families requiring the hard cut: `packages/core/src/system/RepoTypeSchema.ts`; `packages/core/src/{AggregateNode,ServiceNode,aggregateSession,serviceSession}/**/*.ts` that refer to confirmed `executedIndex`, `executedHash` or `serviceHash`; `packages/core/src/contracts/CommandSchema.ts` and result/output types; `packages/browser/src/{AggregateNode/AggregateNodeSynchronization.ts,ServiceNode/ServiceNodeSynchronization.ts,bootstrapAggregateAgentSession.ts}` and snapshot/network schemas using those fields; `packages/dev-worker/src/{DevWorker.ts,cloudflare-workers.d.ts,makeWranglerConfig.ts}`; `packages/production-worker/src/{ProductionWorker.ts,cloudflare-workers.d.ts}`; `explorer/src/data/{architecture.ts,table-purposes.ts}`. Generate and inspect the exact cursor references before editing; delete all obsolete fields rather than broad textual renaming. The exhaustive current authored cursor/hash reference inventory is appended below; review each semantic use rather than performing broad replacement.

AggregateSessionApi, ServiceSessionApi and SystemApi.openAgentSession acquisition changes are coordinated with the API review. Selected-view consolidation and the [Plan120](120-plan-service-socket-protocol.md) consume this journal/cursor contract. Browser connection-lifetime changes remain separately owned. Delete retired RepoTypes from inspection, worker exports, namespace declarations and provisioning; do not keep externally visible empty stubs. Update module READMEs and affected workflow docs together.

## Implementation order and verification

Current Nx project metadata was inspected read-only. Required meaningful implementation gates are core `lib`/`lint`/`tsc:typecheck` and browser/system-worker/dev-worker/production-worker `lib`/`ts`/`lint`, scoped to affected projects through `pnpm nx run <project>:<target>`. Inspect the resolved command before execution: an inferred `tsc:typecheck` disabled as an echo is not verification. Existing inferred dependencies remain governing. No build, lint, typecheck or test ran during this review.

1. Complete/coordinate root operation-codec and transaction/fanout recovery decisions; preserve approved admission Plan102 and implemented Channel Plan099/Plan101 behavior. Confirm all cursor references and downstream structural consumers, then land the fixed result/cursor schemas together with their actual callers.
2. Convert each VersionRepo to the retained journal, derive checkpoints from its last row, recover duplicates locally, and expose the result fanout. Move existing Chain page/result logic into focused Repo procedures while removing transfer-only validation layers.
3. Rebind selected subscribers; update Node, browser snapshot/protocol and completion handling to source occurrence cursor plus version disposition hash. Preserve private outcome cursor independently and exact owner/session/node redaction.
4. Remove Chain DOs/services/worker bindings/provisioning/inspection artifacts, dead helpers and obsolete error branches. Perform the empty-storage deployment cutover; no live-data translation.
5. Use existing configured `system-worker`, `core`, `browser`, `dev-worker`, `production-worker` and affected consumer Nx lint/typecheck targets discovered through `pnpm nx show project <name> --json`. Existing example Shopping commands, snapshot/ticket/browser receipt workflows and established Workerd harnesses are verification seams; inspect their current existence before claiming a runnable suite. Do not create test files, fixtures, probes/runners or configs without explicit authorization. Verify failed/empty outcomes retain positions, duplicate/lost-ack recovery, source-version routing, per-version replay, original-only async production, interrupted wake recovery and private outcome resume with existing authorized seams. No check has been run during this review.
6. Update glossary ownership and cursor definitions. Record a qualifying ADR for one version owner and one confirmed occurrence cursor, superseding the affected parts of ADR005/006 with explicit successor links while leaving still-governing decisions active. Keep ADR001's no-replay-production decision. Update architecture/module docs; archive this plan only after implementation and the required existing checks are complete.

## Limits

Source proves the duplicate-ordinal invariant and absence of separate result-chain program authority. Runtime tests of recovery/liveness, throughput and worker provisioning have not been run. Removing the duplicate ordinal/hash changes browser fixed storage and protocol, so the cutover must be coordinated across server and browser deployment; a partial release is invalid. No compatibility bridge is proposed.

## Current cursor/hash source inventory

These current authored files contain `executedIndex`, `executedHash` or `serviceHash`. They are the exact schema/consumer inspection set, not a claim that every file requires a substantive rewrite. Preserve local speculative indexes and private outcome indexes.

1. [packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts)
2. [packages/browser/src/publishAggregateSessionProgress.ts](../../../packages/browser/src/publishAggregateSessionProgress.ts)
3. [packages/system-worker/src/ServiceVersionChain/serviceVersionChainDbConfig.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceVersionChain/serviceVersionChainDbConfig.ts)
4. [explorer/src/data/table-purposes.ts](https://github.com/morgs32/zerospin/blob/ff1c4b34220320b25cc79c1e95e54ccf6f532e9e/explorer/src/data/table-purposes.ts)
5. [packages/system-worker/src/ServiceVersionChain/readServiceResultsPage.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceVersionChain/readServiceResultsPage.ts)
6. [packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts)
7. [explorer/src/data/architecture.ts](https://github.com/morgs32/zerospin/blob/918e1c572aa43fff1151aef965cb780118047564/explorer/src/data/architecture.ts)
8. [packages/system-worker/src/ServiceVersionRepo/readExecutedCommandsPage.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceVersionRepo/readExecutedCommandsPage.ts)
9. [packages/system-worker/src/executedDispositionHash/executedDispositionHash.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/executedDispositionHash/executedDispositionHash.ts)
10. [packages/system-worker/src/ServiceSessionApi/getSnapshot/getSnapshot.ts](../../../packages/system-worker/src/ServiceSessionApi/getSnapshot/getSnapshot.ts)
11. [packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts)
12. [packages/system-worker/src/AggregateVersionRepo/readEvaluatedCommand/readEvaluatedCommand.ts](../../../packages/system-worker/src/AggregateVersionRepo/readEvaluatedCommand/readEvaluatedCommand.ts)
13. [packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts)
14. [packages/system-worker/src/AggregateVersionRepo/types.ts](../../../packages/system-worker/src/AggregateVersionRepo/types.ts)
15. [packages/system-worker/src/AggregateChain/AggregateChain.ts](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts)
16. [packages/system-worker/src/readOwnerResultsPage/readOwnerResultsPage.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/readOwnerResultsPage/readOwnerResultsPage.ts)
17. [packages/system-worker/src/AggregateChain/acknowledgeCommand.ts](../../../packages/system-worker/src/AggregateChain/acknowledgeCommand.ts)
18. [packages/system-worker/src/AggregateVersionRepo/utils/retainAggregateFinalizationTx.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateVersionRepo/utils/retainAggregateFinalizationTx.ts)
19. [packages/system-worker/src/ServiceVersionRepo/utils/retainServiceFinalizationTx.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceVersionRepo/utils/retainServiceFinalizationTx.ts)
20. [packages/system-worker/src/AggregateVersionRepo/utils/applyAggregateOperationsTx.ts](../../../packages/system-worker/src/AggregateVersionRepo/utils/applyAggregateOperationsTx.ts)
21. [packages/system-worker/src/AggregateVersionRepo/authorizeSession/authorizeSession.ts](../../../packages/system-worker/src/AggregateVersionRepo/authorizeAggregateSession/authorizeAggregateSession.ts)
22. [packages/system-worker/src/ServiceVersionRepo/acknowledgeExecutedCommands.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceVersionRepo/acknowledgeExecutedCommands.ts)
23. [packages/system-worker/src/aggregateProjection/executionResultsFanoutSubscriber/executionResultsFanoutSubscriber.ts](../../../packages/system-worker/src/aggregateProjection/executionResultsFanoutSubscriber/executionResultsFanoutSubscriber.ts)
24. [packages/system-worker/src/ServiceVersionRepo/flush/flush.ts](../../../packages/system-worker/src/ServiceVersionRepo/flush/flush.ts)
25. [packages/system-worker/src/ServiceActorVersionRepo/executionResultsFanoutSubscriber/executionResultsFanoutSubscriber.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceActorVersionRepo/executionResultsFanoutSubscriber/executionResultsFanoutSubscriber.ts)
26. [packages/system-worker/src/ServiceVersionRepo/serviceVersionRepoDbConfig.ts](../../../packages/system-worker/src/ServiceVersionRepo/serviceVersionRepoDbConfig.ts)
27. [packages/system-worker/src/AggregateVersionRepo/onDOActivation/onDOActivation.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateVersionRepo/onDOActivation/onDOActivation.ts)
28. [packages/system-worker/src/aggregateProjection/aggregateProjectionDbConfig.ts](../../../packages/system-worker/src/aggregateProjection/aggregateProjectionDbConfig.ts)
29. [packages/system-worker/src/AggregateVersionRepo/catchupMaterialization/catchupMaterialization.ts](../../../packages/system-worker/src/AggregateVersionRepo/catchupMaterialization/catchupMaterialization.ts)
30. [packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts)
31. [packages/browser/src/bootstrapAggregateAgentSession.ts](../../../packages/browser/src/bootstrapAggregateAgentSession.ts)
32. [packages/system-worker/src/AggregateVersionRepo/flush/flush.ts](../../../packages/system-worker/src/AggregateVersionRepo/flush/flush.ts)
33. [packages/system-worker/src/asyncOperations/readOperationOutput.ts](../../../packages/system-worker/src/asyncOperations/readOperationOutput.ts)
34. [packages/browser/src/outbox/makeSessionCommandOutbox.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/browser/src/outbox/makeSessionCommandOutbox.ts)
35. [packages/browser/src/makeBrowserSession/createAggregateAgentBrowserSession.ts](../../../packages/browser/src/makeBrowserSession/createAggregateAgentBrowserSession.ts)
36. [packages/browser/src/ServiceNode/ServiceNodeSynchronization.ts](../../../packages/browser/src/ServiceNode/ServiceNodeSynchronization.ts)
37. [packages/browser/src/bootstrapAggregateSession.ts](../../../packages/browser/src/bootstrapAggregateSession.ts)
38. [packages/system-worker/src/filterAggregateBrowserCommand/filterAggregateBrowserCommand.ts](../../../packages/system-worker/src/filterAggregateBrowserCommand/filterAggregateBrowserCommand.ts)
39. [packages/system-worker/src/ServiceActorVersionRepo/execute/executeTx.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceActorVersionRepo/execute/executeTx.ts)
40. [packages/system-worker/src/ServiceActorVersionRepo/makeServiceActorBrowserCommandOutbox.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceActorVersionRepo/makeServiceActorBrowserCommandOutbox.ts)
41. [packages/browser/src/bootstrapServiceSession.ts](../../../packages/browser/src/bootstrapServiceSession.ts)
42. [packages/browser/src/ServiceNode/makeServiceNodeBaseline.ts](../../../packages/browser/src/ServiceNode/makeServiceNodeBaseline.ts)
43. [packages/browser/src/AggregateNode/AggregateNodeSynchronization.ts](../../../packages/browser/src/AggregateNode/AggregateNodeSynchronization.ts)
44. [packages/browser/src/AggregateNode/makeAggregateNodeBaseline.ts](../../../packages/browser/src/AggregateNode/makeAggregateNodeBaseline.ts)
45. [packages/system-worker/src/ServiceActorVersionRepo/getSnapshot/getSnapshot.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceActorVersionRepo/getSnapshot/getSnapshot.ts)
46. [packages/core/src/Node/validateNodeSnapshotReconciliation.ts](../../../packages/core/src/Node/validateNodeSnapshotReconciliation.ts)
47. [packages/system-worker/src/aggregateSessionChain/receiveBrowserCommands/receiveBrowserCommands.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/aggregateSessionChain/receiveBrowserCommands/receiveBrowserCommands.ts)
48. [packages/system-worker/src/ServiceActorVersionRepo/serviceActorVersionRepoDbConfig.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceActorVersionRepo/serviceActorVersionRepoDbConfig.ts)
49. [packages/system-worker/src/aggregateSessionChain/getResolvedThrough.ts](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/aggregateSessionChain/getResolvedThrough.ts)
50. [packages/core/src/ServiceNode/types.ts](../../../packages/core/src/ServiceNode/types.ts)
51. [packages/system-worker/src/forwardedCommands.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/forwardedCommands.ts)
52. [packages/system-worker/src/aggregateProjection/commitProjectionTx/commitProjectionTx.ts](../../../packages/system-worker/src/aggregateProjection/commitProjectionTx/commitProjectionTx.ts)
53. [packages/system-worker/src/AggregateVersionChain/types.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateVersionChain/types.ts)
54. [packages/system-worker/src/aggregateSessionChain/getBrowserCommands/validateNodeReplay.ts](../../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/validateNodeReplay.ts)
55. [packages/system-worker/src/AggregateVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts)
56. [packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts)
57. [packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts](../../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts)
58. [packages/core/src/ServiceNode/ServiceNode.ts](../../../packages/core/src/ServiceNode/ServiceNode.ts)
59. [packages/system-worker/src/ServiceActorVersionChain/receiveBrowserCommands/receiveBrowserCommands.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceActorVersionChain/receiveBrowserCommands/receiveBrowserCommands.ts)
60. [packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts)
61. [packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts](../../../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts)
62. [packages/core/src/ServiceNode/serviceNodeTables.ts](../../../packages/core/src/ServiceNode/serviceNodeTables.ts)
63. [packages/system-worker/src/ServiceActorVersionRepo/getProjectionReadiness/getProjectionReadiness.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceActorVersionRepo/getProjectionReadiness/getProjectionReadiness.ts)
64. [packages/system-worker/src/aggregateProjection/getProjectionReadiness/getProjectionReadiness.ts](../../../packages/system-worker/src/aggregateProjection/getProjectionReadiness/getProjectionReadiness.ts)
65. [packages/system-worker/src/aggregateProjection/makeProjectionBrowserCommandOutbox.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/aggregateProjection/makeProjectionBrowserCommandOutbox.ts)
66. [packages/system-worker/src/aggregateSessionChain/onMessage/replaySocketCommands.ts](../../../packages/system-worker/src/aggregateSessionChain/onMessage/replayAggregateSocketCommands.ts)
67. [packages/system-worker/src/aggregateProjection/applyExecutedCommands/prepareProjectionOccurrence.ts](../../../packages/system-worker/src/aggregateProjection/applyExecutedCommands/prepareProjectionOccurrence.ts)
68. [packages/system-worker/src/aggregateProjection/applyExecutedCommands/applyExecutedCommandsTx.ts](../../../packages/system-worker/src/aggregateProjection/applyExecutedCommands/applyExecutedCommandsTx.ts)
69. [packages/system-worker/src/ServiceActorVersionChain/getBrowserCommands/getBrowserCommands.ts](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/ServiceActorVersionChain/getBrowserCommands/getBrowserCommands.ts)
70. [packages/core/src/serviceSession/stageServiceSessionCommandTx.ts](../../../packages/core/src/serviceSession/stageServiceSessionCommandTx.ts)
71. [packages/system-worker/src/ServiceActorVersionChain/onMessage/onMessage.ts](../../../packages/system-worker/src/ServiceActorVersionChain/onMessage/onMessage.ts)
72. [packages/system-worker/src/SystemApi/openAgentSession/openAgentSession.ts](../../../packages/system-worker/src/SystemApi/openAgentSession/openAgentSession.ts)
73. [packages/system-worker/src/ServiceActorVersionChain/getNodeOutcomes.ts](../../../packages/system-worker/src/ServiceActorVersionChain/getNodeOutcomes.ts)
74. [packages/system-worker/src/ServiceActorVersionChain/decodeServiceBrowserCommand.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/ServiceActorVersionChain/decodeServiceBrowserCommand.ts)
75. [packages/core/src/serviceSession/types.ts](../../../packages/core/src/serviceSession/types.ts)
76. [packages/core/src/serviceSession/initializeServiceNodeProjection.ts](../../../packages/core/src/serviceSession/initializeServiceNodeProjection.ts)
77. [packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts](../../../packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts)
78. [packages/core/src/serviceSession/replayPendingServiceCommandsTx.ts](../../../packages/core/src/serviceSession/replayPendingServiceCommandsTx.ts)
79. [packages/core/src/AggregateNode/AggregateNode.ts](../../../packages/core/src/AggregateNode/AggregateNode.ts)
80. [packages/core/src/serviceSession/ServiceSessionWireSchema.ts](../../../packages/core/src/serviceSession/ServiceSessionWireSchema.ts)
81. [packages/core/src/serviceSession/importServiceNodeCommands.ts](../../../packages/core/src/serviceSession/importServiceNodeCommands.ts)
82. [packages/core/src/AggregateNode/aggregateNodeTables.ts](../../../packages/core/src/AggregateNode/aggregateNodeTables.ts)
83. [packages/core/src/AggregateNode/types.ts](../../../packages/core/src/AggregateNode/types.ts)
84. [packages/core/src/serviceSession/filterServiceBrowserCommand.ts](../../../packages/core/src/serviceSession/filterServiceBrowserCommand.ts)
85. [packages/core/src/serviceSession/serviceSessionRepoTables.ts](../../../packages/core/src/serviceSession/serviceSessionRepoTables.ts)
86. [packages/core/src/serviceSession/applyServiceSessionSnapshot/applyServiceSessionSnapshotTx/applyServiceSessionSnapshotTx.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/core/src/serviceSession/applyServiceSessionSnapshot/applyServiceSessionSnapshotTx/applyServiceSessionSnapshotTx.ts)
87. [packages/browser/src/StandaloneNode/executeStandaloneCommand.ts](../../../packages/browser/src/StandaloneNode/executeStandaloneCommand.ts)
88. [packages/system-worker/src/AggregateSessionApi/getSnapshot/getSnapshot.ts](../../../packages/system-worker/src/AggregateSessionApi/getSnapshot/getSnapshot.ts)
89. [packages/core/src/aggregateActor/types.ts](../../../packages/core/src/aggregateActor/types.ts)
90. [packages/core/src/aggregateSession/AggregateSocketProtocolSchema.ts](../../../packages/core/src/aggregateSession/AggregateSocketProtocolSchema.ts)
91. [packages/core/src/aggregateSession/sessionRepoDbConfig.ts](../../../packages/core/src/aggregateSession/aggregateSessionRepoDbConfig.ts)
92. [packages/core/src/aggregateSession/provisionAggregateSessionCommandIndexes.ts](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/core/src/aggregateSession/provisionAggregateSessionCommandIndexes.ts)
93. [packages/core/src/aggregateSession/types.ts](../../../packages/core/src/aggregateSession/types.ts)
94. [packages/core/src/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts](../../../packages/core/src/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts)
95. [packages/core/src/aggregateSession/replayPendingCommandsTx.ts](../../../packages/core/src/aggregateSession/replayPendingCommandsTx.ts)
96. [packages/core/src/aggregateSession/applyAggregateSessionSnapshot/applyAggregateSessionSnapshotTx/applyAggregateSessionSnapshotTx.ts](../../../packages/core/src/aggregateSession/applyAggregateSessionSnapshot/applyAggregateSessionSnapshotTx/applyAggregateSessionSnapshotTx.ts)
97. [packages/core/src/aggregateSession/aggregateBrowserCommandsTable.ts](../../../packages/core/src/aggregateSession/aggregateBrowserCommandsTable.ts)
98. [packages/core/src/aggregateSession/importAggregateNodeCommands.ts](../../../packages/core/src/aggregateSession/importAggregateNodeCommands.ts)
99. [packages/core/src/aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx.ts](../../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts)
100. [packages/core/src/aggregateSession/initializeAggregateNodeProjection.ts](../../../packages/core/src/aggregateSession/initializeAggregateNodeProjection.ts)
101. [packages/core/src/aggregateSession/make/makeAggregateSession.ts](../../../packages/core/src/aggregateSession/make/makeAggregateSession.ts)

## Coordinated plan dependencies

1. [Plan105](105-plan-immutable-authored-declarations.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
2. [Plan107](107-plan-contract-evaluation-phases.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
3. [Plan108](108-plan-model-operation-codecs.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
4. [Plan109](109-plan-bound-database-definition.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
5. [Plan110](110-plan-sqlite-execution-and-commit-observation.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
6. [Plan116](116-plan-node-command-journal-and-subscriptions.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
7. [Plan117](117-plan-session-reconciliation-and-evaluation.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
8. [Plan119](119-plan-selected-view-owner.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.
9. [Plan120](120-plan-service-socket-protocol.md) owns its separate declared scope. Use its final API/ownership contract and coordinate overlapping files; do not restore the machinery that it removes.

## Implementation progress

Aggregate source cutover is written: the version Repo retains immutable executedCommands and complete output, derives progress from its journal, recovers duplicates locally, and owns durable result subscribers. Selected actor/agent socket owners now retain resources, browser history, connection locks and projection progress together; snapshot captures its public checkpoint and private prefix in one transaction. Transfer-only aggregate owners and publication queues are deleted. Aggregate and service source cutovers and integrated source gates are complete; durable runtime verification remains open.

### Integration update — 2026-10-11

Aggregate and service VersionRepos now own canonical executedCommands journals, ordered operations, cursor/hash and local result reads. Intermediate result Chains and transfer outboxes are deleted. Both fanout producer leases are retained before aggregate materialization commit. Worker library compilation passes; durable-host publication/restart cases remain unrun.

### Service implementation and verification — 2026-10-11

ServiceVersionRepo now retains its immutable local journal, ordered operation outputs, actual local cursor/hash and exact local result/checkpoint reads; result fanout uses explicit subscriber identity and durable independent cursors. Source-result requests distinguish local read from catch-up. Async production remains original-only and outbox retention lives with committed work. Scoped service source lint passed with zero warnings/errors. Service durable-host acceptance cases still unrun include empty-success positions, lost-ack recovery, source-version routing, per-version replay, original-only async production and interrupted wake recovery. Source and library gates do not establish those behaviors; the bounded ordinary service cases below establish successful and failed positions plus exact duplicate recovery.

The existing Shopping CLI seed exercises the actual administrative service path on fresh affected storage. Its 12 `createProduct@1.0.0` commands finish successfully; existing SystemApi inspection returns 12 products and 12 retained `ZerospinSuccess` commands at contiguous service indices1–12 with `caller:null`. Evidence is recorded in `/tmp/zerospin-goal-shopping-seed-cli.log` and `/tmp/zerospin-goal-shopping-seed-admin.log`. After owned shutdown, read-only physical SQLite inspection confirms the command and result journals retain the same twelve IDs, inputs, releases and indices1–12. This establishes successful original materialization and durable local journal retention. Empty-success, lost-acknowledgement, release-routing, producer and delivery cases remain open.

The actual public SystemApi then retried retained seed command `cmd_WA5BwLq6cgkzyo3cMBjoI` with its original wire input. It returned the identical finalization, raw payload, owner/release, serviceIndex1 and dispositionHash `19be40e605b843ee9f15e4fc46116bcbe15dc40b212a903f9deb284a1ef0f19f`. A second request reused that ID with one leading whitespace byte in the raw payload; although its decoded JSON was equal, it returned the sole typed refusal `service-command-identity-mismatch`. Before and after both requests, all complete `commands`, `executedCommands`, `product` and `modelOperations` row sets were byte-identical with matching SHA256 values, each containing 12 rows. The actual RPC invocation exited0; no new command IDs, declarations, fixtures, files or host bindings were created. This establishes ordinary service duplicate result recovery and exact raw-input refusal, without establishing lost acknowledgement, declaration removal, aggregate retries or external-producer behavior.

An ordinary `deleteProduct@1.0.0` command for the genuinely absent `prd_seed-13` then returned RPC success containing a retained `ZerospinError` finalization with code `operation-row-not-found`. Command `cmd_DcLvOWHKI22OY6obCtlt-` occupied serviceIndex13, with dispositionHash `d2a26fcc57a9214dcda855ae140b1e5fab970a1c24f254e09b699deffb475905`, and the identical failed finalization was retained in both source and result journals. The prior twelve commands/results and all twelve product/model-operation rows remained byte-identical. This establishes one failed service occurrence advancing the contiguous result journal without business output. A separate ordinary request for unavailable `deleteProduct@0.0.0` returned the sole method refusal `admission-contract-not-found`; its ID was absent from both journals and all four table row sets remained unchanged at13/13/12/12. Both requests completed in one inline invocation that exited0, without new declarations, fixtures, files or host bindings. Empty-success positions and the recovery cases below remain unverified; actual aggregate failed progression is recorded below.

The existing public table-inspection API exposed all thirteen authoritative service journal positions and disposition hashes. Every position was contiguous from1 through13; the current exported `genesisDispositionHash` and `advanceDispositionHash` procedures reproduced each retained hash from genesis `f31c0c51be861af11225611526c9e2b73ab453f449950aa4ad4eaad22c522dbc` through the failed tip above. Every source command's identity, raw input and finalization matched its result row. This bounded check establishes the actual service journal's current cursor/hash derivation; it does not exercise a requested-prefix checkpoint RPC or flush boundary.

After guarded SIGINT, the owned Shopping CLI/workerd processes stopped and the existing Nx runtime exited0. Read-only physical SQLite inspection using URI `mode=ro` confirmed13 source commands,13 result commands,12 seed products and12 seed model operations. The two complete physical journal row sets matched the last public inspection SHA256 values (`85d9f9896f4b40786465c6f6e5c50eeb0b9b5816f4325c688f0a3a053ef5e9b6` and `907fa98f38e04332556ae96da2e11bbe453c6fd55de9a9d5af2e1c24df519516`); the failed occurrence remained at13 and the unavailable-version ID remained absent. Physical seed resource IDs and operation indices1–12 persisted. Business timestamp columns are integers in SQLite and decoded dates in public inspection; no cross-format business-row hash identity is claimed.

The genuine aggregate actor workflow in [Plan102](102-plan-aggregate-command-admission-orchestration.md) also retained one first-party `createGame` success at aggregateIndex1. Retrying its exact original command recovered the same admission receipt and left the complete public source-chain rows, selected resources and checkpoint unchanged. Changing one raw payload byte refused the identity without changing those records. This establishes finalized aggregate actor admission recovery; direct VersionRepo result redelivery after lost acknowledgement and proof of no program reevaluation remain unrun.

The same retained TicTacToe game then received one genuine first-party mapped `playX@1.0.0` command `cmd_rwoWhZSC-VxbH8ukAeKEA` through its actual authorized actor socket. The original update and registered external emission retained operation indices0 and1 at aggregateIndex2. The configured computer producer recorded response1 and actual child `cmd_j18wjP2oKYeE2XEqo43LV`; that child completed successfully at aggregateIndex3. Source and version journals now retain three successful commands, three model operations and one original async emission with its exact aggregate owner and human actor provenance. The delivered async outbox is empty. The selected actor graph reached `XO.......`, turnX, and the first real SQL.js Node advanced public progress3 while its own private outcome prefix remained1. This establishes one actual original production and recorded continuation happy path; one retained response/child does not establish invocation count, absence of producers during version replay, or recovery after interruption.

Actual public table inspection exposed all three aggregate result positions. The current exported aggregate `genesisDispositionHash` and `advanceDispositionHash` reproduced every retained hash from genesis `ac5d5ad64482e54218ed9a201af48d0a5fd25db2f10428044b73ee1cf6f60b12` through tip `b05a63ab0955109be790858345c3e95681bc9df69d51e07f9132a6033c9a651e` at3. Each source command's raw input and finalization matched its authoritative result. The selected owner's local projectionState and authorized snapshot shared that exact tip. After owned shutdown, read-only physical SQLite inspection confirmed the same command IDs, raw inputs, finalizations, three hashes, model/async counts, recorded response and selected graph. Evidence is in `/tmp/zerospin-goal-107-118-tictactoe-{play,journal}.log` and `/tmp/zerospin-goal-107-118-physical-retention.log`. This establishes current aggregate local journal cursor/hash derivation and ordinary durable retention, without establishing requested-prefix checkpoint RPCs, flush boundaries or restart replay.

A second genuine Node had staged an ordinary move against the same actual earlier board but had not submitted it. Its current authorized server snapshot and exact replay-complete tuple correctly reported public3/private0. Receiving the other player's final operations exposed the unqualified local Node completion-subquery defect tracked by116: local outcomeIndex incorrectly became1. The inline assertion stopped before submission; that second command is absent from both physical journals. At that point, aggregate failed-command progression and successful local private-prefix replay for an unrelated pending original were unverified. Both actual Node/session/socket scopes closed, and the owned backend exited0. Its generated configuration was removed; all17 prior configuration names/inodes/mtimes and all56 protected original storage file hashes/identities matched (`/tmp/zerospin-goal-107-118-cleanup.log`). No declarations, host bindings, receipts, fixtures, runners or configuration were manufactured.

After116's correlation repair and coordinated source/consumer gates passed, two fresh actual Nodes initialized from the retained `XO.......` snapshot at3. Each independently authenticated and authorized through the existing human actor/session API, then accepted a genuine first-party move against that same current board. `cmd_W1xv8EPjOAZD_N58odKSa`, from `node_O_anchdHPpkeoo4SscHuO`, played square2 and finalized successfully at4. The configured computer producer recorded response3 and real child `cmd_vFGgvkUWwBMsiBrznXotR`, which finalized at5 with graph `XOXO.....`, turnX. The second Node `node_vl6tTHFqbJl9xYQR2ZU4M` replayed those foreign final operations and explicitly retained its exact accepted `cmd_YcXbdZurMrhjZ10ugmvdh` input, one pending command, admittedThroughPushIndex0 and outcomeIndex0 at public5. This proves the repaired unrelated-original correlation through an actual host replay and the real SQL.js Node APIs.

The second player then submitted that unchanged naturally stale command, originally staged for square4 against `XO.......`. It was admitted and finalized at6 with the authoritative guard's typed public refusal `aggregate-guard-failed`, no model operations and no async emission. The selected graph and its update timestamp stayed exactly those from successful child5. All six source/result IDs, raw inputs, finalizations and indices matched; the current exported hash procedures reproduced every result hash through failed tip `00a8dbaf65ca3911730dd82bf7ebd0852c26b2ff82584df0d4349ce73cd7c0f0`. The selected owner's projectionState and both actual server Node snapshots shared public6/hash6, with each producer's resolvedThrough1. The owning Node's `admitted` and `receiveCommand` calls for its failed6 completed before the inline invocation stopped on an incorrect expected error-code assertion. Its terminal local metadata snapshot was not sampled, so no additional postfailure local-prefix assertion is claimed. The authoritative aggregate guard in the existing declaration returns a framework `invalid-move` failure; `aggregate-guard-failed` is its expected outer callback refusal, rather than a declared contract-scope error. A subsequent read-only Date-versus-string assertion was also corrected. These assertion mistakes are not product failures or evidence; no domain command was repeated.

The corrected public inspection exited0 and established failed aggregate occurrence progression with no output, exact current aggregate cursor/hash and independent actual server private prefixes. Post-shutdown read-only SQLite inspection confirmed six physical source/result rows including failed6 and all six hashes, five model operations, two recorded async operations with responses1 and3, an empty outbox, and the unchanged final graph/timestamp. Evidence is in `/tmp/zerospin-goal-118-rerun-play.log`, `/tmp/zerospin-goal-118-rerun-journal.log` and `/tmp/zerospin-goal-118-rerun-physical.log`. Both owned Node/session scopes, sockets and SQL.js databases closed; guarded SIGINT stopped the owned CLI and both Workerd processes with Nx exiting0. The sole generated configuration was removed, all17 prior configuration identities/mtimes matched, and all56 protected original storage files retained their exact filesystem identities and SHA256 hashes (`/tmp/zerospin-goal-118-rerun-cleanup.log`). No previous game/move or disposed pending history was recreated. Neither this normal workflow nor its retained response counts establish producer invocation count, lost acknowledgements or interrupted recovery.

### Mounted browser convergence — 2026-10-11

Native Chrome inspection exercised two actual same-origin TicTacToe tabs at `http://127.0.0.1:53020/` with the existing application controls. Both selected game `06538c4b-3fe5-44c4-9ef9-3e61b5a38e77`. Playing Square1 in the second tab produced `XO.......` in both tabs. After closing only that tab, the survivor played Square5 and reached `XOO.X....`; reopening the second tab displayed the same board. Square9 then produced `XOO.X...X` and the visible `X wins!` outcome. In the second tab, the existing New game/Start game controls selected new game `d2d47ddb-86f6-4fe7-be5a-3c7e56c9a082`; Square5 produced `O...X....` there while the original tab retained its terminal game. This establishes normal mounted selected-owner convergence, surviving-tab progress, ordinary tab reopening and isolation between actual game identities.

Read-only public server inspection paired these rendered observations with retained source, result, model, async and selected-history rows. The first game's producer `node_1fdsGFACy-lSB8DH5MM-Q` retained own push indices1–4 and server private resolvedThrough4, independently of public aggregateIndex6. Its source/result/model/selected-history counts were6/6/6/6, with two recorded async responses, an empty async outbox, and selected checkpoint hash `b9752804fa90a13212c937aa017b75483f66f57a0d27f82d87f1e3da6ef3f016`. The new game's independent producer `node_3O4Qh7bjNzMeQl6Kzl1vE` retained own push indices1–2 and server private resolvedThrough2 at public aggregateIndex3; source/result/model/selected-history counts were3/3/3/3, with one recorded async response, an empty outbox, and checkpoint hash `610500ccdada23900c757fd85d76fb1943e1bc9c3a479728ded77e3038b9c940`. Every one of the nine retained disposition hashes independently derived from the appropriate genesis, and selected resources/checkpoints matched each owner's journal. Evidence is in `/tmp/zerospin-goal-mounted-retry-browser-baseline.log`, `/tmp/zerospin-goal-mounted-retry-browser-private-baseline.log` and `/tmp/zerospin-goal-mounted-retry-browser-independent-owners.log`.

These normal browser observations do not establish full SharedWorker destruction/reconstruction, offline recovery, lost acknowledgement, a commit/wake interruption, producer invocation counts or replay without producers. No terminal browser-local Node metadata was sampled. Both same-game tabs used the same retained producer identity, so this is not proof of two durable fanout subscribers with unequal cursors. The new game proves independent current owners, not historical release/registry removal. DevTools was not mounted; no diagnostic UI behavior is claimed.

The source-linked architecture, glossary, governing-ADR and sequence-step audits pass. Actual development startup used fresh affected server storage, and newly initialized current-schema Node storage exercised the coordinated local cutover. Original data remains preserved separately; any later fixed-schema deployment must likewise use fresh affected storage without translation or automatic deletion.

### Actual native offline recovery and independent owner — 2026-10-11

The real native TicTacToe app accepted offline winning `playX` original `cmd_KQiViojj-n3hZOYb2ctZZ` for game `gam_ba36661779d14154bbd4d6bc24eb3d44`, Node `node_k2KSRxZyZGM2wnVRCzT8N`, at push4/node9. Its exact raw payload was `{"id":"gam_ba36661779d14154bbd4d6bc24eb3d44","board":"XOO.X....","square":8}`. Actual OS process close/reopen and an app update retained that original, prior journal rows, Node/session identities and main-file identities while the owned backend was down. The initial live run exposed a connection-lifetime defect: failed-attempt cleanup aborted the same signal driving the connection Effect before its failure classifier could arm a retry. Both aggregate/service synchronization files now settle that driver first, then join retirement and classify its preserved Cause without reusing the signal. Fresh browser/native build/type/lint and real iOS packaging passed in `/tmp/zerospin-goal-connection-retirement-browser-gates-2.log`, `/tmp/zerospin-goal-connection-retirement-native-build-2.log`, `/tmp/zerospin-goal-connection-retirement-native-quality.log` and `/tmp/zerospin-goal-native-retry-fix-ios-build.log`. The actual updated JavaScript application bundle SHA256 was `f78b4b5db843d2ff870ac466d9c62769a80093b22a4ab49008d9fd469a40204b`.

The same repaired foreground process made at least 14 actual unavailable authentication attempts about 3 seconds apart while the backend remained down. Restoring the backend alone, without Home/foreground, Retry connection or manual push, yielded one retained final success for the original at public6/node10 with disposition hash `f41d6eeeefdb0fc8df5b5e9b92966cc5a5d931b3684e4066bf3891ccf5f57049`. Actual local Node metadata reached outcomeIndex4/admittedThroughPushIndex4; session metadata reached public6 with that hash and afterNode10. The single optimistic operation cleared, and local Node/session rows and the rendered native board converged to `XOO.X...X`, outcome X. All prior nine local journal rows stayed exact. Read-only server inspection found six source/results/models/selected-history rows, two recorded async responses, empty outbox, exact selected resource/checkpoint and server private prefix4. All six result hashes independently derived from genesis. Previously retained immutable source/result/model-operation/async/selected-history entries for the first five occurrences stayed exact; resources and checkpoints legitimately advanced when final6 appended. Evidence is in `/tmp/zerospin-goal-native-retry-fix-offline-host.log`, `/tmp/zerospin-goal-native-retry-journal.log` and `/tmp/zerospin-goal-mounted-native-retry-fixed-offline-recovery-journal.log`.

Existing New game/Start game controls then selected actual independent game `gam_b1e0a64243904ae99608d9df670ae064` under Node `node_sUUfZO0yUQ45tsBnKkxdZ`. An ordinary center move and its real computer continuation produced `O...X....`, public3/private2, hash `665d6838d9c03335238528697d4daa148339992d6f8524cf8928fe9e7cc21e59`, with three source/results/models/selected-history rows, one recorded async response and empty outbox. All three hashes independently derived from genesis; the old winner's eight complete logical rowsets stayed exact (`/tmp/zerospin-goal-mounted-native-second-game-journal.log`). This establishes native aggregate offline pending recovery, measured local public/private completion and independent current-owner convergence. It does not establish lost acknowledgements, requested-prefix interruption, producer invocation counts, replay without producers, service/agent identity, SQL drainage or awaited disposal.

After the real Home action, actual RunningBoard/SpringBoard records confirmed the same PID9355 moved from foreground-active to suspended/NotVisible/Background at19:20:55Z. A read-only WAL sample at19:24:35Z retained all complete logical tables, four main-file identities and two game-preference identities exactly against the19:20:18Z baseline (`/tmp/zerospin-goal-native-retry-two-owner-lifecycle-host.log`, `/tmp/zerospin-goal-native-retry-journal.log`). Final samples at19:26:31Z and after purpose-built OS termination at19:26:48Z retained the complete two-owner rows and physical identities. The owned app and fresh simulator were then removed; all11 pre-existing simulator identities/states/dataPaths were preserved, including the user's booted simulator. This is ordinary OS background/termination preservation only; subsequent foreground/resume and graceful JS/SQL drain were not observed.

### Verified source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Authorized final result-owner recovery — 2026-10-11

The disposable isolated Workerd declarations execute real claims-free aggregate and service originals through the production Gateway/SystemApi. `admin-results.log` in `/tmp/zerospin-framework-goal-server-qvh4z87h` passes: empty successes and typed business failures each retain the next contiguous occurrence and disposition hash without business output; exact retries recover the same result, changed raw bytes refuse, and the resource graphs stay exact. `external-results.log` passes for both families: each original launch invokes its actual producer once, retains response71 and its exact real child, and recovers the same recorded preparation/child receipt. A fresh execution release2 replays the complete source prefix with no producer counter change, no producer lifecycle and no child outbox. These are actual authored callbacks and retained DO rows, with controlled failure timing confined to authorized temporary fixtures.

The independent provider in `/tmp/zerospin-framework-goal-service-120` then holds each actual VersionRepo after the business/result SQL commit and before its producer lease releases, result wake or source acknowledgement. `result-commit.log` passes: aggregate2 and service85, ordered model operations and value71 are already retained, the recovery alarm is armed, and the source finalization is still null. Joining only that owned Workerd provider loses both pending real source replies. Reopening the same storage preserves every raw result, ordered operation and resource row. Direct original redelivery and a normal public exact retry recover the original final without changing output; a source-release mismatch refuses. Older requested-prefix `flush` and `getInputCheckpoint` return aggregate1/service84 and their retained hashes even though the current tips are2/85. Genesis flush and unsafe-index refusal also pass.

The first restart legitimately replayed the pending source prefix into the independently retained release2 owners, incrementing the shared fixture program counters once per family. The original runner incorrectly expected every version's combined program count to be zero; its completed row/prefix assertions are retained as intermediate evidence, not its failed terminal assertion. A second fully joined provider restart removes that ambiguity. `result-restart-3.log` exits0: the fresh counters begin and end at zero, exact original recovery does not evaluate programs or producers, and both release2 owners retain their complete prefixes with sourceVersion1/executionVersion2. Their checkpoint/flush values and complete raw journals stay unchanged. No domain command was recreated to repair an assertion.

[129](129-plan-fanout-delivery.md) verifies the production durable fanout schema/scheduler on real SQLite: independent bounded cursors, failed-subscriber retention beside healthy progress, in-flight publication, acknowledgement SQL failure and exact redelivery, alarm recovery, full mixed Causes and cold catch-up. Actual aggregate actor delivery is recorded above; actual agent ordered finals/private outcomes and service delivery/replay/hibernation pass in [112](112-plan-agent-session-owners.md), [120](120-plan-service-socket-protocol.md) and [124](124-plan-session-snapshot.md). Full SharedWorker destruction, the same nonempty IndexedDB journal reopening, pending-original recovery and SQL/VFS close-before-lease-handover pass in [111](111-plan-connected-worker-ownership.md). These complementary owner checks establish the required transaction, publication and recovery boundaries; a test of one boundary is not described as a different host fault.

The final affected source graph, actual core typecheck, consumer/native compilation and source-linked documentation gates pass. An independent completion audit identifies no uncovered required criterion. All result-recovery client scopes and runners join. The owned62495 provider and both Workerd processes stop and join; read-only physical SQLite inspection then confirms both execution-version journals and exact original-version result/model/resource rows (`physical-retention.log`). The other provider is separately owned until coordinated goal cleanup. Changed fixed schemas continue to require fresh affected storage, with original user storage preserved separately.

## Remaining work

None.
