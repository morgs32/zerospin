# Named contract operations and client-first server extensions

Status: Implemented and verified on 2026-10-13; archived after required checks passed.

## Agreed behavior

1. Model operation leaves are canonical descriptors with `schema` and `make`; external contracts expose `asyncOperation`. Keep portable operation and journal shapes.
2. Declaration `operations` is a readonly named descriptor map. Programs receive matching recording methods returning Effects of void and return only their domain result. Guards receive no recording methods.
3. Derive `operationsSchema` from canonical descriptor schemas. Local aliases are authoring names, not portable operation identities. Keep exact argument types, move correlation, application services and declared failures.
4. Ordinary client contracts expose a version-specific result-only `execution` service key. Server programs must require their own client's key in their inferred Effect requirements.
5. Server maps contain additions only. After its guard succeeds, the framework evaluates the checked client once, supplies its result key, runs the server program and retains client operations followed by server additions.
6. Client/server reads use their respective declared scopes and observe pre-application state. The owner encodes the final result and applies the complete batch in its existing transaction/savepoint. Escaping failures expose no successful batch.
7. Keep fresh private collectors, existing authored-failure normalization and shared owning resource scope. Whole-command atomicity is the failure boundary; no addOperation, isolated-attempt API or custom computation model.
8. Hard-cut constructors, upgrades, SDK exports, registration, history codecs and authored consumers. Remove superseded standalone operation makers/schema factories. Preserve unrelated work and platform separation.

## Implementation

1. Implement descriptor ownership and lazy constructors using existing codecs; validate canonical descriptor identity, derive deterministic deduplicated permissions and inject recording methods.
2. Update concrete contract typing, result-only callbacks, evaluator collection, client-result services and automatic server composition.
3. Migrate registration/projection/history consumers and all examples/UI fixtures. Preserve Shopping catalog refusal, checkout quote, conditional tracking and purchase ordering; preserve TicTacToe pre-state reads and independent server result.
4. Reconcile source documentation, local patterns, architecture and glossary. Record an ADR only for an implemented decision that meets the repository's qualifying criteria.

## Planned locations

Legend: `+` create, `~` modify.

```text
zerospin/
├── wiki/plans/145-plan-named-contract-operations.md                 +
├── packages/core/src/{contracts,models,declaration,system}/        ~
├── packages/{sdk,browser,system-worker,studio}/                     ~
├── examples/{shopping,tic-tac-toe}/                                ~
├── explorer/src/zerospin/                                        ~
├── packages/core/verification/plan140.ts                           ~
├── scripts/{verify-plan140,verify-session-identity}.mjs             ~
└── wiki/{patterns,architecture,glossary.md}                        ~
```

## Verification

1. Migrate the existing inference fixture: recording argument/result/services, undeclared methods, move correlation, exact client execution requirement and historical requirements.
2. Reuse existing runtime checks for ordered fresh collectors, client execution once, resource lifetime, whole-evaluation retry, server failure, encoding refusal and atomic application rollback.
3. Verify model/async codec round trips, canonical reference restoration, inherited server codec and alias-independent portable identity. Retain history decoding through the owner model graph.
4. Run one scoped Nx build/typecheck/lint graph, existing verification scripts and relevant Workerd checks. Shopping verification uses contract/integration seams only.
5. Create no new tests, fixtures, runners or configuration; add no compatibility path or new ALLOWED_CAST.
6. Archive only after implementation and required verification finish.

## Implemented outcome

- Canonical model and external operation descriptors now own `schema` and lazy `make`. Named maps bind to fresh private recording methods; programs return the domain result, while checked evaluation returns `{ operations, result }`.
- Server construction requires the matching client's version-specific execution key in its program requirements. Evaluation preserves server-guard-first ordering, evaluates the client once, supplies only its result, scopes reads separately and prefixes checked client operations before server additions.
- Operation codecs and permission projections deduplicate canonical leaves and sort their identities without locale-dependent ordering. Derived server codecs include inherited client permissions. Portable operation, history, journal and session-lock shapes stay intact.
- Constructors, upgrades, SDK exports, external admission, examples, Studio fixtures and existing verification sources use the new API. Eight superseded maker/schema modules were removed. No compatibility paths, new tests/fixtures/runners/configuration or new `ALLOWED_CAST` were added.
- Shopping retains catalog refusal, the frozen checkout quote, conditional tracking requests and purchase-before-items-before-payment ordering. TicTacToe retains pre-application reads and its independent null server result.
- Active module READMEs, handbook/reference/guides, local patterns, architecture source metadata and glossary describe the implemented interface. No new ADR qualifies: this is a reversible pre-release authoring API change with no durable storage change.

## Verification results

- The scoped Nx graph passed 56 tasks for 11 selected projects and 19 dependency tasks: `lib`, `ts`, `tsc:typecheck` and `lint` for core, SDK, browser, system-worker, React, Studio, devtools, CLI, Shopping, TicTacToe and Explorer. Explorer's actual `typecheck` target also passed separately; Nx's inferred `tsc:typecheck` is disabled there. TicTacToe's actual `ts` target passed. Six existing Explorer UI lint warnings remain outside the changed contract declaration. Nx Cloud reported an existing access error; local tasks completed successfully.
- The strict existing `packages/core/verification/plan140.ts` inference fixture passed, including recording arguments, void results, services, undeclared-method refusal, move correlation and client-key requirements.
- Both existing runtime scripts passed: `verify-plan140.mjs` (seven contract groups) and `verify-session-identity.mjs` (three identity groups). They cover checked ordering, snapshots, codec/reference round trips, alias-independent schemas, inherited server batches, read authority, shared resource lifetime, whole-evaluation retries, server failure, result-encoding refusal, application rollback, async retention/recovery and Shopping purchase behavior.
- Existing Workerd and Workerd typing checks passed all five files and 18 tests. Workerd initially rejected global-scope randomness in execution-key construction; a per-declaration module counter removed that restriction while retaining distinct keys.
- Core/system-worker/Shopping lint and all 18 Workerd tests passed after the final locale-independent codec refinement; the seven-group runtime script passed again after dependency builds completed. Formatting checks passed for every added/modified file and `git diff --check` passed.

## Remaining work

None.
