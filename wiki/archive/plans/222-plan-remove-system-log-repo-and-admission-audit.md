# Remove SystemLogRepo and admission auditing

**Date:** 2026-10-16

**Status:** Complete — implementation and scoped verification completed 2026-10-23 under Plan 151. Archived after required checks; governing ADR 017 and parent Plan 151 remain active.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [SystemLogRepo.admissionAttempts](../../reviews/storage-tables/system-log-repo-admission-attempts.md). **Related work:** [Plan 143](../../plans/143-plan-optional-effect-telemetry.md), whose preserved mandatory-audit scope is superseded only for this approved removal. Its unfinished provider/verification obligations remain separate.

## Problem and agreed behavior

At the original review, SystemLogRepo owned only permanent admission-attempt audit history. Nothing read those rows to authenticate, authorize, recover commands or resume sessions, yet begin/completion RPCs gated successful access and could replace the actual admission failure. Remove this unneeded durable feature outright while preserving actual access checks and independent diagnostics.

1. Delete SystemLogRepo, its admissionAttempts schema, physical-name helper and begin/complete methods. Delete auditAdmission, the audit-only claims hashing helper and returned claimsHash/selection baggage. Remove systemId acquisition/parameters used only to acquire this owner. Keep makeActorSelection and its complete canonical identity validation, full encoded claims, actorPath and exact Actor identity. Browser StandaloneNode's separate claims hashing remains outside scope.
2. AggregateApi and ServiceApi admission must directly resolve exact release/Actor, run the existing authentication/credentials/claims validation, derive/validate the canonical Actor path and return the same meaningful capability inputs. Preserve Aggregate-ID equality, Service authentication-none semantics, authored callback Cause handling and all subsequent lock/resource/session authorization. Do not simplify or bypass any of those boundaries.
3. Remove the mandatory durable-audit guarantee: no begin-before-auth audit insert, unfinished-on-interruption record, completion-before-access gate, permanent attempt retention or audit-write failure priority remains. Original authentication/identity failures propagate through the existing RPC/Cause handling. Admission no longer depends on two audit RPCs. This is intentional policy retirement, not equivalent durability from hosted telemetry.
4. Preserve existing named admission spans, complete local capture, source-owned optional/sampled OTLP export and contained diagnostic delivery failures. Add no new telemetry event protocol, full-claims export requirement, audit flag, empty forwarding layer, fallback SQL, replacement table or audit outbox. Hosted provider arrival and Plan 143's other unfinished work remain separate.
5. Remove all live consumer/binding/export/Repo-kind/name-prefix/service-layer/inspection/configuration/fixture references to the deleted owner. Remove its class from fresh-storage Wrangler declarations and supported Repo types rather than retaining a compatibility path. Preserve SystemRepo, other Repo storage, command/projection history and unrelated work. Do not reset storage, deploy, delete deployed data or commit.
6. Update existing assertion consumers in place and retain the smallest meaningful authentication success/rejection coverage. Create no test, fixture, runner or configuration files. Remove obsolete audit-only assertions/stubs instead of preserving fake logging dependencies. The original implementation pass left every assertion unrun; the current follow-up verifies applicable existing seams.
7. Record the implemented retirement in a governing ADR and update affected current architecture, module/root/CLI documentation, glossary, patterns, Plan 143's scope and this finding/Plan 151. Keep older plan/handoff context historical rather than rewriting past work. Do not archive a governing ADR or claim hosted telemetry delivery is verified.
8. This is a pre-release hard cutover. There are no translation migrations, aliases, legacy decoders, dual paths or automatic data preservation/reset. Existing deployment/storage transitions require the normal empty-storage cutover; no existing namespace/data deletion is performed by this source change. Plan 151’s live verification gate controls the next review; this follow-up reviews no additional table.

## Implementation sequence

1. Simplify Aggregate/Service admission to the direct named domain steps and delete the audit-only owner/procedures/helpers. Keep shared authentication, identity and authorization procedures intact.
2. Remove runtime/service/inspection/public-kind wiring, production/dev exports and binding declarations, generated configuration source and fresh Wrangler class declarations. Update actual existing fixture/assertion consumers together; add no shim.
3. Update concise existing admission assertions for successful authenticated claims/canonical path and meaningful rejection, with no SystemLogRepo service requirement. Retain existing identity/authorization checks and preserve prior unverified fixture edits.
4. Add ADR 017 after source implementation is written; reconcile current docs and mark the preserved mandatory-audit clause in Plan 143 superseded by this plan/ADR without absorbing its remaining work.
5. Record actual implementation, remaining checks, scope and known limits in this plan and the finding. Update Plan 151 to distinguish approved unverified removal from the prior source recommendation, and leave its next client-table marker unchanged.
6. The original implementation-only pass deferred verification. The maintainer’s 2026-10-23 request resumes scoped runtime/consumer, documentation/citation/formatting, independent review and preservation checks. Archive only after required checks pass; keep Plan 151 active.

## Planned file hierarchy

`+` creates; `~` modifies; `-` deletes. Preserve existing working-tree changes. Consumer discovery may narrow or expand directly affected existing files without adding test infrastructure.

```text
zerospin/
  ~ README.md
  ~ TODOS.md
  explorer/src/data/
    ~ architecture.ts (direct owner reference only)
    ~ schema-snapshot.json (retired owner entry only)
    ~ table-purposes.ts (retired owner entries only)
  packages/core/src/system/
    ~ RepoTypeSchema.ts
  packages/system-worker/
    ~ wrangler.jsonc
    src/
      - SystemLogRepo/ (class, schema, name, begin/complete procedures)
      actorAdmission/utils/
        - auditAdmission.ts
        - hashAdmissionClaims.ts
      AggregateApi/admit/
        ~ admit.ts
        ~ admitAggregate/admitAggregate.ts
        ~ admitAggregate/utils/authenticateAggregateClaims.ts (stale audit/hash prose only)
      ServiceApi/admit/
        ~ admit.ts
        ~ admitService/admitService.ts
      repoServices/
        - SystemLogRepos.ts
        ~ RepoServicesLive.ts
      SystemRepo/registerRepo/
        ~ systemRepoNamespaces.ts
      SystemApi/getRepoTableRows/utils/
        ~ resolveRegisteredRepo.ts
      makeMigratableDORepo/
        ~ README.md
      ~ systemWorkerAbbreviations.ts
      ~ index.ts
    test/migratable-do-repo/
      ~ existing owners/inspection/activation consumers
  packages/dev-worker/
    ~ src/DevWorker.ts
    ~ src/cloudflare-workers.d.ts
    ~ src/makeWranglerConfig.ts
  packages/production-worker/
    ~ src/ProductionWorker.ts
    ~ src/cloudflare-workers.d.ts
  packages/cli/
    ~ README.md
  wiki/
    ~ glossary.md
    adrs/
      + 017-admission-without-durable-audit.md
    architecture/
      ~ AuthoredSystem.md
      ~ SystemApi.md
    patterns/
      ~ affected live guidance only
    plans/
      + 222-plan-remove-system-log-repo-and-admission-audit.md
      ~ 143-plan-optional-effect-telemetry.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ system-log-repo-admission-attempts.md
```

## Verification seams — resumed 2026-10-23

Use existing source/Workerd/acceptance seams to establish direct Aggregate and Service admission success and rejection with no audit service; full encoded claims and canonical identity remain, Aggregate-ID mismatch and invalid credentials/claims still fail, and subsequent authorization remains enforced. Existing optional-telemetry scenarios continue to own success/typed failure/defect/interruption/export-failure behavior; do not add a second audit replacement harness.

When deferral ends, inspect current Nx configuration and run the scoped core/system-worker/dev/production/config/CLI consumer type/lint/test graph and necessary dependencies, plus relevant existing acceptance/runtime checks. Check generated binding/class configuration through existing supported tasks. No Explorer verification is required or permitted. Formatting, documentation/link/citation/frontmatter/whitespace checks, independent implementation review, obsolete-live-reference checks and other-storage comparisons are also deferred. Source discovery and edits establish no passing result; no provider arrival or deployment is performed.

## Original implementation outcome — historical unverified record

SystemLogRepo's five source files are deleted, along with auditAdmission, hashAdmissionClaims and SystemLogRepos. Aggregate/Service inner admission now reads top-to-bottom as exact release/Actor resolution, existing authentication/complete claims validation, canonical makeActorSelection validation and meaningful admission return data. Audit-only systemId acquisition/parameters, claimsHash and returned selection are removed. Aggregate identity/systemName and full encoded claims/actorPath remain. Existing named spans, RPC schemas/callback conversion and authentication helpers remain; only the Aggregate helper's stale hash prose is corrected. Later session-lock/resource authorization and unrelated Browser claims hashing are outside the production edits.

The supported Repo kind, owner export, abbreviation, live service layer, inspection resolver branch, native namespace declarations, dev/production exports/environment declarations and generator/fresh Wrangler binding/export entries omit the retired owner. No class alias, optional owner, fallback SQL, replacement audit table, outbox, translation migration or deployed deletion migration is added. Direct Explorer architecture/schema/purpose data consumers omit the owner through source edits only; no Explorer task, regeneration or verification ran. Generated historical Graft indexes are outside live runtime ownership and were not regenerated.

The existing owners worker, inspection worker and activation Workerd spec remove the owner/binding/activation consumer and describe thirteen supported owners. One native-RPC test in that existing spec uses its existing /rpc fixture and real configured authentication/authorization: Aggregate/Service authorized snapshots retain full claims/exact Actor version, while Aggregate-ID mismatch and Service excess credentials are rejected. No new tests, fixtures, runners or configuration files were created; no acceptance runner changes were needed. All assertions remain unrun, and no result is claimed.

ADR 017 records the implemented retirement of acknowledged permanent audit history, interruption records and audit-write gating/failure priority. Root/CLI/module READMEs, current architecture admission sequences/annotations, glossary, local patterns and obsolete SQL-error TODOs describe the direct admission and independent optional diagnostics. Deleted source entries/citations are removed from current architecture frontmatter; source hashes/range/frontmatter validation are deferred. Plan 143 marks its former mandatory-audit preservation scope superseded, without closing provider proof or absorbing this plan's checks. Historical evidence remains historical.

The finding and Plan 151 now distinguish approved written removal from source review. Plan 151 omits the retired owner/domain/ledger from current composition, leaves aggregate inventory totals unvalidated instead of carrying inconsistent prior totals forward, and keeps Aggregate session replica.commands next. No additional table is reviewed. Other active plans and unrelated working-tree changes retain their separate status.

No typecheck, lint, tests, builds, acceptance, formatting, documentation/link/citation/frontmatter/whitespace checks, obsolete-live-reference checks, independent implementation review or other-storage comparisons ran. Initial source discovery and edits are not verification. No hosted-provider arrival/indexing, deployment, namespace/data deletion, storage reset or commit was performed. Existing deployment/storage transition planning remains separate, and this plan stays active through deferred verification.

## Current verification scope — 2026-10-23

Completed [Plan 220](220-plan-accepted-definition-key-spec-storage.md) supplies real catalogue acceptance/require-only registration, immutable Actor locks and atomic metadata rejection. Completed [Plan 221](221-plan-session-ticket-admission-cleanup.md) supplies actual configured Service authentication through authorization, selected snapshot, ticket issuance and socket/resume, plus four-family SQL ticket/spend/forwarding. Reuse those proofs within their recorded limits rather than re-creating them.

The original thirteen-owner/legacy acceptance seam is retired by [Plan 257](257-plan-direct-system-worker-verifications.md). Verify current real classes in existing cloudflare:test specs and current native APIs, supported Repo declarations and generated configuration. The older telemetry harness is also removed; its 2026-10-13 results are historical. Bound any new diagnostic failure-containment proof to these admission invocations; do not restore a harness or absorb Plan 143’s independent provider proof.

Fresh source/WIP preservation is captured under /private/tmp/plan222-verification-before. No new test/fixture/runner/configuration file, existing-store reset, namespace deletion, deployment, provider send or commit is authorized. No Explorer source discovery or verification is part of this follow-up.

## Verification — 2026-10-23

Three cases extend existing specs: two direct public Aggregate/Service API admission/authorization/snapshot journeys and one generated dev/production configuration case. The existing native/PartyServer lifecycle case additionally checks real automatic registration metadata and seventeen actual named exports. AggregateActorVersionRepo is added to the existing fixture Worker exports and SQLite binding configuration; no test, fixture, runner or configuration file is created.

The generated-config test uses the public @zerospin/dev-worker/makeWranglerConfig package export. The package manager adds one root workspace development dependency and its lockfile link; the existing test target now builds that package explicitly. No external dependency version changes or new testing framework are introduced. The initial source-relative import failed the repository’s package-boundary lint rule and is replaced, without a lint bypass or source alias.

Scoped Core/System Worker/Dev Worker/Production Worker/CLI library builds pass. The four applicable ts targets and their required library dependencies pass; all five scoped lint targets pass with zero errors and the one existing unrelated warning. The final full runtime graph passes all **101 System Worker tests across 25 files**, including all four native SystemApi/admission cases, all eight lifecycle cases and the generated-composition case. Test typing and ten required dependency tasks, including the public generator library, pass. The final run has no Vitest unhandled-error result. Earlier test-only import/typing/privacy/path assumptions are resolved. Authored Cause detail remains in actual local AggregateApi.admit capture, while its public wire error intentionally omits cause; exact physical Repo keys compare decoded canonical paths. No production defect is established.

Fresh preservation currently shows all 837 captured production TypeScript modules/schema declarations unchanged. Qualified comparison with the committed pre-removal parent ff3ef7b82e21d6be568e0ac2cdfd8c91a5fe1495 preserves reportRpcTelemetry, WorkerTelemetryLive, exportTelemetryBatch, authenticateServiceClaims and makeActorSelection byte-for-byte; Aggregate authentication differs only in removed hash prose and runWorkerInvocation only in the ErrorJson/IErrorJson type name. This is source preservation, not physical-store equivalence or proof about the original uncommitted snapshot.

Independent review finds no remaining required correction in the three cases and lifecycle extension. Governing ADR 017, the retired-table finding, Logger README and affected architecture now distinguish intentional audit retirement from optional diagnostics; source provenance is refreshed only for affected admission/registry sections. Hosted provider proof remains independent.

**Documentation boundary:** all seventeen changed architecture provenance entries match current source blobs/ranges, and affected local links/citations resolve. Twelve unrelated AuthoredSystem links/ranges already fail in the captured before snapshot, with no newly introduced invalid reference. They concern existing Agent/declaration, replica/model/initializer and SQLite documentation; Plan 151 explicitly retains their reconciliation before another table review. This scoped closure does not claim that unrelated workflows or every pre-existing source reference are current. Logger README’s mandatory-audit claim and Identity’s deleted audit-helper references are corrected; the historical finding uses verified immutable pre-removal source links, qualified against the original uncommitted review snapshot. Existing local admission guidance already states diagnostic independence; no duplicate pattern or new ADR is added. The glossary now names actual ServiceSessionApi claims/lock authority.

**Proof limits:** these generated public API methods execute in Workerd with real child Repo calls. They do not establish HTTP/native network RPC transport, real identity/provider integration, autonomous/deployed activation, every Repo kind’s activation, browser/Native lifecycle or hosted OTLP arrival/indexing. Plan 220/221 retain their separate catalogue/ticket proofs; Plan 143 and current Agent/client/Model/Game obligations remain open. Existing storage was not reset or deleted, and no provider send, deployment, publication or commit occurred.

**Closure checks:** scoped Nx formatting and whitespace checks pass. Affected local links/source ranges, seventeen changed architecture provenance entries and twenty-two immutable historical source links are verified. No retired runtime symbol remains in the six scoped production source trees; the deleted owner/helper files remain absent. Source and existing WIP preservation pass. Independent implementation and closure reviewers find no required correction. The twelve baseline-only unrelated AuthoredSystem references remain explicitly tracked under Plan 151’s review gate, rather than claimed current by this bounded check.

## Remaining work

None for Plan 222. Plan 151 remains active for current Agent observers, client/Native and Model/Game verification, independent provider proof, documentation closure and the later gated inventory/review queue. No further review, new test machinery, existing-storage reset, provider send, deployment, publication or commit starts from this completion.
