# Validate and retain canonical System registries

Status: Complete — implemented and verified on 2026-10-06.

## Problem and agreed interface

1. [makeSystem](../../../packages/core/src/system/make/makeSystem/makeSystem.ts) rebuilds nested aggregate/service registries through resolution helpers that validate each declaration and return the original object unchanged. There is no resolved aggregate representation: `IAggregate` aliases `IAuthoredAggregate`, and `IAnyAggregate` aliases `IAnyAuthoredAggregate`.
2. `IResolvedAggregates` reconstructs a declaration type without its contract-map generic. A registered contract's literal command name therefore widens to `string`. Remove this reconstruction and retain the exact supplied registry types.
3. For supplied registries, require `system.aggregates === props.aggregates`, `system.services === props.services`, and unchanged nested declaration/model/actor/contract identities. Preserve `system.agents === props.agents` when supplied, as implemented in [plan 044](044-plan-aggregate-agent-sessions.md). Omitted services and agents still produce empty registries.
4. Keep current constructor inputs, owner-name/version constraints, optional services/agents, conditional application-layer requirements, and runtime behavior. The public result is `ISystem<AGGREGATES, SERVICES, SYSTEM_NAME, AGENTS>` without resolved aliases. Do not introduce a new registration representation or a new freezing/mutation policy.

## Implementation

1. Keep runtime shape validation but treat its decoded registries as validation results, not replacement data. After successful validation, use the supplied aggregate/service/agent registries directly; normalize only absent optional registries to empty maps.
2. Move the two resolution helpers' actual checks into the existing construction validation: registry names and exact versions must match declarations, aggregate/service actor versions must remain unambiguous across each owner registry, and a canonical model object must not be owned by different services. Preserve the allowance for reuse by versions of the same service. Delete the resolution helpers and nested identity-only mapping passes; do not rename them into a second construction phase.
3. Validate canonical agents against these same retained registries. Preserve exact aggregate/actor registration, claims schemas, authentication restrictions, canonical models, permitted contracts, bindings, full-row selections, and database/claims capture provenance. Construction must remain cold and must not access agent browser-runtime getters.
4. Delete `IResolvedAggregates` and `IResolvedServices`; remove the unused `IAggregate` and `IAnyAggregate` aliases and update their current registry/System references to the authored types. Make existing `ISystem` fields preserve the supplied declaration types, including aggregate contract maps, models, actors, claims, and service queries. Do not widen to `IAnyContracts`, `any`, or `unknown` to accommodate construction.
5. Retain the existing layer-dependent public generic constructor declaration for this scoped change; give the implementation a checked concrete System result instead of `unknown`. Eliminating that remaining constructor overload is not an acceptance criterion. Preserve exact generic input/result relationships and avoid new assertions or `ALLOWED_CAST` exceptions.

## Verification

1. Extend [agentDeclarations.ts](../../../packages/core/src/agent/fixtures/agentDeclarations.ts), the existing System registration/type/manifest seam. Assert top-level and nested registry identity, supplied empty-map identity, omitted optional maps remaining empty, canonical agents, cold construction, and manifest equivalence.
2. Add exact `Equals` assertions for a registered aggregate's contract map and literal command name, and its decoded payload/result/failure types. Verify service contracts/queries, actors/models, System name, and agent types retain their precise declarations. Keep negative owner-name/version and missing/insufficient layer cases; do not add factory-result annotations to consuming System declarations.
3. Exercise rejected registration keys/versions, ambiguous actor versions, cross-service canonical-model ownership, and malformed agent bindings/provenance. Verify different versions of the same service can retain their shared canonical model. Existing validation must not be weakened by retaining input maps.
4. Run `pnpm nx run @zerospin/core:agent-preview:check`, `pnpm nx run @zerospin/sdk:lib`, and `pnpm nx run-many -t ts,lint -p @zerospin/core,system-worker,shopping,@zerospin/studio` with required dependencies. Run `pnpm nx run shopping:agents:cold-check` for the concrete declaration consumer. Keep these graphs sequential; run formatting checks on changed files and `git diff --check`.

## Scope and completion

1. Implement this plan independently; plans 049 and 052 need not be completed first. Preserve concurrent changes to shared constructors, SDK exports, and declaration fixtures. Current source/type/docs references to the superseded resolved aliases are in scope; historical archived plans remain historical records.
2. No manifest/wire/storage schema changes, compatibility aliases, duplicate registries, registration mutation feature, runtime-service redesign, or caller-owned model merging. Preserve the established exclusive service-model ownership and canonical agent rules.
3. After implementation, reconcile System authoring/architecture documentation and the existing glossary with canonical registration. Update source citations and current examples. Record an ADR only if the implemented change meets all repository criteria; do not create one solely for deleting identity-only helpers.
4. Record actual verification and remaining work, then follow the implement skill to archive this plan only after implementation and required checks are complete. The prior investigation confirmed registry precision loss; a full replacement construction check and runtime regression suite remain pending.

## Completion evidence

1. System construction validates and retains supplied aggregate/service/agent registries and exact generic declaration types; only omitted optional maps normalize to empty maps. Removed the identity-only helpers and obsolete aggregate/resolved aliases, while preserving owner, actor, service-model, agent, and application-layer validation.
2. Extended the existing registration/type/manifest fixture with top-level/nested identity, empty/omitted maps, decoded payload/result/failure precision, service queries, cold construction, key/version and actor ambiguity rejection, model ownership, and layer requirements. Existing malformed agent/provenance checks remain.
3. Core agent preview, SDK library build, core/system-worker/Shopping/Studio TypeScript and lint, and Shopping cold agents passed with configured dependency builds. The checked implementation's layer type was corrected. Concurrent session-refactor compiler/type failures temporarily blocked consumer verification; that work was preserved and the required checks passed after it settled. Nx Cloud's access warning (401) was non-blocking. Changed-file formatting and `git diff --check` passed.
4. Updated governing System documentation and glossary entries, removed obsolete helper citations, and refreshed affected source metadata. No ADR was needed for removing identity-only construction.

## Remaining work

None.
