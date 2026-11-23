# Actor publication coverage and recovery

**Status:** Complete; implemented and verified in [PR 100](https://github.com/morgs32/zerospin/pull/100) on `codex/actor-publication-coverage`.
**Date:** 2026-10-27.
**Inspection base:** `30bd5a99efdc74e7158d1c6016c7bd35825413d8`, including merged
[PR 91](https://github.com/morgs32/zerospin/pull/91) and
[PR 97](https://github.com/morgs32/zerospin/pull/97).

**Implementation base:** Refreshed main at `ea7bf241ad` (PR 98); the approved
Actor publication/recovery source is unchanged from the inspection base.

## Problem and scope

1. AAVC/SAVC publication retries reread old Archives to compare complete retained
   publications, although their durable logical heads already prove coverage and
   their single bound AAVR/SAVR producer freezes each publication transactionally.
   A lost reply followed by archival can therefore prevent an already-committed
   publication from settling while the old Archive is unavailable.
2. The existing 64-position AAVC/SAVC limit does not bound the producers'
   `exposedCommandOutbox`. AAVR/SAVR can keep materializing and acknowledging
   evaluated pages while downstream publication is blocked, growing pending work
   inside resource-owning Durable Objects.
3. AAVC/SAVC initialize fixed history schemas through authored release/Actor
   resolution. Deregistering that release makes retained logical history and its
   Archive directory unavailable after cold activation. Pure history does not
   require those authored declarations; connection authority still does.
4. Preserve Actor Archive ownership. Actor-selected deltas are frozen transitions
   between selected resource graphs, rather than duplicate admitted inputs.
   Actor outcomes and disposition hashes remain tied to their exact evaluating
   release, independently of the currently canonical release.

## Agreed behavior

1. **Coverage acknowledgement:** validate the bound publication source, the
   fixed publication shape and position ordering. Treat positions at or below
   the current durable `historyHead` as covered without reading or comparing
   their retained public/private pair. Atomically append only the fresh
   contiguous suffix and acknowledge only when every offered position is
   covered. Preserve the existing `void` success contract; no additional
   producer directory, per-command index or returned checkpoint is needed.
2. A structurally valid changed retry at a covered position succeeds and is
   ignored. It cannot replace retained history, emit another broadcast or
   consume fresh capacity. This deliberately replaces Plan 275's publication
   retry equality requirement with the source-immutability premise used by
   Plan 277's producer acknowledgements. Continue rejecting malformed requests,
   mismatched sources, invalid ordering and fresh-position gaps.
3. **Retained pairs:** keep complete public commands and optional private
   completions permanently, with the existing foreign key. Physical Archive
   appends continue exact complete-pair comparison on retries. Keep atomic
   Archive-cursor advancement and local child/parent pruning, rollover,
   ambiguous-failure retries, existing AAVC/SAVC suffix limits and bounded pages.
   Historical replay, checkpoints and private recovery still require their
   relevant Archives to be available.
4. **Producer capacity:** cap each AAVR/SAVR `exposedCommandOutbox` at 64 pending
   publications. In the projection transaction, count genuinely new positions
   against existing pending publications before resource mutation, checkpoint
   advancement or publication insertion. Refuse insufficient capacity retryably
   without mutation. Already-materialized repeats remain successful at capacity;
   a genuinely new batch larger than the entire bound fails explicitly.
5. Preserve the existing evaluated-fanout acknowledgement meaning: resource
   materialization plus complete durable pending publication. Do not make every
   acknowledgement wait for AAVC/SAVC publication or physical archival. Capacity
   refusal prevents subsequent fresh materialization and propagates backpressure
   through the existing source fanout. Recovery must remain armed on refusal.
   Owner orchestration may recover that specific capacity refusal once: capture
   the committed materialization head, drain prior pending publication outside
   SQL, then retry the same offered page. If draining fails, preserve the original
   capacity refusal; if the second transaction loses a capacity race, return its
   refusal to normal source recovery. Successful first attempts do not await their
   own publication. This bounded recovery also lets multi-page startup catch-up
   progress without changing its captured source boundary or adding state flags.
6. **Activation recovery:** capture the Actor Repo's committed materialization
   head and drain its existing pending publication through that position before
   activation catch-up/subscription. Then use the bounded projection transaction
   for both pulled and pushed pages. A full pending queue must not repeatedly
   prevent constructor catch-up before its own delivery can run. Hold no SQL
   transaction or resource permit across the delivery RPC. Preserve snapshot N
   capture and publication through N while N+1 can commit independently.
7. **Independent history:** initialize AAVC/SAVC from their fixed database
   configurations without resolving an authored release, Actor or Actor path.
   Keep point reads, public replay, private completion recovery and archival
   recovery available after that authored release is removed from the registry.
   Release-specific resource materialization and pending authored execution
   retain their existing exact-code requirements.
8. **Connection authority:** preserve SystemRepo's existing authored
   release/session/claims/path validation before forwarding a new connection.
   Put the required Aggregate release/Actor/path availability checks in runtime
   capability validation for resumed and hibernated sockets; removing the old
   constructor gate must not let a retired release's retained socket capabilities
   authorize disclosure. Preserve the corresponding Service checks and all
   post-await authority revalidation and synchronous replay-to-live checks.
   Do not duplicate the existing new-connection admission validation merely to
   preserve the removed constructor machinery.
9. **Missing history:** correct the Aggregate local reader so missing covered
   public positions fail rather than appear to be EOF. Preserve legitimate
   empty private ranges, independent public/private cursors and bounded pages.
   This applies the existing missing-history contract rather than introducing
   another retention or recovery policy.
10. Keep Node wire fields, canonical selection/adoption, independently evaluated
    outcomes, resource/history ownership and Agent behavior unchanged. Do not
    introduce a generic Archive framework, compatibility paths, new schema
    versions or an additional release-retirement protocol.

## Implementation steps

1. Replace the old-position comparison loops in `AggregateActorHistory` and
   `ServiceActorHistory` with coverage handling. Keep fixed-shape decoding,
   source binding, fresh-suffix validation and synchronous head/capacity checks.
   Return broadcasts only for genuinely new committed publications. Remove the
   superseded publication-conflict branches and replace affected existing test
   expectations; retain physical Archive conflict coverage.
2. Add Actor pending-publication capacity checks at the existing Aggregate and
   Service projection transaction seams. Scope the shared Aggregate procedure's
   new bound to Actor projections; preserve Agent projection behavior. Implement
   activation's pending-delivery-before-catch-up ordering and the bounded
   capacity-drain/retry in the owner receiving procedure in the same change.
3. Make both Actor Chain database configurations static. Use existing Aggregate
   release/Actor/path resolution in `readConnectionCapabilities`, keeping its
   unavailable-context result fail-closed for sockets. Preserve SystemRepo's
   new-connection admission validation and Service capability validation, which
   already resolve current declarations. Introduce no forwarding-only context
   helper or second admission path.
4. Align Aggregate public-gap failure with the existing Service behavior while
   preserving sparse private scans. Do not collapse public continuity and private
   completion progress into one cursor.
5. Extend only the existing suites below, run the scoped verification, then update
   the affected runtime documentation and existing ADR. Keep this plan active
   until implementation and required verification are complete.

## Planned file hierarchy

`~` means modify; `+` means create. Code extraction remains domain-local and must
earn its use at the named callers.

```text
zerospin/
├─ packages/system-worker/
│  ├─ src/
│  │  ├─ AggregateActorVersionChain/
│  │  │  ├─ AggregateActorHistory.ts                              ~
│  │  │  ├─ aggregateActorHistoryStorage.ts                       ~
│  │  │  └─ aggregateActorVersionChainMigratableDORepoConfig.ts   ~
│  │  ├─ ServiceActorVersionChain/
│  │  │  ├─ ServiceActorHistory.ts                                ~
│  │  │  ├─ appendExposedCommands.ts                              ~
│  │  │  └─ serviceActorVersionChainMigratableDORepoConfig.ts     ~
│  │  ├─ AggregateActorVersionRepo/AggregateActorVersionRepo.ts   ~
│  │  ├─ ServiceActorVersionRepo/ServiceActorVersionRepo.ts       ~
│  │  ├─ aggregateProjection/applyEvaluatedCommands/
│  │  │  └─ applyEvaluatedCommandsTx.ts                           ~
│  │  ├─ serviceProjection/applyEvaluatedCommandsTx.ts            ~
│  │  └─ aggregateSessionChain/readConnectionCapabilities.ts      ~
│  └─ tests/
│     ├─ aggregate-history-fanout/aggregate-history-fanout.workerd.spec.ts ~
│     ├─ service-actor-prefix/service-actor-prefix.workerd.spec.ts ~
│     └─ service-actor-connections/service-actor-connections.workerd.spec.ts ~
└─ wiki/
   ├─ plans/278-plan-actor-publication-coverage-and-recovery.md    +
   ├─ adrs/024-version-chain-sql-archives.md                      ~ after implementation
   ├─ glossary.md                                               ~ after implementation, if terminology needs reconciliation
   ├─ patterns/{index.md,system-worker/repo-lifecycle.md}         ~ after implementation
   └─ architecture/
      ├─ AuthoredSystem.md                                       ~ after implementation
      ├─ browser/SessionWebSocket.md                             ~ after implementation
      └─ server/
         ├─ VersionChainArchives.md                              ~ after implementation
         ├─ SelectedViews.md                                     ~ after implementation
         └─ DeliveryAndRecovery.md                               ~ after implementation
```

## Verification at existing seams

1. **Publication coverage:** in Aggregate history fanout and Service Actor prefix
   cases, prove exact and changed covered publications settle after local pruning
   while the old Archive is unavailable, without Archive reads, another insert
   or another broadcast. Exercise a mixed covered/fresh page, fresh index gaps,
   source mismatch, malformed publication rejection and retries at capacity.
   Preserve exact conflicting-pair rejection at the physical Archive seam.
2. **Bounded producer work:** hold downstream publication unavailable and offer
   enough evaluated history to exceed the Actor Repo bound. Prove the pending
   count stops at 64; refusal leaves resources, materialization head and outbox
   unchanged; repeats at capacity succeed; and publication recovery permits fresh
   progress. Include cold activation with a full retained pending queue and newer
   upstream history, proving delivery occurs before catch-up can hit capacity.
   Reuse the existing snapshot N/concurrent N+1 case.
3. **History versus connection authority:** retain public/private publications
   across local archival and eviction, remove the authored release from the
   current registry and prove pure history plus archival recovery remain usable.
   In the existing socket cases, prove new and retained/hibernated connections
   for that removed release cannot disclose public or private commands. Keep
   owner/session/full-claims validation and post-await capability checks intact.
   The cold-history proof must remove the declaration from the actual `System`
   service used by the captured ManagedRuntime, not merely replace an exposed
   configuration property while its original Effect layer remains available.
4. **Public gaps:** exercise a missing covered local public tail and require a
   failure. Retain the existing successful empty-private-range and independent
   cursor cases. Use a small focused scenario rather than a corruption catalogue.
5. Run the affected existing Workerd projects through `zerospin:test` with
   `--maxWorkers=2`, including its complete test compiler, and the existing
   `agent-node-aggregate` regression for the shared Aggregate paths. Run the
   scoped `system-worker` Nx build/type/lint graph and changed-file formatting,
   diff and documentation-reference checks. Inspect current task configuration
   before selecting commands. Broaden only for an actual affected consumer or
   unresolved failure; never verify Explorer.
6. Create no test files, fixtures, runners or configuration files. The review
   baseline on `30bd5a99ef` passed 28 existing tests across six files, recorded in
   `/private/tmp/pr91-pr97-review-tests.log`; that evidence does not verify these
   planned changes.

## Documentation, decisions and delivery

1. After implementation, reconcile the existing glossary and affected architecture
   workflows with the actual result. Explain publication coverage separately from
   byte equality, materialization acknowledgement and physical Archive
   acknowledgement. Refresh touched source hashes, ranges and relevant workflow
   annotations. Create no source-module READMEs.
2. Amend [ADR 024](../../adrs/024-version-chain-sql-archives.md) for the implemented
   Actor publication retry contract, producer bound and code-independent history.
   [ADR 025](../../adrs/025-canonical-published-history-handoff.md) remains the
   reference for canonical handoff and producer coverage. Write another ADR only
   if an implemented decision cannot be documented clearly in those existing
   governing records and meets the repository's qualifying criteria.
3. No new persisted schema is required by the agreed design. Do not add
   compatibility machinery or reset storage as part of this plan. The earlier
   development/production cutover discussion is separate from this local work;
   publishing packages, deployment and runtime deletion are not implementation
   steps here.
4. Record actual implementation and verification evidence, resolve required
   failures, set Remaining work to None and archive this plan only after verified
   completion. Commit/push/PR publication follows the user's delivery instruction.

## Implementation outcome and evidence

1. Implemented coverage acknowledgement in one synchronous current-head transaction
   per Actor Chain. Covered changed publications produce no Archive reads, new
   rows or broadcasts. Physical Archive complete-pair equality remains intact.
2. Implemented Actor-only pending-publication bounds, initial captured-head drain
   and one conditional prior-output drain/retry on capacity refusal. This fixes
   the real multi-page constructor catch-up failure found by the existing Service
   fanout case. Failed delivery preserves capacity refusal; interruptions remain
   interruptions. No lifecycle flags or extra paging loop were introduced.
3. Implemented static Actor history schema initialization, current Aggregate
   socket capability checks and typed missing-public-tail failures. Retirement
   cases override both synchronous and asynchronous captured runtime services;
   retained history/archival recovery succeeds while old socket disclosure fails.
4. The final focused Workerd run passed **32 tests across six files**, including
   complete test compilation: `aggregate-history-fanout`, `service-actor-prefix`,
   `service-actor-connections`, `agent-node-aggregate`, `service-history-fanout`
   and `service-publication`. Command: `NX_DAEMON=false NX_NO_CLOUD=true pnpm nx
run zerospin:test --args='--project=workerd/aggregate-history-fanout
--project=workerd/service-actor-prefix --project=workerd/service-actor-connections
--project=workerd/agent-node-aggregate --project=workerd/service-history-fanout
--project=workerd/service-publication --maxWorkers=2'` (one shell invocation).
   Output: `/private/tmp/plan278-final-tests.log`.
5. The final scoped source/dependency graph passed **15 build/type/lint tasks**:
   `NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run-many -t ts lint -p system-worker
--nxBail` (one shell invocation). Output:
   `/private/tmp/plan278-final-source-checks.log`. Only the two existing unrelated
   lint warnings remain. Newly introduced warnings and test-typing failures were
   fixed. The final test run also resolves the earlier two fixture timeouts and
   native delivery-failure handling failure; those intermediate runs are not the
   completion evidence.
6. Locked offline dependency refresh passed using `CI=true` for pnpm's required
   noninteractive workspace-link replacement. No package or lockfile was changed.
   Source schemas, Node wire fields and Agent behavior remain unchanged. No
   storage reset, deployment, package publication, new test files, fixtures,
   runners or configuration were introduced.
7. Updated ADR 024, the glossary, runtime workflows and local lifecycle guidance.
   Source ranges/hashes were refreshed after code freeze. Changed-file formatting
   and `git diff --check` pass. Documentation validation checked 43 changed/new
   links, 28 changed-source manifest entries and 15 sequence/annotation pairs
   without errors. Independent read-only review found no concrete blocker in
   bounded receive recovery, interruption handling or delivery wake ownership.

## Remaining work

None.
