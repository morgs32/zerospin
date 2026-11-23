# Scoped Repo spec checks

**Status:** Implemented and verified, 2026-10-23.

## Agreed behavior

1. Each system-bound child Repo supplies a synchronous `requiredDeclarations({ key, system })` selector to `makeMigratableDORepo`. Its four optional declaration arrays are `aggregateReleases`, `serviceReleases`, `aggregateAgents`, and `serviceAgents`. SystemRepo and standalone configurations have no selector.
2. Before local SQL, the registration adapter projects only selected declarations into four complete JSON spec arrays and calls `SystemRepo.registerRepo({ registration, specs })`. Concrete callers never construct catalogue identities or entry envelopes.
3. SystemRepo strictly decodes the groups, derives identities, and requires prior exact full-spec equality. It never accepts new specs during registration. Repo metadata and AggregateChain membership retain their synchronous transaction.
4. Explicit `acceptSystemSpec` remains an atomic permanent first-acceptance batch with independent cross-release Actor locks. Selected release comparison includes embedded Actors, without standalone registration Actor checks. Equality freezes projected specs, not executable functions.

## Repo scopes

1. AggregateChain, ServiceChain, AggregateVersionRepo and ServiceVersionRepo select every configured release under their bound owner name; no Agents.
2. AggregateVersionChain and ServiceVersionChain select their exact release if configured; absent declarations retain existing history-only operation.
3. ActorVersionRepo and ActorVersionChain select the required exact enclosing release and preserve existing Actor identity checks. Declaration-free Actor session activation is outside scope.
4. AgentVersionRepo selects its required enclosing release and a current Agent only when family, Agent name, owner name and owner version match its physical key. Missing/re-pinned Agents preserve retained publication draining.
5. AgentVersionChain selects only its matching current Agent; absence/re-pinning preserves retained history and publication. Live capabilities require the declaration.
6. AgentNodeRepo selects the current scheduled Agent matching its family/owner name. Pending frozen command delivery fences pin replacement. Drain before declaration removal.
7. SystemRepo has no constructor acceptance prerequisite. Ticket issuance locally checks an Actor's enclosing release or an Agent's complete spec; spending a ticket does not recheck current specs.

## Implementation

1. Add the typed selector and grouped spec schema/projector; update all child factories and registration RPC callers. Keep synchronous schema construction and declaration lookup inside admission/execution transactions; add no async resolver or projection cache.
2. Remove Actor/Agent submission-permission lookup from AggregateChain and ServiceChain. Preserve Actor ingress authentication/authorization, retained capabilities and exact Origin/session/owner binding; preserve Agent Node compiled contract production and immutable pending input.
3. Preserve Chain owner/version/payload/ordinary-contract checks, producer tuples, idempotency and ordering, System's null Node metadata and non-Actor claims-bearing refusal. Keep VersionRepo Actor execution resolution, claims and guards.
4. Replace the full portable contract spec's `payloadShape` with required version-indexed `payloadShapes` covering current plus `.previous` versions, never `.next`. Keep declaration-level payload shapes and session lock formats unchanged. Update session facts and the Studio fixture through shared projection.
5. Update glossary, affected architecture/module documentation and overlapping Plan 157 requirements after code implementation. Preserve unrelated System Diagrams edits. Archive this plan only after required verification passes.

## Verification and cutover

1. Extend existing lifecycle/name/admission/Agent suites only. Prove scoped independence, missing/mutated required specs, metadata-only registration, atomic acceptance, Actor locks, historical-payload equality, ingress permissions, immutable retries, pending pin fencing and retired Agent publication reconstruction. Create no test/fixture/runner/config files.
2. Run scoped Nx builds/typechecks/lint for changed packages and affected consumers, then `pnpm nx run zerospin:test -- packages/system-worker/tests`. Never verify Explorer.
3. The portable spec format is a hard cutover requiring empty affected SystemRepo storage. No aliases, fallback decoders, migrations, resets or deployment are authorized by this plan. Operational storage reset/deployment remains separately authorized work.

## Outcome and verification

1. Implemented all sixteen child Repo selectors, grouped complete-spec registration, local ticket checks, historical payload projection and ingress-only submission permission. Removed the four unused Chain permission helpers and the unused claims path from the shared admission helper. Registration and acceptance retain their distinct transaction boundaries.
2. `pnpm nx run-many -t lib lint ts -p @zerospin/core system-worker @zerospin/studio` passed, including dependent package builds. Core's 40 and Studio's one existing lint warnings are in unchanged files; final `pnpm nx run system-worker:lint` passed without warnings.
3. The full `pnpm nx run zerospin:test -- packages/system-worker/tests` selection contains 110 tests across 25 files. Its initial run passed 105 tests and exposed one new error-label assertion and four retirement-test isolation failures. The corrected lifecycle/command-admission cases passed in the focused four-file rerun; final Agent rerun passed all 14 cases in both Agent suites. All 110 selected cases have passing evidence across these runs, with no unresolved test failures. The complete test program also compiled on each run.
4. Existing lifecycle regressions prove a real AggregateChain activates with only its own release accepted, strict scoped mismatches reject before metadata writes, and all four ticket families require acceptance before secret generation. The inline contract-lineage regression proves different historical payloads fail exact acceptance while adding a future version leaves an older spec unchanged. Existing atomic acceptance and cross-release Actor-lock assertions remain passing.
5. Agent retirement regressions reconstruct only the old VersionRepo and VersionChain, retain exact frozen publication and preserve history/resources/checkpoints while live Agent lookup is re-pinned. Their class factories keep their original immutable declaration snapshot; these scenarios establish retired publication behavior rather than simulate a new deployed module graph. All sixteen constructor selectors were separately source-audited against the approved scope matrix.
6. Updated the glossary, lifecycle pattern/module README, authored-System/SystemApi and Aggregate/Service admission workflows, and overlapping Plan 157 requirements. Changed source metadata hashes and affected citations match current code. Scoped formatting and `git diff --check` passed. No new test, fixture, runner or configuration files were created.
7. Only disposable test storage was reset by the existing Cloudflare test hooks. No application storage reset or deployment occurred. Deploying this fixed-spec format requires separately authorized empty affected SystemRepo storage.

## Remaining work

None.
