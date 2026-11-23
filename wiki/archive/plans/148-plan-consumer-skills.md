# Zerospin consumer skills

Source README paths below are historical inventory. Their [pre-consolidation snapshot](https://github.com/morgs32/zerospin/tree/79c1824b1a0353f770211851c0bfe1cc54d0ba46/packages) remains available; current documentation lives in [Fragment](../../../docs/README.md) and [architecture](../../architecture/AuthoredSystem.md).

**Date:** 2026-10-13  
**Status:** All seven skills authored and verified; pilot distribution complete; plan archived.

**Source revision:** `acb025e5634af283891db89de700326ee34291be` on clean `main` before these documentation edits.  
**Discovery and pilot versions:** `@zerospin/sdk`, `@zerospin/browser`, and `@zerospin/react` were investigated at `9.0.0`.  
**Distribution at authoring completion:** Published `9.0.1` contained the pilot. The seven-skill source set was validated against its APIs before the subsequent `9.0.2` release.

## Agreed scope and boundaries

1. Author the seven-skill design. The original batch wrote only `zerospin-author-feature`; the maintainer has now authorized the remaining six entries. The published `9.0.1` release still contains only the pilot; this authoring batch prepares the complete source skill set without another publication or consumer upgrade.
2. Skills guide application authors through decisions, ordered steps, and completion checks using supported public imports. Read internals for evidence; do not teach contributor tooling policy or copy internal imports from examples. `@zerospin/sdk/browser` belongs to the SDK package.
3. Use a flat tree with one owning public package per task. Keep genuine prerequisites and conditional detail accessible without unconditional `requires`, a router, duplicated guidance, API catalogues, or speculative failure quotas. Aim for bodies around 250 words, retaining necessary constraints.
4. Keep the reusable [discovery prompt](../../skills.md) separate from this design record. The original pilot batch did not configure distribution; the subsequent batch shipped the pilot and installed the pinned loader in Red Rope. This batch writes the other six skills and includes browser/React skills in their owning packages' publication allowlists and discovery metadata. Create no Intent maintainer setup, three-artifact registration set, CI, new tests/fixtures/runners, or additional skills.
5. The pilot merges models, ordinary contracts, named operations, results/failures, exact owner releases, `makeSystem`, and `makeConfig` because they form one feature-authoring task. Declaration evolution, authorization, external work, session lifetime, command submission, and React ownership remain independently useful tasks.

| Domain                    | Consumer tasks                                                              |
| ------------------------- | --------------------------------------------------------------------------- |
| `domain-authoring`        | Author a feature; evolve declarations and release/session bindings.         |
| `authorization`           | Derive identity from verified claims; project reads and guard writes.       |
| `server-work`             | Adapt checked client evaluation and perform durable external continuations. |
| `application-integration` | Own browser sessions; submit commands; integrate React.                     |

## Current external-work behavior

1. [Plan 147](147-plan-author-owned-external-retries.md) is implemented, verified, and archived; [ADR 011](../../adrs/011-author-owned-external-request-retries.md) governs retries. External-work authoring has no outstanding framework retry blocker.
2. Authors classify failures, bound attempts, and schedule retries inside `external.request`. `timeoutMs` still bounds the complete request invocation, including retry waits, with a 30-second default. A committed `producerFailure` is terminal; it emits no continuation and does not revise the originating command's result.
3. The first committed response or failure wins. Response recording and child enqueue share a synchronous transaction; failure recording is a separate synchronous transaction. Alarms recover original production only while neither outcome is recorded. Process loss before recording may repeat provider work, so authors must supply business idempotency or reconciliation. Recorded-response delivery recovery does not repeat the request.
4. Current [factories](../../../packages/core/src/contracts/make/makeAggregateExternalContract.ts), [runtime](../../../packages/system-worker/src/asyncOperations/makeAsyncOperations.ts), and [producer schema](../../../packages/system-worker/src/asyncOperations/asyncOperationsDbConfig.ts) retain no `retryDelayMs` or `nextRunAt`. Teach the current design, without removed fields or compatibility paths. [Contracts](https://github.com/morgs32/zerospin/blob/79c1824b1a0353f770211851c0bfe1cc54d0ba46/packages/core/src/contracts/README.md) and [async operations](../../../packages/system-worker/src/asyncOperations/README.md) document addressed continuation authority and frozen producer evidence.

## Implemented package-local tree

`package` is repository-relative; `path` is relative to that package. Frontmatter `name` equals `slug`. Sources locate evidence. Verification fields distinguish authored-guidance checks from unexecuted application/runtime routes. References are bundled files with explicit reading conditions.

```yaml
skills:
  - slug: zerospin-author-feature
    status: pilot-published
    domain: domain-authoring
    package: packages/sdk
    path: skills/zerospin-author-feature/SKILL.md
    description: >-
      Use when adding models or ordinary commands to a Zerospin application, choosing
      aggregate versus service ownership, or registering a feature in a System. External
      provider workflows and browser/React session setup are separate tasks.
    purpose: Define owned data and typed ordinary commands with exact release registrations.
    imports: ['@zerospin/sdk', '@zerospin/sdk/browser', effect]
    references: [references/ordinary-feature.md]
    sources:
      - packages/sdk/src/index.ts
      - packages/sdk/src/browser/index.ts
      - packages/core/src/contracts/README.md
      - packages/core/src/models/make/makeModelVersion.ts
      - packages/core/src/system/make/makeSystem/makeSystem.ts
      - examples/tic-tac-toe/src/contracts/createGameV1.ts
    completion: The ordinary contract uses exact owner models and named operations, returns its declared result, and is registered through its actor, owner release, existing session and system configuration.
    verification: Pilot structural and Intent validation, scoped formatting/local links, bundled example typechecking and independent read-only use passed. Existing application/runtime routes are source evidence, not executions in this pilot batch.

  - slug: zerospin-evolve-declarations
    status: authored-verified
    domain: domain-authoring
    package: packages/sdk
    path: skills/zerospin-evolve-declarations/SKILL.md
    description: >-
      Use when changing existing Zerospin model, command payload, or actor declarations
      and updating exact owner release and browser session bindings.
    purpose: Evolve canonical declarations while preserving intentional history and exact release bindings.
    imports: ['@zerospin/sdk', '@zerospin/sdk/browser', '@zerospin/browser']
    references: [references/declaration-evolution.md]
    sources:
      - packages/core/src/models/make/makeModelVersion.ts
      - packages/core/src/contracts/make/upgradeAggregateContractVersion.ts
      - packages/core/src/contracts/make/upgradeServiceContractVersion.ts
      - packages/core/src/aggregateActor/updateAggregateActorVersion.ts
      - packages/browser/src/sessionRelease/makeAggregateBrowserRelease.ts
    completion: New declarations and exact bindings agree; intentional payload lineage and physical storage work follow the governing application policy.
    verification: Structural/Intent validation, two-module example typechecking and independent evolution/authorization walkthrough passed. Existing application checks remain available; no fresh evolution runtime test was executed.
    reference_candidates:
      - topic: Declaration lineage and fixed schemas
        read_when: Changing historical declaration relationships or a persisted fixed schema.

  - slug: zerospin-authorize-actors
    status: authored-verified
    domain: authorization
    package: packages/sdk
    path: skills/zerospin-authorize-actors/SKILL.md
    description: >-
      Use when defining Zerospin actor authentication, admission authorization, selected
      read exposure, or authoritative write guards for application users.
    purpose: Keep verified claims, read visibility, admission and canonical write policy in their owning boundaries.
    imports: ['@zerospin/sdk']
    references: [references/admission-and-visibility.md]
    sources:
      - packages/core/src/aggregateActor/README.md
      - packages/core/src/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts
      - packages/core/src/serviceActor/make/makeServiceActorVersion.ts
      - examples/shopping/src/zerospin/aggregates/user/actors/userActorV1.ts
    completion: Verified claims establish identity, selections expose only intended rows/columns, and canonical-state write refusal belongs to the appropriate guard.
    verification: Structural/Intent validation, public occurrence typechecking and independent authorization walkthrough passed. Existing Shopping checks remain available; no fresh authentication/admission runtime test was executed.

  - slug: zerospin-external-work
    status: authored-verified
    domain: server-work
    package: packages/sdk
    path: skills/zerospin-external-work/SKILL.md
    description: >-
      Use when adapting a Zerospin public contract to canonical server operations or
      adding provider requests and recorded continuations, including delivery across
      owners. Ordinary model-only commands and client submission are separate tasks.
    purpose: Record canonical server operations and finalize provider evidence through owned continuations.
    imports: ['@zerospin/sdk', '@zerospin/sdk/browser']
    references: [references/recorded-external-work.md]
    sources:
      - packages/core/src/contracts/README.md
      - packages/core/src/contracts/make/makeAggregateExternalContract.ts
      - packages/core/src/contracts/make/makeServiceExternalContract.ts
      - packages/system-worker/src/asyncOperations/makeAsyncOperations.ts
      - packages/system-worker/src/asyncOperations/asyncOperationsDbConfig.ts
      - examples/shopping/src/zerospin/services/marketplace/contracts/checkout/checkoutServerV1.ts
      - examples/shopping/src/zerospin/aggregates/user/contracts/asyncProcessPaymentV1.ts
      - wiki/adrs/011-author-owned-external-request-retries.md
    completion: The receiving release registers the exact external declaration; adapters re-record canonical operations; recorded evidence drives the continuation with authored retry/idempotency policy.
    verification: Structural/Intent validation, complete backend example typechecking and independent checkout/payment walkthrough passed. Existing contained continuation routes remain available; no real provider or crash-process evaluation was executed.
  - slug: zerospin-browser-sessions
    status: authored-verified
    domain: application-integration
    package: packages/browser
    path: skills/zerospin-browser-sessions/SKILL.md
    description: >-
      Use when constructing, initializing, disposing, or signing out a Zerospin browser
      session, choosing its fixed instance inputs, or wiring its SharedWorker.
    purpose: Bind an authored release to an independent live instance and own its identity, readiness, and shutdown.
    imports: ['@zerospin/browser']
    references: [references/instance-inputs-and-worker.md]
    sources:
      - packages/browser/src/index.ts
      - packages/browser/src/makeBrowserSession/README.md
      - packages/browser/src/makeBrowserSession/makeBrowserSession.ts
      - packages/browser/src/sessionLifecycle/makeSessionLifetimeExecution.ts
    completion: The live instance uses the intended immutable identity, is initialized before domain use, and closes its owned resources before replacement or sign-out.
    verification: Structural/Intent validation, Vite worker example typechecking and independent connected-editor walkthrough passed. Existing application checks remain available; no fresh browser lifecycle runtime test was executed.
  - slug: zerospin-submit-commands
    status: authored-verified
    domain: application-integration
    package: packages/sdk
    path: skills/zerospin-submit-commands/SKILL.md
    description: >-
      Use when validating or staging Zerospin aggregate or service session commands,
      tracking their returned identities, or handling optimistic, admission, execution
      and later external outcomes. Session construction and contract authoring are
      separate tasks.
    purpose: Submit ordinary session commands and distinguish each completion and failure boundary.
    imports: ['@zerospin/sdk/browser', '@zerospin/browser']
    references: [references/completion-boundaries.md]
    sources:
      - packages/sdk/src/browser/index.ts
      - packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts
      - packages/core/src/serviceSession/stageServiceSessionCommand.ts
      - packages/browser/src/makeBrowserSession/README.md
      - wiki/adrs/003-immutable-node-command-history-and-submission-order.md
    completion: Callers distinguish validation, local commit, uncertain service handoff, durable acceptance, canonical execution and later external completion without inventing a new transport occurrence.
    verification: Structural/Intent validation and independent service/aggregate submission walkthrough passed. Existing application/SQLite routes remain available; no fresh browser confirmation/failure runtime test was executed.
  - slug: zerospin-react
    status: authored-verified
    domain: application-integration
    package: packages/react
    path: skills/zerospin-react/SKILL.md
    description: >-
      Use when mounting a Zerospin React session initializer, reading claims or live
      queries, changing session identity, or cleaning up its mounted owner.
    purpose: Connect makeReactApp, keyed session ownership, Suspense, and live reads through the supported React API.
    imports: ['@zerospin/react', '@zerospin/browser']
    sources:
      - packages/react/README.md
      - packages/react/src/index.ts
      - packages/react/src/makeReactApp/makeReactApp.tsx
      - packages/react/src/useLiveQuery.ts
      - examples/shopping/src/routes/_app._authenticated.tsx
    completion: Each keyed initializer owns one instance; live reads use the initialized context/Suspense boundary; replacement and unmount clean up the owned session.
    verification: Structural/Intent validation and independent mounted-owner/query wiring walkthrough passed. Existing application checks remain available; no mounted React runtime test was executed.
```

## Pilot implementation and checks

1. Author only the SDK pilot with narrow activation text, verified `9.0.0` metadata and source references. Keep browser-safe ordinary declarations separate from backend owner/system registration. Preserve exact model ownership, named recording operations, guard/read scope, result validation, and failure atomicity.
2. The pilot batch created only the files below. `+` means create; the other six paths were planning entries at that point.

```text
zerospin/
├── wiki/plans/148-plan-consumer-skills.md +
└── packages/sdk/skills/zerospin-author-feature/
    ├── SKILL.md +
    └── references/ordinary-feature.md +
```

3. Run the existing structural validator on the pilot, scoped Markdown formatting/link validation, and an independent read-only realistic feature-authoring walkthrough. Inspect the resulting guidance against public exports and an existing example. Report these checks separately; a walkthrough is not a fresh consumer implementation or runtime evaluation. Create no new test artifacts.
4. Reconcile this plan with the resulting pilot and verification evidence. Retain existing domain terminology; no new glossary term or qualifying architecture decision is introduced, so no glossary/ADR edits are needed. Keep the six future entries proposed and unapproved for authoring.

## Pilot outcome and verification

1. Added the approximately 250-word SDK skill and one bundled ordinary-feature reference. Pinned GitHub source URLs returned 404, so the example travels with the skill instead of depending on unavailable repository links.
2. `quick_validate.py packages/sdk/skills/zerospin-author-feature` passed. Intent `0.5.5` validation of `packages/sdk/skills` passed for the original pilot. Its warnings concerned the then-unconfigured dependency, discovery keyword and package publishing allowlist; that batch made no setup or publication change.
3. Scoped Oxfmt and local link/source-path checks passed. The proposed tree has seven unique entries and references the actual pilot files. The two bundled TypeScript examples compiled together against workspace package declarations using an in-memory compiler host, without creating files or emitting output.
4. An independent agent used the pilot to propose an ordinary `resetGame` command in the existing Tic Tac Toe feature, without editing the example. The rehearsal exposed missing session registration and ambiguous additional owner policy; both were clarified, and reassessment found no blocking authoring ambiguity. The reference distinguishes anonymous game identity from account authentication. Pending opponent work across resets remains application-specific behavior, outside this pilot's claims.
5. Fresh consumer implementation, application build and runtime evaluation were not performed or required for this documentation pilot. The walkthrough and compiler checks do not establish application behavior. No new tests, fixtures, runners or configuration were created.

## Approved distribution batch

1. Include `skills` in the SDK's publishing allowlist, add its monorepo repository metadata and recommended `tanstack-intent` keyword, and align `metadata.library_version` with the released SDK. Preserve the bundled reference so loading needs no private GitHub access. No JavaScript API or export changes are required.
2. Use the repository's existing fixed release group and local registry publication path. Preview the release and SDK payload, build the required packages, and publish the next patch release only after those checks pass. Record the actual version and registry; local publication is not public npm publication.
3. Upgrade Red Rope's exact Zerospin package versions together. Preserve unrelated consumer WIP and the existing system-worker patch contents while updating its version binding. Install `@tanstack/intent@0.5.5` as a pinned root development dependency and allow the SDK package through `intent.skills`.
4. Run `pnpm exec intent install` with the saved permission policy. Keep the existing agent guidance outside Intent's managed block. List the available skill and load `@zerospin/sdk#zerospin-author-feature` from the consuming workspace package; verify the installed version, package path, complete reference payload, and generated installed-runner instruction.
5. Run the existing scoped consumer integration check and document its result separately from loader verification. The proof establishes packaged guidance and working discovery/loading; it does not establish future agent activation or an implemented application feature. Reconcile this plan and the [distribution research](../../research/versioned-consumer-skills.md) with actual evidence.

Primary files below use `~` for modify. The normal fixed release also updates the other release-group manifests and generated version/changelog records.

```text
zerospin/
├── README.md ~
├── packages/sdk/
│   ├── package.json ~
│   └── skills/zerospin-author-feature/SKILL.md ~
└── wiki/
    ├── plans/148-plan-consumer-skills.md ~
    └── research/versioned-consumer-skills.md ~
redropeparking/
├── AGENTS.md ~
├── package.json ~
├── pnpm-lock.yaml ~
└── apps/
    ├── admin/package.json ~
    ├── web/package.json ~
    └── zerospin/package.json ~
```

## Distribution outcome and verification

1. The release preview and actual release passed. All 19 fixed-group package manifests are `9.0.1`; the root lockfile did not change because their links remain workspace dependencies. The required explicit Nx `lib` graph passed for 18 projects; `server-only` has no `lib` task.
2. Actual `pnpm pack` produced `zerospin-sdk-9.0.1.tgz`. It contains the pilot `SKILL.md`, bundled reference, compiled root/browser JavaScript and declarations, SDK repository directory metadata, and concrete `9.0.1` core/error/shapes dependency versions. Both bundled Markdown files match the source byte for byte.
3. Structural validation and pinned Intent `0.5.5` validation with `--check` passed. The only Intent warning is the absent producer Intent development dependency: validation uses the cached pinned checker rather than adding maintainer infrastructure. Scoped formatting and `git diff --check` passed.
4. The actual Nx publication graph passed for all 19 projects to `http://127.0.0.1:4873/` with the `latest` tag. Independent registry queries confirmed all 19 records and `latest` tags at `9.0.1`. The downloaded SDK tarball contains the compiled browser entrypoint, concrete `9.0.1` dependencies, and both Markdown files matching source byte for byte. This is local Verdaccio publication only; no public npm publication, Git commit, or push occurred.
5. Changelog formatting was reconciled and the scoped formatting check passed. Red Rope installed pinned Intent `0.5.5`. Its managed `AGENTS.md` block uses `pnpm exec intent` without a download fallback; existing guidance outside the block was verified preserved.
6. Intent list/load JSON from both Red Rope's root and `apps/zerospin` reports the one permitted SDK pilot at `9.0.1`, without warnings or conflicts. Both installed Markdown files match the producer source byte for byte; loaded reference links resolve to absolute paths inside the installed SDK. This verifies installed discovery and loading, rather than relying on root discovery alone.
7. The existing `ts` graph passed for Red Rope's `zerospin`, `web`, and `admin` projects. An independent audit found all 30 preexisting dirty/untracked files outside the six owned metadata files byte-identical, including the system-worker patch. Structural comparisons of all four manifests contain exactly the approved release pins, Intent pin/permission, and patch version binding.
8. The final lockfile semantic audit preserved all 2,757 prior independent non-Zerospin package records and 2,833 snapshots exactly, plus unrelated importer pins, settings/overrides, and the patch hash/path. Incidental lockfile churn was removed; frozen installation passed with resolution skipped.
9. Against that final lockfile, the `zerospin`, `web`, and `admin` TypeScript graph passed using valid existing Nx cache, and the web/admin build graph executed and passed. Generated admin `next-env` changes were restored. The final WIP audit retained the exact initial dirty-file inventory and byte-identical contents for all 30 unowned dirty/untracked files; consumer `git diff --check` passed.
10. The pilot distribution batch has no pending required checks. That publication contained one pilot and configured one consumer; the remaining six skills were authorized subsequently.

## Remaining-six authoring batch

1. Refresh each task against current public exports, types, guides, examples and relevant existing checks. Preserve the settled flat tree and package ownership. Record source/docs contradictions; implemented behavior governs the instructions.
2. Write the six package-local skills with `9.0.1` API metadata, concise bodies and discriminating activation descriptions. Bundle substantial conditional detail with explicit reading conditions. Do not duplicate the pilot or cross-link outside a published package for indispensable guidance.
3. Make the browser and React package payloads include their owned skills and repository discovery metadata. Preserve existing runtime exports, release versions, prior WIP and Red Rope configuration.
4. Run structural and pinned Intent validation, scoped formatting, reference/public-import checks, pack previews and independent read-only consumer walkthroughs. Do not create test files or claim that documentation checks prove runtime behavior.
5. Reconcile the tree and source refresh findings with the verified files. Archive this plan after these authoring checks pass. A new published release and consumer upgrade are separate work, outside this batch.

`+` means create; `~` means modify:

```text
zerospin/
├── packages/sdk/skills/
│   ├── zerospin-evolve-declarations/ +
│   ├── zerospin-authorize-actors/ +
│   ├── zerospin-external-work/ +
│   └── zerospin-submit-commands/ +
├── packages/browser/
│   ├── package.json ~
│   └── skills/zerospin-browser-sessions/ +
├── packages/react/
│   ├── package.json ~
│   └── skills/zerospin-react/ +
└── wiki/plans/148-plan-consumer-skills.md ~
```

## Remaining-six outcome and verification

1. Authored four additional SDK skills, one browser skill and one React skill, with five conditional references. The complete source tree has seven skills. New bodies are 237–259 words; each skill owns one consumer task, has a discriminating description and uses supported public imports.
2. API evidence remains the `9.0.1` source/declarations. Main advanced during authoring to `5cb6dd36ad8a79f6d9ed4b6fc35197111d642b66`, committing earlier release/docs and some in-progress skill work without changing runtime APIs. That commit and prior WIP were preserved. Browser/React metadata now includes skills, repository directory and discovery keyword; runtime exports and release versions are unchanged.
3. Current source resolves documentation disagreements: aggregate authentication receives requested aggregate ID plus credentials, and aggregate provisioning uses a public four-field occurrence rather than internal `makeCommand`. Model upgrades patch declarations without migrating rows; ordinary payload lineage requires `up`, while `down` is conditional. Actor map updates merge rather than revoke. These facts are taught without rewriting unrelated implementation/docs.
4. Structural validation passed for all seven skills. Intent `0.5.5 validate skills --check` passed from each owning package (SDK five, browser one, React one). Its only warnings are the intentionally absent producer Intent development dependency. Running from the workspace root cannot resolve those packages' Effect/Vite peers for virtual examples; package-local validation and separate in-memory checks resolve the actual installed dependencies.
5. Strict in-memory TypeScript checks passed for the two canonical evolution modules, public provisioning occurrence construction, complete external backend module and Vite worker entry. No emitted files, tests, fixtures or check runners were created.
6. Independent read-only walkthroughs covered declaration evolution/private authorization, external checkout/payment plus service/aggregate submission, and connected browser/React editing. Corrections now require canonical adapters in backend actor/owner registration, explain service handoff failure after local commit without a returned ID, make the pending external outcome predicate explicit, distinguish Initializer identity from query filters, and route limited-model commands to canonical adaptation. Reassessment found no remaining demonstrated blockers. These walkthroughs are not fresh runtime implementations.
7. Intent locally discovers and loads all seven at the `9.0.1` API version, with no conflicts/load warnings and resolvable bundled references. Native pack previews include all ten SDK Markdown files, two browser files and the React skill. The previews run no lifecycle scripts and publish nothing.
8. Scoped formatting, reference/source paths, package/path semantics and diff checks passed. Prior pilot/release work and runtime sources remain intact. No new domain terminology or governing architecture decision was introduced, so the glossary and ADRs remain unchanged.
9. This authoring batch completed before the separate release: published `9.0.1` contained only the pilot at that point. The maintainer subsequently authorized publication and sibling consumer updates.

## Subsequent publication

The maintainer authorized the complete release and sibling rollout. Commit `83fa67bd5ade1c9160662825b77f172165ae9e83` contains the seven skills and fixed `9.0.2` metadata. All 19 packages were published to the local registry; independent registry/tarball checks verified all seven skills and exact references. Sibling updates proceed separately from this completed authoring plan.

## Remaining work

**None** for the authorized pilot, pilot-distribution and remaining-six authoring batches.
