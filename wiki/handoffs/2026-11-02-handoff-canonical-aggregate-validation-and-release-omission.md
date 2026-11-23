# Handoff: Cloud Studio Pending Work

**Date:** 2026-11-04
**Focus:** Carry the agreed Cloud Instance Studio Pending Work design into a saved implementation plan and end-to-end local implementation.
**Status:** Design interview complete; proposed plan exists only in this chat. No implementation, package adoption, storage operation, public publication or deployment occurred. This update replaces this handoff’s earlier unresolved AVC-validity proposal; preserve the filename.

## Goal

1. Give authors one read-only Pending Work table in Cloud Instance Studio so they can find executable dependencies before manually omitting a release.
2. Build structured runtime inspection, exact local-registry package adoption in `zerospin-cloud`, the Cloud view, and focused local verification. The user explicitly selected this end-to-end local scope.
3. Keep public publication, deployment, storage resets and canonical/registration edits outside scope. The present handoff request authorizes documentation only.

## Done

1. Reviewed the earlier handoffs against source. Custom stack capture was already addressed by PR #123; additional diagnostics changes require fresh measurements. Actor construction remains separate work in its own handoff; its performance impact remains unmeasured.
2. Completed the `$grill-me` interview. The user rejected disposition agreement as an upgrade requirement: an older release may not support contracts introduced by a later release. Do not resume the earlier Success/Failure-certification design.
3. Traced public inspection and private Cloud access paths. Existing raw-table inspection can read these queues, but owner identity is held in Repo keys, and the necessary lightweight name codecs are not public exports. The user selected a structured runtime read rather than Cloud interpreting raw SQL shapes or copying address grammars.
4. Investigated PartyServer. Existing Actor/Agent authored views and Cloud control-plane models have live subscriptions; raw Repo-table inspection does not. The four pending-work Repos use native DurableObject. The user selected refreshed reads first, without a new subscription protocol.
5. Presented a complete proposed plan in chat, tentatively named `293-plan-cloud-studio-pending-work.md`. No numbered plan file was written during Plan Mode. On handoff creation, the highest existing plan/spec prefix found was 292; recheck before allocating a number.
6. At handoff creation, public `zerospin` was clean on `main` at `53ba11c89b`, and `zerospin-cloud` was clean on `main` at `22c484bb1`. Searches found no `getRepoPendingWork` or `getInstancePendingWork` implementation. Recheck both checkouts before editing; these are observations, not pinned implementation bases.

## Settled decisions — do not re-interview

1. Preserve TypeScript and runtime canonical membership checks. `makeSystem` constrains `canonical` to a registered release, and `validateCanonicalReleases` checks it at runtime. These are incoming-configuration checks, not catch-up certification.
2. Allow configuration changes while aggregate instances catch up independently. Preserve existing `canonicalHistory` adoption: the previous history source remains until replacement publication covers its adopted boundary. Add no global readiness gate, disposition comparison or persisted validity marker.
3. Authors manage draining before noncanonical release omission. Existing replay delivery filters authored release membership, retains dormant subscriber cursors and resumes returning releases. Omission does not delete history or models. Pending execution, external requests and configured callers may still need exact executable support.
4. Build the view in **Cloud Instance Studio**, not the local declaration-only `zerospin studio` command. Reuse CloudApi’s authenticated active-instance access; do not introduce local credentials or environment selection.
5. Cover both Aggregates and Services and all four categories below in one table, one row per pending work item. Do not merge the durable tables or deduplicate different lifecycle stages into a command history.
6. Return metadata only. Keep payloads, claims and external response bodies out of the overview; link to existing authorized Repo/table inspection for details.
7. Use initial loading, Refresh and Load more, with bounded pages allowing every item to be browsed. No PartyServer/raw-table subscription capability is part of this work.
8. **Fail the whole view:** any initial or continuation read error invalidates and hides all accumulated rows and continuations. The user explicitly chose this over partial results. Do not retain stale success behind an error or interpret unread queues as empty.
9. Report observed pending work, not “safe to omit.” Reads across independent Repos are not an atomic instance-wide snapshot. New work before a pagination cursor appears after Refresh.
10. Include exact local-registry package adoption and Cloud integration verification. Do not publicly publish or deploy; existing observed deployments lacking the new method show an inspection error, without a raw-table compatibility fallback.

## Work categories and facts

1. **Unfinalized admitted commands:** `AggregateChain.commands` / `ServiceChain.commands` where `outcome` is absent. Required release comes from `aggregateVersion` / `serviceVersion`; retain canonical command identity and domain position.
2. **External requests:** Chain `externalOperationOutbox`. Required release and external contract identity come from the row. Absent `externalOutcome` means no retained observation, not proof that a provider has never been called or that a request is running. A retained external outcome means command admission is pending; exact executable support remains necessary for that admission.
3. **Recorded command deliveries:** Chain `commandDeliveryOutbox`. Required release and destination identity come from the complete recorded command, not the containing Chain’s release. Queue identity is the source `aggregateIndex` / `serviceIndex` plus `operationIndex`.
4. **Agent command deliveries:** `AggregateAgentNodeRepo.commandDeliveryOutbox` / `ServiceAgentNodeRepo.commandDeliveryOutbox`. The row supplies frozen release, Agent version, command ID and `producerIndex`; the Repo key supplies owner/aggregate/Agent identity.
5. These queues do not retain enqueue timestamps, attempt counts or last errors. Do not invent age, “running” or detailed blocked-state labels. Replay lag and pending history publication are not these executable-work categories.
6. Agent Node inspection remains possible after its selection is removed: fixed schema acquisition tolerates absent selection. Inspection may activate a Durable Object, reconcile alarms and allow normal recovery. Promise read-only administrative inspection, not absence of activation effects; do not initialize Agent models to inspect queues.

## Planned API and pagination

1. Add schema-backed `SystemApi.getRepoPendingWork({ repoType, repoName, limit?, cursor? })`, restricted to the four concrete Repo types above. Validate registration within the authenticated system capability and resolve identity using framework-owned codecs. Add explicit source-local `getPendingWork` methods, each reading its own queues in one synchronous read transaction. Do not add a meaningless method to every Repo or cast the existing all-Repo resolver union.
2. Add `packages/core/src/systemApi/RepoPendingWorkSchema.ts`; wire `ISystemApiRpc`, `makeSystemApi`, `SystemApi`, `SystemApiFailure`, `getNativeSystemApi`, and the four Repo-service capability declarations together. Core’s existing wildcard exports cover the schema module. Use `I`-prefixed authored types, explicit Aggregate/Service fields and no `ownerKind` equivalent.
3. Items carry work kind, exact required release and domain identity, command/external-command identity, contract name/version, source Repo/table and queue position. Preserve source identity separately from the required destination release.
4. Planned defaults: 100 items maximum per Repo page, across all its categories together. Fixed category order: admitted commands, external requests, recorded deliveries; Agent Repos have Agent deliveries. Use SQL keyset cursors over `aggregateIndex` / `serviceIndex`, `externalCommandId`, domain index plus `operationIndex`, and `producerIndex`. Text predicates and ordering must use the same SQLite collation. Validate category/key combinations; deletions between pages must not break continuation.
5. Add `CloudApi.getInstancePendingWork` and matching failure method. Acquire one deployment-specific SystemApi capability per batch through the current access path. Private `apis` retains organization/dev-owner authorization and credentials. Adjust the existing acquisition helper to expose the inspected deployment identity rather than duplicating credential validation.
6. Enumerate existing catalogs for `AggregateChain`, `ServiceChain`, `AggregateAgentNodeRepo`, `ServiceAgentNodeRepo`; traverse that fixed order and stable ordinal Repo-name order. Bound **each Cloud response too**: at most 100 items and eight Repo-page reads per batch. Reading 100 rows from every Repo into one response would not meet this bound. Existing catalogs themselves are unpaged; do not introduce a new directory or claim a globally atomic inventory.
7. Cloud continuation retains the inspected deployment, current source identity and local page cursor. Use the remaining Cloud row budget for each source request. Empty source batches may return continuation; UI continues searching and only shows “No pending work” after traversal exhaustion. More items or unvisited sources must remain explicit.
8. Bind follow-up requests to the inspected deployment and reject an active-deployment change during collection. Refresh discards rows/cursors and starts anew. Ignore superseded in-flight results on refresh, navigation or instance changes; no old completion may repopulate a cleared result.
9. Add `/studio/pending-work`, Studio navigation and sidebar active-state handling. Use the existing Cloud UI table/PageIntro patterns and route-owned data through an instance-scoped hook. Show required release, aggregate ID where applicable, work kind, contract, command identity and source Repo links, plus inspected deployment/observation time. Label visible counts as observed items, not a complete total before exhaustion.

## Remaining

1. Save the agreed implementation plan under the public project’s `wiki/plans/`, rechecking numbering. Carry forward the chat plan and this handoff; do not restart settled design questions. Keep one cross-repo plan, with a file tree and explicit verification/remaining-work sections.
2. Implement the public schema/API and four source-local readers, then exact local package release/adoption in Cloud, CloudApi collection and the unified route. Use existing release/package-manager workflows; preserve unrelated dependency pins and existing storage. Do not edit Cloud’s `vendor/zerospin` subtree for package adoption.
3. Extend **existing tests only**. Do not create test files, fixtures, runners or configuration without a new explicit request. Cover four work formats, destination-release attribution, metadata exclusion, external stages, pagination/deleted rows, authorization/cursor refusal and native dispatch. Update explicit API mocks in `repo-names.spec.ts`; widening Repo-service capability Picks can affect other typed fakes.
4. Extend `zerospin-cloud/apis/test/system.spec.ts` for deployment binding and fail-whole-observation behavior. Verify populated, exhausted-empty, loading, refresh, continuation-error, deployment-change and instance-switch UI states. No existing Cloud UI test/story seam was found; prefer permitted browser checks over inventing a runner.
5. Resolve environment blockers before verification: public `pnpm nx show project ...` triggered automatic dependency synchronization and refused a non-TTY modules-directory replacement; Cloud target discovery failed with `Operation not permitted` in the sibling checkout. No build/test ran. Do not force a dependency purge merely to bypass this. Re-establish current resolved Nx targets with appropriate workspace access.
6. Run scoped public compilation/lint and affected worker tests, then local-package integration and Cloud API tests/build. Intended private targets from manifests are `apis:test`, `apis:lib`, `cloud:build`; resolved target discovery remains to be completed. Reuse configured Portless URLs and existing services. Never verify Explorer.
7. After implementation, reconcile glossary terminology and runtime/public Studio documentation. Create an ADR only for an implemented decision meeting all qualifying criteria. The existing Studio guide contains stale Instance-board prose; reconcile it against the actual Cloud view. This handoff already replaces its old AVC-validity requirements; do not revive them. Archive handoff/plan only under their normal completion lifecycle.

## Suggested skills

1. `$grill-me` — persist the already agreed plan; ask only if a genuinely new material choice appears.
2. `$implement` — complete implementation, required verification and plan archival when implementation is requested.
3. `$use-morgs32-wiki-patterns`, `$nx-workspace`, `$nx-run-tasks` — scoped source guidance and resolved task configuration.
4. `$link-workspace-packages` — only if actual sibling workspace dependency wiring needs correction; external exact-version adoption follows package-manager/release workflows.
5. Cloud’s installed Intent — read its current AGENTS.md and run its required skill discovery/loading before substantial edits. Do not download a replacement if unavailable.

## Pointers

1. `AGENTS.md`
2. `wiki/patterns/index.md`
3. `wiki/archive/plans/277-plan-canonical-chain-history-handoff.md`
4. `wiki/architecture/server/CanonicalHistoryHandoff.md`
5. `wiki/adrs/025-canonical-published-history-handoff.md`
6. `wiki/handoffs/2026-11-03-handoff-actor-construction.md`
7. `packages/core/src/system/make/makeSystem/makeSystem.ts`
8. `packages/core/src/system/make/makeSystem/validateCanonicalReleases.ts`
9. `packages/system-worker/src/SystemApi/getRepoTableRows/getRepoTableRows.ts`
10. `packages/system-worker/src/SystemApi/getRepoTableRows/utils/resolveRegisteredRepo.ts`
11. `packages/system-worker/src/SystemRepo/getRepoRegistrations/getRepoRegistrations.ts`
12. `packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts`
13. `packages/system-worker/src/ServiceChain/serviceChainDbConfig.ts`
14. `packages/system-worker/src/AggregateAgentNodeRepo/aggregateAgentNodeRepoDbConfig.ts`
15. `packages/system-worker/src/ServiceAgentNodeRepo/serviceAgentNodeRepoDbConfig.ts`
16. `packages/system-worker/src/externalOperations/resolveWorkContract.ts`
17. `packages/system-worker/tests/repo-names/repo-names.spec.ts`
18. `packages/system-worker/tests/native-system-api/native-system-api.workerd.spec.ts`
19. `packages/system-worker/tests/aggregate-adapter-failures/aggregate-adapter-failures.workerd.spec.ts`
20. `packages/system-worker/tests/service-external-delivery/service-external-delivery.workerd.spec.ts`
21. `packages/system-worker/tests/agent-node-aggregate/agent-node-aggregate.workerd.spec.ts`
22. `packages/system-worker/tests/agent-node-service/agent-node-service.workerd.spec.ts`
23. `../zerospin-cloud/AGENTS.md`
24. `../zerospin-cloud/wiki/patterns/index.md`
25. `../zerospin-cloud/apis/src/CloudApi/CloudApi.ts`
26. `../zerospin-cloud/apis/src/CloudApi/CloudApiFailure.ts`
27. `../zerospin-cloud/apis/test/system.spec.ts`
28. `../zerospin-cloud/cloud/components/studio/useRepoRegistrations.ts`
29. `../zerospin-cloud/cloud/components/studio/useRepoTableData.ts`
30. `../zerospin-cloud/cloud/components/studio/RepoTablePane.tsx`
31. `../zerospin-cloud/cloud/app/(authed)/routePatterns.ts`
32. `../zerospin-cloud/cloud/app/(authed)/CloudInstanceSidebarGroup.tsx`
33. `../zerospin-cloud/cloud/app/(authed)/(console)/[organizationId]/system/[systemId]/instances/[instanceId]/studio/page.tsx`
34. `fragment/content/guides/studio.md`
35. `README.md`

## Open decisions

1. No product-design decision remains intentionally open. The earlier choice of what “AVC valid” certifies was superseded, not postponed. Preserve the accepted scope and defaults above.
2. Plan number and exact local package version must be allocated against current repository state, not assumed from yesterday’s proposed filename or inspected package version (42.0.1 at inspection time).
3. Discover and resolve current workspace permissions/dependency setup before claiming verification. Public publication, deployment, storage reset and handwritten canonical/registry changes require separate authorization; they are not prerequisites to the approved local implementation scope.
