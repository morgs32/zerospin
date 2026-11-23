# AC/SC canonical history handoff

**Status:** Complete; implementation and required verification passed.
**Date:** 2026-10-27.
**Implementation base:** Main initially pulled at `46a8cb6137447e4ee2ba8a211dd68b5af6d768ce`, then refreshed to `f8b0f71bf5323448a3edf8e802a372e444236165`; branch `codex/canonical-chain-history-handoff`. The previous design inspection used `15e505c3322dad08504946923e0c15f4fb1768e9`. Unrelated primary-checkout changes remain untouched.

## Problem and scope

1. AggregateChain (AC) and ServiceChain (SC) retain every admitted command after original execution and release fanout. AVC/SVC now retain complete evaluated history across local SQL and successive Archives, so permanent AC/SC copies duplicate an existing durable history owner.
2. Keep AC/SC as admission, original-execution scheduling, pending command-delivery and pending external-operation owners. Hand their finalized history prefix to the configured canonical AVC/SVC through the existing AVR/SVR replay fanout acknowledgement.
3. Include the dependencies that make pruning correct: explicit canonical selection, logical historical reads, independently durable admission progress, producer checkpoints for recorded System and Agent commands, fresh authorization invocations, originating-release outcome recovery, and retained external observations during admission backpressure.
4. This supersedes the proposed **physically archived prefix only** restriction in Plan 274's later milestone. The handoff boundary is publication into canonical AVC/SVC local storage. Physical Archive delivery remains asynchronous inside AVC/SVC.
5. Change no authored guard/program evaluation rules, existing materializations, historical external effects, Actor/Agent projections, or Node wire protocol merely because a prefix is adopted. Create no new DO or universal command-ID directory.

## Agreed public configuration and authorization

1. Each aggregate/service entry owns its registered releases and selects one version key:

   ```ts
   makeSystem({
     name: 'shop',
     aggregates: {
       user: {
         releases: { 1: userV1, 2: userV2 },
         canonical: 2,
       },
     },
     services: {
       payments: {
         releases: { 1: paymentsV1 },
         canonical: 1,
       },
     },
   });
   ```

2. Require `canonical` for every registered aggregate/service. Constrain it to that entry's registered version keys in TypeScript; validate key existence and existing release name/version identity in `makeSystem` at runtime. Do not infer the highest version or retain the old flat registry shape.
3. Keep actual release objects only in `releases`. Update System typing, SystemSpec projection/validation/hash, configuration requirement inference, Agent selections, release lookups, examples, existing test declarations and public guidance together. SystemSpec already has an owner-local `releases` map; add the canonical selection there. Acceptance remains one whole-SystemSpec operation.
4. `authorization.executeCommand` omits caller-supplied `id` and uses the existing fresh direct System invocation path. AggregateChain assigns its ID and admission position. The authored command handles business idempotency across repeated authorization attempts.
5. Remove the obsolete arbitrary-ID authorization execution path and its sole-use helpers, service interfaces and stubs. Do not retain an alias or compatibility admission path.

## Durable ownership and handoff

1. The selected AVR/SVR commits resources, its materialization checkpoint and its complete pending AVC/SVC publication synchronously. Before acknowledging a replay fanout page, it drains that existing publication outbox through the page's delivered boundary.
2. AVC/SVC acknowledges publication after committing its complete evaluated commands and logical head locally. Its existing archival queue later moves local copies to Archives and prunes only after Archive acknowledgement. AC/SC does not wait for or receive physical Archive progress.
3. In the source fanout acknowledgement transaction, AC/SC records the adopted release and covered domain index and deletes the covered local command prefix. Commit subscriber acknowledgement, handoff state and pruning atomically. The source identity fields already fixed by the AC/SC owner are not duplicated in handoff storage.
4. Only the configured canonical release's publication-proving progress authorizes handoff. Other release acknowledgements still advance their own replay cursors. Slow or newly registered releases can replay the pruned prefix through AC/SC's logical reader.
5. Cover pushed pages, pull catch-up, enrollment and cold activation. A materialization checkpoint alone is not publication proof: `getCurrentIndex` must advertise a publication-safe position for canonical handoff, and already-materialized pending output must still publish before a path reports covered progress.
6. Derive publication-safe progress from the existing materialization head and earliest pending publication row rather than adding a competing persisted publication frontier. Ensure an already-enrolled or newly enrolled canonical subscriber ahead of the adopted frontier still causes adoption; relying only on a later nonempty push would stall a full suffix.
7. Preserve original finalization before pruning. Its transaction must already have retained the original `outcome` and complete pending recorded commands/external requests. Those dedicated delivery rows may outlive the command's local history copy; handoff does not delete or regenerate them.
8. Use synchronous local transactions for handoff and pointer replacement. No source `blockConcurrencyWhile`, whole-chain drain, cross-DO atomicity or new notification outbox is required for this handoff: the fallible publication precedes the local acknowledgement transaction.

## Logical history and canonical changes

1. AC/SC historical point/page reads use the adopted AVC/SVC for the adopted prefix and AC/SC SQL for the newer suffix. Expose a bounded pure evaluated-history page RPC on AVC/SVC by reusing its existing local/Archive reader. Do not read historical commands through AVR/SVR: their identity-validation path calls AC/SC and would recurse.
2. Preserve `aggregateIndex`/`serviceIndex`, full immutable admitted input, `id`, originating release and `outcome.finalizedAt`. Strip release-local operations when constructing AC/SC replay input. The adopted release supplies the shared historical `outcome`; each receiving release continues to own its independently evaluated `outcome`, operations and `dispositionChainHash`.
3. On a canonical selection change, retain the previous adopted AVC/SVC and its fixed handoff boundary until the newly selected release has durably published through that boundary. Stop old-release acknowledgements from extending the adopted prefix while replacement catch-up is pending. The replacement must not chase an ever-advancing cutover boundary.
4. The replacement replays through the old source plus the local suffix using the ordinary fanout. Reads and replay remain available when the 64-command admission suffix is full. Once publication-proving progress covers the old adopted boundary, atomically replace the source and advance/prune through the covered index. Numeric version ordering does not control selection.
5. A canonical-source change changes historical replay lookup. Existing materializations keep their committed checkpoints and resume after them; no reset or replay from genesis is caused by adoption. Historical operations are not issued again.
6. Pure historical AVC/SVC and Archive reads currently do not require that old authored release to remain registered. Preserve this property. Availability of authored code for original execution, release-specific materialization or still-pending external work remains its existing separate requirement; add no release-retirement protocol.
7. Capture the reader's source/frontier consistently before asynchronous reads; honor `afterIndex`, inclusive `maxIndex`, genesis and the logical finalized tip across local/remote boundaries. Preserve the existing 64-row/1 MiB page bound, permitting one valid larger command for progress. A page may end at a placement boundary.
8. Missing or unavailable covered history is an error, not empty history or permission to reevaluate a committed result. Admission and finalized progress must remain independent of pruned SQL maxima; update predecessor and execution-through checks accordingly.
9. Refactor identity validation to compare immutable admitted input and the stable finalization time independently of canonical-release outcome selection. Do not compare an originating release's result to another selected release's result as an identity test.
10. Fresh execution APIs, including authorization, return the originating/requested AVR/SVR's own `outcome`. Use `awaitCommandResult`'s returned evaluated command rather than re-reading a possibly adopted canonical `outcome` from AC/SC.

## Producer checkpoints and admission backpressure

1. Recorded System delivery retains its existing frozen opaque command ID and complete input. Its producer is the complete originating AggregateChain identity `(systemId, aggregateName, aggregateId)` or ServiceChain identity `(systemId, serviceName)`; its ordered source position is `(aggregateIndex, operationIndex)` or `(serviceIndex, operationIndex)`.
2. Pass that source identity and position in the internal delivery envelope. Existing source Chain delivery is earliest-first, one operation at a time. Positions observed by one receiving AC/SC can be sparse because intervening source operations were delivered elsewhere. Check ordering for that producer relationship without requiring dense destination-specific positions.
3. Agent Node delivery retains existing frozen command IDs. Add a durable enqueue sequence to each unversioned AggregateAgentNodeRepo/ServiceAgentNodeRepo and its pending delivery rows. Allocate the sequence in the same transaction that freezes the command and attempted wake. Its producer identity is the complete unversioned Agent Node identity; selected release changes do not reset that sequence.
4. Replace Agent Node's concurrent unordered pending admission with earliest-first delivery. Preserve existing behavior that delivers frozen old-release commands before installing a new selected baseline or becoming dormant.
5. Destination AC/SC commits a genuinely new admitted command and its producer checkpoint atomically. Keep independently durable checkpoint rows per producer relationship, not per historical command. Use explicit Aggregate/Service source methods and exact source keys; introduce neither `ownerKind` nor another field that recreates that domain switch.
6. Internal recorded System and Agent delivery replies acknowledge producer progress. Callers delete a pending row only when the returned checkpoint covers its offered position. They no longer require the historical destination index or reconstructed admitted command to acknowledge delivery.
7. For an already-covered producer position, return its stored progress without re-admission or historical payload comparison. The source's durable outbox owns command immutability per position. This reply proves coverage, not equality with arbitrary replacement bytes. Validate producer binding before reporting its checkpoint.
8. Keep existing Node-derived command identity and Node continuation/progress behavior. Remove general lifetime `commands.id` recovery once its non-Node callers have moved to their explicit producer protocol or fresh invocation path. Add no per-command ID mapping, producer-to-Archive range directory or ID parser.
9. Initially permit 64 AC/SC commands awaiting canonical handoff. Check genuinely new admission against that bound inside the admission transaction; reject insufficient capacity with retryable backpressure before advancing admission or producer progress. Preserve existing atomic batches. A genuinely new batch that cannot fit even in an empty suffix must fail explicitly rather than retry forever.
10. Covered producer positions continue to return admission progress at capacity. Capacity blocks neither historical reads, canonical catch-up/publication, handoff nor delivery acknowledgements. The bound covers the unhanded-off command suffix; existing pending delivery rows and producer membership have their separate responsibilities.
11. Browser Aggregate/Service Node synchronization recognizes the retryable cap failure and uses its existing uncertain-admission recovery instead of permanently rejecting the command or authentication. Preserve backpressure from an actual delegated authorization command without treating authored policy refusals as infrastructure failures. This necessary consumer wiring changes no Node wire fields.

## External observations while admission is full

1. Add nullable `externalOutcome` to the existing AC/SC `externalOperationOutbox` row. Retain the first observed external result durably while its completion command waits for admission.
2. Recovery of a row with retained `externalOutcome` retries completion admission using that result; it does not run the external request again. Preserve its original observation time. A row without a retained result keeps the existing request execution/retry behavior.
3. Keep result persistence independent of an admission transaction that may reject for capacity. Otherwise rollback would discard the observation and cause the next wake to issue the external request again. Prefer the existing synchronous transaction machinery for both writes.
4. Successful completion admission and pending-row deletion remain one synchronous transaction. Missing pending rows make late callbacks no-ops. Concurrent callbacks cannot replace the first retained observation or admit another completion.
5. This prevents deliberate admission backpressure from repeating a durably observed request. It does not introduce an exactly-once external-provider guarantee for a process failure before result persistence.

## Alternatives and rationale

1. Waiting for physical Archive acknowledgement was rejected: AVC/SVC already owns durable, readable history after its local commit and preserves it through Archive delivery. AC/SC needs a history handoff, not physical placement coordination.
2. Pruning at today's AVR/SVR materialization acknowledgement without publication was rejected: it leaves a window where the only copy is in its pending publication outbox and AVC/SVC cannot serve it. Reading through AVR/SVR adds another history path and identity-validation recursion. Awaiting existing publication before acknowledgement closes that gap.
3. An independent Archive-progress notification outbox was rejected once handoff moved to AVC/SVC local commit. Existing fanout acknowledgement supplies the needed durable fact.
4. Permanent per-command ID lookup and exhaustive old-payload equality were rejected for framework producers. Ordered frozen delivery and receiver checkpoints retain admission coverage without retaining lifetime ID mappings.
5. Separate canonical-selection maps were rejected in favor of owner entries with `{ releases, canonical }`. Registering a parallel release alone does not change history ownership.
6. New deterministic IDs for recorded System/Agent delivery are unnecessary. Existing commands are already frozen with their IDs; producer coordinates identify delivery progress independently.

## Implementation sequence

1. Change the authored registry and portable SystemSpec shape, exact key inference and runtime validation. Move all current lookups/inference to `.releases` and update every in-scope declaration/example. Preserve Agent selection validation and whole-SystemSpec acceptance. Make authorization invocations ID-less and remove the obsolete execution path.
2. Introduce the explicit recorded-System and Agent producer admission paths/checkpoints and progress replies. Add durable Agent enqueue sequences/FIFO delivery, pass source Chain coordinates through recorded command delivery, and remove historical ID recovery. Retain complete pending rows until admission coverage is acknowledged.
3. Add adopted-history state and logical readers to AC/SC, pure bounded AVC/SVC history pages and publication-proving canonical fanout progress. Reuse the fanout acknowledgement transaction for handoff/pruning and cover enrollment/catch-up/recovery. Keep parents as short, domain-named orchestration steps; extract focused procedures where needed.
4. Implement canonical replacement at the frozen old boundary, independent admission/finalized positions and originating-release outcome recovery. Preserve existing original work, historical effects and release-local model state.
5. Enforce the 64-command suffix bound across fresh Node, recorded System, Agent, direct System, authorization and external-completion admission paths. Persist observed external results on pending rows and retry admission without repeating durably observed requests.
6. Modify the existing tests at the seams below, run the scoped graph, resolve in-scope failures and reconcile live documentation after implementation. These steps are one hard cutover, not parallel old/new compatibility APIs.

## Planned file hierarchy

`+` creates a source/document file, `~` modifies existing files, and `-` removes obsolete files. Braces/globs group existing files with the same mechanical registry change; they do not authorize new test files, fixtures, runners or configuration. New procedure names describe placement for the agreed responsibilities, not new runtime owners.

```text
zerospin/
├─ packages/core/
│  ├─ src/aggregateActor/types.ts                                      ~
│  ├─ src/agent/getAgentRelease.ts                                     ~
│  ├─ src/contracts/prepareCommandOperation.ts                          ~ registry lookup only
│  ├─ src/system/
│  │  ├─ {types.ts,SystemSpecSchema.ts}                                 ~
│  │  └─ make/
│  │     ├─ {makeConfig.ts,makeSystemSpec.ts}                           ~
│  │     └─ makeSystem/
│  │        ├─ makeSystem.ts                                          ~
│  │        ├─ decodeSystemProps/decodeSystemProps.ts                  ~
│  │        ├─ validateCanonicalReleases.ts                           +
│  │        └─ validate*.ts                                           ~ existing registry traversal
│  ├─ src/testing/systemHarness/{makeHarnessStores,makeSystemHarness}.ts ~
│  └─ tests/{contracts.typecheck.ts,receipt-delivery.spec.ts}           ~ existing declarations/contracts
├─ packages/browser/
│  ├─ src/{AggregateNode,ServiceNode}/*NodeSynchronization.ts           ~ retryable admission handling
│  ├─ src/Node/isNodeAdmissionBackpressure.ts                          +
│  └─ tests/node-network-errors.spec.ts                                ~ existing error boundary
├─ packages/system-worker/src/
│  ├─ AggregateChain/
│  │  ├─ {AggregateChain,aggregateChainDbConfig}.ts                     ~
│  │  ├─ adoptCanonicalAggregateHistory.ts                             +
│  │  ├─ readAggregateCommand.ts                                      +
│  │  ├─ admitRecordedAggregateCommandTx.ts                            +
│  │  ├─ admitAggregateAgentCommandTx.ts                               +
│  │  ├─ {readReplayPage,recordOriginalCommandOutcomeTx}.ts             ~
│  │  ├─ recordExternalOutcomeAndAdmitCommandTx.ts                      ~
│  │  ├─ admitDirectSystemAggregateCommandTx.ts                         ~
│  │  ├─ admitAggregateCommands/{admitAggregateCommands,admitAggregateCommandsTx,appendAggregateCommand}.ts ~
│  │  ├─ admitAggregateCommands/readRetainedCommand.ts                  -
│  │  ├─ executeAggregateCommand/executeAggregateCommand.ts             -
│  │  ├─ executeCommandsThrough/executeCommandsThrough.ts               ~
│  │  └─ onDOActivation/onDOActivation.ts                              ~
│  ├─ ServiceChain/
│  │  ├─ {ServiceChain,serviceChainDbConfig}.ts                         ~
│  │  ├─ adoptCanonicalServiceHistory.ts                               +
│  │  ├─ readServiceCommand.ts                                        +
│  │  ├─ admitRecordedServiceCommandTx.ts                              +
│  │  ├─ admitServiceAgentCommandTx.ts                                 +
│  │  ├─ {readReplayCommandsPage,recordOriginalCommandOutcomeTx}.ts     ~
│  │  ├─ recordExternalOutcomeAndAdmitCommandTx.ts                      ~
│  │  ├─ admitDirectSystemServiceCommandTx.ts                           ~
│  │  ├─ admitServiceCommands/{admitServiceCommands,admitServiceCommandsTx,appendServiceCommand}.ts ~
│  │  ├─ admitServiceCommands/readRetainedServiceCommand.ts             -
│  │  ├─ executeCommandsThrough/executeCommandsThrough.ts               ~
│  │  └─ onDOActivation/onDOActivation.ts                              ~
│  ├─ {AggregateVersionRepo,ServiceVersionRepo}/
│  │  ├─ {AggregateVersionRepo,ServiceVersionRepo}.ts                   ~ respective existing class
│  │  ├─ validateCommandIdentity.ts                                   ~
│  │  └─ replayCommandsFanoutSubscriber/replayCommandsFanoutSubscriber.ts ~
│  ├─ AggregateVersionRepo/authorizeSession/authorizeSession.ts         ~
│  ├─ AggregateVersionChain/AggregateVersionChain.ts                    ~
│  ├─ ServiceVersionChain/ServiceVersionChain.ts                        ~
│  ├─ makeFanoutQueue/{makeFanoutQueue,makeFanoutQueueStorage}.ts       ~ acknowledgement/enrollment handoff
│  ├─ commandOperations/{makeCommandDeliveryQueue,admitRecordedCommand}.ts ~ explicit source delivery
│  ├─ agentNodeRepo/
│  │  ├─ agentNodeRepoDbConfig.ts                                      ~ durable producer position
│  │  ├─ agentNodeRuntimeTypes.ts                                      ~
│  │  └─ {makeAgentNodeRuntime,makeAggregateAgentNodeRuntime,makeServiceAgentNodeRuntime}.ts ~
│  ├─ AggregateAgentNodeRepo/{AggregateAgentNodeRepo,aggregateAgentNodeRepoDbConfig}.ts ~
│  ├─ ServiceAgentNodeRepo/{ServiceAgentNodeRepo,serviceAgentNodeRepoDbConfig}.ts ~
│  ├─ externalOperations/makeExternalOperationQueue.ts                  ~
│  ├─ executeDirectAggregateCommand/executeDirectAggregateCommand.ts    -
│  ├─ executeDirectSystemAggregateCommand/executeDirectSystemAggregateCommand.ts ~
│  ├─ executeDirectServiceCommand/executeDirectServiceCommand.ts        ~
│  ├─ repoServices/{AggregateChains,ServiceChains,AggregateVersionChains,ServiceVersionChains}.ts ~
│  └─ existing Api/Gateway/Repo-config/projection release lookups       ~ .releases access only
├─ packages/system-worker/tests/
│  ├─ {aggregate,service}-history-fanout/*.workerd.spec.ts               ~ existing files
│  ├─ service-publication/service-publication.workerd.spec.ts            ~
│  ├─ service-command-admission/service-command-admission.workerd.spec.ts ~
│  ├─ chain-command-delivery/chain-command-delivery.workerd.spec.ts      ~
│  ├─ agent-node-{aggregate,service}/*.workerd.spec.ts                   ~ existing files
│  ├─ service-external-settlement/service-external-settlement.workerd.spec.ts ~
│  ├─ aggregate-adapter-failures/aggregate-adapter-failures.workerd.spec.ts ~
│  ├─ native-system-api/native-system-api.workerd.spec.ts               ~
│  ├─ repo-lifecycle/repo-lifecycle.workerd.spec.ts                      ~
│  ├─ repo-names/repo-names.spec.ts                                    ~
│  └─ existing system.ts and inline makeSystem declarations            ~
├─ examples/{shopping,tic-tac-toe}/.../{system.ts,system.typecheck.ts}    ~ existing declarations
├─ packages/sdk/skills/zerospin-author-feature/SKILL.md                  ~ existing author guidance
├─ fragment/content/
│  ├─ handbook/{releases-and-systems,actors-and-authorization}.md       ~ after implementation
│  ├─ guides/{build-first-feature,system-diagrams}.md                   ~ existing declaration examples
│  └─ reference/browser.md                                            ~ existing declaration example
└─ wiki/
   ├─ archive/plans/277-plan-canonical-chain-history-handoff.md         + completed plan
   ├─ glossary.md                                                     ~ after implementation
   ├─ architecture/AuthoredSystem.md                                   ~ after implementation
   ├─ architecture/server/{VersionChainArchives,executeAggregateCommand,serviceExecution}.md ~
   ├─ architecture/server/CanonicalHistoryHandoff.md                    + after implementation
   └─ patterns/system-worker/{repo-lifecycle,identity-and-ownership}.md  ~ after implementation
```

## Verification at existing seams

1. **Declaration/type seam:** extend `packages/core/tests/contracts.typecheck.ts` and existing `repo-lifecycle.workerd.spec.ts` SystemSpec cases for required canonical selection, invalid key/name rejection, retained inference and canonical selection in whole-SystemSpec hashing/acceptance. Update affected existing consumer type declarations. Do not add a compatibility acceptance case for the old shape.
2. **Handoff/history seam:** extend existing Aggregate/Service history-fanout and Service publication cases. Prove selected AVC/SVC commit before pruning while Archive delivery is unavailable; lost publication/fanout replies; atomic handoff and source eviction; mixed local/Archive history; a slow/new release after pruning; and canonical replacement through a fixed old boundary while the suffix is full. Include already-materialized unpublished output and already-enrolled progress, rather than testing only nonempty pushed pages.
3. **Producer seam:** extend `chain-command-delivery.workerd.spec.ts`, `service-command-admission.workerd.spec.ts` and the existing Aggregate/Service Agent Node due-command/rebinding cases. Prove a lost admission reply followed by pruning/reconstruction returns checkpoint coverage without another admission; covered changed payload is ignored; different producers remain independent; source Chain positions can be sparse at a destination; Agent enqueue sequence survives empty outboxes/rebinding and rolls back with failed enqueue; FIFO delivery; and covered-position replies still work at capacity. Use compact cases with Aggregate/Service parity only where their implementation differs.
4. **External seam:** extend existing Service external-settlement and Aggregate adapter-failure/settlement cases. An observed Success/Failure survives admission backpressure and reconstruction, retry does not rerun the durably observed request, and successful completion admission atomically deletes the pending row. Reuse existing callback/request counters and failure injection.
5. **Execution/authorization seam:** extend `native-system-api.workerd.spec.ts` and existing public typing for ID-less authorization input and fresh Chain-assigned IDs. Verify direct execution returns its own release's `outcome` when the adopted canonical release differs. Update existing `repo-names.spec.ts` service stubs after deleting the obsolete method.
6. Run these existing projects through the root Nx test target with bounded workers, plus affected Core/System Worker source/type/lint targets and the actual in-scope example/dependency consumers. Inspect current Nx target configuration before selecting the implementation graph. Run formatting and diff checks for changed files. Actual results are recorded below.
7. Never verify Explorer. No new test files, fixtures, runners or configuration files are authorized. Mechanical declaration updates to existing test/Storybook configuration are limited to actual affected consumers; do not introduce new machinery or broaden unrelated quality work.

## Post-implementation documentation and rollout

1. Reconcile implemented terms in `wiki/glossary.md`: canonical release, adopted prefix, publication-proving handoff and producer coverage. Explain domain meaning; keep storage tables/procedures in architecture documentation.
2. Update `wiki/architecture/` for admission, original finalization, release replay, synchronous handoff/pruning, canonical replacement and external-result recovery. Update Fragment's existing System/release and authorization guidance plus affected examples/navigation; create no source-module READMEs.
3. Review ADRs [013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md), [015](../../adrs/015-service-delivery-history-and-projection-ownership.md), [016](../../adrs/016-aggregate-original-operations-and-external-work.md) and [024](../../adrs/024-version-chain-sql-archives.md). After implementation, create an ADR only for decisions that are hard to reverse, surprising without context and the result of a real trade-off. Allocate its number then, link it here, and amend/supersede only the clauses actually replaced. Do not write an ADR or change the glossary during planning.
4. Changed fixed schemas require empty affected storage. Include AC/SC producer/handoff/external rows, Agent Node sequence/outbox schemas and SystemRepo's retained `acceptedSystemSpecs.spec` JSON in the rollout inventory: existing stored SystemSpec bodies lack the mandatory canonical selection. Use a coherent fresh development storage lineage for the dependent materializations/history. This plan authorizes no storage reset, deployment or package publication. Use no migrations, aliases, fallback decoders, legacy tables or compatibility-only tests.
5. Record actual implementation and verification evidence, resolve every required omission, set Remaining work to None and archive this plan only when implementation and required verification are complete. PR publication is a separate user instruction.

## Implementation outcome and evidence

1. Implemented required `{ releases, canonical }` declarations and SystemSpec metadata, publication-proving AC/SC handoff, logical history reads, canonical replacement at a frozen boundary, producer checkpoints, durable Agent sequences, ID-less authorization commands, the 64-command suffix bound and retained external observations. Removed the superseded arbitrary-ID execution/recovery paths. Receiving releases and direct execution retain their own `outcome`.
2. All existing Workerd projects passed: **127 tests across 23 files**, including complete test compilation. Command: `NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run zerospin:test --args='--project=workerd/* --maxWorkers=2'`. Final output: `/private/tmp/plan277-workerd-final.log`.
3. The Node project passed: **77 tests across 20 files**, including complete test compilation after the final main refresh. Command: `NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run zerospin:test --args='--project=node --maxWorkers=2'`. Final output: `/private/tmp/plan277-node-tests-refreshed-main.log`. Together, the behavioral runs passed **204 tests across 43 files**. Earlier failing intermediate runs were resolved and are not the completion evidence.
4. The affected source and consumer graph passed **40 tasks across 13 projects and their dependencies** on the refreshed main base: `NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run-many -t lib ts lint -p @zerospin/core system-worker @zerospin/browser @zerospin/sdk @zerospin/dev-worker @zerospin/production-worker @zerospin/cli @zerospin/studio @zerospin/system-diagrams @zerospin/react @zerospin/native shopping tic-tac-toe --parallel=3`. Output: `/private/tmp/plan277-final-checks-refreshed-main.log`. New lint warnings were removed; existing unrelated warnings remain. No Explorer checks were run.
5. Updated Fragment guidance, glossary, local patterns and runtime workflows. [ADR 025](../../adrs/025-canonical-published-history-handoff.md) records the implemented ownership decision and narrowly amends the existing governing ADRs. Architecture source hashes/ranges and immediate sequence annotations were refreshed and checked after source freeze. Changed-file formatting and diff checks passed.
6. No storage reset, deployment or package publication was performed. Rollout requires separately authorized empty affected storage, including SystemRepo's retained SystemSpec JSON, AC/SC fixed schemas and Agent Node producer/outbox schemas, within a coherent fresh development lineage. No compatibility paths or new test files, fixtures, runners or configuration were introduced.

## Remaining work

None.
