# First-class aggregate agent sessions

## Summary

Replace the ordinary-session wrapper with a canonical `IAggregateAgentSession`, constructed by `makeAggregateAgentSession`. System registers the supplied object directly, preserving identity and precise types.

## Canonical model and public APIs

1. Define `IAggregateAgentSession` independently of `IAggregateSession`. It directly owns aggregate/actor identity, claims schema, authored database, captured selections, agent contracts, observable state, connection, typed runtime, and `initialize`/`dispose`.
2. Keep `db` as the authored actor-style database; initialized memory SQLite belongs in observable state. Derive models from `db.models`.
3. Keep each `contracts[name]` entry as `{ contractVersion, model, bind }`. Expose validated captured selections through `selections[name]`. Remove `.definition`, `contractBindings`, and the authored/captured selection duplication.
4. Remove the unused inherited `makeId`, `onInitialized`, and `onStageFailure` methods.
5. Provide `stageAggregateAgentCommand({ session, contractName, payload })`. Rename ordinary `stageCommand` to `stageAggregateCommand`, updating exports and callers. Preserve synchronous staging outcomes, typed payloads, results, and recognized failures.
6. Use one checked generic constructor implementation. Preserve literal identities, model types, selected row types, contract types, and runtime services without a broad overload or `unknown` return.

## Construction, registration, and execution

1. Replace `makeAgentSessionDefinition` with construction-time validation and capture directly within the first-class construction path. Freeze declaration containers while preserving canonical model and contract identities.
2. Make `makeSystem` accept and retain canonical sessions: `system.agents.items === items`. Preserve each entry's inferred type. Validate registered aggregate/actor versions, claims, canonical models, permitted contracts, bindings, and capture provenance without rebuilding declarations or accessing the browser runtime.
3. Share transactional execution, journal, replay, snapshot, and lock primitives through explicit declaration data and contract lookup. Avoid constructing an ordinary-session facade or retaining a second normalized registry.
4. Add constructor input `layer`, optional when programs and guards need only framework-provided services and required otherwise. Check supplied services against inferred requirements.
5. Acquire application services during initialization, awaiting asynchronous layer acquisition before synchronous database work. Reconnect reuses the mounted runtime; disposal releases its services and SQLite. Fence late initialization work and clean up partial acquisition failures.
6. Preserve Studio-owned lifetime, optimistic staging, authoritative reconciliation, recovery, and synchronous program/guard execution. Agent sessions remain transient and browser-safe.
7. Serialize manifest contracts as `{ contractVersion: descriptor, modelName, bind }`. Remove manifest `contractBindings`; update its schema and consumers. Update Studio, broker lock construction, fixtures, Shopping declarations, and package exports in one hard cutover.

## Verification and completion

1. Extend declaration fixtures to verify precise inference, invalid selections/bindings, missing or insufficient application layers, cold construction, canonical registration identity, and manifest round trips.
2. Extend the Browser fixture to cover scoped and asynchronous layer acquisition, initialization failure/disposal races, release exactly once, reinitialization, reconnect reuse, synchronous staging, replay, and rejection of suspended programs.
3. Run existing ordinary staging regressions after the helper rename. Verify Studio row forms and live selections through its independent fixture; verify Shopping through cold-import and contract/runtime seams.
4. Use scoped Nx checks for touched packages and consumers, including existing core/browser `agent-preview:check`, React tests, Studio checks, and Shopping `agents:cold-check` and `agent-preview:check`.
5. Preserve concurrent work and leave ordinary session representation outside this refactor. Remove superseded exports and paths without compatibility aliases; do not add `ALLOWED_CAST`.
6. After implementation, reconcile affected docs and the existing glossary. Create an ADR only if the implemented decision meets the spec skill's criteria. Archive this plan after implementation and required verification are complete.

## Implementation and verification

1. Implemented the frozen canonical `IAggregateAgentSession` and checked `makeAggregateAgentSession` constructor. The authored database, captured selections, and `{ contractVersion, model, bind }` entries retain canonical identities and precise declaration types. Observable state exposes the initialized SQLite execution capability with precise models and claims; it does not duplicate the authored declaration. Removed the ordinary-session wrapper and superseded constructors, schemas, exports, and binding registries.
2. System retains the supplied registration map and sessions without accessing browser runtime getters. Construction and registration validate exact declarations, claims, models, contract permissions, row bindings, and database/claims capture provenance. Manifest contracts round-trip as `{ contractVersion: descriptor, modelName, bind }`.
3. Shared binding, snapshot, replay, journal, and lock primitives resolve declarations directly. The ordinary public helper is `stageAggregateCommand`; canonical agents use `stageAggregateAgentCommand`. Application layers are checked against inferred program and guard requirements, acquire before SQLite work, remain mounted across reconnects, and release once on disposal or failed initialization. Scoped synchronous evaluation rejects suspended programs before transactional application.
4. The final scoped Nx graph passed `ts`, `lint`, `test`, `agent-preview:check`, `agents:cold-check`, `preview:build`, and `agent-rpc:check` for core, browser, React, Studio, Shopping, and system-worker, with required dependency tasks. React passed 112 tests across six files. Core declaration/type/manifest fixtures, browser service-lifetime/replay/synchronization fixtures, Studio production RPC and preview build, and Shopping cold-import/authoritative checkout/fulfillment fixtures passed. Nx Cloud reported a non-blocking access error; local checks succeeded.
5. The independent Studio UI fixture passed live and relational selections, model-specific row forms, Date/JSON bindings, preserved drafts with changing live bindings, guard rejection, all-bound submission, optimistic staging and authoritative confirmation, selection changes, and disposal. Its temporary harness, server, and browser tab were removed. Shopping was verified only through its permitted cold-import and contract/runtime seams.
6. Updated the glossary, Studio/React documentation, ordinary staging patterns, and affected architecture workflows. Formatting passed for 54 in-scope files. Five architecture documents passed current-link, source-range, source-hash, and sequence/annotation validation; seven broken links already present in HEAD were excluded from this scoped reconciliation. No new ADR was warranted: this reversible declaration/API refactor preserves the existing durable protocol and persistence boundaries.
7. An additional tic-tac-toe typecheck remains blocked by missing `computerOperations`, `computerOperatorV1`, `computerTurn`, and `playOV1` modules already referenced in HEAD. Its staging caller was renamed, but repairing that unrelated example was excluded from the required six-project suite. The existing ShoppingProvidersTest lint warning remains. Concurrent command-history work was preserved.

## Remaining work

None. Implemented and verified on October 6, 2026; archived after the required checks passed.
