# Consolidate source-module READMEs into documentation

**Date:** 2026-10-26

**Status:** Complete. Implemented and verified on 2026-10-26 in `codex/consolidate-source-readmes`, then reconciled with current main `7b44d48e68e3637bc075ca5d249305d5e64d2aaa` before updating PR 79. The initial migration used `79c1824b1a0353f770211851c0bfe1cc54d0ba46`. This PR changes documentation only.

## Problem and agreed outcome

1. There are 39 `packages/*/src/**/README.md` files across browser (2), core (12), SDK (1) and system-worker (24), containing approximately 4,200 lines at planning time. They distribute explanations by implementation folder rather than by the reader's question, duplicate existing documentation and retain superseded implementation/status descriptions.
2. Move useful developer-facing concepts, public API usage and examples into Fragment's existing handbook, guides and reference. Fragment's Markdown source lives in `fragment/content/`; its `/docs` route redirects to `/guides/quickstart`. Do not create a new `/docs` directory, route hierarchy or Internals section.
3. Move system-worker ownership, transactions, retained history, selected projections, delivery and recovery explanations into `wiki/architecture`. Core/browser runtime internals likewise belong in the relevant existing browser architecture workflows; they do not need a separate Fragment internals catalogue.
4. Consolidate by responsibility, not one new page per old README. Preserve exact Aggregate/Service and Actor/Agent differences where they affect correctness. Delete all 39 source-module READMEs after useful content and references are reconciled; retain no placeholder, forwarding or summary READMEs in their former locations.
5. Keep package-level READMEs for package purpose, entry points and development commands. Keep operational test READMEs, example READMEs, plans, handoffs, ADRs, review evidence and architecture workflows in their existing responsibilities. This is not a wholesale wiki migration.

## Documentation ownership and scope

1. Fragment owns the application developer's explanation: what to author, how to use public APIs, what local staging means, how to observe state and failures, and how to test authored behavior.
2. `wiki/architecture` owns implementation workflows and invariants: concrete component ownership, SQL transaction boundaries, publication/capture, subscriber acknowledgement, recovery, transport and storage lifetimes. Prefer extending the existing workflow; add the focused pages below only for responsibilities that otherwise get buried in `AuthoredSystem.md`.
3. Source comments retain local implementation reasoning and invariants. No source refactor, annotation pass or new generated documentation system is part of this migration.
4. `wiki/plans`, `wiki/adrs`, `wiki/handoffs` and dated reviews retain work status, decisions and evidence. Source review during migration does not establish runtime acceptance or close Plans 234, 236, 240, 258 or 270.
5. Root `AGENTS.md` will record this repository's documentation destinations and prohibit recreating `packages/*/src/**/README.md`. Do not edit the shared `update-readme` skill or the sibling wiki repository; the explicit maintainer direction and local rule govern this checkout.
6. Preserve concurrent work. The planning checkout has unrelated Plan 234 code/tests/status edits, Plan 270 and handoff edits, and the two session README edits written in this side conversation. Read their latest contents when implementing. Carry the installer explanation and A/B example into their final destinations before deleting those READMEs; do not discard them or stage unrelated work.

## Migration inventory

Every numbered item below identifies one source README to remove. Destinations are existing files unless marked **new**. Split public API explanation from implementation detail when both occur in one source; do not duplicate a full explanation in both destinations.

### Browser: 2 source READMEs

1. `packages/browser/src/browserSession/README.md` → `fragment/content/reference/browser.md`, `fragment/content/handbook/sessions-and-synchronization.md` and `fragment/content/handbook/failures-and-recovery.md` for construction, public lifecycle, commands, readiness and errors. Put host acquisition, publication fences and startup/deadline implementation details in `wiki/architecture/browser/bootstrapBrowserSession.md` and `wiki/architecture/browser/Identity.md`.
2. `packages/browser/src/sessionDefinition/README.md` → `fragment/content/reference/browser.md` for pure declarations and executable worker wiring. Keep worker/storage identity implementation in `wiki/architecture/browser/StandaloneSharedWorkerExecution.md` and `wiki/architecture/browser/bootstrapBrowserSession.md`.

### Core: 12 source READMEs

1. `packages/core/src/AggregateNode/README.md` → `wiki/architecture/browser/PushSequence.md` and `wiki/architecture/browser/SessionWebSocket.md`: immutable original/final history, authoritative baseline, derived optimistic graph, coherent capture/publication and close/replacement responsibilities.
2. `packages/core/src/ServiceNode/README.md` → the same browser architecture pages, retaining Service identity, `serviceIndex`, private progress and actual Service procedures explicitly rather than assuming the Aggregate path proves Service behavior.
3. `packages/core/src/aggregateSession/README.md` → `fragment/content/handbook/sessions-and-synchronization.md` for the A/B explanation of a Node view plus uncovered local commands. Put `installAggregateNodeView` validation, same-row resolution, inverse replacement, checkpoint and transaction details in `wiki/architecture/browser/PushSequence.md` and `wiki/architecture/browser/AggregateCommandLifecycle.md`.
4. `packages/core/src/serviceSession/README.md` → the same handbook explanation by reference and `wiki/architecture/browser/PushSequence.md` / `wiki/architecture/browser/SessionWebSocket.md` for `installServiceNodeView`, Service allocation/checkpoint and bound capability differences. One shared conceptual example is enough.
5. `packages/core/src/AggregateAgentNode/README.md` → `wiki/architecture/browser/SessionWebSocket.md` for the current public observer snapshot/checkpoint and lifetime. Put developer-facing Agent observation guidance in `fragment/content/guides/studio.md` where relevant. Reconcile against current source rather than copying retired browser producer descriptions.
6. `packages/core/src/ServiceAgentNode/README.md` → the same observer destinations with the actual Service owner binding and `serviceIndex` behavior.
7. `packages/core/src/aggregateActor/README.md` → `fragment/content/handbook/actors-and-authorization.md` and `fragment/content/reference/sdk.md` for authoring, claims, selections and supported contracts. Put internal projection/selection compilation details in `wiki/architecture/AuthoredSystem.md` or the new `wiki/architecture/server/SelectedViews.md` according to the actual owner.
8. `packages/core/src/serviceActor/README.md` → the same public authoring destinations, preserving Service identity, query authority and exact release membership.
9. `packages/core/src/contracts/README.md` → `fragment/content/handbook/contracts-and-operations.md`, `fragment/content/handbook/external-work.md` and `fragment/content/reference/sdk.md` for public authoring/results/operation semantics. Put internal evaluation, replay and failure classification in `wiki/architecture/server/executeAggregateCommand.md` and `wiki/architecture/server/serviceExecution.md`.
10. `packages/core/src/drizzle/README.md` → `fragment/content/handbook/models-and-ids.md` / `fragment/content/guides/query-data.md` for stored-row versus resource-envelope and public query semantics. Put codecs, `makeTx`, savepoints, physical persistence and selection compilation in **new** `wiki/architecture/QueriesAndTransactions.md`.
11. `packages/core/src/sessionExecution/README.md` → `wiki/architecture/browser/bootstrapBrowserSession.md` for execution roots, cancellation, draining and runtime lifetime. Keep public `runSync`/`runPromise` usage and readiness in `fragment/content/reference/browser.md`, without repeating the host implementation.
12. `packages/core/src/utils/README.md` → `wiki/architecture/SystemApi.md` for `getApi`, capability acquisition, invocation, transport and administrative read ownership. Put supported public imports and a useful caller example in `fragment/content/reference/sdk.md`.

### SDK: 1 source README

1. `packages/sdk/src/testing/README.md` → **new** `fragment/content/guides/test-authored-behavior.md`: public `makeSystemHarness` setup, typed commands/queries, deterministic external work, disposal and proof boundaries. Link to `tests/README.md` for repository runner instructions; do not copy test-command ownership or claim headless harness results prove browser/SharedWorker/Native behavior.

### System-worker: all 24 source READMEs go to wiki architecture

1. `packages/system-worker/src/AggregateChain/README.md` → `wiki/architecture/server/admitAggregateCommands.md`, with cross-links to execution and external delivery for work those components own.
2. `packages/system-worker/src/AggregateVersionRepo/README.md` → `wiki/architecture/server/executeAggregateCommand.md`: materialized resources, command evaluation/replay, atomic checkpoints/pending publication and commit failures.
3. `packages/system-worker/src/AggregateVersionChain/README.md` → `wiki/architecture/server/executeAggregateCommand.md`: retained evaluated commands, immutable history, publication acknowledgement and downstream fanout.
4. `packages/system-worker/src/ServiceChain/README.md` → `wiki/architecture/server/admitServiceCommand.md`: admitted input, original retained `outcome` and pending external responsibility.
5. `packages/system-worker/src/ServiceVersionRepo/README.md` → `wiki/architecture/server/serviceExecution.md`: exact release materialization, ordered operations and synchronous commit/replay.
6. `packages/system-worker/src/ServiceVersionChain/README.md` → `wiki/architecture/server/serviceExecution.md`: immutable Service output, per-subscriber acknowledgement, catch-up and retained-history ownership.
7. `packages/system-worker/src/SystemRepo/README.md` → `wiki/architecture/SystemApi.md` and the existing acceptance sections of `wiki/architecture/AuthoredSystem.md`: whole-SystemSpec acceptance, registration/inspection, identity listing and single-use session tickets.
8. `packages/system-worker/src/AggregateActorVersionRepo/README.md` → **new** `wiki/architecture/server/SelectedViews.md`: selected resource materialization, checkpoint and complete pending publication.
9. `packages/system-worker/src/AggregateActorVersionChain/README.md` → `SelectedViews.md`: retained exposed history, private resolutions, connection capabilities and replay/live transitions.
10. `packages/system-worker/src/ServiceActorVersionRepo/README.md` → `SelectedViews.md`, preserving exact Service Actor identity and materialization transaction.
11. `packages/system-worker/src/ServiceActorVersionChain/README.md` → `SelectedViews.md`, preserving Service history/private-prefix capture and socket recovery boundaries.
12. `packages/system-worker/src/AggregateAgentVersionRepo/README.md` → `SelectedViews.md`: public Agent resources, checkpoint and pending publication without private history ownership.
13. `packages/system-worker/src/AggregateAgentVersionChain/README.md` → `SelectedViews.md`: public retained Agent history and durable subscriber acknowledgement.
14. `packages/system-worker/src/ServiceAgentVersionRepo/README.md` → `SelectedViews.md`, preserving exact selected Service binding and public materialization.
15. `packages/system-worker/src/ServiceAgentVersionChain/README.md` → `SelectedViews.md`, preserving public history, exact source and recipient acknowledgement.
16. `packages/system-worker/src/aggregateProjection/README.md` → `SelectedViews.md`: selected output computation, resource/checkpoint/publication atomicity and exact retry.
17. `packages/system-worker/src/aggregateSessionChain/README.md` → `SelectedViews.md`: Actor connection/private completion versus public Agent observation; link to the existing browser `SessionWebSocket.md` for the receiving Node workflow.
18. `packages/system-worker/src/serviceProjection/README.md` → `SelectedViews.md`: exact release/Actor selection, scope/privacy, captured checkpoint and publication.
19. `packages/system-worker/src/serviceAgentProjection/README.md` → `SelectedViews.md`: registered Agent owner binding and public selected output.
20. `packages/system-worker/src/agentNodeRepo/README.md` → **new** `wiki/architecture/server/AgentExecution.md`: AggregateAgentNodeRepo/ServiceAgentNodeRepo resources, attempted wakes, frozen command delivery, owner rebinding and removal.
21. `packages/system-worker/src/makeWakeRegistry/README.md` → `AgentExecution.md`: durable next-wake discovery, registration, alarm recovery and interruption. Scheduling does not transfer canonical command execution ownership to an observer or query.
22. `packages/system-worker/src/externalOperations/README.md` → **new** `wiki/architecture/server/DeliveryAndRecovery.md`: original-only provider work, recorded observations, exact continuation admission, uncertainty, recovery and pending-row lifecycle.
23. `packages/system-worker/src/makeFanoutQueue/README.md` → `DeliveryAndRecovery.md`: fixed-boundary source reads, catch-up/enrollment, per-subscriber acknowledgement, independent failures, producer leases and alarm recovery. Preserve the reason enrollment cannot wait for the drain semaphore.
24. `packages/system-worker/src/makeMigratableDORepo/README.md` → **new** `wiki/architecture/server/RepoLifecycle.md`: schema admission, bootstrap/activation, subscriptions, failure/reconstruction and explicit recovery ownership. Preserve the distinction between any still-supported lifecycle/schema mechanisms and the maintainer's fixed-schema hard-cutover policy; do not introduce translation or migration compatibility.

## Content reconciliation requirements

1. Read each README's current implementation and callers when migrating it. This inventory locates content; it does not certify every old statement. Mark every meaningful explanation as retained at a specific section, already covered there, superseded by current source, or historical evidence retained through its original commit. Record exceptions in this plan instead of adding a generated catalogue.
2. Preserve distinctions between local staging, Node retention, admitted command, execution commit, dispatch acknowledgement and `outcome` retention. Use `outcome: { result: Success | Failure, finalizedAt }`, `serviceIndex` and `dispositionChainHash`. Do not copy obsolete tags, fields, schema stamps, removed browser Agent producers or multi-definition SharedWorker registration from old prose.
3. Preserve transaction boundaries, exact identity and claims, safe allocation, first-gap/private progress, immutable history, resource envelope validation, publication capture, lost acknowledgement, retry, disposal and recovery explanations. Aggregate/Service and Actor/Agent paths need their own concrete source citations where behavior differs.
4. Keep historical verified evidence and its proof limits intact. Move useful evidence summaries with their dated scope or link to the original commit; do not turn a dated README test result into fresh acceptance of current code. In particular, this migration cannot close Plan 234's Node/replica requirements.
5. Merge the installer explanation already written in the Aggregate session README: a captured graph covers A, a concurrent local B remains uncovered, installation replaces the graph and replays B once. Fragment explains the reader-visible behavior; architecture owns the exact `installAggregateNodeView` / `installServiceNodeView` validation and commit sequence.
6. Fragment articles use required nonempty `title`, `description` and numeric `order` frontmatter, the existing sections and automatic navigation. Assign the new testing guide the next available guide order at implementation time. Keep site links as `/handbook/...`, `/guides/...` or `/reference/...`; use verified repository source URLs for implementation links rather than copying README-relative filesystem links into the site.
7. Architecture pages keep preview-safe repository-relative source links and their `sources[]` path/hash/range metadata. New workflow pages include concrete triggers and meaningful sequence diagrams with matching annotated steps. Refresh affected metadata from current source and repair changed section anchors; do not run an unrelated wiki-wide ingest or provenance rewrite.
8. Existing `AuthoredSystem.md`, admission/execution and browser workflows remain the overview and causal paths. Replace overlapping detail with links to the new focused architecture page rather than copying its complete sections into every workflow.

## Inbound links and historical references

1. Before deletion, resolve references to all 39 README paths, including relative Markdown links, directory/implicit-README links, source comments, metadata and tracked configuration. The planning scan found at least 22 files with literal full README paths; that is a lower bound, not a complete inbound-link audit.
2. Repair live references to the final canonical page and section. Fragment links from repository docs should resolve as repository-relative Markdown paths; links rendered inside Fragment use site routes. Source citations in architecture point to the implementation, not back to a removed source README.
3. For dated plans, reviews and evidence records whose meaning depends on the old README, preserve the original evidence with a commit-pinned repository link to the README before deletion. A historical snapshot is not a claim about the new documentation. Do not retain dead links or rewrite historical evidence as though it originally described the new page.
4. Preserve historical coverage/provenance metadata such as `wiki/reviews/2026-10-11-framework-rearchitecture-coverage.json`. Inspect whether a field is a live lookup or historical record before changing it; do not refresh old evidence hashes to make them appear current. Update any live consumer of a removed README path or retain a pinned historical reference as appropriate.
5. Limit changes in package/example/operational READMEs to repairing affected links and documenting the new entry points. Correct the root README's obsolete documentation-site location to Fragment. Update `fragment/README.md` with content ownership and `wiki/README.md` with the architecture-versus-Fragment boundary.

## Implementation sequence

1. Recheck this inventory, numbering, current source and working-tree edits. Find all inbound references before choosing final section anchors; do not assume the main conversation's uncommitted work is part of this migration.
2. Migrate developer-facing material into existing Fragment pages and the new testing guide. Reconcile the sessions handbook's stale staging/result and selected-delta wording with current source. Keep API examples small and exact; use current owner grants and command APIs without pre-implementing Plan 270.
3. Consolidate runtime material into the existing architecture workflows and five focused pages. Keep the entire system-worker inventory in wiki architecture. Validate concrete ownership, trigger/message order, failures, transaction commits and retention before removing duplicate prose.
4. Repair live and historical references using the rules above, then delete all 39 source-module READMEs in the same migration. Leave no stub files or compatibility documentation paths. Amend local documentation guidance and entry-point READMEs so subsequent work does not recreate the old layout.
5. Run the scoped documentation/site checks below, resolve in-scope failures and record actual evidence here. Do not create test files, fixtures, runners or configuration. Application behavior and storage are unchanged.
6. Reconcile implemented terminology with the existing glossary only if domain meaning actually changed. This move introduces no new domain concept and ordinarily needs no glossary entry or ADR. Keep all governing ADRs and unrelated active plans unchanged except necessary link repairs.
7. Archive this plan only after the full inventory, deletion, reference repair and permitted verification are complete. Commit/push only when separately requested or authorized; neither happened during planning.

## Planned file hierarchy

Legend: `+` creates, `~` modifies, `-` deletes. The brace groups name exact files; the deletion inventory above is exhaustive for the 39 source READMEs. Existing tracked files with inbound links also receive narrowly scoped reference repairs.

```text
zerospin/
  ~ AGENTS.md
  ~ README.md
  fragment/
    ~ README.md
    content/
      guides/
        + test-authored-behavior.md
        ~ query-data.md
        ~ studio.md
      handbook/
        ~ actors-and-authorization.md
        ~ contracts-and-operations.md
        ~ external-work.md
        ~ failures-and-recovery.md
        ~ models-and-ids.md
        ~ sessions-and-synchronization.md
      reference/
        ~ browser.md
        ~ sdk.md
  packages/
    browser/src/{browserSession,sessionDefinition}/
      - README.md
    core/src/{AggregateNode,ServiceNode,AggregateAgentNode,ServiceAgentNode,
              aggregateActor,serviceActor,aggregateSession,serviceSession,
              contracts,drizzle,sessionExecution,utils}/
      - README.md
    sdk/src/testing/
      - README.md
    system-worker/src/{AggregateChain,AggregateVersionRepo,AggregateVersionChain,
                       ServiceChain,ServiceVersionRepo,ServiceVersionChain,
                       SystemRepo,AggregateActorVersionRepo,AggregateActorVersionChain,
                       ServiceActorVersionRepo,ServiceActorVersionChain,
                       AggregateAgentVersionRepo,AggregateAgentVersionChain,
                       ServiceAgentVersionRepo,ServiceAgentVersionChain,
                       aggregateProjection,aggregateSessionChain,serviceProjection,
                       serviceAgentProjection,agentNodeRepo,makeWakeRegistry,
                       externalOperations,makeFanoutQueue,makeMigratableDORepo}/
      - README.md
  wiki/
    ~ README.md
    architecture/
      ~ AuthoredSystem.md
      ~ SystemApi.md
      + QueriesAndTransactions.md
      browser/
        ~ AggregateCommandLifecycle.md
        ~ Identity.md
        ~ PushSequence.md
        ~ SessionWebSocket.md
        ~ StandaloneSharedWorkerExecution.md
        ~ bootstrapBrowserSession.md
      server/
        ~ admitAggregateCommands.md
        ~ admitServiceCommand.md
        ~ executeAggregateCommand.md
        ~ serviceExecution.md
        + AgentExecution.md
        + DeliveryAndRecovery.md
        + RepoLifecycle.md
        + SelectedViews.md
    plans/
      + 273-plan-consolidate-source-readmes-into-documentation.md
```

## Verification and completion criteria

1. **Inventory and content:** account for every one of the 39 README removals and their meaningful content. Confirm system-worker details landed only in wiki architecture, public developer explanations landed in Fragment, duplicated content was consolidated and obsolete assertions were not copied as current behavior.
2. **References and evidence:** resolve changed local links, Fragment routes and heading anchors; check repository source URLs against actual paths; validate historical pinned links against the selected pre-deletion commit. Confirm no live reference still requires a deleted README. Allow old path text only in explicit migration inventory or genuine historical references with intact evidence.
3. **Architecture consistency:** validate changed frontmatter source paths/hashes/ranges and range-relevant citations. Check each changed/new sequence against its trigger and annotated message order. Preserve privacy, ownership, transaction and recovery distinctions; documentation checks establish no runtime acceptance.
4. **Formatting and whitespace:** run the existing formatter on the explicitly changed Markdown files and `git diff --check` for this change. Use existing documentation checks where available; add no new checker/test infrastructure.
5. **Fragment:** inspect resolved Nx configuration when implementation begins and run its existing typecheck/lint/build tasks with required dependencies. Verify the changed article routes and new testing guide render, appear in navigation, expose their headings and follow links correctly through the existing Fragment runtime. No new section, renderer, redirect or documentation package is required.
6. **Scope and preservation:** confirm the only executable behavior checked is Fragment's existing rendering/navigation, no production source behavior changed, no existing storage was reset, no shared skill was edited, and unrelated working-tree changes remain intact. Never verify Explorer.
7. **Closure:** record any unresolved content or current-source mismatch in Remaining work; do not silently drop it to finish deletion. Archive only after all applicable checks pass. Existing application verification obligations stay with their owning plans.

## Implementation outcome and content reconciliation

All 39 inventory entries above are reconciled and their source READMEs are deleted, with no forwarding files. Their useful explanations are retained at the named destinations; the section map below records the final responsibility boundaries. Five focused architecture pages and one public testing guide were added. Package, example and operational test READMEs remain in their existing roles. No runtime source, schema, storage, test, runner or shared skill changed.

- **Browser construction and definitions (2):** retained public construction, readiness, execution and errors in Fragment's browser reference/session and failure handbooks. Pure declaration versus executable worker wiring is in `reference/browser.md#wire-the-executable-sharedworker`; acquisition, identity fences, diagnostics and lifetime drainage are in browser bootstrap, Identity and standalone workflows.
- **AggregateNode and ServiceNode (2):** retained immutable original/final history, allocation, private progress, coherent capture, shared optimism, retry/replacement and close in `PushSequence.md` and `SessionWebSocket.md`, with separate Aggregate/Service source citations.
- **Aggregate and Service sessions (2):** retained the concurrent installer explanation and one A/B example in `sessions-and-synchronization.md#install-a-node-view-without-duplicating-optimism`. Exact validation, same-row resolution, inverse replacement, checkpoint and uncovered replay belong to `PushSequence.md#installing-a-captured-node-view`; staging/validation remain in AggregateCommandLifecycle.
- **AggregateAgentNode and ServiceAgentNode (2):** retained public observation, checkpoint and guarded-reader lifetimes in `SessionWebSocket.md#public-agent-observation`, Fragment's browser reference and Studio guide. Browser producer/optimistic-reconstruction descriptions were superseded by current observer-only source.
- **Aggregate and Service Actors (2):** retained claims, exposed models, selections, query/command authority, exact release support and declaration capture in Fragment's actor handbook/SDK reference. Existing AuthoredSystem plus SelectedViews cover internal compilation and owner bindings.
- **Contracts (1):** retained public results, operations, upgrades, adapters and external continuation semantics in Fragment's contracts/external-work handbooks and SDK reference. Exact execution, replay, failure classification and logical Clock belong to the Aggregate and Service execution workflows.
- **Drizzle (1):** retained stored-row versus resource-envelope and query semantics in the model handbook/query guide; codecs, savepoints, transaction fences, physical provisioning, committed-table observation and selection compilation are in `QueriesAndTransactions.md`.
- **Session execution (1):** retained public lazy execution/readiness in the browser reference; execution roots, cancellation, supervisor and ordered drainage in bootstrap; optimistic replay/refusal boundaries in PushSequence and QueriesAndTransactions.
- **Utilities (1):** retained supported administrative imports and an exact caller example in `reference/sdk.md#administrative-owner-reads`. Lazy capability acquisition, invocation, transport failures/disposal and administrative ownership are in `SystemApi.md#lazy-http-capability-invocation` and the existing read sections.
- **SDK testing (1):** retained scoped SQLite, typed command/query setup, deterministic providers, explicit Clock advancement, flush limits, disposal and proof boundaries in the [new testing guide](../../../docs/content/guides/test-authored-behavior.md), at the next guide order, 14. Operational runner ownership stays in `tests/README.md`.
- **AggregateChain and ServiceChain (2):** retained immutable retry-first admission, original outcome retention and pending external responsibility in their admission workflows' retention sections, with links to execution and recovery owners.
- **Aggregate/Service VersionRepos and VersionChains (4):** retained exact execution interpretation, synchronous model/checkpoint/publication commitment, replay, complete immutable evaluated commands, logical time, lost acknowledgement and permanent history in the two execution workflows and SelectedViews. Subscriber acknowledgement never deletes retained history.
- **SystemRepo (1):** whole-SystemSpec acceptance remains covered by existing AuthoredSystem/SystemApi sections; registration, inspection and single-use family-bound ticket lifetime are retained in SystemApi. Individual immutable-fact comparisons are not separate acceptance events.
- **Four selected Repos, four selected Chains, three projection modules and aggregateSessionChain (12):** retained exact Actor/Agent identities, complete selection dependencies, model-only projection, atomic resource/checkpoint/pending output, immutable public/private history, captured-N snapshots, first-gap/private-prefix proof, replay/live transitions, connection capabilities and disposal in [SelectedViews](../../architecture/server/SelectedViews.md). Aggregate/Service differences retain their own source citations. Browser receipt of these streams stays in SessionWebSocket.
- **Agent Node Repos and WakeRegistry (2):** retained stable Node identity, attempted wakes, frozen pending commands, durable deadline discovery/watchdog, owner rebinding/removal, interruption and independent wake-pass failure in [AgentExecution](../../architecture/server/AgentExecution.md).
- **External operations and fanout queue (2):** retained original-only provider work, first recorded observation, exact continuation admission, provider uncertainty, pending-row lifecycle, finite catch-up/enrollment, independent recipients, producer leases and alarms in [DeliveryAndRecovery](../../architecture/server/DeliveryAndRecovery.md). The enrollment/drain semaphore deadlock explanation is preserved explicitly.
- **Migratable Repo factory (1):** retained identity, registration/schema/bootstrap/activation order, supported generic ledger mechanics, failure/reconstruction, subscription and explicit alarm ownership in [RepoLifecycle](../../architecture/server/RepoLifecycle.md). Existing mechanisms do not override the fixed-schema hard-cutover policy.

AuthoredSystem remains the overview. Its overlapping alarm/rebinding detail now links the focused pages. Fragment and architecture links replace live source-README references; AGENTS.md and entrypoint READMEs record the ownership boundary and prohibit recreating nested source READMEs. The root README now locates the developer site in Fragment. No new glossary concept or ADR was needed.

### Superseded statements and historical evidence

Current source supersedes old staging/result names, removed schema stamps, browser Agent producers, global Agent registration examples, unversioned selected Agent identities, the old Service direct-return wrapper, removed ticket helper and retired Studio trace-route claims. Public examples now use current release membership, command construction and direct `ICommandOutcome`; no later plan was implemented implicitly.

Dated README evidence is preserved through commit-pinned links, with its original fixture/provider/authentication limits. The archived plan inventories explicitly retain their historical meaning. The 2026-10-11 coverage JSON is byte-identical; its owning review identifies the historical snapshot, and no live lookup consumes its removed README paths. Four affected historical architecture line citations were pinned before their sections moved.

Two original Node README `#L53` citations in the dated user-version research were already outside the committed files. Invalid line fragments were removed, the original research snapshot remains linked, and the evidence limitation is explicit in that research. The migration does not manufacture proof for its schema-21 claim. Plans 234, 236, 240, 258 and 270 retain their own scope and verification obligations.

### Verification evidence

- Confirmed exactly 39 deletions: browser 2, core 12, SDK 1 and system-worker 24. No nested source README or forwarding stub remains.
- Audited 2,453 tracked/new text files for live inline/reference-style, directory/implicit-README, HTML, unpinned GitHub, comment and configuration references. No live reference requires a deleted README; remaining path text is explicit historical inventory, preserved audit data or a pinned historical link.
- Validated all 863 source metadata path/hash/range entries across the 17 changed/new architecture pages. Checked 29 sequence diagrams against their immediately following first ordered annotation lists; counts and order now match. Checked changed local/site/source links, heading anchors, source ranges and historical pinned objects. Independent review of all five focused pages found no material ownership, transaction, history or recovery issues.
- Existing Nx formatting/format-check tasks pass on the explicitly changed Markdown files; `git diff --check` passes. No new checker, runner, configuration or test file was created.
- `NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run-many -t ts lint build -p fragment --parallel=1` passed typecheck and lint. Next.js interrupted the first build with its installed-version security notice; the existing build passed on retry. After final article formatting, `pnpm nx run fragment:build` again passed on the documented retry. The existing fragment-ui library prerequisite ran through Nx. The dependency-security notice is recorded for separate dependency maintenance; no dependency or lockfile was changed.
- Production-preview browser checks passed for all 11 changed article routes, rendered titles/headings, guide navigation, the testing-guide-to-SDK heading link and the existing `/docs` quickstart redirect. Reloaded the final formatted production guide and confirmed its headings/navigation. Preview uses port 12734; Chrome was not running, so verification used the in-app browser.
- Source/runtime/configuration/lockfile changes are absent. The original main-checkout session README additions and approved plan remain unchanged; unrelated work was not staged or imported. No storage reset, provider/application runtime acceptance, Explorer verification or closure of another plan occurred.

### Current-main integration

Plan 272 merged while [PR 79](https://github.com/morgs32/zerospin/pull/79) opened. Its three updated source READMEs were read and reconciled before retaining their deletions. The two browser architecture conflicts now preserve flat Actor snapshot fields, definition-owned Actor identity/full encoded claims, Actor-specific socket headers and private replay, plus separate public Agent snapshots and connection schemas. SelectedViews retains the new bound-key identity and complete nullable command resolution without reconstructing a nested Actor origin. The latest projection/connection clarifications are pinned to the full Plan 272 commit.

Fragment's failure handbook now explicitly distinguishes Actor private resolutions from Agent public observation. Two self-contained SDK reference provenance labels now link their pre-consolidation README snapshots; their skill behavior is unchanged. The final 2,452-file inbound audit found no live dependency on a removed README. Source metadata/citations were refreshed against current main, all 39 deletions remain, and the complete documentation checks pass after reconciliation. Fragment's updated production article build passed on Next.js's provided security-notice retry path. The task-owned production preview was restarted after rebuilding, and browser verification confirmed the exact Actor private-resolution versus Agent public-history wording. No runtime/test changes differ from main, and this integration does not independently verify or close Plan 272.

## Remaining work

None.
