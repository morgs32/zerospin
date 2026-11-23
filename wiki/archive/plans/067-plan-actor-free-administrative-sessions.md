# 067 — Actor-free administrative sessions and explicit contract APIs

## Summary

Remove administrative dependence on application actors while preserving the existing command engine: staging, authoritative admission, guards, deduplication, async production, ordered outcomes, optimistic reconciliation, and subscriptions.

Studio sessions remain transient and bound to a registered agent declaration plus an aggregate instance. Administrative projection state remains durable and shared across sessions for that aggregate instance and exact release.

## APIs and ownership

1. Replace the neutral contract authoring methods outright:

   | Aggregate                         | Service                         |
   | --------------------------------- | ------------------------------- |
   | `defineAggregateContract`         | `defineServiceContract`         |
   | `makeAggregateContractVersion`    | `makeServiceContractVersion`    |
   | `mapAggregateContractVersion`     | `mapServiceContractVersion`     |
   | `upgradeAggregateContractVersion` | `upgradeServiceContractVersion` |
   | `makeAggregateExternalContract`   | `makeServiceExternalContract`   |

   Each method has **one signature, no overloads**. Reuse internal construction and execution routines. Remove superseded exports and import paths.

2. Definitions retain a frozen `{ name, ownerKind }` descriptor. Contract versions retain immutable ownership in their runtime metadata, specification, mappings, and lineage. Enforce matching domains in factories, actors, sessions, release registries, composed modules, and mapped external dependencies.

3. Aggregate guards, programs, mappings, and external continuation programs receive **`aggregateId: string` supplied by the framework**:

   ```ts
   const createTrackingLabelV1 = sdk.makeAggregateContractVersion(
     sdk.defineAggregateContract('createTrackingLabel'),
     {
       version: '1.0.0',
       payload: {
         purchaseId: sdk.primitives.foreignKey({ abbreviation: 'pur' }),
       },
       models: { purchase: purchaseV1 },
       result: CreateTrackingLabelResult,
       program: ({ aggregateId, payload, db, models }) =>
         /* existing program */,
     },
   );
   ```

   Service callbacks have no `aggregateId` property. Preserve their existing caller-claims behavior. External request callbacks remain payload-only; mappings freeze aggregate-derived provider keys into emitted payloads.

4. Preserve existing omission semantics for claims, guards, results, models, and failures. Missing claims declarations create no runtime schema. Verify inference with ordinary callbacks and `Effect.fn`, including omitted claims. Specialized upgrades accept only ordinary, unmapped versions; upgrade the base before mapping.

5. Preserve `makeAggregateAgentSession`, but remove `actorName`, `actorVersion`, and `claimsSchema`. Rename `makeActorDbVersion` to **`makeQueryDbVersion`**, updating application actor callers too. Keep agent selections, bindings, ordinary contracts, full aggregate SQLite, and local live queries.

## Command, projection, and recovery changes

1. **Separate provenance from projection identity.** Retain an aggregate command origin describing a real application actor, a registered agent declaration, or a direct privileged SystemApi submission. Actor origins retain actual actor identity and claims; agent origins retain `agentName`. Administrative wire data and initialized capabilities contain no fabricated claims or actor fields.

   Retain aggregate scope independently. Administrative commands freeze their exact source aggregate release; preserve the distinction between source contract lineage and `originalExecutionVersion`.

2. **Bind administrative sessions explicitly.** Add `agentName` to initialization and pass the bound `agentName`, `aggregateId`, and `nodeId` into bootstrap. Repeated initialization with the same binding is idempotent; a different active binding fails. Disposal followed by initialization creates a new producer. Reconnect preserves the binding, producer, database, and unresolved commands.

   The server derives authority from the registered declaration and issued ticket. Bind the ticket to aggregate scope, origin, session name, exact declaration lock, and producer ID. Validate repeated client fields against that binding. Keep the existing readiness contract.

3. **Replace actor-specific projection ownership.** Refactor the existing aggregate actor Repo and Chain into `AggregateProjectionRepo` and `AggregateProjectionChain`, with two explicit projection scopes: application actor view and full administrative view.

   The administrative projection key contains system, aggregate instance, and exact aggregate release; it excludes agent name, session name, producer ID, and fabricated actor path. Update routing, namespaces, fanout records, inspection APIs, exports, and Studio callers together.

   Keep projection cursors separate from each producer’s contiguous resolved prefix. Private outcomes and recovery require the complete scope, origin, session, and producer binding.

4. **Preserve applicable authority and guards.** Real actor submissions retain authentication, authorization, staging guards, recorded actor contract lineage, and both authoritative owner-guard checks. Administrative submissions resolve ordinary contracts from the exact canonical aggregate release and execute all contract guards, including the transaction recheck.

   Existing actor-indexed owner guards remain actor-specific. Do not invent an admin guard branch or synthesize identity claims. Reject administrative bindings that require claims the session cannot supply.

5. **Close the refusal gap durably.** Add nullable `stagingFailure` to the existing staging journal and delivery outbox. Persist successful stages and permanent business refusals through the same synchronous staging transaction and basis validation. A refusal retains the original command, producer position, staging position, and encoded failure, with no prepared operations.

   Retries and duplicates recover the first persisted decision without reevaluation, new positions, or duplicate delivery records. Infrastructure uncertainty retries delivery; malformed requests and protocol conflicts retain their existing error behavior.

   Add a server-only staged-admission entrypoint that runs existing admission validation and retention. A saved refusal becomes `admission.failed` with a real aggregate index. Existing execution publishes `execution.skipped` and an ordinary ordered final outcome. Remove synthetic unindexed failure receipts and early staging resolution.

   Direct execution—including application provisioning—must await retained staged admission before finalization, preventing success from racing a refused stage.

6. **Use the existing reconciliation transaction.** The page importer owns one synchronous sequence:

   ```text
   rewind all staged optimism
   → retain/apply final commands in order
   → replay all unresolved staged commands in order
   → commit resources, history, inverses, and cursors together
   ```

   A retained final counterpart permanently excludes the refused command from replay. No separate rollback handler.

   Rebase once before the page’s first effective mutation. First staged acknowledgments may also change replay order and use this same mechanism. Duplicate-only pages and admission receipts do not independently rewind or settle optimism. Snapshot hydration installs a fresh baseline, resolves covered outcomes without reapplying their deltas, then replays unresolved staging once.

7. **Preserve async production and deterministic direct commands.** Retain command origin separately from the emission owner release and exact external contract name/version. Resolve continuations from that frozen emission ownership rather than treating provenance as their contract catalog.

   Original execution alone produces external work; replay only records emissions. Continuations remain independent of Studio lifetime. Preserve public external-response rejection and Shopping’s deterministic purchase command ID. Service factory specialization does not change direct service async eligibility.

8. **Cut over Shopping and Studio completely.** Delete the admin actor and `adminClaims`. Move fulfillment ownership to canonical aggregate contracts, replace claims-derived provider keys with program `aggregateId`, and remove actor dependence from purchase delivery and Studio bootstrap. Retain the snapshot’s authoritative `resolvedThrough` once, removing the duplicate bootstrap field.

## Verification

1. Extend the existing browser initialized-session check using real SQLite and controlled socket delivery. Test dependent optimism, multiple final commands in one page, a final without local staging, duplicate delivery, and a later conflicting record that rolls back the whole transaction. Observers must see only committed state.

2. Verify refusal at producer position 1 followed by successful positions 2 and 3. Exercise lost admission acknowledgments, lost final responses, reconnect before and after settlement, covered snapshot recovery, and late duplicate responses. The refused command must never regain optimism or be resubmitted after resolution.

3. Add a focused `system-worker:aggregate-administration:check` using real staging, admission, execution, and projection procedures with database-backed fixtures and controlled Repo transport. Exercise interruption after staging commit, after admission retention, and before outbox deletion; duplicate refusals; changed guard state; and delayed delivery racing direct finalization.

4. Verify declaration locks, aggregate binding, producer binding, contract allowlists, and private outcome isolation across two agent declarations and two producers sharing one administrative projection. Reject forged origins, cross-aggregate input, external responses, and incomplete recovery prefixes.

5. Verify aggregate scope propagation through browser validation/staging/replay, server staging, authoritative preparation and transaction checks, mappings, and continuations. Test domain rejection, ownership-preserving lineage, ordinary-only upgrades, and single-signature inference with and without claims.

6. Run affected library builds, typechecks, lint, browser checks, worker checks, and Studio fixture builds through Nx. Update all in-repo authoring callers, including Shopping, TicTacToe, Explorer, and fixtures. Use contract/backend verification for Shopping; preserve its prohibition on application browser testing.

## Files, conventions, and cutover

Compact hierarchy below; brace pairs expand into separate files. `+` creates, `~` modifies/refactors, `−` removes superseded public paths.

```text
zerospin/
├─ packages/core/src/
│  ├─ contracts/
│  │  ├─ + define{Aggregate,Service}Contract.ts
│  │  ├─ + make/{make,map,upgrade}{Aggregate,Service}ContractVersion.ts
│  │  ├─ + make/make{Aggregate,Service}ExternalContract.ts
│  │  ├─ ~ shared types, metadata, preparation, and execution routines
│  │  └─ − neutral public authoring entrypoints and Command string brand
│  ├─ ~ agent/, aggregateSession/, aggregateActor/, serviceActor/, system/
│  └─ ~ models/make/makeQueryDbVersion.ts
├─ packages/system-worker/
│  ├─ ~ src/AggregateProjectionRepo/ and AggregateProjectionChain/
│  ├─ ~ admission, execution, async, tickets, fanout, inspection, bindings
│  ├─ + checks/aggregate-administration.mjs
│  └─ ~ package.json and project.json
├─ packages/browser/
│  ├─ ~ agent bootstrap, initialized state, synchronization, exports
│  └─ ~ checks/initialized-session.mjs
├─ ~ packages/sdk/, packages/studio/, packages/react/, packages/cli/
├─ ~ examples/ and explorer/ affected declarations and callers
└─ wiki/
   ├─ + plans/067-plan-actor-free-administrative-sessions.md
   ├─ + patterns/typescript/explicit-domain-methods-no-overloads.ts
   └─ ~ patterns/index.md, affected guidance, glossary, architecture
```

1. Record the requested local pattern: **favor explicit domain methods with one signature each; avoid overloads**. Apply it to this refactor and touched helpers without initiating a repository-wide overload rewrite.

2. After implementation, reconcile glossary and affected documentation with the actual result. Preserve the governing async-replay and immutable-history ADRs. Add an ADR only for implemented decisions meeting the repository’s criteria; archive the plan after implementation and verification are complete.

3. Use a hard cutover with empty affected storage: no aliases, fallback decoders, translation migrations, or compatibility paths. Preserve concurrent work. Human operator authentication and the broader credential/public-admission redesign remain outside this refactor.

4. This approved plan is implemented. The explicit domain method pattern is recorded in `wiki/patterns/typescript/explicit-domain-methods-no-overloads.ts`.

## Implementation and verification record — 2026-10-08

1. Replaced neutral contract authoring APIs and query database naming throughout runtime, SDK, applications and fixtures. Ownership remains immutable through domain factories, release registries, mapped external dependencies and lineage. Aggregate callbacks receive framework aggregate scope; services retain their caller behavior. Inference fixtures cover omitted claims, Effect.fn callbacks, domain rejection and ordinary-only upgrades.
2. Implemented registered actor-free administrative sessions, shared full aggregate projections, separately retained command origin/source release, bound tickets and producer-private recovery. Removed Shopping's admin actor and claims. The Explorer schema capture and inspection graph now describe APR/APC and the new aggregate command fields.
3. Saved permanent staging refusals and delivery work in the same synchronous transaction, admitted them with real aggregate indices, and published ordered skipped final commands. Direct execution awaits retained admission. Final pages and covered snapshots reconcile optimism atomically without early settlement or duplicate replay.
4. Verified frozen async emission ownership and independently retained origin, original-only external production, replay without production lifecycle, and exact continuations. Shopping contract/backend fixtures use actual fulfillment declarations and verify paid-only tracking, frozen aggregate-derived provider keys, external responses and deterministic purchase delivery. No Shopping application browser testing ran.
5. Passed the 41-task affected Nx graph for library dependencies, typechecks, lint, browser initialized-session checks, worker administration checks and Studio preview build. The existing Storybook build configuration resolved to `nx:noop`; wired it to the installed Storybook build command, then passed the real 14-task build graph. Reran the worker check after strengthening canonical-contract allowlist rejection and reran Explorer typecheck/lint after graph/schema cleanup; both passed.
6. Browser fixtures use real SQLite and controlled socket delivery for dependent optimism, atomic multi-final pages, rollback on a late conflict, observers, position-one refusal with positions two/three succeeding, dropped acknowledgments and final commands, reconnect, covered snapshots and late duplicates. Worker fixtures use real staging, admission, execution and projection procedures with database-backed state and controlled transport, including interruption/retry around admission retention and outbox deletion, durable refusal deduplication, guard rechecks, private outcome isolation and the direct admission barrier.
7. Updated the local pattern index, glossary, Studio and async guidance, and affected architecture sequences/source hashes. Existing governing ADRs remain active; no new qualifying ADR was introduced. Scoped formatting and `git diff --check` passed.
8. Nx Cloud returned its existing access error (401) after successful local checks. Used `--skipSync` to avoid unrelated existing project-reference synchronization drift; required affected typechecks still passed. Fixed schemas and renamed Durable Object namespaces require empty affected storage. No user storage was reset, and no compatibility path or translation migration was retained.

## Remaining work

None.
