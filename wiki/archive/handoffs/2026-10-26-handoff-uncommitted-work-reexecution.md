# Handoff: Uncommitted work and reexecution

**Date:** 2026-10-26
**Focus:** Preserve the useful work before discarding uncommitted changes, remove connected-session command execution, and resume the remaining work in dependency order.
**Status:** Completed source work, reviewed against merged main `e9a90199a9` ([PR #81](https://github.com/morgs32/zerospin/pull/81)). Superseded recommendations are reconciled below. Archived as reset and reexecution evidence; no source work remains in this handoff.

## Completion review against merged main

1. [Plan 271](../plans/271-plan-remove-connected-session-command-execution.md) removed connected-session `executeCommand`, its exclusive private RPC/helpers, and Node-less Actor commands. Ordinary staging and Node delivery remain; admitted Actor commands require their real Node/session/push tuple.
2. [Plan 270](../plans/270-plan-contract-release-names-and-command-kinds.md) completed the `kind`/`external` cutover, all four admission-ticket branches, exact selected-lock identity, retained-input recovery and the unchanged `dispositionChainHash` preimage. Its recorded implementation and verification close queue items 2 and 3.
3. Plan 270 Phase 3 completed explicit reusable Actor/Agent/System grants, distinct external registration, derived owner inventories, authoritative admission, harness/example migration, typed administrative execution and seed programs. Queue item 4's category-specific ordinary factories and immutable kind/principal bindings were superseded by the approved invocation-neutral ordinary releases. No reader Actor fixture was needed.
4. [Plan 269](../plans/269-plan-props-destructuring-cleanup.md) contains the completed props-cleanup and verification record. [Plan 272](../plans/272-plan-remove-actor-origin-and-session-origin-union.md) completed flat Actor identity. [Plan 273](../plans/273-plan-consolidate-source-readmes-into-documentation.md) superseded source-module README updates with Fragment/architecture ownership. Queue item 6 is complete.
5. The [focused System construction and seeds handoff](270-handoff-system-command-construction-and-seeds.md) is complete and archived alongside this record. The final design reuses `createProductV1`, preserves create-only guards, uses stable per-occurrence IDs, and runs one checked sequential `ISeedProgram`. Canonical `ICommandOutcome` and caller-side success decoding remain.
6. The external recovery package at `/Users/morgs32/GitHub/zerospin-reexecution-2026-10-26-01a17a02` still contains its manifest, original planning records and both reference snapshots. All research files named below remain in `wiki/research/`. The temporary implementation worktree has been removed after its two WIP handoffs were preserved in main.

The inventory, baseline, queue and pickup instructions below are historical evidence. Every authorized source-queue item is complete or superseded. Research proposals, publication, deployment, sibling consumer adoption and fixed-schema runtime rollout were outside that queue; the archived Plan 270 records the separate storage-authorization gate. This review changes documentation only and leaves runtime storage untouched.

## Historical direction at reset

1. The maintainer's latest decision is that a browser session should not expose `executeCommand`. Implement that removal through [Plan 271](../plans/271-plan-remove-connected-session-command-execution.md). Do not replace it with a browser submit/wait pair, execution handle or another canonical-only execution interface without a new request.
2. Retain ordinary synchronous staging and ordered Node delivery. Retain administrative SystemApi execution, Aggregate authorization's `executeCommand`, command replay, canonical `outcome` and external execution. The decision concerns connected browser-session execution, not every method with the same name.
3. The session-gating and React completion proposals in the earlier handoff/research are superseded as implementation directions. They are historical reasoning, not work to recreate after a reset.
4. The accepted typed administrative execution and seed-program design remains in scope for planning. It belongs in [Plan 270's administrative execution and seeds subsection](../plans/270-plan-contract-release-names-and-command-kinds.md#typed-administrative-execution-and-seeds), after explicit contract categories exist. The [focused handoff](270-handoff-system-command-construction-and-seeds.md) stays at its existing path.
5. Source deletion, Git discard, runtime-storage reset and worktree removal are different operations. This inventory does not perform any of them. A later discard must identify the checkout or checkouts; storage still needs its own precise authorization.

## Committed baseline: do not reexecute

Both checkouts were at `bf029423dd61748ee40f11e887c04ae245bfd019` (`nx update`) when inventoried.

1. `c24111d31d`, PR #69, already contains connected-session `executeCommand`. Resetting uncommitted files restores that implementation; it does not remove the feature. Plan 271 is therefore required even after a clean reset.
2. `5e83e0f438`, PR #70, contains Plan 270 phase 1's Release factory/type names. Do not repeat that rename.
3. `34915fcbfb`, PR #71, contains Plan 268's factory-owned Actor specs. Do not repeat that implementation.
4. `569ff979ac`, PR #72, contains Plan 269's props-input cleanup. Only its uncommitted completion record and move to `wiki/archive/plans/269-plan-props-destructuring-cleanup.md` need preservation/reconciliation.

## Inventory before these documentation edits

1. Main checkout: `/Users/morgs32/GitHub/zerospin`, branch `main`. There were **195 tracked changed files and 19 untracked files**, nothing staged: **214 paths** total.
2. Separate checkout: `/Users/morgs32/.codex/worktrees/contract-command-kinds/zerospin`, branch `codex/contract-command-kinds`. There were **250 tracked changed files and 29 untracked files**, nothing staged: **279 paths** total.
3. Across the 288 paths changed in either checkout, 189 had identical current contents and 99 differed. The latter include 90 source/test/export paths and nine documentation-presence differences. Do not treat the worktree as a second independent completed implementation or apply both diffs in sequence.
4. The chat **Implement Plan 270 in a PR** was idle after its plan review. Its latest response records partial unverified edits, no PR, and no newly created fixture files. The chat **Research chain storage limits** holds separate research. This is a status snapshot, not an instruction to resume or message either chat.
5. Counts above precede this handoff, Plan 271 and the accompanying documentation reconciliation. Recovery manifests identify their own capture time and exact paths.

## Affected Nx projects and directories

Project names were checked with `NX_NO_CLOUD=true pnpm nx show projects --json`; no build, lint, test or application verification ran for this inventory.

1. `system-worker` — 86 main-checkout paths, including command schemas/rows, admission, private session RPCs, original/replay execution, projection and existing scenarios.
2. `@zerospin/core` — 59 paths: discriminated commands, Node/session journals and optimistic replay, administrative builders, harness and exports.
3. `@zerospin/browser` — 22 paths: connected submission, Node command lookup, admission/outcome waits, session constructors and existing authentication/network scenarios.
4. `@zerospin/sdk` — seven paths: exports and authoring guidance.
5. `shopping` — six paths: administrative promotion input, seeds and existing test inputs.
6. `@zerospin/native` — two paths: replica storage format and documentation.
7. `fragment` — two reference-document paths.
8. `@zerospin/error` — one default-error-message path.
9. Root tooling/release documentation: `scripts/lint/zerospin-plugin.mjs`, the existing `.nx/version-plans/` note, and 27 `wiki/` paths.
10. The separate worktree additionally touches `tic-tac-toe` and `@zerospin/studio`, and expands the Core, SDK, Shopping and System Worker migrations. These are partial phase-3 changes. Other projects in historical verification graphs were dependencies or consumers, not additional independent WIP projects. Never verify Explorer.

## Historical reexecution queue: resolved or superseded

1. **Remove connected browser-session execution — Plan 271.** Start from the committed baseline and remove the public capability and its exclusive private admitting RPC/helpers. If any old WIP is selectively restored, also remove its replacement outcome-wait path, unstaged submission support and exclusive Node point-read/wait machinery. Preserve shared command execution/replay and ordinary staging. Reassess the tests and fixture requests after that removal.
2. **Finish Plan 270 phase 2 and independently justified Actor provenance.** Reapply `origin` to `kind` and `continuation` to `external` through commands, retained/evaluated rows, projections and consumers. With connected-session execution removed, Actor mutation proceeds through ordinary Node-backed staged delivery; remove the Node-less direct Actor variant if no remaining legitimate caller needs it. Do not restore null staging evidence or optimistic no-op replay solely to support the removed feature. Keep same-ID immutable-input recovery and the unchanged `dispositionChainHash` preimage. The former recorded checks describe discarded WIP, not proof of the rebuild.
3. **Finish the agreed admission identity/schema consolidation.** Write the missing concrete implementation detail before executing it: four Aggregate Actor/Agent and Service Actor/Agent ticket shapes, exact lock branches, identity derived from those locks, Actor claims retained once, every producer/forwarder, and validation at the authority. Include persisted `SystemRepo.sessionWebSocketTickets.admission` JSON in the fixed-schema rollout inventory. Preserve actual authority checks and retained-work recovery; do not recreate redundant identity copies or add `ownerKind`.
4. **Implement Plan 270 phase 3 categories and assembly.** Separate Actor/Agent/System/External authored definitions/releases, immutable kind and principal bindings, explicit `actors`, `agents`, `system`, `external` owner assembly, strict grants/ingress/invocation and harness/example migration. Remove the dormant generic module-registration path. The partial worktree is reference material, not a verified base. Explicitly migrate catalog create/delete grants, remove the external O move from human grants, and retain `releaseUncommittedReservation` under the actual `reservations` Agent. Reassess the missing reader Actor in the existing receipt-delivery seam. No new fixture exception has been approved; requests tied only to removed session execution must not be reproduced.
5. **Implement typed administrative execution and seeds within Plan 270.** Use `api.executeServiceCommand(serviceRelease, { id, contractName, payload })` and the Aggregate equivalent with `aggregateId`, restricted to `release.system`. Move construction/encoding into that interface, enforce categories again in administrative RPC/Chain admission, and preserve exact-ID retries and canonical `outcome`. Migrate the actual promotion caller, CLI seed loader and Shopping seed authoring together. Remove the old public builders and their exclusive internal helper; do not replay the intermediate `make*SystemCommand` rename merely to delete it later.
6. **Reconcile documentation and Plan 269 closure.** Restore the already-completed Plan 269 archival record, not its source cleanup. Update glossary, governing ADR terminology, module READMEs, SDK skills, Fragment and architecture citations only to match the source work actually implemented. Do not restore documentation advertising the removed browser execution feature. Preserve the existing major-version note, rewriting it for the final public cutover rather than accumulating obsolete intermediate names.

The order above records dependencies and the latest direction. It does not advance every phase to implementation, authorize fixtures, approve seed-domain semantics or authorize retained-storage deletion.

## Focused handoff closure

The [System construction and seeds handoff](270-handoff-system-command-construction-and-seeds.md) is archived with this inventory. Its work was implemented and verified within Plan 270; no separate plan or repeated factory rename is needed. The concrete seed behavior and program interface are settled. Automatic authored success decoding and later catalog-update semantics remain outside this cutover.

## Research to preserve without inventing implementation plans

1. [Aggregate command builders and System authority](../../research/aggregate-command-builders-and-system-authority.md) supplies evidence for the accepted administrative cutover.
2. [Aggregate Node user_version](../../research/aggregate-node-user-version.md) investigates storage stamping. No replacement or removal implementation was approved.
3. [Chain capacity and segmentation](../../research/chain-storage-capacity-and-segmentation.md) contains platform research and an evaluated-history archival design investigation. Preserve it for a separate design discussion; no archive implementation, runtime proof or storage deletion is authorized here.
4. [Producer sequence/archive routing](../../research/producer-sequence-archive-routing.md) investigates later admitted-Actor-history routing. Keep it separate from the first evaluated-history archive milestone and preserve its unresolved command identity, uniqueness, lineage and metadata-bounding decisions.
5. [Session command availability](../../research/session-command-availability-and-canonical-execution.md), [React interface usability](../../research/react-command-execution-interface-usability.md) and the [earlier session handoff](270-handoff-contract-release-names-and-command-kinds.md) are preserved historical exploration. Their browser execution/gating proposals are superseded by the latest removal decision, not queued work.
6. Preserve tracked naming-audit and Shopping-harness research updates as well. Recheck their source citations against the eventual rebuilt source before treating them as current.

## Historical recovery package and pickup rules

1. Before these planning edits, both checkouts were copied to `/private/tmp/zerospin-reexecution-2026-10-26-gncy68ew`, each with a complete changed-file archive, binary tracked diff, staged/unstaged diffs, status and per-file SHA-256 manifest. Archived regular-file bytes were checked against the manifest. Ignored files, runtime storage and Git internals were not copied.
2. The completed documentation and pre-edit snapshot are to be preserved outside both checkouts at `/Users/morgs32/GitHub/zerospin-reexecution-2026-10-26-01a17a02` before reporting this pass complete. The external package's README and manifests establish its completed capture. A Git reset/clean inside either checkout must not be used on that directory.
3. Read the latest versions of this handoff, Plan 271, Plan 270 and the System construction/seeds handoff from that external package if the checkout has since been reset. Restore only the intended planning documents before rebuilding; archived source patches are evidence, not instructions to apply superseded machinery wholesale.
4. No PR or commit was created by this inventory. No verification claim from a discarded or partial implementation transfers to the next implementation. Use scoped existing Nx targets and existing test seams after code changes; do not create tests/fixtures/runners/configuration or verify Explorer.

## Suggested skills

1. `$use-morgs32-wiki-patterns` — apply local API, command ownership and scoped-execution guidance.
2. `$yolo` — carry forward requirements and replace superseded machinery outright.
3. `$grill-me` — resolve only the remaining seed/domain or ticket-shape decisions; the documented shared `spec` skill path is unavailable.
4. `$implement` — after the relevant implementation step is authorized, complete its migration, permitted verification and documentation.
5. `$nx-workspace` and `$nx-run-tasks` — inspect the relevant resolved project configuration and run the smallest appropriate existing graph.

## Remaining work

None.
