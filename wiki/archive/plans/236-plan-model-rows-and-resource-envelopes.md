# Model rows and resource envelopes

**Date:** 2026-10-16

**Status:** Complete and archived on 2026-10-27. The common Model row/resource-envelope cutover is verified at its remaining generic resource, operation, query and physical-index boundaries. Scoped checks and documentation closure pass; the final record distinguishes new evidence from bounded Plan 234/Agent/Native reuse. Plan 151 remains active for its independent obligations.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Replaces:** [cancelled Plan 235](235-plan-bound-purchase-resource-storage.md). **Starting finding:** [Shopping Purchase](../../reviews/storage-tables/shopping-user-aggregate-version-repo-purchase.md).

## Objective

Remove redundant model identity through the existing Model/table/resource codecs. Make one consistent framework distinction:

```ts
// A stored model row:
{ id, createdAt, updatedAt, ...attributes }

// A complete resource envelope:
{ ...row, modelName: model.modelName, version: model.version }
```

There is one model row format. Applications declare models and releases as they do today. No storage policy, per-owner opt-in or runtime binding is introduced. The current Purchase declaration has fourteen authored attributes, seventeen stored fields and nineteen complete resource-envelope fields. The original thirteen/fifteen and later eighteen/twenty counts describe historical declarations; current counts are an inventory observation, not a reason to freeze future business attributes.

## Scope and API consequence

1. This is the approved framework-wide model-row cutover. Model-owning Aggregate/Service source Repos, projection Repos, Nodes, session replicas and derived optimistic databases use the same representation. A Purchase-only exception would recreate the rejected selection machinery.
2. Ordinary SQL queries return stored rows. modelName/version remain available on the bound Model and complete resource envelopes; they are not SQL query columns. Supported typed contract reads and portable read compilation reject them in columns/where/orderBy, including nested queries. Authored projection selection capture separately rejects metadata filters/order and requires complete model rows; it does not support partial columns/with/extras capture. Do not silently discard filters or claim raw db.query returns these fields. This does not promise runtime validation of arbitrary untyped Drizzle calls or raw SQL.
3. Complete published resources, snapshots, selected resource envelopes, deletion inverses and operation transport retain exact modelName/version. This preserves resource envelopes while deliberately narrowing the row-query API.
4. This plan does not change fixed command/history/checkpoint/outbox schemas or their ownership. Later plans govern their actual current shapes: completed Plan 234 owns coherent Node views and local command records, and Plan 277 owns canonical history handoff. Their historical table shapes are not this plan's acceptance criteria. This plan does not complete another table review.

The query API consequence is intentional. Preserving virtual metadata columns throughout arbitrary Drizzle queries requires additional query compilation or adapter machinery. If that API must remain unchanged, retain the two stored columns and reconsider the optimization; do not revive Plan 235's indirection.

## Decision relevance and supersession review — 2026-10-27

1. **Retain the common row/envelope split.** [makeModelVersion](../../../packages/core/src/models/make/makeModelVersion.ts#L372-L432) omits the two identity descriptors from the table while retaining complete resource properties, schemas and exact validation. [makeLimitedModelVersion](../../../packages/core/src/models/make/makeLimitedModelVersion.ts#L22-L25) delegates to that factory, and [makeResourceDbConfig](../../../packages/core/src/drizzle/make/makeDbConfig/makeDbConfig.ts#L31-L44) composes the canonical Model table. The limited-model wrapper adds no second storage path, so it needs no duplicate SQLite/codec matrix. No later decision requires a storage policy, duplicated schema or query facade. [Plan 277](277-plan-canonical-chain-history-handoff.md#problem-and-scope) expressly preserves materializations and authored evaluation; its canonical release selection does not change this representation.
2. **Correct current declaration facts.** [PurchaseV1](../../../examples/shopping/src/zerospin/aggregates/user/models/purchase/PurchaseV1.ts#L9-L38) has fourteen authored attributes. `promotionCommitRequested` is absent; the former fifteen-attribute/eighteen-column count is stale. Adding the three common row fields yields seventeen stored fields; adding bound modelName/version yields nineteen envelope fields. Verify the generic rule against the current declaration rather than adding a permanent test for a historical Purchase count.
3. **Keep exact resource identity and narrow the query promise to its supported boundaries.** [encodeRowAsResource](../../../packages/core/src/models/encodeRowAsResource.ts#L12-L40), [getResourceRow](../../../packages/core/src/contracts/getResourceRow.ts#L49-L56) and [applyOperationTx](../../../packages/core/src/contracts/applyOperationTx.ts#L100-L159) reconstruct or validate bound identity. [makeContractReadDb](../../../packages/core/src/contracts/make/makeContractReadDb.ts#L193-L264) and [compileReadQuery](../../../packages/core/src/models/reads/compileReadQuery.ts#L155-L210) recursively validate actual stored fields; nested compilation uses the same boundary. [QuerySelection.capture](../../../packages/core/src/models/make/makeQueryDbVersion.ts#L220-L230) is a third boundary: it requires complete model rows, then validates declarative filters/order independently. Portable operations carry `modelName`/`modelVersion` through [operationCodecs](../../../packages/core/src/contracts/operationCodecs.ts#L200-L225) and [prepareReplayAppliedOperation](../../../packages/core/src/contracts/prepareReplayAppliedOperation.ts#L55-L77); that is distinct from resource envelopes carrying `modelName`/`version`. Verify those public/replay boundaries rather than malformed props to the internal applyOperationTx procedure. No untyped raw-SQL validation layer is proposed.
4. **Distinguish encoded bytes from decoded JSON values.** [Node/resourceEnvelope](../../../packages/core/src/Node/resourceEnvelope.ts#L14-L46) and [makeEncodedShapeRowCodec](../../../packages/shapes/src/makeEncodedShapeRowCodec.ts#L31-L48) validate encoded JSON strings without rewriting them. Decoded row codecs parse JSON, and encodeRowAsResource serializes those values for export. Preserve encoded strings across encoded-envelope installation/export and preserve values through decoded round-trips; arbitrary original JSON whitespace/key formatting is not a decoded-value guarantee.
5. **Use current Node and Agent ownership.** Completed [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md#final-host-native-and-consumer-closure--2026-10-27) replaces per-tab Node-history imports with coherent views and owned uncovered-local replay. Do not reintroduce removed phase importers or live inverse-rewind machinery. [Plan 249](249-plan-aggregate-agent-backend-node.md) and governing [ADR 022](../../adrs/022-owner-local-agents-and-explicit-node-selection.md) retain checkpoint-only browser Agent observers and separately owned backend Agent materialization/delivery. Agent checks here concern selected resources and checkpoints, not browser staging, optimism, journals or private completion.
6. **Retire obsolete host and schema blockers.** Current Aggregate/Service Node guards are 22 and Native replica guard is 11; 18/7 below is the original cutover record. Plan 234 proves actual macOS Swift/JavaScriptCore/SQLite operation, disposal/reopen and unsupported nonempty-schema refusal. The 2026-10-21 CoreSimulator mismatch is not a current prerequisite. Generic Native resource-boundary cases remain separate; this plan does not require new iOS UI or OS-process-crash evidence merely to verify model codecs. A plan refresh warrants no new guard bump or reset.
7. **Follow current documentation ownership and permissions.** Fragment owns public concepts/API guidance; architecture owns runtime internals. Update the glossary and existing package-purpose Native README where needed; do not create source-module READMEs. No new test file, fixture, runner, configuration, storage reset, deployment or implementation is authorized by this review. There is no unanswered test-creation approval request to treat as granted or pending; obtain specific authorization only if the remaining checks actually need new machinery.

The decision is still relevant. The unfinished work is evidence for the common codec/query/index boundaries, not another model-storage redesign or a repeat of Plan 234's complete acceptance list. No new implementation defect was established by this source review.

## Design

1. `makeModelVersion` builds model.table and drizzleSchema from the existing properties minus modelName/version. Keep propertiesShape/resourceJsonCodec and published model facts complete. Compose resolved resource properties from the resolved row descriptors plus the two Model identity descriptors; stop assuming table.shape is the whole resource envelope.
2. Correct existing Model/table/query types to distinguish the stored row from the full resource. Use the structural omission of the two metadata fields rather than adding another runtime configuration object. Apply the same rule to limited model declarations.
3. Keep existing table encodeRow/decodeRow responsible for actual SQL row values and codecs. At existing model-bound resource encode/decode boundaries, construct or strip the two identity fields once. Validate incoming complete resources against the exact bound model name/version before converting to a row. Preserve decoded JSON values and Date codecs, and preserve JSON strings where the boundary is already encoded; avoid scattered caller-specific spreads.
4. Operation create/update/delete/move and inverse restoration use the one model.table. Creates/restores write row fields only. Resource reads needed for validation or inverse capture reconstruct complete identity from the operation's already bound Model. Keep exact incoming model/version validation and complete delete inverse resources.
5. Resource selection/export reconstructs full envelopes using the already bound Model before resource encoding. Graph/snapshot/projection publication consequently retain the existing resource wire shape. SQL row reads and complete resource publication are distinct interfaces.
6. Encoded Node resource tables apply the same omission. Baseline/delta installation validates full incoming resource identity, then stores the row. Authoritative/optimistic snapshots reconstruct full resources from the bound model/lock. Aggregate/Service replica installation and Agent observer selected-resource installation follow these existing codec boundaries. Do not redesign their commands or progress metadata, or add Agent optimistic execution.
7. Query schemas describe actual row columns. Existing query validation and relational compilation reject missing metadata columns naturally once types/schemas are corrected. Keep ordinary filters, ordering, column selections and relations on stored fields. Remove any affected metadata-query use explicitly; add no read CTE, custom session or virtual-table facade.
8. `makeResourceDbConfig` continues composing each canonical Model table. Reference identity and graph ownership remain canonical; no second physical graph or per-owner clone is needed. Model specifications continue describing complete resources, with no new release policy or accepted-definition field.

## Current execution scope

The central cutover is implemented. The dated record below preserves that work;
[Remaining work](#remaining-work) names the finite verification and documentation
steps. Change production code only to repair a demonstrated in-scope defect; do
not repeat the original cutover or introduce another storage/query layer.

## Original written implementation — 2026-10-16

1. The existing Model factory builds one table shape without modelName/version. Complete resolved properties and resource schemas retain both, with exact identity validation. Existing row/resource type aliases and index types describe the appropriate shape. Limited models delegate to the same factory.
2. Existing encodeRowAsResource reconstructs the bound identity from decoded rows. Resource reads used for inverse capture reconstruct complete resources; create and inverse-restoration writes omit metadata and use table codecs. Captured query selections publish complete encoded resources through encodeRowAsResource, so existing Aggregate/Service projection publication keeps its full envelopes.
3. Contract query types use actual stored fields for columns, filters and ordering, including relation queries. Existing recursive read/contract validation uses the same table fields. Selection capture additionally validates declarative field names before Drizzle compilation without changing identity placeholders, RAW predicates or ordering callbacks.
4. Existing Node encoded-resource codecs validate exact full incoming identity, strip metadata for row installation and reconstruct it for snapshots/optimistic-view export. Aggregate/Service Node baselines, deltas, resets and captures, Aggregate/Service/Agent replicas, browser seeds/Agent conversion and Native snapshots use those boundaries. Existing standalone initialization already carries full envelopes and retains its exact resource-schema validation.
5. AggregateNode and ServiceNode guards advance from 17 to 18; Native replica guard advances from 6 to 7. Durable Object resource owners retain their strict current-definition schema validation. Changed persistent model schemas require empty affected storage. No reset, migration, compatibility path or deployment was performed.
6. Module READMEs, glossary, authored architecture and lifecycle guidance describe rows versus full envelopes. Plan 151 and the Purchase finding record written versus verified status. No new ADR, release/spec property, runtime storage module or configurable read layer was added. Other active plans retain independent verification status.

At the original implementation handoff, no typecheck, lint, tests, build, formatting, documentation/link/citation/frontmatter/whitespace/obsolete-reference checks, source-range/hash refresh, preservation comparison or independent implementation review had run. Source discovery and edits established written implementation only. The resumed verification evidence below supersedes that historical check status.

## Implementation and verification areas

`~` identifies existing files or modules. `+` identifies the new test file explicitly authorized on 2026-10-27. Reuse the existing openTestDb helper and rich row/inverse scenario; keep the remaining generic runtime cases together rather than adding unrelated cases to large Node recovery journeys. The source area map is context for bounded repairs, not an instruction to rewrite every owner.

```text
zerospin/
  packages/core/src/
    models/
      ~ types.ts
      ~ make/makeModelVersion.ts
      ~ make/makeLimitedModelVersion.ts
      ~ encodeRowAsResource.ts
      ~ applyInverseOperationTx.ts
      ~ existing selection/query resource encoding
      ~ reads/compileReadQuery.ts
    contracts/
      ~ applyOperationTx.ts
      ~ getResourceRow.ts
      ~ existing model-row query types/codecs
    Node/
      ~ makeNodeResourceTables.ts
      ~ resourceEnvelope.ts
    ~ existing Aggregate/Service Node resource install/export paths
    ~ existing Aggregate/Service/Agent replica resource consumers
  packages/core/tests/
    ~ session-staging-inverses.spec.ts  (only adjacent row/envelope assertions)
    ~ contracts.typecheck.ts           (query type rejections)
    + model-resource-boundaries.spec.ts (authorized 2026-10-27)
  tests/support/
    ~ openTestDb.ts                    (reuse; no change expected)
  packages/system-worker/src/
    ~ existing source/projection resource read/write/export consumers
  packages/browser/src/
    ~ existing resource snapshot/delta/replica consumers
  packages/native/
    src/
      ~ existing resource codecs, only if a remaining check exposes a defect
    ~ README.md
  fragment/content/{handbook,guides,reference}/
    ~ existing public model/query guidance
  wiki/
    ~ architecture/glossary/pattern guidance
    plans/
      ~ 151-plan-storage-table-review.md
      ~ 236-plan-model-rows-and-resource-envelopes.md
    reviews/storage-tables/
      ~ shopping-user-aggregate-version-repo-purchase.md
```

## Acceptance criteria

1. Source code has one model table format, no added application authoring property and no per-owner storage argument threaded through command procedures. Verify actual SQL columns against the bound declaration: authored attributes plus id/createdAt/updatedAt, without modelName/version. Current Purchase is fourteen attributes, seventeen physical fields and nineteen complete resource-envelope fields; historical counts are not fixed acceptance values.
2. Existing row codecs preserve nullability, references, decoded JSON values and timestamps. Encoded Node resource boundaries preserve encoded JSON strings without double encoding. Full resource identity/version is validated before SQL writes and reconstructed correctly for export and inverse resources. Portable operation modelName/modelVersion is separately validated at its codec/replay boundary before application. Do not require arbitrary JSON source-format preservation after decoding and re-encoding a value.
3. Supported contract reads and portable read compilation operate on actual row fields and reject metadata fields in root/nested columns, where and orderBy. Stored-field queries and relations retain their behavior. Authored projection selection capture independently rejects metadata filters/order and partial capture, and publishes complete resource envelopes. Arbitrary untyped raw Drizzle and SQL are outside the validation promise.
4. Resource/checkpoint/pending-publication commits, savepoints, optimistic rollback/rebase, resets and recovery retain their existing ownership. Changed persistent schemas require empty storage; earlier plans retain independent verification status.
5. Use scoped core/backend/browser/Native seams with dependencies. Never verify Explorer. Record formatting/documentation/link/citation/frontmatter/whitespace/obsolete-reference checks, source-range/hash refresh and independent review separately from compilation and behavioral evidence.
6. Judge the result by simpler ownership and less plumbing. If the implementation needs another policy flag, parallel schema registry, CTE/session facade or runtime storage context, stop and reconsider storing the two constants. Fewer columns do not justify a more complicated architecture.

## Verification resumed — 2026-10-21 (historical)

1. `pnpm nx run-many -t ts lint -p @zerospin/core @zerospin/browser system-worker @zerospin/native shopping tic-tac-toe` passed all 29 tasks, including dependency tasks, with cached outputs respected. The graph included core/browser compilation and builds and Native bundle generation. Unsigned generic iOS Simulator compilation also passed for arm64 and x86_64; evidence: `/tmp/zerospin-241-ios-20261021.log`. Compilation does not establish Native runtime parity or codec/replay acceptance. The Native runtime journey remains blocked by the CoreSimulator version mismatch, 1171.7.0 versus 1174.9.2.
2. Lint completed with forty warnings across the selected projects: thirty-three in core, two in system-worker, four in Shopping and one in Tic-tac-toe. Passing lint does not mean warning-free lint.
3. The existing root tests and types checks passed; six existing tests passed. These external-work checks do not establish this plan's row/resource, query, inverse, installation or replay acceptance.
4. Independent source inspection found the intended model-table omission, exact envelope validation, query-field rejection and inverse/resource reconstruction at the inspected seams. No implementation defect was proven. Source inspection and passing compilation do not establish runtime behavior.
5. Current Purchase's fifteen authored attributes require eighteen stored fields and twenty complete resource-envelope fields; current acceptance above reflects the promotion additions while retaining the original historical record.
6. No tests, fixtures, runners or configuration have been created for this pass. Authorization for focused behavioral test creation is pending. No storage reset or deployment has been performed.

## Evidence reused from completed work — 2026-10-27

1. **Stored row and inverse restoration:** [Plan 234's inverse record](234-plan-node-owned-optimistic-views-and-session-replicas.md#initial-staging-rollback-and-stored-deletemove-inverses--2026-10-26) and the existing [session-staging-inverses.spec.ts](../../../packages/core/tests/session-staging-inverses.spec.ts#L294-L353) cover Aggregate and Service delete/move inverse codecs over real SQLite. Complete deletion envelopes, reverse restoration, reference identity, null/JSON values, original creation/update times and rollback are asserted. The tests restore through applyInverseOperationTx, which has no production caller; they establish that helper's codec/restoration behavior, not a live rewind lifecycle. Current production view installation replaces resources and replays uncovered local commands. Do not restore an obsolete production inverse path to satisfy historical wording.
2. **Node/replica transactions and actual hosts:** Completed [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md#final-host-native-and-consumer-closure--2026-10-27) establishes representative baseline/view installation, post-write rollback, replay/rebase, coherent publication, generation/reset and lifetime boundaries. Its actual Chromium and public macOS Swift checks also establish basic resource publication, durable reopen and nonempty fixed-schema refusal. The Native run exposed and repaired missing durable SQLite JSON/boolean codecs. Preserve those specific observations; they do not prove every primitive, generic resource identity rejection, root/nested query validation or physical composite-index enforcement.
3. **Agent observers:** Completed Plans [211](211-plan-agent-exposed-command-history.md) and [212](212-plan-agent-derived-connection-capabilities.md), under Plan 249's ownership, retain their bounded public-observer evidence. Reuse current resource/checkpoint transactions and lifetime evidence where applicable. Only a remaining codec-specific gap belongs here; no Agent command journal or optimistic replay is required.
4. **Application uniqueness is separate:** [Plan 237's explicit boundary](237-plan-cart-item-quantity-and-product-uniqueness.md#application-and-framework-boundary) leaves generic index compilation and actual SQLite enforcement with this plan. Shopping's authored composite declaration and command behavior do not close that framework requirement.
5. **Current checks are not rerun by this review:** The Plan 234 PR integration at `d4274c7200` records 36 focused scenarios, full test-program compilation and 32 scoped Nx quality tasks after main `30bd5a99ef`. The sources and existing assertions above were inspected for this plan refresh. No behavioral test, typecheck, lint, build, storage reset, Native executable or application runtime is run by this review, and no new acceptance is inferred from source alone.

## Verified completion — 2026-10-27

1. **Scope and result.** Implemented the approved verification in the managed
   worktree `plan236-resource-boundaries`, based on main `ea7bf241ad` (merged
   Plan 234). The existing common Model row/resource implementation required no
   production repair, schema change, compatibility path or new runtime layer.
   The new test file and its local declarations use the existing Node Vitest
   project and openTestDb helper. No separate fixture/runner/configuration is added.
2. **Physical rows, resources and operations.** The three new journeys in
   [model-resource-boundaries.spec.ts](../../../packages/core/tests/model-resource-boundaries.spec.ts)
   prove declaration-derived SQL columns without modelName/version; decoded
   reference/null/JSON/Date round-trips; complete envelope reconstruction; and
   exact preservation of a deliberately noncanonical encoded JSON string through
   conversion, SQL installation and export. applySelectedResourcesTx runs with
   replacement enabled inside makeTx. Valid resources followed by a wrong-name
   or wrong-version resource leave both seeded tables unchanged; valid replacement
   stores only row fields. Portable operation codec/replay checks bind exact
   modelName/modelVersion separately from resource modelName/version. They
   establish decoding/refusal before application, not canonical command execution.
3. **Query and index boundaries.** Actual contract reads and compiled portable
   reads return the valid related graph and reject representative root/nested
   metadata columns, filters and ordering. Authored selection capture separately
   rejects metadata filters/order and partial capture; valid capture publishes
   complete envelopes. Twelve added compile-time misuse assertions cover the two
   authored read APIs, with valid relation examples. Real SQLite index pragmas
   confirm the generated composite index's uniqueness and column order. Duplicate
   `(folderId, slug)` insertion reports the actual SQLite uniqueness failure and
   rolls back an earlier parent-row insertion in the same transaction; a distinct
   pair succeeds. This closes Plan 237's independent generic-index requirement.
4. **Existing inverse evidence preserved.** Both rich Aggregate/Service inverse
   journeys now also inspect actual model columns and full resource export.
   Their existing reference, nullable/JSON, timestamp, inverse-order and rollback
   assertions remain intact. Raw table selects retain encoded JSON strings;
   table.decodeRow produces the decoded row consumed by encodeRowAsResource.
   Dates remain Date values at this row boundary. Complete inverse helper proof
   is reused without restoring a removed live rewind lifecycle. The limited-model
   constructor still delegates to the same factory and needs no duplicate journey.
5. **Agent/Native stop condition satisfied.** AggregateAgentNode and
   ServiceAgentNode installInitialSnapshot/applyPage call the now-exercised
   applySelectedResourcesTx, then retain their checkpoint inside reconcile's
   transaction. Native makeNativeSession exports through makeResourceFromEncodedRow
   and installs through the shared receiver/installAggregateNodeView path. Its
   Node adapter uses durableSQLiteCodecs; its replica uses makeSqliteDrizzle.
   Canonical model selects deliberately preserve JSON text while relational
   schemas decode values. No distinct model conversion or adapter gap remains
   after the Core checks plus Plan 234's actual Native SQL/host evidence. This is
   a source-call-graph reuse conclusion, not another Native/browser execution or
   an iOS UI/process-crash claim. Agent observers retain no command journal or
   optimistic execution responsibility.
6. **Checks and reproducibility.** The command
   `pnpm nx run zerospin:test --args='packages/core/tests/model-resource-boundaries.spec.ts packages/core/tests/session-staging-inverses.spec.ts --project node'`
   passes all **11 scenarios across two files**, complete test-program TypeScript
   compilation (including the new misuse assertions) and all eleven prerequisite
   library tasks. A fresh worktree first also needs
   `pnpm nx run @zerospin/cli:lib`: existing repo-name type checks import its built
   modules. That existing prerequisite is built explicitly; no test configuration
   is changed. The approved scoped ts/lint graph for Core, Browser, System Worker,
   Native, Shopping and Tic-tac-toe passes **28 tasks**, including dependency builds
   and Native bundle generation. Changed-file warnings are repaired; existing
   warnings outside this work remain. Formatting, relative links/source ranges,
   relevant source hashes, whitespace and independent assertion/source review pass.
7. **Documentation and ownership.** Fragment's existing query guide, architecture,
   glossary and existing Native package README distinguish stored rows, decoded
   query values, complete projection capture and encoded resource export. Current
   Purchase has fourteen authored attributes, seventeen row fields and nineteen
   envelope fields; this remains a source inventory derived from the tested common
   rule, not a new hardcoded application acceptance test. The Purchase finding and
   Plan 151 record this bounded framework completion. Existing governing ADRs
   remain consistent; verification introduces no qualifying new architectural
   decision and needs no new ADR or source-module README.
8. **Preservation and limits.** Primary-checkout Plan 236 review WIP and unrelated
   untracked Plan 274 remain untouched. All new SQL storage is disposable in-memory
   verification storage; no existing store is reset, migrated or deployed. Explorer
   is not verified. Plan 241, provider/deployed-state proof and remaining physical
   owner/table inventory remain separate Plan 151 work. Logs and pre-worktree plan
   evidence are retained in `/private/tmp/plan236-implement-20261027-9pkompum`.

## Remaining work

None. Plan 151 stays active for its independent child and inventory obligations.
