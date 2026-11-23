# Plan 259: Shared programs with canonical-only command operations

Status: Complete on 2026-10-23 in [PR 62](https://github.com/morgs32/zerospin/pull/62), branch `codex/shared-program-command-operations`, isolated from committed main `340e00acd7908936e44284d44e9a560c8435e019`. Consumer cutover: [Mentor Mailbox Plan 022](../../../../mentormailbox/wiki/plans/022-plan-shared-program-command-cutover.md).

## Problem and agreed behavior

1. A Zerospin contract has one program. The same ordinary aggregate or service program records its model operations, command operations, and external operations during optimistic evaluation and canonical execution. Remove the public-program/server-adapter split; do not replace it with a client predictor, canonical callback, or execution-mode branch in application programs.
2. Browser evaluation validates the emitted operations and applies only model operations. It neither allocates destination command IDs nor dispatches commands or provider requests. Its result remains a staging observation; canonical results remain authoritative.
3. Only original canonical execution prepares complete destination commands and external requests. The owning transaction retains the local model output, encoded result/outcome, and complete ordered outgoing intents together. Existing Chains deliver those retained intents after commit. Failure retains no successful output or dispatchable work.
4. Replay, additional parallel releases, selected projections, optimistic rebasing, and retry recovery do not create fresh outbound work or allocate fresh destination IDs. Recorded delivery retries reuse the original frozen command. Durable admission is not destination execution success.
5. Delete aggregate/service contract adapters, ServerContract classes/types, execution tags, dual-evaluation plumbing, and all authored `*Server` wrappers in this repository. Preserve real external request/continuation implementations and their distinct recorded authority.
6. Preserve actor-visible ordinary reads, owner guards, selected-row privacy, synchronous evaluation, operation ordering, result/failure contracts, and existing parallel-model ownership. This change does not grant ordinary actor commands canonical private reads or add read-your-writes evaluation.

## Pre-implementation evidence

1. Ordinary constructors currently accept only `IModelOperationDescriptors`; `constructContractVersion.validateOperationScope` forbids both external and command descriptors on ordinary contracts. `applyOptimisticOperationsTx` rejects either operation kind instead of omitting their application.
2. `makeCommandOperation` itself already validates and snapshots a description without dispatch. Its obstacle is its server-only import and requirement for a completed destination release. Completed releases pull actors, guards, and backend implementations into the import graph and prevent ordinary same-owner authoring.
3. `prepareAggregateOutput` and its service equivalent already separate original preparation from replay. `prepareCommandOperation` allocates the child command ID. Original outcome recording owns the existing dispatch queues. Preserve these boundaries rather than introducing another transport, queue, or event system.
4. `evaluateAggregateCommand`/service execution gives ordinary actor commands the current actor-selected graph; adapters alone receive the broader canonical database. This distinction must survive adapter removal. An internal claims-free command can read its owner's canonical models when invoked with System Origin.
5. Relevant governing records are [ADR 001](../../adrs/001-async-replay-retains-output-without-production.md), [ADR 007](../../adrs/007-canonical-results-and-selected-chain-ownership.md), [ADR 008](../../adrs/008-ordinary-and-recorded-continuation-authority.md), and [ADR 012](../../adrs/012-opaque-external-work-and-originating-chain-continuations.md). They are implementation evidence, not approval to retain adapter terminology.
6. Source packages are currently `32.0.1`; Mentor Mailbox consumes exact `32.0.0`. Both checkouts contain unrelated WIP. Inspect fresh status before implementation and isolate release inputs; never publish unrelated working-tree changes.

## Authoring design

1. Keep ordinary contract construction and its single `program`. Permit the appropriate aggregate/service operation-descriptor union, including model, command, and same-family external descriptors. Keep guards unable to emit operations. Continue strict payload/result/failure validation and synchronous transaction execution.
2. Change `makeCommandOperation` to take an existing browser-safe owner definition, explicit release version, and exact completed ordinary contract. Proposed shape:

   ```ts
   sdk.makeCommandOperation({
     destination: { aggregate: userAggregate, version: 1 },
     contract: upsertDirectMessageChannelV1,
   });
   // Service destinations use { service: organizationMembershipService, version: 1 }.
   ```

3. Do not accept completed releases through a compatibility overload. Preserve aggregate/service type distinctions, aggregate-ID requirements, typed complete destination payloads, and claims-free ordinary destination restrictions. Keep the existing portable family/name/version/contract/payload facts; serialize no executable callback.
4. Retain the exact owner definition on each completed release. At System construction, resolve its family/name/version, require the same owner-definition object and exact registered destination contract object, and reject missing registrations, wrong versions/families, claims-bearing or external destinations, and lookalike declarations. Canonical preparation resolves and checks that same binding before allocating an ID. Portable metadata describes the binding; it cannot reconstruct execution authority.
5. Export the safe owner definitions and command descriptor through the browser SDK. The destination ordinary contract may bring its pure program and schemas into the browser graph; it does not expose its rows or make it actor-callable. Existing command graphs in Shopping, service publication fixtures, and the planned Mentor Mailbox publication handlers are acyclic. Do not add lazy registries or a new definition layer for hypothetical recursive ordinary contracts.
6. External descriptors also need browser-safe authoring because ordinary programs must emit them without importing providers. Add `defineAggregateExternalContract` and `defineServiceExternalContract` declarations containing name, version, payload, response codec, and timeout. Their `.externalOperation` contains only the emission codec and immutable definition identity. Keep provider request callbacks, continuation programs/guards/models, secrets, and Layers in the backend `makeAggregateExternalContract(definition, implementation)` / service equivalent.
7. The external implementation consumes the exact pure definition; do not repeat its codecs or accept matching names as authority. Owner/System validation binds every emitted external definition to its exact same-family implementation in that owner release. Resolve pure external definitions to their exact registered implementations for actor/continuation claims checks; preserve those requirements without importing implementations into browser declarations. Preserve originating owner/release and recorded continuation authority, existing request timeout/observation handling, and frozen retry evidence. This is declaration/implementation separation for external I/O, not a second implementation of the initiating ordinary program.
8. Programs continue collecting operations before application. Reads do not see their own recorded model operations. Author command payloads from validated input and current permitted reads; where private derivation is needed, record a command operation to an explicit internal owner contract as described in Mentor Mailbox Plan 022. Do not add an implicit canonical callback.

## Implementation sequence

1. Re-run installed Intent discovery and load the local parallel-model, feature, external-work, declaration-evolution, actor-authorization, and testing guidance relevant to changed packages. Preserve root/shared patterns and the inline actor-selection rule. Do not edit installed package copies.
2. Implement browser-safe command destination references using existing owner definitions. Where examples/fixtures currently define referenced owners inline inside release constructors, extract only those definitions into pure owner-local leaf modules and reuse the exact objects. Update descriptor types, schema facts, release construction, System binding validation, canonical preparation, and portable spec projection together. Remove completed-release imports from descriptor construction while retaining exact registered capabilities at composition/execution.
3. Separate pure external declarations from backend implementations for aggregate and service families. Move `.externalOperation` authoring to the pure declaration; update canonical external binding and preparation. Ensure external continuations may themselves emit ordinary commands or more external operations through exact registered definitions.
4. Allow async descriptors in ordinary constructors and the single evaluator. In the shared optimistic application seam, validate the complete ordered batch and omit applying command/external entries. Preserve original sparse operation indexes for model application and retained output; preserve inverse-operation order and undo state (inverse records have no operationIndex field). Do not filter/reindex the batch or silently accept malformed async payloads.
5. Remove adapter factories/classes/types, `.execution` tags, `publicContract` unwrapping, adapter-only spec fields, resolver branches, and public-then-server evaluation. Simplify ordinary/external contract registration and selection around their actual declarations. Update result/failure inference and exact actor/session locks; actor-selected reads and owner guards must remain unchanged. Preserve ordinary payload-version up/down adaptation and replay refusal behavior: those payload adapters are unrelated to the ServerContract machinery being removed.
6. Cut over authored repository consumers in the same change: Shopping's `applyPromotion`, `removePromotion`, `checkout`, `createTrackingLabel`, and `updateTrackingInfo`; TicTacToe's `playX`; the receipt fixture; and aggregate/service publication fixtures. Fold recorded output into their ordinary programs, author pure external definitions where needed, register those ordinary contracts directly, and delete wrappers. Retain business results and validation; no operation re-recording loops or adapter aliases remain.
7. Preserve original-only canonical preparation, source-transaction rollback, frozen delivery retry, external observation/continuation delivery, replay/restoration, and projection behavior. Change those paths only as needed for new descriptor references and adapter removal; do not replace delivery machinery.
8. Reconcile SDK feature/external-work/parallel-model/declaration skills, relevant READMEs, contract patterns, architecture references, and glossary after behavior is implemented. Remove instructions teaching server wrappers. Record a new ADR only if the implemented change meets the repository's trade-off criteria; repair references to superseded adapter descriptions without overwriting unrelated WIP.
9. Complete framework verification, then package the fixed release group as the next breaking release, selected as `34.0.0` after `33.0.0` was occupied by a different release. Inspect pending version plans and registry contents before selecting that exact number; if it is already occupied, resolve one new exact group version and update both plans/pins together. Do not overwrite a published version. Use clean committed inputs containing only intended framework changes, inspect a release dry-run and package contents, then publish through the producer's existing release flow. Publication is a later implementation step, not part of this planning turn.
10. Verify published package exports, pure descriptor import/bundling, exact fixed-group dependencies, and bundled Intent guidance through the credential-free registry. Hand the exact release version and commit to Mentor Mailbox Plan 022. Never restore vendored/workspace links or schedule framework builds from the consumer.

## Existing verification seams

1. Extend existing test files and fixtures; do not create a new runner, configuration, or parallel harness. Run configured Nx targets, including `pnpm nx run zerospin:test`, with the producer's own Node version. Do not verify Explorer.
2. In `packages/core/tests/contracts.typecheck.ts`, turn ordinary async-operation rejection cases into accepted aggregate/service cases. Retain negative cases for wrong payload, owner family, missing aggregate ID, claims-bearing or external command destinations, wrong external-family declarations, and malformed registered bindings.
3. Extend receipt/publication cases around ordinary programs: one program evaluation, declared result/failure behavior, synchronous-only evaluation, rollback of a mixed batch, and unchanged actor-visible/private read boundaries. The existing aggregate/service-adapter-failures suites cover payload-version up/down adaptation, not ServerContract wrappers; preserve those adaptation/replay/continuation cases unchanged except necessary API edits. No new test files, fixtures, runners, or configuration are part of this plan.
4. Extend `receipt-delivery.spec.ts` through its existing SQLite transaction setup and the shared aggregate/service optimistic application and replay functions. Exercise model/command/external/model emission: model application preserves original sparse indexes, inverse/rebase behavior preserves undo order/state, and destination command IDs plus request/dispatch probes remain zero. Browser staging still allocates the initiating command ID normally. Invalid async payloads fail staging and leave no partial local model writes. Exercise both aggregate and service evaluation/replay paths through that shared seam; the resource-only DB can also exercise service staging. Do not claim that seam covers the full aggregate staging repository, which needs session tables. Actual installed-browser staging remains part of the consumer runtime evidence.
5. Extend `chain-command-delivery.workerd.spec.ts` and `servicePublicationConfig.ts`: original success retains one immutable child ID per emitted command, local failure enqueues nothing, transport retries reuse IDs, receipt eviction/restart does not recreate children, and destination refusal remains independent of source success. Include same-owner ordinary destination binding and cross-family destination commands.
6. Reuse service replay/projection/external delivery/settlement files for duplicate original retries, finalized replay, extra parallel release materialization, projection restoration, and external observation recovery. Assert zero new command IDs/provider invocations during all materialization paths. Preserve same-family/origin continuation restrictions and exact retained authority after source cleanup.
7. Build Shopping and TicTacToe with their existing seams and inspect an ordinary-program browser bundle's dependency graph. It must contain command/external emission codecs while excluding completed releases, owner/actor authentication and owner-guard graphs, provider request code, and `@zerospin/server-only`. Ordinary contract guards remain in the shared browser program. Source/typechecking alone is not browser packaging evidence.
8. Run relevant formatting, lint, typechecks, builds, and existing Node/Workerd tests once the implementation stabilizes. Record failures attributable to pre-existing WIP separately. A unit/harness pass does not establish Durable Object restart/delivery; a local Workerd pass does not establish production.

## Planned file hierarchy

Legend: `+` create; `~` modify; `~ remove` delete. Braced names denote the corresponding aggregate/service files; named existing suites remain the verification seams.

```text
zerospin/
├── packages/core/src/
│   ├── contracts/
│   │   ├── makeCommandOperation.ts                       ~ portable destination reference
│   │   ├── commandOperation{,Schema}.ts                  ~ exact reference and portable facts
│   │   ├── prepareCommandOperation.ts                   ~ exact ref resolution, original-only IDs
│   │   ├── define{Aggregate,Service}ExternalContract.ts   + pure external definitions
│   │   ├── external{Aggregate,Service}OperationDescriptor.ts ~ pure definition binding
│   │   ├── externalContract.ts                          ~ backend binding/public filtering
│   │   ├── operation{Descriptor,Schema}.ts               ~ ordinary operation unions
│   │   ├── types.ts / evaluateContract.ts               ~ one implementation/result path
│   │   └── make/
│   │       ├── constructContractVersion.ts              ~ remove adapter classes/evaluation
│   │       ├── make{Aggregate,Service}ContractVersion.ts ~ allow operation unions
│   │       ├── make{Aggregate,Service}ExternalContract.ts ~ consume pure definition
│   │       └── make{Aggregate,Service}ContractAdapter.ts ~ remove
│   ├── aggregate/make/makeAggregateRelease.ts            ~ retain owner identity; direct contracts
│   ├── service/make/makeServiceRelease.ts                ~ same binding rules
│   ├── declaration/validateActorContracts.ts             ~ direct ordinary/external validation
│   ├── system/make/makeSystem/validateCommandOperations.ts ~ exact System resolution
│   ├── sessionExecution/applyOptimisticOperationsTx.ts   ~ apply model output only
│   ├── aggregateSession/ / serviceSession/               ~ remove wrapper assumptions/lock facts
│   └── system/                                          ~ spec projection without adapter fields
├── packages/sdk/
│   ├── src/index.ts / src/browser/index.ts               ~ exports; delete adapter exports
│   └── skills/zerospin-{author-feature,external-work,parallel-models,evolve-declarations}/SKILL.md ~ guidance
├── packages/system-worker/src/
│   ├── AggregateVersionRepo/utils/                      ~ ordinary evaluation/preparation
│   ├── ServiceVersionRepo/utils/                        ~ ordinary evaluation/preparation
│   └── externalOperations/prepareExternalOperation.ts   ~ pure external-definition binding
├── packages/core/tests/
│   ├── contracts.typecheck.ts                           ~ authoring and binding cases
│   └── receipt-delivery.spec.ts                         ~ shared ordinary program
├── packages/system-worker/tests/
│   ├── support/servicePublicationConfig.ts              ~ direct programs/pure definitions
│   └── workerd/
│       ├── {aggregate,service}-adapter-failures.workerd.spec.ts ~ preserve payload-version adaptation cases
│       ├── chain-command-delivery.workerd.spec.ts        ~ original/frozen retry cases
│       └── service-{replay,projections,external-delivery,external-settlement}.workerd.spec.ts ~ gates
├── examples/shopping/src/zerospin/services/promotion/
│   ├── promotionService.ts                              + pure referenced owner definition
│   └── promotionServiceReleaseV1.ts                     ~ reuse exact definition
├── examples/shopping/src/zerospin/aggregates/user/contracts/
│   ├── {applyPromotion,removePromotion,checkout,createTrackingLabel,updateTrackingInfo}V1.ts ~ own all operations
│   ├── corresponding *ServerV1.ts                       ~ remove five
│   └── external definitions/implementations             + pure headers; ~ existing implementations
├── examples/tic-tac-toe/src/contracts/
│   ├── playXV1.ts / external declaration+implementation ~ shared ordinary program/pure header
│   └── playXServerV1.ts                                  ~ remove
├── packages/*/package.json / pnpm-lock.yaml              ~ fixed-group breaking release
└── wiki/
    ├── plans/259-plan-shared-program-command-operations.md + this plan
    ├── patterns/contracts/                              ~ post-implementation authoring rules
    ├── architecture/ / glossary.md / relevant adrs/      ~ post-implementation reconciliation
    └── archive/plans/                                   + completed plan only after all gates
```

## Scope and remaining work

1. Implementation and documentation reconciliation are complete. Current verification and release gates are recorded below. This document authorizes no work in other external consumers.
2. No compatibility factories, wrapper rebranding, alternate predictors, canonical-read escape hatches, generic CDC, new outbox, read-your-writes rewrite, or speculative recursive command registry belong in this change. Pure external definitions are required for browser packaging; ordinary contracts do not acquire duplicate definition modules.
3. Mentor Mailbox consumes the completed published release through Plan 022. Its existing Plan 021 ownership/privacy decisions remain in force; planner integration and organization–student channels are separate later phases.
4. Keep this plan active until its implementation, existing verification, and exact package handoff are complete; archive it then with recorded evidence and a link to any explicitly remaining consumer work.

## Implementation decisions

1. [ADR 020](../../adrs/020-shared-programs-and-portable-operation-declarations.md) records the implemented shared-program and exact portable binding trade-off.

## Verification evidence

1. Node `v24.13.1`, matching `.nvmrc`. The configured `pnpm nx run zerospin:test` passed all 123 tests across 33 Node/Workerd files, including test typechecking. Final verification also includes deterministic finalizer/recovery-alarm observations; the existing real timeout-failure case and production deadlines remain unchanged.
2. The fixed release group's 19 configured `lib` targets passed. Available scoped `ts`/`lint` targets passed for core, error, System Worker, System Diagrams and both examples, with pre-existing warnings outside changed files. SDK types passed through its `lib` target. All 126 changed TypeScript files have zero lint warnings/errors, and all 154 final changed files passed formatting. Nx remote-cache access reported 401; the local executions completed.
3. Shopping and TicTacToe native Vite production builds passed, including client/worker chunks, SSR and `/` prerender. Six ordinary-program browser bundles through built SDK exports contained emission codecs while excluding completed releases, actors/authentication, owner guards, providers and `@zerospin/server-only` (684 input modules in the inspected graph).
4. Source identity, actor-selected ordinary reads, owner guards, payload-version adaptation, canonical original-only preparation and recorded continuation authority were reviewed at their existing call sites. ADR 020 records the implemented boundary. Source/citation hashes in AuthoredSystem were refreshed.
5. Initial unauthenticated registry inspection found all 20 fixed-group packages at `32.0.1` with `33.0.0` unoccupied. The existing `pnpm release 33.0.0 --dry-run` selected exactly `33.0.0` for the group without writing versions.
6. A final registry recheck found `33.0.0` occupied by a different release: its core archive still contained removed adapters and omitted the new pure external definitions. No occupied version was overwritten. All 20 package slots for `34.0.0` were free, so this breaking cutover now uses exact `34.0.0`. Mentor Mailbox Plan 022 must consume that version through the handoff below.
7. Clean release-input commit `39b3b6e848bdd420f2a2f09aed073165bf3fa4be` contains the intended implementation and exact `34.0.0` metadata. Its 19 configured library builds and all 20 publish dry-runs passed. Actual publication through `pnpm nx release publish -g zerospin --registry=http://127.0.0.1:4873/ --tag=latest` published all 20 packages successfully. The worktree was clean before and after packing/publication.
8. All 20 registry archives have the same file inventory and byte-identical source/assets as the audited packs. Parsed package manifests are identical; serialization-only formatting/key-order differences in ten manifests were normalized for comparison. Registry tarball integrity/shasums and exact internal runtime, optional and peer dependencies were verified. All 20 `latest` tags resolve to `34.0.0`. The registry omitted `gitHead`, so content comparison establishes the release-input correspondence. Evidence: `/private/tmp/plan259-packages34/audit.json` and `/private/tmp/plan259-packages34/registry/comparison.json`.
9. A fresh `/private/tmp/plan259-consumer34` installed only registry packages with empty user configuration and no producer links/builds. Installed browser exports, aggregate/service command descriptors, pure external descriptors and snapshot identity passed. Its mixed aggregate/service ordinary-program browser bundle has 677 inputs (882,178 bytes), retains emission codecs, and excludes completed releases, backend provider/continuation implementations, actor authentication, owner guards and `@zerospin/server-only`. Every module realpath resolves inside the isolated consumer. All eight installed Intent skills were discovered and loaded with `library_version: '34.0.0'` and no removed wrapper APIs. Evidence: `smoke.json`, `bundle-metafile.json`, `intent-list.json`, `intent-summary.json` and `install.log` in that directory.

## Primary checkout integration

The local planning draft was preserved in commit `3461a0c812` before merging
completed upstream work from `6374372974`. This archived completion record
supersedes that draft; its original publication provenance below is unchanged.
Local System Diagrams, runtime verification, and documentation work are retained
in the integrated primary checkout. The integration does not republish `34.0.0`.

## Integrated release follow-up

The integrated primary source is retained in merge commit `bc98d5953af5a972fd324edb89fc0b1cc7bca05a`.
Clean release-input commit `275e51a134a8286c421089a02ac520c6e63170db` advances the fixed group and all eight bundled Intent skills to **`34.0.1`**.
A fresh worktree installed with `pnpm install --frozen-lockfile` on Node `24.13.1`; all 66 internal workspace links resolved inside that checkout.
The full configured `pnpm nx run zerospin:test` passed **142 tests across 33 files**, and all 19 configured library builds passed.
Version and publication dry-runs passed before all 20 unoccupied package slots were published through the existing loopback registry workflow.

The registry audit verified all 20 exact versions and `latest` tags, SHA-512 integrity and SHA-1 shasums, matching file inventories and bytes against the clean reference packs, and exact internal dependency pins.
All 1,072 packaged committed source/assets and all eight packaged skill versions match the release-input commit.
Parsed package manifests match; serialization-only differences were normalized for comparison.
No existing archive was overwritten. The original `34.0.0` provenance above remains historical evidence.
Release logs, packs and audits are retained in `/private/tmp/zerospin-integrated-release-259-evidence/`.

## Release and consumer handoff

1. Mentor Mailbox Plan 022 must now consume exact integrated fixed-group **`34.0.1`**, published from clean producer commit **`275e51a134a8286c421089a02ac520c6e63170db`**. It retains the ordinary-program cutover first published as `34.0.0` from `39b3b6e848bdd420f2a2f09aed073165bf3fa4be`, with the integrated local work described above. The credential-free producer endpoint is `http://127.0.0.1:4873/`; Plan 022 records its consumer endpoint as `http://130.0.1.1:4873/`.
2. [Mentor Mailbox Plan 022](../../../../mentormailbox/wiki/plans/022-plan-shared-program-command-cutover.md) owns its dependency/lockfile cutover and fresh authenticated/runtime verification. This framework change does not implement that consumer phase or reinterpret its prior `32.0.0` evidence. No storage was reset and no production deployment was performed.
3. [PR 62](https://github.com/morgs32/zerospin/pull/62) contains the original `34.0.0` implementation and completion record. The integrated `34.0.1` release commits remain local until a separate push is authorized. ADR 020 remains active.

## Remaining work

**Remaining work: None.**
