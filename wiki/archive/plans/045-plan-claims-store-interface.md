# Claims hook through its observable store

Status: Complete — implemented and verified on 2026-10-06.

## Problem and evidence

1. [useClaims](../../../packages/react/src/useClaims.ts) has separate aggregate and service overloads, but its implementation reads only `session.store.subscribe` and `session.store.getState`. It erases claims to `unknown` while making an owner-specific type promise that the body cannot check.
2. [Plan 044](044-plan-aggregate-agent-sessions.md) introduced canonical aggregate agent sessions with their own observable state. The hook's actual capability already fits ordinary aggregate, service, and agent stores; requiring full ordinary session types conceals that fact.
3. Shopping has two existing callers, in ProductList and ShoppingCartSidebar. An in-memory checked generic passed precise aggregate, service, and canonical agent claims inference during investigation. This is feasibility evidence; runtime verification remains required after implementation.

## Agreed interface and implementation

1. Replace both overload declarations and the erased implementation with one checked `useClaims<CLAIMS>` implementation. Its argument remains named `session` and requires only a `store` with `subscribe(listener: () => void): () => void` and `getState(): { isInitialized: boolean; claims: CLAIMS | null }`. Describe this capability inline; do not introduce another exported session or store abstraction.
2. Keep `useSyncExternalStore`, with identical client and server snapshots: return published claims when `isInitialized` is true and `null` otherwise. Preserve the existing `session-not-initialized` error code and message when the snapshot is `null`. Keep the inferred return precise and non-null without assertions, overloads, or `ALLOWED_CAST`.
3. Remove the now-unused aggregate/service session type imports. Preserve the public name, package export, call syntax, and initialization-gate contract. Ordinary aggregate, service, and canonical agent sessions must work directly; existing Shopping calls require no casts, wrappers, or explicit generic arguments.

## Verification

1. Use the existing React Happy DOM and Testing Library setup for a small hook fixture. Verify published claims render, a store publication updates the render, unmount releases the subscription, and unpublished state throws the existing error. Exercise the server snapshot through React server rendering so its readiness and claims behavior remains identical.
2. Add compile-time assertions under React's existing test/typecheck configuration for ordinary aggregate, service, and canonical aggregate agent session declarations with distinct claims shapes. Use `tsafe` `Equals` against explicit expected claims types; include a nested or transformed field such as `Date`, and verify that no `null`, `unknown`, or owner-type union appears in the result. A minimal structural store must also be accepted without unrelated session capabilities.
3. Run `pnpm nx run @zerospin/react:ts`, `pnpm nx run @zerospin/react:lint`, `pnpm nx run @zerospin/react:test`, and `pnpm nx run shopping:ts` with their configured dependency builds, without overlapping task graphs. Run Shopping lint only if its files change. Check formatting on changed files and `git diff --check`. Record actual results; the investigation's virtual checks do not count as completed implementation verification.

## Scope and completion

1. Limit changes to the hook, its focused inference/lifecycle coverage, and directly affected documentation. Keep claims publication, authentication, initialization/disposal gates, session representations, and persistence unchanged. No compatibility overload, new hook, schema change, or broader session refactor is needed.
2. After implementation, reconcile affected React documentation and [the glossary](../../glossary.md) with the implemented meaning of published session claims, editing only if existing wording requires it. Create an ADR only for an implemented decision meeting all spec criteria; this reversible interface cleanup does not currently warrant one.
3. Follow the implement workflow, record completed verification and any remaining limitations in this plan, and move it to `wiki/archive/plans/` with its filename intact only when implementation and required checks are complete. Repair relative and inbound links during archival.

## Completion evidence

1. Replaced the erased owner overloads with the checked generic observable-store interface, preserving client/server readiness snapshots and the existing initialization error.
2. Added exact claims inference assertions for aggregate, service, canonical aggregate agent, and structural stores, including decoded `Date` fields. Added eight runtime cases covering publications, cleanup, and client/server unpublished states.
3. React TypeScript, React lint, React tests (120 tests across seven files), and Shopping TypeScript passed with configured dependency builds. Nx Cloud returned a non-blocking access warning (401); all local commands exited successfully. Changed-file formatting and `git diff --check` passed.
4. Updated the React README and glossary. No ADR is warranted for this reversible capability cleanup.

## Remaining work

None.
