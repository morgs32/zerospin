# Construct aggregate versions from their shared identity

Status: Complete — implemented and verified on 2026-10-06.

## Problem and evidence

1. [upgradeAggregateVersion](../../../packages/core/src/aggregate/make/makeAggregateVersion.ts) accepts an earlier aggregate, retains only its name, and calls `makeAggregateVersion` through `Reflect.apply`. It neither inherits declarations nor upgrades data. The name suggests a relationship that the implementation does not provide.
2. There are no current authored-source callers. The SDK still exports the wrapper and [AuthoredSystem](../../architecture/AuthoredSystem.md) describes it. `defineAggregate({ name })` already supplies the shared identity consumed by `makeAggregateVersion(identity, completeDeclarations)`.
3. [Plan 044](044-plan-aggregate-agent-sessions.md) removed a redundant representation in favor of canonical declarations. Apply the same deletion test here: the ordinary constructor already expresses the entire operation.

## Agreed interface and implementation

1. Delete `upgradeAggregateVersion` and its overload from core and remove its SDK export. Add no alias, replacement helper, version shim, or implicit inheritance path. Keep `makeAggregateVersion` itself outside the overload cleanup in this plan.
2. Construct every version with `makeAggregateVersion(sharedIdentity, completeDeclarations)`, reusing the object returned by `defineAggregate`. The declarations describe that version independently: optional omitted model, contract, module, and guard collections contribute nothing; `actors` remains explicitly required. Earlier aggregate instances remain unchanged.
3. Replace current documentation's upgrade terminology and examples with independent construction from the shared identity. Preserve archived plans as historical records and leave generated Graft lookup caches outside manual edits.

## Verification

1. Use the existing core type/library checks and SDK library build to verify the remaining authoring surface and export removal. Existing declaration fixtures continue constructing aggregates through `makeAggregateVersion`. Do not create a test solely asserting that the wrapper is absent or invent another declaration fixture for this deletion.
2. Search current authored source, exports, and governing documentation for `upgradeAggregateVersion`; there must be no remaining live reference. Historical archive records and generated lookup data do not constitute supported APIs.
3. Run scoped Nx core `ts`/`lint` and SDK `lib` with configured dependency builds. Check formatting on changed files and `git diff --check`; record actual results after implementation.

## Scope and completion

1. Limit source changes to removing the wrapper and export. Existing declaration composition, collision checks, actor ownership, validation, aggregate construction overloads, and persistence remain unchanged. No schema or storage cutover is involved.
2. After implementation, reconcile affected authoring documentation and [the glossary](../../glossary.md) with the implemented independent-version semantics, editing only where necessary. Create an ADR only if the implemented decision meets all spec criteria; deleting this reversible redundant helper does not currently warrant one.
3. Follow the implement workflow, record completed verification and limitations, and archive this plan under `wiki/archive/plans/` with its filename intact when no work remains. Repair relative and inbound links during archival.

## Completion evidence

1. Deleted the unused aggregate upgrade wrapper and SDK export. Independent versions use the ordinary constructor and shared `defineAggregate` identity; no replacement surface or compatibility path was introduced.
2. Updated authored-system documentation and the aggregate-registration glossary entry to describe complete independent declarations, explicitly required actors, omitted optional collections, and unchanged earlier instances. Live authored-source/export/governing-doc searches found no wrapper references.
3. Core TypeScript/lint/library checks and the SDK library build passed with configured dependency builds. Nx Cloud's access warning (401) was non-blocking. Changed-file formatting and `git diff --check` passed.
4. Existing declaration fixtures cover the remaining construction surface. No deletion-only fixture or ADR was added.

## Remaining work

None.
