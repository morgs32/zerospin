# Plan 260: Shared declarations and per-file Workerd Systems

Status: Completed on 2026-10-23. Implementation and required verification are complete.

## Agreed design

Replace the shared example application in `servicePublicationConfig.ts` with a pool of ordinary authored declarations and one explicit System composition per existing Workerd spec file. Each running Workerd application must use the same configuration that its spec imports.

Share stable models, contracts, actors, Aggregate releases, Service releases and Agent definitions through direct imports from defining files. Keep scenario-specific declarations beside the owning spec. A shared declaration is justified by actual reuse; the pool is not a mandatory destination for every declaration.

Organize `packages/system-worker/tests/` by behavior, with one folder per existing spec file. Each folder owns its spec, its `system.ts` when a System is needed, and any local helpers or declarations. Remove the `workerd/` grouping; retain `.workerd.spec.ts` to identify the required runtime. Move the two Node specs into their own behavior folders too, without introducing Systems or helpers they do not need.

This plan changes test organization and configuration. Preserve the production Durable Object classes, their interfaces, the existing behavioral assertions and lifecycle evidence. No production dependency-injection mechanism, mutable configuration registry, fixture subclasses, command router, scenario DSL or compatibility path.

## Current construction and constraints

- `vitest.workerd.config.mts` supplies one project-wide `config` alias and binds all production Durable Object classes. All 23 existing Workerd spec files import the same application configuration.
- The package also has two Node specs: `repo-names.spec.ts` and `command-evaluation-clock.spec.ts`. They exercise declaration/name/schema behavior and the Effect evaluation clock without running Durable Objects. `tests/support/` contains four shared modules and no spec files. Runtime choice is independent of directory organization.
- Workerd is Cloudflare's Worker runtime. These integration specs use production Durable Object classes, SQLite storage, RPC, alarms, eviction/reactivation and, where relevant, WebSockets. The Cloudflare Vitest plugin runs them in Workerd through Miniflare. Moving folders must preserve that runtime and its controls; plain Node execution does not establish these lifecycle guarantees.
- Production classes, including `ServiceVersionRepo`, capture `config.system` and `config.managedRuntime` during module evaluation. A System declared only inside a spec would not configure those classes.
- The installed Cloudflare plugin creates Miniflare through `getProjectMiniflare` with a Vitest project and that project's options. Separate project definitions therefore provide the intended configuration seam. Loading and isolation still require runtime proof.
- `src/index.ts` exports the same 17 production classes currently duplicated by `servicePublicationWorker.ts`. Use that production entry for every project and lifecycle typing; verify source module resolution before deleting the duplicate.
- Authored declarations follow `wiki/patterns/declarations/one-version-per-file.ts`: one concrete version per defining file, direct imports, no declaration barrels, actor selections owned by the actor file. A test's System registry is the explicit composition point.
- Existing counters, provider controls, finalizer barriers and Agent selector state need deliberate ownership and reset. Splitting files alone does not isolate mutable state.

## File structure

Paths below are relative to the repository root. Declaration filenames illustrate the naming and ownership rules; allocate additional files only for declarations used by the migrated specs.

```text
vitest.config.mts                         # Node project plus Workerd project definitions
vitest.workerd.config.mts                 # One shared configuration; one project per spec/System pair
packages/system-worker/
  src/index.ts                           # Existing production Worker entry
  tests/
    declarations/                        # Reusable authored declarations; no index.ts
      models/
        reservationV1.ts
        agentReservationV1.ts
      contracts/
        service/
          createReservationV1.ts
          createTimedReservationV1.ts
          performReservationWorkV1.ts
          recordReservationWorkV1.ts
        aggregate/
          receiveCommandV1.ts
      actors/
        service/
          operatorV1.ts
          operatorV2.ts
          capabilityViewerV1.ts
          capabilityViewerV2.ts
        aggregate/
          viewerV1.ts
      services/
        reservationsV1.ts
        reservationsV2.ts
        agentReservationsV1.ts
        agentReservationsV2.ts
      aggregates/
        accountV1.ts
        accountV2.ts
        agentAccountV1.ts
        agentAccountV2.ts
      agents/
        projectionReader.ts
        serviceExpiryV1.ts
        serviceExpiryV2.ts
        aggregateExpiryV1.ts
        aggregateExpiryV2.ts
    service-publication/
      service-publication.workerd.spec.ts
      system.ts                          # This spec's makeSystem + makeConfig
      reservationsV1.ts                  # Publication-specific release/instrumentation
      helpers.ts                         # Only if this spec needs extracted setup/control helpers
    service-actor-connections/
      service-actor-connections.workerd.spec.ts
      system.ts
      authenticatedViewerV1.ts
      reservationsV1.ts
    native-system-api/
      native-system-api.workerd.spec.ts
      system.ts
      ...                                # Local authentication/authorization refusal declarations
    agent-node-service/
      agent-node-service.workerd.spec.ts
      system.ts
    repo-names/
      repo-names.spec.ts                 # Node; no System configuration required
    command-evaluation-clock/
      command-evaluation-clock.spec.ts   # Node; no System configuration required
    ...                                  # One behavior folder per remaining spec
```

Each existing `<name>.workerd.spec.ts` moves to `tests/<name>/<name>.workerd.spec.ts` and gets exactly one sibling `system.ts`. The two Node specs move to matching `tests/<name>/<name>.spec.ts` paths. Create helpers and local declaration files only where the owning scenario needs them; do not scaffold empty helper modules. Shared and local release files may have the same basename: their directories identify ownership.

`system.ts` exports its typed `system` and default `makeConfig({ system, systemId })` result. It assembles registry entries explicitly. It imports only reusable or local authored declarations, never the `.workerd.spec.ts` module. The spec imports this sibling configuration and imports individual declarations from their defining files. Helpers stay beside the spec and support that behavior; assertions and lifecycle sequencing remain visible in the spec. Do not move the complete test into a helper.

Keep existing System name/ID and owner identity strings during the extraction where possible. Each project has independent Workerd storage, so reusing a test identity does not require a shared application. Existing Agent definitions embed System and owner identities; only pool a complete Agent definition when those bindings match. If a scenario needs different bindings, declare that Agent locally rather than adding a generic Agent factory.

## Pool ownership rules

1. Models and ordinary contracts with stable semantics are the first shared ingredients. Keep supporting schemas and operation descriptors with their declaration unless genuinely shared.
2. Pool an Actor only when its claims, authentication, authorization, contracts and selections are actually shared. Authentication refusal and invalid-result behavior belong to their owning scenario rather than the normal pooled Actor.
3. Pool an Aggregate or Service release only when its complete membership is shared. Importing one must not transitively register unrelated authentication, clock, external-provider or Agent scenarios. Assemble a separate local release when membership differs; never mutate a pooled release or spread the old all-purpose release and remove fields.
4. Preserve actual contract versions and release distinctions. A numeric suffix denotes an authored version, not a configurable scenario mode. Keep server-adapter removal out of this refactor; Plan 259 owns that change, and implementation must accommodate whichever declaration shape is current then.
5. Scenario-specific instrumentation and provider controls live with their owning declaration. Reusable observable controls, where already needed by multiple specs, remain focused and declaration-local with explicit reset in each owning spec. Do not turn them into a cross-project global registry. Preserve finalizer barriers and deliberate provider failures.
6. No `withAuthentication`, `withAgents`, arbitrary callback bags or universal `makeTestSystem` builder. Each System's registry membership remains readable at its composition site.

## Workerd configuration

Refactor `vitest.workerd.config.mts` to export inline project definitions consumed by `vitest.config.mts`. Keep the current aliases, compatibility flags, SQLite namespace bindings and `fsModuleCache: false` in this one configuration module.

Discover `packages/system-worker/tests/**/*.workerd.spec.ts` files in deterministic order. For each, require the containing behavior folder's `system.ts` and create a project named `workerd/<name>` with:

- An exact include containing that one spec file.
- A project-local `config` alias pointing to that folder's `system.ts`.
- `main` pointing to `packages/system-worker/src/index.ts`.
- The existing production Durable Object bindings and environment configuration.

Fail configuration loading clearly if a required sibling is absent. Do not generate configuration files, import test modules into Node configuration, select a System from a mutable variable, or swap configuration after classes have been imported. No per-spec Vitest configuration file is needed.

Update only the System Worker Node include in `vitest.config.mts` to discover nested `packages/system-worker/tests/**/*.spec.ts`, with an explicit exclusion for `.workerd.spec.ts` files while preserving the existing default exclusions. Every spec must be discovered exactly once in its owning runtime. Keep the other packages' Node includes unchanged.

Keep test TypeScript compilation through the existing root `tsconfig.tests.json`; its recursive test include already covers declarations and `system.ts` siblings. Existing recursive lint and Nx test inputs cover the relocated files. Update the lifecycle spec's `Cloudflare.GlobalProps` declaration to the production entry. Update documented project filtering to `workerd/*` or a specific `workerd/<name>` project after checking the installed CLI's syntax. Folder names organize behaviors; project names and spec suffixes select the runtime.

## Implementation sequence

1. Inspect fresh status and preserve ongoing edits. In particular, Plan 259 and the authentication/lifecycle work already touch these declarations and tests. Extract current behavior, without overwriting newer changes or resurrecting removed adapters.
2. Establish the loading seam using two existing specs, initially publication and queries. Move them into their behavior folders, give them explicit reduced Systems and separate project aliases, and preserve their assertions. During this initial gate, continue to discover unmigrated specs at their existing paths with their existing configuration. Run the migrated specs together and independently; prove that the running production classes resolve their own System rather than a shared catalogue. Add any necessary isolation assertion to an existing spec, not a new test file.
3. Extract stable declarations into the pool, relocate each remaining Workerd spec into its behavior folder and add its `system.ts`. Minimize each registry by the spec's actual owner/release/Actor/Agent requirements. A catalogue test covering six identity scopes intentionally includes all six; an Agent rebind test intentionally retains both relevant releases. Minimality must not weaken a test's behavior. Move the two Node specs and adjust runtime discovery as part of the same organization change.
4. Move authentication-only Actors, clock probes, external request controls and publication counters into their actual owner files. Preserve instrumentation identity between the spec and running declarations, reset controls explicitly and keep scenario faults/assertions visible in the specs.
5. Update all imports after relocation; use the production Worker entry and delete `servicePublicationConfig.ts`, `servicePublicationWorker.ts`, `agentVerificationContracts.ts` and `serviceExternalContracts.ts` once their declarations and controls have migrated. Remove the empty `tests/workerd/` and `tests/support/` directories and the temporary discovery of unmigrated specs. No forwarding compatibility files or replacement declaration barrels.
6. Update `tests/README.md` and the current wiring references in `wiki/research/system-worker-verification-simplicity.md`. Historical completed plans remain historical records; do not rewrite them merely to remove old paths.

## Verification and completion

- First prove the two-project configuration/loading seam, including concurrent execution and identical physical Repo names resolving within independent project storage. Measure whether the complete set of Workerd projects has material startup/resource cost; use supported Vitest scheduling controls if required, without introducing custom runtime management.
- Run the existing test command through Nx with a System Worker file filter: `pnpm nx run zerospin:test -- packages/system-worker/tests`. This retains complete test TypeScript compilation and all current System Worker assertions. Verify single-file selection still runs exactly the selected spec.
- Run the scoped existing lint and formatting checks for the changed tests/configuration and `git diff --check`. Confirm no test imports the deleted shared application, no project loads the wrong System, and all 25 existing specs are discovered exactly once: 23 in Workerd and two in Node. Check that selecting a behavior folder runs its spec without pulling unrelated specs into that selection.
- No Explorer verification, real storage resets, deployments or consumer releases. This refactor changes disposable test applications only.
- Completion requires all existing System Worker behavior passing with per-file configurations, the superseded support modules deleted and the current instructions accurate. Record actual evidence and archive this plan only after implementation and required verification are complete.

## Planning limits

At planning time, the installed plugin's project configuration and runtime construction supported the proposed seam at source level. Per-file configuration loading, concurrent isolation and suite startup cost were unverified and formed the first implementation gate. Implementation evidence follows below.

## Implementation outcome

- All 25 original specs now have behavior folders; all 23 Workerd specs import their own `system.ts`. The two Node specs have no additional System configuration. Original test names and ordering are preserved.
- Ordinary declarations and four complete releases with actual reuse are pooled. Single-behavior versions, authentication faults, publication counters, clock probes and external/Agent controls remain behavior-local. Mutable controls reset explicitly; both parallel releases retain the publication program and its two-evaluation assertion.
- Workerd uses one exact spec/project pair and the production entry. Node discovery recursively excludes Workerd specs. The four superseded support modules and old grouping directories are deleted. The test README and current research links describe the new wiring.
- The initial combined publication/query run passed both specs (9.09s). Query exact-file/project selection passed alone (5.71s), including a production API refusal for release 2; publication behavior-folder selection passed alone (5.35s). Their identical physical Repo names resolve within independent project storage and different release registries.
- The first full scoped Nx run passed all 109 tests in 25 files (69.69s Vitest runtime). After final declaration/control ownership cleanup, the final full run again passed all 109 tests in 25 files (66.25s Vitest runtime, 82.06s wall time for the timed Nx command), including complete test TypeScript compilation and all 10 required build dependencies. `/usr/bin/time -lp` reported maximum resident set size of 2,850,406,400 bytes for that command. Evidence: `/tmp/plan260-suite-final.log`.
- Scoped lint reports zero warnings/errors; formatting and diff checks pass. Discovery lists 25 unique specs: 23 Workerd and two Node. There are no missing relative imports or remaining imports of the deleted support modules. Evidence: `/tmp/plan260-lint-final.log`, `/tmp/plan260-format-check.log`, `/tmp/plan260-discovery-final.json`, `/tmp/plan260-pilot-runtime.log`, `/tmp/plan260-queries-alone.log` and `/tmp/plan260-publication-alone.log`.
- The runtime-cost sample during the first full run observed eight active Workerd processes totaling approximately 1.46 GiB RSS and the Vitest Node process at approximately 0.53 GiB RSS. This is a point-in-time sample, not a peak. Default Vitest scheduling completed the suite; no custom runtime manager or scheduling override was added.
- Commands used `pnpm_config_verify_deps_before_run=false` to prevent pnpm's unrelated automatic dependency reinstall. Workerd required localhost access outside the filesystem sandbox. Nx Cloud artifact uploads reported 401; local builds, compilation and tests completed successfully.

## Remaining work

None.
