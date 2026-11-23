# Aggregate command preparation and retention

Status: Completed — 2026-10-10.

## Problem and agreed behavior

1. `admitAggregateCommands` combines submitted-command validation with durable retention. Its 11 successful explorer scenarios describe different preparation and retention behaviors, although every successful invocation already returns `IAdmittedAggregateCommands`.
2. Move command authority, claims, contract, and payload validation to shared preparation procedures invoked by the Chain API boundaries. Keep `admitAggregateCommands` responsible for atomic retention of an ordered prepared array.
3. Preserve one successful result: the complete admitted command array, with assigned or recovered `aggregateIndex` values in occurrence order. An empty submission returns `[]`. Admission does not mean final execution success.
4. Configuration remains owned by `makeSystem`, following [plan 093](093-plan-system-configuration-validation.md). Do not reopen its decisions or add configuration validation to preparation.
5. This plan authorizes planning only. Implementation, schema changes, public API redesign, opaque validation markers, lookup indexes, and changes to ServiceChain are outside this planning change.

## Composition and ownership

```ts
// Ordinary batch API / direct execution, using the bound Chain's db and key.
const commands = yield* prepareAggregateCommands({ db, key, commands: submitted });
const admitted = yield* admitAggregateCommands({ db, commands });

// Staged delivery: validate trusted staging evidence, then ordinary preparation.
const commands = yield* prepareStagedAggregateCommands({ db, key, commands: stages });
const admitted = yield* admitAggregateCommands({ db, commands });

// Async delivery: verify retained provenance before continuation preparation.
const commands = yield* prepareAsyncAggregateCommands({ db, key, rows });
const admitted = yield* admitAggregateCommands({ db, commands });
```

1. `db` is bound infrastructure, not submission data. Keep explicit procedure arguments rather than introducing a new session factory or service solely to achieve a literal single-argument signature.
2. Each prepared array element has `{ command, stagingFailure }`, matching the existing transaction input. Ordinary and continuation preparation supply `stagingFailure: null`; staged preparation supplies separately validated trusted evidence. Preserve the existing encoded command type and authored payload bytes. Define this shared input shape once in `AggregateChain/types.ts`.
3. The lower-level retention procedure accepts the prepared array without `key`, `trustedAsync`, a separate staging-failure map, or `System`. Aggregate address checking belongs to preparation using the bound Chain key. No trusted flag or prepared wrapper is accepted as proof of validation over RPC.
4. Keep the existing Chain RPC signatures and result envelopes. `AggregateChain.admitAggregateCommands` still receives submitted encoded commands and prepares them locally. `executeAggregateCommand` prepares its single command before retaining it. Staged and async RPC methods continue to use their existing dedicated procedures.
5. Ordinary preparation owns command structure, bound aggregate address, System name, exact release availability, actor/agent permission and version, agent aggregate/session binding, claims, scope, public async prohibition, and submitted payload validation through `checkAdmission`.
6. Staged preparation first decodes `StagedAggregateCommandSchema`, then uses ordinary preparation with its trusted staging evidence. Never accept staging refusals supplied through the ordinary RPC method.
7. Async preparation preserves acquisition through `AggregateVersionRepos`, `getPreparedAsyncCommand`, and `verifyPreparedAsyncCommand` before applying continuation kind/version, bound address, and historical actor provenance/claims checks. Keep this distinct from ordinary payload preparation; ordinary upgrade adaptation must not run for continuations.
8. Share the common bound-command preparation logic between ordinary and continuation preparation through a private helper in the preparation module. The trusted continuation choice is internal to that module, not a caller-supplied boolean accepted by retention. Do not introduce a generic validator framework.
9. Preserve existing outbox `drainAfter` lifetimes and error envelopes. Preparation and retention execute inside the existing producer hold; do not start delivery before commit. Async preparation remains outside the synchronous SQL transaction.

## Duplicate recovery and transaction requirements

1. Preserve current retry semantics: command structure, bound address, and public response prohibition are checked for every ordinary occurrence. Existing retained IDs skip current release, authority, and payload revalidation so a retry can recover retained history even when the original declarations are unavailable.
2. Preparation uses the existing retained-ID lookup and batch-local seen-ID set to avoid redundant validation. This lookup only decides which new occurrences need preparation; it is not retention evidence and does not decide duplicate equality.
3. Do not introduce suspension between the retained-ID reads and synchronous retention for the ordinary/staged preparation paths. Async provenance acquisition happens first, before this local preparation phase. Preserve the current append-only retention assumption and exact occurrence order.
4. `admitAggregateCommandsTx` remains authoritative for duplicate equality, both against previously retained rows and earlier insertions in the same batch. It recovers the original row and index or rejects changed provenance, payload, contract identity, response, or producer position.
5. Keep producer identity continuity, consecutive `pushIndex`, aggregate index allocation/exhaustion, row encoding/decoding, and all insertions in the existing synchronous transaction. No identity check is replaced with a preparation-time decision.
6. Failures anywhere in preparation retain no prefix. Transaction failures roll back every new row in that batch. Previously retained rows survive both outcomes.
7. Preserve the existing domain error codes at the applicable boundary. Preserve `aggregate-admission-failed` remapping for infrastructure/codec failures and the async wrapper's `async-admission-failed` envelope. Relocating an error must not silently change what current callers observe.
8. No fixed schema changes or translation migrations are needed.

## Explorer responsibilities

1. Keep the retention explorer focused on five successful behaviors: empty batch, ordered new retention, retained duplicate recovery, same-batch duplicate occurrence order, and separate staging-refusal evidence.
2. Retain producer gap/identity failures, duplicate mismatches, index exhaustion, and SQL/codec rollback or retained-row decoding failures in the retention explorer. Move bound address and encoded submission errors to preparation where appropriate; do not delete meaningful failure coverage merely to lower the count.
3. Ordinary preparation owns the system/actor/agent success cases and historical submitted-contract validation without adaptation. It owns the public submission, permission, claims, contract lookup, and payload rejection scenarios.
4. Async preparation owns trusted system continuations and historical actor provenance. Adapt those scenarios to provide real verified retained async evidence through the existing acquisition seam; a boolean is not a substitute for provenance verification.
5. Keep fresh scoped SQL.js storage and Systems constructed by `makeSystem`. Catalogue scenarios remain profiling inputs. Do not recreate the standalone test/check runners removed under plan 093.
6. Keep each catalogue beside the procedure it explores. Shared fixture declarations move into the existing feature-local `admissionExplorerFixture.ts` only where consumed by more than one catalogue; avoid duplicate declaration graphs or fixture factories that hide case differences.

## Planned files

Legend: `+` create, `~` modify. Paths are rooted at the repository.

```text
zerospin/
├── packages/system-worker/src/AggregateChain/
│   ├── AggregateChain.ts                                      ~
│   ├── types.ts                                              ~
│   ├── prepareAggregateCommands/
│   │   ├── prepareAggregateCommands.ts                        +
│   │   └── prepareAggregateCommands.explorer.ts               +
│   ├── prepareStagedAggregateCommands/
│   │   └── prepareStagedAggregateCommands.ts                  +
│   ├── prepareAsyncAggregateCommands/
│   │   ├── prepareAsyncAggregateCommands.ts                   +
│   │   └── prepareAsyncAggregateCommands.explorer.ts          +
│   ├── admitAggregateCommands/
│   │   ├── admitAggregateCommands.ts                          ~
│   │   ├── admitAggregateCommandsTx.ts                        ~
│   │   ├── admitAggregateCommands.explorer.ts                 ~
│   │   └── admissionExplorerFixture.ts                       ~
│   ├── admitStagedCommands/admitStagedCommands.ts              ~
│   ├── admitAsyncCommands/admitAsyncCommands.ts                ~
│   └── executeAggregateCommand/executeAggregateCommand.ts     ~
└── wiki/plans/094-plan-aggregate-command-preparation-and-retention.md +
```

1. `checkAdmission` and `verifyPreparedAsyncCommand` remain existing preparation building blocks; change them only if required by the extracted responsibility, preserving unrelated consumers.
2. Check the existence and current contents of the feature-local fixture before editing: it is open in the IDE but should not be assumed to exist in every checkout.

## Implementation and verification

1. Re-read scoped current diffs and completion evidence for plan 093. Its file still says implementation has not started despite the changed admission source; reconcile that prerequisite from current source without undoing concurrent work.
2. Extract ordinary preparation with current per-occurrence and duplicate behavior intact. Define the shared prepared-array element type and update the transaction input to use it.
3. Extract staged evidence preparation and verified async preparation using their existing schemas and acquisition services. Remove the superseded public trusted flag and staging-failure map from the retention procedure.
4. Update all four entry paths: ordinary batch RPC, direct execution, staged delivery, and async delivery. Search callers exhaustively; ensure no raw submitted command reaches internal retention. Preserve existing RPC contracts, producer holds, version result lookup, and error envelopes.
5. Reduce the retention success catalogue to the five behaviors and relocate preparation cases to the named catalogues. Review rejection cases by ownership and preserve idempotent retries against unavailable declarations.
6. Inspect resolved Nx configurations once and run the smallest available formatting, lint, source typechecking, and build tasks for system-worker and necessary dependencies through the workspace package manager. Do not add standalone verification runners or broaden into repo polish.
7. Review source for authority preservation at every entry, synchronous duplicate preparation/retention sequencing, transaction rollback, staged refusal evidence, and async provenance verification. Execute catalogues only through an existing permitted profiling workflow if available; otherwise explicitly record that behavioral execution is unverified.
8. Use `mapValues` from `es-toolkit` with `(value, key)` for record traversal. Do not add `for ... of Object.entries(...)`, compatibility paths, or `ALLOWED_CAST`.
9. After implementation, reconcile existing glossary and architecture descriptions of admission versus preparation. Create an ADR only if the implemented decision meets the repository's three qualifying criteria; no new domain concept is needed for a local prepared-array type.
10. Record verification evidence, set remaining work to None only after required checks are resolved, and archive this plan under `wiki/archive/plans/` using the implement workflow.

## Remaining work

None.

## Outcome

1. Ordinary, staged, and verified-async preparation now produce the shared ordered `{ command, stagingFailure }` input. The ordinary Chain RPC and direct execution prepare submitted commands locally; staged delivery decodes its trusted refusal evidence before ordinary preparation; async delivery acquires and verifies retained producer evidence before local continuation preparation.
2. `admitAggregateCommands` now accepts only `db` and prepared commands. Synchronous transaction retention remains authoritative for duplicate equality, producer continuity, index allocation, row codecs, insertions, and rollback. The superseded aggregate `trustedAsync` flag and staging-failure map were removed.
3. Existing producer holds and result envelopes remain in place. Async provenance acquisition stays before the original-delivery hold; its local retained-ID reads and retention execute together inside the hold. No raw submitted command reaches internal retention.
4. AggregateChain and architecture documentation now distinguish preparation from durable admission. The local prepared-array type introduced no new domain concept, and the implementation required no ADR or glossary entry.

## Verification

1. `pnpm exec oxfmt` formatted the scoped implementation and documentation files.
2. `pnpm nx run-many -t ts lint -p system-worker` passed. Its dependency graph built core and system-worker libraries and ran the system-worker source typecheck. Lint reported 30 existing warnings outside the changed preparation and retention files and no errors.
3. Exhaustive source searches found no AggregateChain `trustedAsync` or staging-failure map, no raw submitted-command retention caller, and no prohibited `Object.entries` record loop in the changed area.
4. Source review confirmed per-occurrence structure/address/public-response validation, retained-ID retry skipping, staged evidence attachment, async provenance verification, no suspension between local preparation and synchronous retention, and unchanged transaction-owned duplicate/rollback rules.
5. Behavioral explorer execution is unverified. Commit `7c5c43cc9e` removed the repository's explorer catalogues and profiling runner before this implementation, and current repository guidance explicitly prohibits recreating them as a prerequisite. No standalone runner or replacement test infrastructure was added.
