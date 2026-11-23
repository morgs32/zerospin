# Plan 270 revision: Derived command identities

Status: Completed and verified on 2026-10-26. Phase 2C is [PR #86](https://github.com/morgs32/zerospin/pull/86); revised Phase 3 is [PR #87](https://github.com/morgs32/zerospin/pull/87), stacked on #86. The [original Plan 270](../270-plan-contract-release-names-and-command-kinds.md) remains separate historical evidence. No runtime rollout or sibling adoption was performed.

## Phase ownership

- Phase 2C: synchronous ID-less Session submissions, durable Session positions, transactional Node allocation, Session-coordinate coverage, independent Chain admission progress, monotonic lost-acknowledgement reconciliation, and affected consumers/documentation.
- Revised Phase 3: direct System admission constructs canonical IDs inside AggregateChain/ServiceChain; update typed APIs, adapters, harness, Shopping and seed consumers. Each invocation creates a new command.
- No runtime storage resets, deployment, publication, Archive rollover, Chain consolidation or sibling adoption are authorized.

## Accepted revision

## Summary and sequencing

1. Reconcile the existing Plan 270 and System-command handoff directly. Preserve ordinary-contract reuse, explicit grants, unrelated work, and the stop boundary before Phase 3.
2. Add Phase 2C for Session submission identity, Node allocation, and durable Chain admission progress. Incorporate direct System identity and consumer migration into Phase 3.
3. Keep staging synchronous in Aggregate and Service Sessions. It returns Session submission coordinates and the local result before Node handoff.
4. Retain the existing AggregateChain and ServiceChain topology. Archive rollover, Chain consolidation, admission-role promotion, and identity changes for other command-production paths remain separate work.

## Implementation changes

1. **Define canonical ID construction.** Add three explicit construction functions using `cmd_` followed by `encodeURIComponent(JSON.stringify(tuple))`:

   ```ts
   ['node', nodeId, pushIndex][
     ('system-aggregate', systemId, aggregateName, aggregateId, aggregateIndex)
   ][('system-service', systemId, serviceName, serviceIndex)];
   ```

   These forms have disjoint namespaces and unambiguous encoding. Public IDs remain opaque strings; consumers must not parse them. Release versions, deployment IDs, and physical Archive identities do not participate.

2. **Represent pre-Node work as a Session submission.** Replace the ID-bearing staged value with `ISessionSubmission`, containing the existing immutable input, `sessionId`, `sessionIndex`, and `stagingOutcome`. Preserve existing outer success/failure envelopes, local results, timestamps, and synchronous optimistic resource updates. Remove superseded exports without compatibility aliases.

3. **Remove the unnecessary optimistic-ID dependency.** Resource mutation and inverse capture must work without `commandId`. Remove command identity and operation-position parameters from resource application where they only construct unused metadata. Preserve canonical command identity in authoritative operation encoding and retained evaluated commands. Do not introduce a placeholder ID.

4. **Allocate Session positions transactionally.** Store `lastSessionIndex` in Session metadata. Allocate and advance it in the same synchronous transaction as successful staging. Rejection rolls everything back. Preserve the counter while the same `sessionId` remains, including when replacement-view installation discards command rows.

5. **Allocate Node coordinates during handoff.** AggregateNode and ServiceNode retain `sessionId` and `sessionIndex` with each original. In one local transaction, validate the submission, allocate `nodeIndex` and `pushIndex`, and retain it. A repeated handoff of identical input returns the existing assignment; changed input under the same Session coordinates rejects.

   Return the allocation mapping as:

   ```ts
   {
     (sessionId, sessionIndex, nodeId, nodeIndex, pushIndex);
   }
   ```

   Session rows retain the nullable Node coordinates together and reconstruct canonical `id` from `(nodeId, pushIndex)`. Node original rows also reconstruct their IDs; final rows retain their canonical IDs. Keep `nodeIndex` because Node-view coverage and producer sequencing describe different facts.

6. **Preserve optimistic ownership and replacement fences.** Recording Node coordinates stops handoff retries but leaves the Session overlay until a covering Node view installs. Correlate handoffs and coverage by Session submission coordinates. Preserve explicit Node-replacement checks; transport recovery must never assign another position to the same retained submission. Mock Sessions remain synchronous and need no fabricated canonical ID.

7. **Persist admission progress independently of command history.** Add a singleton logical admission position and a producer row keyed by `nodeId` to each admitting Chain. Each producer row contains `lastPushIndex` and its frozen binding: owner release version, `sessionName`, `actorName`, `actorVersion`, and complete encoded claims. The enclosing Chain supplies owner identity.

   For Node admission, decode the envelope, verify the derived ID and producer binding, require the next `pushIndex`, validate fresh command support and payload, then atomically retain the admitted command and advance both checkpoints. Do not retain a complete latest command or search historical commands for this path. Ordered-batch failure rolls back all new retention and progress.

8. **Use the logical admission position for every append.** Ordinary admission and external-observation admission must advance the same Chain position. Interleaved command categories therefore share one dense `aggregateIndex` or `serviceIndex`. Preserve Agent, recorded-command, and external-completion identity/recovery behavior; keep retained-ID helpers used by those paths.

9. **Reconcile Node progress without historical recovery.** Reuse `node-admission-index-mismatch` with `expectedPushIndex`. For pending position `p`, a response greater than `p` permits monotonic admission-progress advancement through `expectedPushIndex - 1`, bounded by locally issued positions and the current Node/socket lifetime. Impossible or contradictory progress blocks delivery; it must not rewind acknowledged progress.

   Remove the unused `admissionIndex` from socket acknowledgements. Producer progress establishes neither payload equality, execution commit, nor a retained `outcome`. Preserve originals and final-resolution tracking.

10. **Construct direct System commands inside the admitting Chain.** Public typed methods become:

    ```ts
    api.executeServiceCommand(serviceRelease, { contractName, payload });
    api.executeAggregateCommand(aggregateRelease, {
      aggregateId,
      contractName,
      payload,
    });
    ```

    Infer input from the selected release’s `system` grants. Direct RPC inputs omit canonical `id` and reject caller-supplied IDs. Use explicit direct-System admission procedures so frozen recorded System commands retain their separate recovery path. Within one synchronous transaction, validate fresh admission, allocate the Chain position, derive the ID, retain the admitted command, and advance the logical position.

11. **Preserve direct-call outcome semantics.** Each invocation, including re-execution of an Effect after an ambiguous timeout, creates a new command. Await that invocation’s allocated position and return the existing `{ result, finalizedAt }` outcome. Do not introduce an allocator, producer handle, outcome cache, or implicit retry layer.

12. **Migrate actual consumers.** Keep Shopping promotion’s bounded authored retries: its existing program handles repeated attempts for the same purchase. Remove deterministic canonical-ID construction and original-outcome recovery claims. Convert seeds to Plan 270’s sequential program using the same create-only contracts and product data. Stop on the first failure, including an existing product; retain earlier committed successes. Update HTTP/native adapters, the harness, interceptors, and authored type assertions coherently.

## Planned file hierarchy

Root: `/Users/morgs32/GitHub/zerospin/`. `+` creates, `~` modifies, `-` removes. Brace groups abbreviate corresponding existing Aggregate/Service files. This is the identity-related addition to Plan 270’s existing inventory.

```text
zerospin/
├── packages/core/
│   ├── src/contracts/
│   │   ├── + commandIds.ts
│   │   └── ~ CommandSchema.ts, types.ts, applyOperationTx.ts
│   ├── src/models/
│   │   └── ~ encodeInverseOperation.ts
│   ├── src/sessionExecution/
│   │   └── ~ applyOptimisticOperationsTx.ts, replayOptimisticCommandTx.ts,
│   │         replayAggregateCommandTx.ts, replayServiceCommandTx.ts
│   ├── src/aggregateSession/
│   │   ├── ~ sessionRepoDbConfig.ts, allocateAggregateSessionIndexTx.ts,
│   │   │     evaluateAggregateSessionCommandTx.ts, installAggregateNodeView.ts,
│   │   │     replayLocalAggregateCommandsTx.ts, types.ts
│   │   └── stageCommand/
│   │       ├── + makeSessionSubmission.ts
│   │       ├── - makeSessionCommand/makeSessionCommand.ts
│   │       └── ~ stageAggregateSessionCommand.ts,
│   │             stageSessionCommandTx/stageSessionCommandTx.ts
│   ├── src/serviceSession/
│   │   └── ~ serviceSessionRepoTables.ts, allocateServiceSessionIndexTx.ts,
│   │         evaluateServiceSessionCommandTx.ts, stageServiceSessionCommandTx.ts,
│   │         stageServiceSessionCommand.ts, installServiceNodeView.ts,
│   │         replayLocalServiceCommandsTx.ts, types.ts
│   ├── src/{AggregateNode,ServiceNode}/
│   │   └── ~ existing input schemas, tables, original retention, row readers,
│   │         Node classes and types
│   ├── src/Node/
│   │   └── ~ NodeCommandCoverage.ts
│   ├── src/{aggregateSession,serviceSession}/
│   │   └── ~ existing socket schemas and command reconstruction
│   ├── src/systemApi/
│   │   └── ~ ISystemApiRpc.ts
│   ├── src/utils/getSystemApi/
│   │   └── ~ makeSystemApi.ts
│   ├── src/testing/systemHarness/
│   │   └── ~ existing execution and typed administrative facade
│   └── tests/
│       └── ~ receipt-delivery.spec.ts, contracts.typecheck.ts
├── packages/browser/src/
│   └── ~ existing handoff, interests, replica receivers/validators,
│         Node synchronization and mock Session consumers
├── packages/native/src/
│   └── ~ openPersistentAggregateReplica.ts, makeNativeSession.ts
├── packages/system-worker/
│   ├── src/{AggregateChain,ServiceChain}/
│   │   ├── ~ schemas, admission/append procedures and replay-head readers
│   │   ├── ~ existing direct execution and external-observation admission
│   │   └── + family-specific direct-System admission procedures
│   ├── src/
│   │   └── ~ existing SystemApi handlers, direct execution adapters,
│   │         socket admission handlers and resource-application callers
│   └── tests/
│       └── ~ existing admission, delivery, native-SystemApi and adapter suites
├── packages/{sdk,cli}/
│   └── ~ existing exports, authoring guidance and seed loader/display
├── examples/shopping/
│   └── ~ seeds, promotion helper and existing consumer tests
└── wiki/
    ├── plans/~ 270-plan-contract-release-names-and-command-kinds.md
    ├── handoffs/~ 270-handoff-system-command-construction-and-seeds.md
    └── ~ post-implementation glossary and relevant documentation
```

## Verification

1. Extend existing receipt-delivery cases to prove immediate synchronous staging without a canonical ID, rejection rollback, same-submission handoff recovery, covering-view ownership transfer, and non-reused Session positions after local history discard. Reuse existing declarations and database support.
2. Extend existing Aggregate/Service admission suites for next-position acceptance, reused/skipped-position rejection, mismatched derived IDs, frozen binding checks, and atomic command/checkpoint rollback. In disposable databases, establish checkpoint independence from old command rows without claiming Archive verification.
3. Exercise lost acknowledgement reconciliation: stop redelivery without reallocating coordinates or resolving the command’s `outcome`; reject progress beyond local issuance and never rewind acknowledged progress.
4. Replace native-SystemApi retry-equality assertions with evidence of distinct admitted commands and authored repeated-business behavior. Preserve promotion response-integrity checks. Verify seed failure stops subsequent commands and leaves earlier successes committed.
5. Preserve existing Agent, recorded-command, and external-delivery regressions. Update existing compiler assertions for ID-less staging/direct APIs and precise grant inference.
6. Resolve and run the affected Nx typecheck, lint, build, and bounded existing test selections. Add no test files, fixtures, runners, or configuration. Do not verify Explorer or run Shopping browser verification.

## Storage and completion

1. Session metadata, Session rows, Node originals, and admitting-Chain schemas change. Use fresh Node format `22` and Native format `11`, avoiding discarded format identifiers. Changed fixed schemas require empty affected storage; identify exact partitions before rollout.
2. This plan authorizes no runtime storage reset, deployment, publication, or sibling consumer adoption. Add no compatibility paths or translation migrations.
3. After implementation, reconcile the glossary and existing documentation with actual behavior. Update governing ADRs where necessary; create a new ADR only for an implemented decision that is hard to reverse, surprising without context, and a real trade-off.
4. Record verification by phase and preserve the stop before Phase 3. Archive Plan 270 only when its complete agreed work and required verification/documentation are finished, or the maintainer explicitly supersedes the remainder.

## Remaining work

None.

## Phase 2C storage partitions

- Attached Aggregate replicas: `sessionMetadata`, `commands`; attached Service replicas: `serviceSessionMetadata`, `commands`. Session counters and nullable Node coordinate triples change.
- AggregateNode/ServiceNode/StandaloneNode journals: `commands` adds Session coordinates and stores canonical IDs only for final rows; their Node format is 22. Native persistent Aggregate Session replica format is 11.
- AggregateChain and ServiceChain admitting databases: `admissionPosition`, `nodeProducers`, plus existing admitted command retention. External-observation and ordinary appends share the logical position.
- Future rollout must inventory concrete local/deployed names for these partitions and obtain separate empty-storage authorization. No runtime reset, model-only-store deletion, deployment or publication occurred.

## Phase 2C verification, 2026-10-26

- Implemented synchronous ID-less staging, transactional Session counters, exact-coordinate Node handoff recovery, derived original IDs, complete nullable Node coordinates, covering-view ownership transfer and format 22 / native replica format 11.
- AggregateChain/ServiceChain retain independent logical admission position and frozen producer bindings. Every append shares the logical position; invalid ordered batches roll back commands and both checkpoints. Producer progress never rewinds and does not resolve outcomes.
- Complete test compiler and 19 tests in five existing files passed (receipt delivery, Node-view recovery, staging inverses, Service admission, Chain delivery). The later six-file run retained those five passing suites; external delivery was repaired and rerun separately: 5/5 passed.
- Eight additional existing regression suites passed: browser Node authentication/network errors, native SystemApi, both Agent Node families, Aggregate adapter failures, and the two Core recovery/inverse suites. The first external-delivery run exposed two obsolete Actor identity assertions; both were migrated and the entire five-case suite passed.
- Scoped Nx `lib,ts,lint` graph for Core, SDK, Browser, System Worker and Native passed 19 tasks; final cleanup rerun is recorded before commit. Native's required build is included by its normal task dependencies. Existing unrelated warnings are distinguished from changed-file lint.
- No new test files, fixtures, runners or configuration; no Explorer or Shopping browser verification. No runtime storage reset, deployment, publication or sibling adoption.

Phase 2C stops here. The approved revised Phase 3 follows in a stacked PR; the original completed Plan 270 remains archived as historical evidence.

## Revised Phase 3 implementation and initial verification

Explicit direct-System RPC schemas omit canonical IDs and reject supplied IDs. AggregateChain/ServiceChain validate fresh support/payload and atomically allocate their shared logical position, derive the disjoint System ID and retain each invocation. Existing recorded System/Agent/external identity recovery remains separate. HTTP/native facades freeze immutable ID-less input; each Effect execution creates a new command and awaits that invocation's outcome. Shopping keeps bounded promotion retries and response-integrity checks. Sequential create-only seeds retain earlier commits and stop on an existing product.

The full test compiler and 33 tests in five existing suites passed: native SystemApi, real CLI loader/API adapters, Shopping system behavior, promotion and promotion checkout. Native tests prove distinct admitted IDs and outcome times for repeated Effects. The actual Shopping seed program against the harness proves products 1 and 2 stay committed when product 3 already exists, then a rerun stops immediately.

## Final revision verification

- Phase 3 scoped Core/SDK/Browser/System Worker/CLI/Native/Shopping `lib,ts,lint` graph passed **29 tasks**, including normal build dependencies. Shopping has `ts` and `lint` rather than a build target; native's configured build ran through dependencies. No Explorer or Shopping browser verification occurred.
- The complete test compiler and **33 tests in five existing suites** passed for Shopping system, promotion and promotion checkout, native SystemApi and real CLI/API adapters.
- The complete test compiler and **53 tests in six existing suites** then passed for native direct-System execution, Chain delivery, Aggregate adapter failures, both Agent Node families and external delivery. The native case discards one committed reply and authors one retry: both invocations retain distinct commands. It also proves invalid fresh payload admission leaves logical position and command retention unchanged.
- Existing create-only seed behavior is proven by the actual Shopping program against the harness: two new Products remain committed when the third already exists, the existing Product is preserved, later Products are absent, and rerunning stops immediately.
- Changed-file lint/format/diff checks and affected architecture source hashes/ranges were reconciled. Existing unrelated warnings remain; no new tests, fixtures, runners or configuration were created.
- Empty storage requirements and the affected responsibilities are listed above. Exact deployed/local runtime partition identities require separate rollout inventory/authorization; no storage reset, deployment, package publication or sibling adoption is part of this completed source work.
