# Explicit aggregate and service command construction

Status: Complete — implemented and verified on 2026-10-06.

## Problem and evidence

1. [makeCommand](../../../packages/core/src/makeCommand.ts) overloads two domain operations and dispatches through `'guards' in owner`. Its implementation makes aggregate provenance optional even though aggregate command construction requires it. The precise public promise is hidden behind an erased implementation.
2. Its authored callers are twelve Shopping service seeds and three calls in the existing core command-provenance fixture. Core also exports a flat `aggregate/make/makeAggregateCommand` assembler, used by the overloaded function and one server provisioning invocation. That helper adds provenance to a payload-validated, newly identified command; it performs no aggregate lookup or claims validation.
3. [Plan 043](043-plan-node-command-history.md) established explicit command identities and phases. [Plan 044](044-plan-aggregate-agent-sessions.md) similarly named ordinary and agent staging operations directly. Name these two construction operations by their owning domain and remove the hidden dispatch.

## Agreed public interfaces

1. Export `makeServiceCommand(service, { contractName, payload })` from core's `service/make/makeServiceCommand.ts` and the root SDK. Preserve the service overload's generic contract-name constraint and `NoInfer` payload input. Return `Effect<IServiceCommand<ICommand<selected command name, selected contract version, selected decoded payload>, SERVICE['name']>, IAnyError, CuidFactory>` with exact selected-contract inference.
2. Replace the flat interface in `aggregate/make/makeAggregateCommand.ts` with `makeAggregateCommand(aggregate, { contractName, actorName, claims, aggregateId, systemName, payload })`, and export it from the root SDK. Require every provenance field. Constrain `actorName` to the aggregate's actors and `contractName` to that actor's contracts; derive claims from that actor's claims schema and payload input from the selected contract using `NoInfer`.
3. Preserve the aggregate overload's return: `Effect<Extract<IAggregateCommand<ICommand<selected command name, selected contract version, selected decoded payload>, AGGREGATE['name'], SYSTEM_NAME>, { nodeId: null }>, IAnyError, CuidFactory>`. Keep `SYSTEM_NAME` a const generic. Each constructor has one checked generic implementation, with no broad overload, optional shared provenance bag, `unknown` return, new cast, or `ALLOWED_CAST`.
4. Rename the existing contract-level function and path to `contracts/make/makeCommand.ts`. It remains an internal core operation owning selected-contract payload validation/defaults/transforms and command-ID generation through `CuidFactory`. It does not select an owner, validate actor claims, or attach owner provenance, and is not a root SDK authoring function.

## Implementation

1. Put service selection and service envelope construction in `makeServiceCommand`. Derive `serviceName` and `serviceVersion` from the supplied service, retain `caller: null`, and delegate payload/ID work to `makeCommand`.
2. Put aggregate actor/contract selection, required provenance validation, claims decoding, aggregate-ID equality, and aggregate envelope construction in the owner-aware `makeAggregateCommand`. Derive aggregate and actor names/versions from their declarations. Preserve existing error codes and validation order, including malformed provenance, unknown actor/contract, invalid claims, aggregate-ID mismatch, and invalid payload. Retain `nodeId`, `pushIndex`, and `sessionName` as null for direct commands.
3. Delete the overloaded top-level `makeCommand` file and the old flat aggregate assembly implementation. Do not introduce an `assembleAggregateCommand` wrapper. Inline provenance assembly at the existing server provisioning invocation, using `makeCommand` for payload/ID construction after its existing registration, authentication, aggregate-ID, and claims checks. Preserve those checks, their errors, and ordering; do not send already decoded server claims through the public constructor for another decode. Keep encoding followed by `stageDirectAggregateCommand` followed by chain execution in the existing order.
4. Migrate the twelve Shopping seed calls to `sdk.makeServiceCommand`. Rename the existing core fixture to `commandConstruction.ts`, migrate its one service and two aggregate calls, and update its obsolete overload comment. Update core subpath exports, SDK exports, current architecture citations/examples, and all live imports in one hard cutover. Remove obsolete paths and aliases; keep archived development history intact.

## Verification

1. Extend the existing command-construction fixture at the new public constructors. Preserve complete encoded aggregate/service command checks, generated-ID behavior, null direct-command/session provenance, and the existing claims/aggregate-ID mismatch regression. Add focused cases for payload defaults/transforms and rejection of invalid payload, malformed or missing provenance, invalid claims, and unavailable actor/contract without bypassing the public validation path.
2. Add exact compile-time assertions at the same fixture for literal owner name, command name, contract version, system name, and decoded-payload types; reject invalid actor/contract names, missing aggregate provenance, wrong claims, and wrong selected payloads. Assert both Effects retain `IAnyError` and `CuidFactory`; constructors must infer correctly without explicit type arguments or casts.
3. Run the migrated fixture directly with `pnpm exec tsx src/fixtures/commandConstruction.ts` in `packages/core` after its required `lib` build; it has no Nx target. Run scoped Nx core/system-worker/Shopping `ts` and `lint`, SDK `lib`, system-worker `contract-programs:check`, and Shopping `agents:cold-check`/`agent-preview:check` with configured dependencies. Verify Shopping through its allowed cold-import and contract/runtime seams; application browser inspection is prohibited by its instructions.
4. Search live source/exports/docs for the removed overloaded API and old contract-builder path. Check formatting on changed files and `git diff --check`. Record actual results; the preceding investigation did not execute this implementation's runtime verification.

## Scope and completion

1. Keep command schemas, serialized shapes, retained command phases, ID allocation, admission/execution ownership, and server provisioning semantics unchanged. This plan changes authoring interfaces and removes redundant assembly; it does not redesign sessions, authentication, async delivery, storage, or error codes. No compatibility alias or migration is permitted.
2. After implementation, reconcile affected command-authoring documentation and [the glossary](../../glossary.md) with the implemented domain names and direct-command provenance. Create an ADR only if the final decision meets all spec criteria; the interface split alone does not currently warrant one.
3. Follow the implement workflow, record completed verification and limitations, and archive this plan under `wiki/archive/plans/` with its filename intact only when implementation and required verification are complete. Repair relative and inbound links during archival.

## Completion evidence

1. Replaced the overloaded authoring API with checked generic `makeAggregateCommand` and `makeServiceCommand`, retaining exact selected-contract inference, required aggregate provenance, `NoInfer` payload inputs, `IAnyError`, and `CuidFactory`. Renamed the internal payload/ID builder to `makeCommand`; deleted superseded paths and exports without compatibility aliases or casts.
2. Migrated all twelve Shopping seed calls and public fixture calls. Server provisioning now assembles its direct command envelope after the existing registration, authentication, aggregate-ID, and claims checks, using the internal builder without another claims decode. Encoding, direct staging, and chain execution retain their established order.
3. The renamed `commandConstruction.ts` fixture passed after core library build. It checks complete encoded envelopes, direct null provenance, ID allocation, defaults/transforms, exact Effect and declaration types, public invalid inputs, and no ID allocation on failure. Core/system-worker/Shopping TypeScript and lint, SDK library build, system-worker contract programs, and Shopping cold/preview agents passed with configured dependency builds. Lint retained one existing braces warning in the unchanged Shopping test-support file; Nx Cloud's access warning (401) was non-blocking.
4. Updated current command-authoring documentation, glossary definitions, and source metadata. Live source/exports/docs contain no removed overloaded API or old contract-builder path. Changed-file formatting and `git diff --check` passed. No ADR was needed for this interface split, and unrelated concurrent work was preserved.

## Remaining work

None.
