# Preserve the selected contract through guard checks

Status: Complete — implemented and verified on 2026-10-06.

## Problem and evidence

1. [checkGuards](../../../packages/core/src/aggregateSession/checkGuards.ts) promises payload and recognized-failure types from the selected session contract, then widens the implementation to an untyped session, `string`, and `unknown`. The bound operation consequently looks the contract up again after losing that relationship.
2. [bindAggregateSession](../../../packages/core/src/aggregateSession/bindAggregateSession.ts) already passes the selected typed contract into `stage` and `validate`. Its shared `prepare` function verifies readiness and canonical contract identity before preparing payload and claims. Guard checks can use exactly that existing path.
3. An in-memory checked change to the public and bound guard-check functions produced zero TypeScript diagnostics during investigation; runtime checks were not run. [Plan 043](043-plan-node-command-history.md) also corrected `InferFailure` distribution across mixed empty/nonempty contract failure maps. This plan must preserve that correction rather than widening the result again.

## Agreed interface and implementation

1. Replace the public overload and broad implementation with one checked generic implementation, following [validateSessionCommand](../../../packages/core/src/aggregateSession/validateSessionCommand.ts). Keep `{ session, contractName, payload }`, constrain the command name to the session's contracts, and derive payload input and recognized failures from that selected contract.
2. Make `IBoundOperations.checkGuards` generic in `CONTRACT extends IContract`, accepting the same command properties plus `contract: CONTRACT | undefined`, and returning `IRecognizedFailure<InferFailure<CONTRACT>> | null`. Make `checkBoundAggregateSessionGuards` generic in the definition and contract name, select the typed contract from `session.definition.contracts`, and pass it into the bound operation as staging and validation do.
3. Remove the guard operation's separate contract lookup. Pass the supplied contract to `settle` and pass the unchanged command properties into shared `prepare`; continue running `runContractGuard` with prepared input and the bound database. Retain `prepare`'s canonical identity comparison. Intentionally correct guard behavior after the exposed session definition is replaced: reject its missing or foreign contract with `contract-not-found`, matching staging and validation, rather than silently evaluating the captured declaration's original guard.
4. Preserve deferred `Effect.sync` execution, synchronous runtime evaluation, readiness/current-session failures, failure encoding/recognition, and `null` on success. A guard check must not evaluate the contract program, apply mutations, consume command IDs, notify staging observers, or hand off delivery. Add no assertions, `ALLOWED_CAST`, overload, or compatibility path.

## Verification

1. Extend [AggregateStaging](../../../packages/react/tests/AggregateStaging.spec.ts) at its existing public `checkGuards` seam. Reuse the actual bound session/runtime/database fixture and its unchanged-state assertions; do not create a second binding harness.
2. Exercise one reusable guard-check Effect before binding, after binding, and after release. Preserve existing uninitialized-store and non-current-session cases. Verify success returns `null`; a declared guard rejection returns its precise transformed failure, encodes/recognizes it once, and leaves database rows, metadata, allocations, staging notifications, and handoffs unchanged.
3. Extend the existing exposed-definition replacement case to guard checks: replace `session.definition` after binding so its selected contract is missing or is a same-named foreign object, while the binding retains its canonical declaration. Require `contract-not-found` without invoking the foreign guard. Verify prepared defaults/transforms and cloned claims still reach the canonical guard, and a suspended guard retains the synchronous-program rejection behavior.
4. Add exact compile-time checks through the same fixture for literal contract payloads and recognized failures, invalid command names/payloads, and a union of contracts with empty and declared failure maps. Verify the declared failure survives that union and that the public Effect requires no new services or error channel. Preserve the existing `InferFailure` and `InferFailureJson` distribution definitions.
5. Run `pnpm nx run @zerospin/core:ts`, `pnpm nx run @zerospin/core:lint`, `pnpm nx run @zerospin/react:ts`, `pnpm nx run @zerospin/react:lint`, and `pnpm nx run @zerospin/react:test`. Run `pnpm nx run @zerospin/browser:ts` and `pnpm nx run @zerospin/browser:agent-preview:check` for the binding owner shared with canonical agents. Use configured dependency builds without overlapping task graphs; check formatting on changed files and `git diff --check`. Record actual results separately from planning diagnostics.

## Scope and completion

1. Limit source changes to the public guard-check seam and its typed path through existing aggregate binding. Other binding overloads, service sessions, failure-codec design, staging/replay architecture, durable ownership, and storage schemas remain outside this plan.
2. After implementation, reconcile directly affected documentation and [the glossary's guard definition](../../glossary.md#guard) with actual behavior, editing only where necessary. Create an ADR only for an implemented decision meeting all spec criteria; no new domain concept or durable protocol decision is currently proposed.
3. Follow the implement workflow, record completed verification and any remaining limitations in this plan, and move it to `wiki/archive/plans/` with its filename intact only when implementation and required checks are complete. Repair relative and inbound links during archival.

## Completion evidence

1. Removed the public guard overload and broad implementation, retained the selected contract through the generic bound operation, and reused canonical identity validation and input preparation.
2. Extended the existing aggregate staging fixture with reusable Effect lifecycle, missing/foreign contract identity, prepared inputs and cloned claims, exact transformed failures and codec counts, suspension rejection, and unchanged resources, metadata, allocations, observers, and handoffs. Exact type assertions cover selected payloads, failure unions, and no additional Effect services/error channel.
3. Core TypeScript/lint, React TypeScript/lint/tests (125 tests across seven files), browser TypeScript, and browser agent preview passed with configured dependency builds. Initial test-only type assertion errors were corrected and React TypeScript rerun successfully. Nx Cloud's access warning (401) was non-blocking. Changed-file formatting and `git diff --check` passed.
4. Reconciled the glossary guard entry and checked affected lifecycle documentation and callers. No ADR is warranted for this interface correction.

## Remaining work

None.
