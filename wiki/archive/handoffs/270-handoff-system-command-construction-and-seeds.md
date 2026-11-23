# Handoff: System command construction and seeds

**Date:** 2026-10-26
**Focus:** Typed administrative execution and seed programs within Plan 270.
**Status:** Completed and verified through [Plan 270](../plans/270-plan-contract-release-names-and-command-kinds.md), merged in [PR #81](https://github.com/morgs32/zerospin/pull/81). Reviewed against merged main `e9a90199a9`; all eight settled directions and five implementation items are complete.

## Completed goal

The administrative and seed migration is complete together with Plan 270's explicit owner grants. The intermediate public-factory rename and category-specific ordinary factories are superseded.

## Settled direction

1. Keep ordinary definitions/releases invocation-neutral. The same canonical release may be granted by an Actor, Agent and the owner's `system` map. `command.kind` records the actual invocation. System/Agent maps reject contracts requiring Actor claims; explicit grant membership is also required. External implementations remain distinct.
2. Replace the existing public builders with the accepted typed methods:

   ```ts
   api.executeServiceCommand(serviceRelease, { id, contractName, payload });
   api.executeAggregateCommand(aggregateRelease, {
     id,
     aggregateId,
     contractName,
     payload,
   });
   ```

   Infer inputs from `release.system`, derive immutable encoded provenance and preserve caller IDs across transport retry. Keep the complete encoded RPC transport and authoritative grant validation. Retained-command recovery still precedes fresh grant validation.

3. Keep current `ICommandOutcome` and caller-side success decoding. Automatic authored result decoding is outside this cutover. `ISystemApi` already exists as the inferred return type of `makeSystemApi`, and the SDK already exports it.
4. Shopping seeds reuse the **same `createProductV1`** as catalog Actor creation, explicitly granted through `marketplaceServiceReleaseV1.system`. Preserve its price guard and create-only behavior. No new seed action, upsert, overwrite, replacement or reset is approved.
5. The named `seeds` function accepts `ISystemApi` and returns `Effect.Effect<void, unknown, never>`. The program owns sequential execution and checks each `outcome.result`; business Failure fails the program before the next command. The CLI runs it once and reports program completion rather than an instrumented command count.
6. Give the existing twelve seed occurrences deterministic command IDs while retaining product IDs/data. Exact reruns recover the original outcomes. Changed input under the same ID conflicts; a new ID does not authorize modifying an existing product. Earlier successes remain committed if a later command fails. No automatic program retry or rollback is introduced.
7. Preserve real promotion behavior: the only caller selects promotion V1, so use its authored release directly and remove the redundant numeric version argument. Preserve the existing deterministic ID, bounded transport retry policy and reservation-result validation. Do not invent a V2 release registry.
8. The harness Service facade and existing promotion test interceptor must adopt the same generic typed method. Preserve System-only administrative eligibility; Actor/Agent harness actions use complete envelopes through `harness.push`.

## Completion review against merged main

1. Aggregate and Service releases derive one canonical execution inventory from explicit grants. Portable SystemSpecs retain required System/external maps; both Chains recover retained input before validating fresh grants. `assembleOwnerContracts` rejects conflicting declarations and ineligible claims-dependent Agent/System grants.
2. `makeSystemApi` exposes the two typed `(release, input)` methods. Internal preparation captures a frozen encoded command before transport retry and retains caller IDs. HTTP/native capability acquisition and canonical `ICommandOutcome` remain; promotion still validates its own decoded success value.
3. The CLI preserves configuration, URL, environment and Jiti loading while running the named seed program once. Shopping sequentially executes twelve stable-ID `createProductV1` occurrences, checks business Failure and preserves create-only/price guards. The CLI reports “Seed program completed” without a command count.
4. Shopping promotion retains the authored V1 release, deterministic ID, bounded retries and reservation validation. The Service harness facade and promotion interceptor use the same generic typed API; Actor/Agent harness actions use complete command inputs.
5. Both public command builders, their subpaths/exports and their exclusive internal helper are removed. Recorded `makeCommandOperation` remains. [Plan 270's verification record](../plans/270-plan-contract-release-names-and-command-kinds.md#phase-3-implementation-and-verification-2026-10-26) contains the compiler, runtime, CLI-loader and final-integration evidence. This archival review inspected current source and that record; it does not claim a new runtime test run.

## Open decisions

None for this scope. Later catalog updates or automatic typed success decoding would be separate requested work.

## Suggested skills

1. `$use-morgs32-wiki-patterns` — shared API/Effect conventions and scoped execution.
2. `$implement` — after the appropriate phase is authorized, complete migration, permitted verification and documentation.
3. `$nx-workspace` and `$nx-run-tasks` — use the resolved affected task graph with normal dependencies.
4. `$tests` — extend only meaningful existing compiler/runtime seams.

## Pointers

1. [Completed Plan 270](../plans/270-plan-contract-release-names-and-command-kinds.md)
2. [Source investigation](../../research/aggregate-command-builders-and-system-authority.md), retained historical evidence; current grant decisions are above.
3. [Typed administrative facade](../../../packages/core/src/utils/getSystemApi/makeSystemApi.ts)
4. [Administrative wire interface](../../../packages/core/src/systemApi/ISystemApiRpc.ts)
5. [Seed loader](../../../packages/cli/src/seed/seedFn.ts)
6. [Seed command UI](../../../packages/cli/src/commands/seed.tsx)
7. [Shopping seeds](../../../examples/shopping/src/zerospin/seeds.ts)
8. [Real promotion caller](../../../examples/shopping/src/zerospin/aggregates/user/contracts/utils/requestPromotionCommitment.ts)
9. [Completed Plan 271](../plans/271-plan-remove-connected-session-command-execution.md)

## Scope

This archived record closes the authorized source implementation and verification. Later catalog updates, automatic typed success decoding, publication, deployment, sibling consumer adoption and runtime-storage cutover are separate work. Plan 270 retains the precise storage-authorization gate. Ordinary staging and Node delivery remain; browser-session execution stays removed. This archival review leaves runtime storage untouched.

## Remaining work

None.

## Later identity revision

The maintainer subsequently approved the [derived command identity revision](../plans/revisions/270-plan-contract-release-names-and-command-kinds.md) in phases and stacked PRs. That revision replaces caller-selected direct System IDs and deterministic seed IDs; the completed grant/seed-program work above remains historical evidence.
