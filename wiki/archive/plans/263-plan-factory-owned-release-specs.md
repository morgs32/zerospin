# Factory-owned Release specs

**Status:** Complete. Approved, implemented and verified on 2026-10-25.

## Summary and contract

1. Aggregate, Service and both Agent Release families own an eagerly constructed, immutable `.spec`. Named data-only schemas define `IAggregateSpec`, `IServiceSpec`, `IAggregateAgentReleaseSpec`, `IServiceAgentReleaseSpec` and their Agent union.
2. Preserve existing portable JSON values, accepted identities, numeric registry-key typing, registration scopes, selected-version observer formats and durable upgrade behavior. Spec equality remains a recorded-structure guarantee; executable functions remain outside it.
3. Keep active Agent pins, Node checkpoints, pending commands and cursor progress outside specs. Stable Nodes select configured releases; versioned Repos select their physical release. Frozen pending commands retain their producing identity and are never reinterpreted through a new spec.

## Implementation

1. Extract shared portable leaf schemas into `packages/core/src/declaration/ReleaseSpecSchemas.ts`; create the named Aggregate, Service and Agent Release spec-schema modules. Compose SystemSpec, RepoSpecs and accepted-definition codecs from these schemas, including named Actor leaves. Remove duplicate anonymous type shapes and deep SystemSpec schema-field access; update imports without compatibility re-exports.
2. Replace the owner projection module with `declaration/makeReleaseSpecs.ts`, exposing four explicit builders with pre-spec structural inputs and canonical return types. Retain real Contract-lineage, Actor, Model and sorted-record projection helpers. Each builder produces detached JSON metadata and recursively seals only that metadata.
3. At the end of each validated/composed/compiled factory, attach `.spec`, freeze the canonical declaration and retain existing provenance/inference. Add the property to precise and erased owner types and both Agent Release types. Do not freeze caller-owned codecs/callbacks or add casts, lazy getters or global caches.
4. Rename `requiredDeclarations` to `requiredSpecs`, returning `IRequiredSpecs = Readonly<Partial<IRepoSpecs>>`. Preserve each selector's current lookup/identity conditions and return `.spec` values. The registration adapter normalizes the three optional groups before the existing `{ registration, specs }` RPC; ticket prerequisites select and normalize stored specs locally. Delete `IRequiredDeclarations` and `projectRequiredDeclarations`.
5. Make `makeSystemSpec` assemble existing specs plus its separate `agentVersions` map. Update Studio fixtures, declaration-board type imports, existing tests and every direct owner-projection consumer.

## Planned file layout

`+` creates, `~` modifies, `-` removes. Paths are rooted at `/Users/morgs32/GitHub/zerospin/`; existing caller families below are grouped to avoid duplicating sixteen selectors.

```text
packages/core/src/
  declaration/
    + ReleaseSpecSchemas.ts
    + makeReleaseSpecs.ts
  aggregate/+ AggregateSpecSchema.ts
  service/+ ServiceSpecSchema.ts
  agent/+ AgentReleaseSpecSchema.ts
  ~ Aggregate/Service/Agent factories and types
  ~ system/SystemSpecSchema.ts, system/types.ts, system/make/makeSystemSpec.ts
  - system/project/projectOwnerSpec.ts
packages/system-worker/
  ~ factory, sixteen selectors, registration/ticket/acceptance codecs
  - src/SystemRepo/registerRepo/projectRequiredDeclarations.ts
  ~ existing lifecycle, names and Agent test suites
packages/studio/src/fixtures/~ agents.ts
packages/system-diagrams/src/~ affected spec-type imports
wiki/~ glossary, affected architecture/module docs and authoring guidance
```

## Verification

1. Adapt the existing lineage regression to inspect a completed Release's `.spec`; prove preceding payload capture, stability after a future Contract upgrade, JSON serialization and one representative nested mutation refusal. Create no test files, fixtures, runners or configuration.
2. Preserve lifecycle assertions for strict decoding, exact acceptance, scoped registration, independent Agent releases, mutable pins and stable owner binding. Reuse both Agent Node suites for frozen delivery, upgrades, inactive publication and exact observer binding.
3. Run one scoped Nx library/typecheck/lint graph for Core, System Worker, Browser, SDK, Studio, System Diagrams, CLI and Dev Worker using their available targets; focused existing regressions; `pnpm nx run zerospin:test -- --maxWorkers=2`; and Studio's existing Storybook build. Finish with scoped formatting, source/document citation checks and `git diff --check`. Never verify Explorer.

## Constraints and completion

1. Keep Actor declaration properties, AggregateChain registration separation, repository-wide props cleanup and AgentVersionChain prerequisite narrowing outside this change.
2. Preserve selected-version `contract.spec`, observer locks and embedded model-summary shapes. This adds no storage-format cutover; [Plan 262](./262-plan-independent-agent-releases.md)'s existing empty-storage requirement remains. Persistent resets and deployment require separate authorization.
3. After implementation, reconcile the glossary, affected architecture/module docs and authoring guidance. Record verification, mark remaining work None and archive this plan only when required checks pass.

## Verified outcome

1. Canonical schemas, all four factory-owned snapshots, all sixteen `requiredSpecs` selectors, registration/ticket normalization, acceptance codecs and direct consumers are implemented. Removed both obsolete external projection modules; no compatibility paths were added.
2. The adapted lineage regression proves complete historical payload capture, JSON serialization, nested mutation refusal and stability after constructing a future Contract version.
3. The explicit eight-project Nx `lib,ts,lint` graph passed using available targets (28 tasks including dependencies). The initial Aggregate builder input-brand error was resolved with a projection-only `IAnyContracts` input, without a cast.
4. Focused existing Repo names, Repo lifecycle and both Agent Node suites passed: **30 tests in 4 files**. Both source audits found no remaining issues in factory snapshots or registration/acceptance semantics.
5. `pnpm nx run zerospin:test -- --maxWorkers=2` passed: **145 tests in 33 files**, including the existing Actor admission, exact acceptance, independent Agent versions, pin changes, stable owner binding, frozen delivery, inactive publication and exact observer regressions. Its existing test TypeScript check passed. No test files, fixtures, runners or configuration were created.
6. `pnpm nx run @zerospin/studio:build-storybook` passed with its existing dependency graph. The scoped formatting check passed for all 50 changed source/document files, and `git diff --check` passed. Validated 37 changed-source architecture metadata entries and 44 added source links/ranges.
7. Reconciled the glossary, Repo factory README, Repo lifecycle guidance, AuthoredSystem/SystemApi workflows and SDK authoring/evolution guidance. Diagrams now show SystemSpec assembly from completed snapshots; source hashes and affected citation ranges match current source. Pre-existing unrelated TraceExplorer documentation links remain outside this work.
8. Portable JSON values and durable identities remain unchanged. Active pins, checkpoints, pending commands and cursors remain outside Release specs; pending delivery retains its producing identity. No persistent storage was reset, and nothing was deployed or published. Nx Cloud cache-access/network warnings did not affect successful local verification.

## Remaining work

None.
