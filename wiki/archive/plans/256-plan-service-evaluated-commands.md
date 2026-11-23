# Full evaluated Service commands

**Status:** Complete, 2026-10-22. Implementation and scoped verification passed.

## Agreed change

1. Replace the Service execution-packet representation with one full evaluated
   Service command, mirroring Aggregate's model: the complete admitted input,
   canonical `id`, `serviceIndex`, non-null `outcome`, `dispositionChainHash`,
   and ordered `operations`.
2. Preserve the admitted `serviceVersion`, payload, external observation,
   contract version, Service identity, Origin and producer coordinates. The
   evaluating release remains the bound VersionRepo/VersionChain context.
3. Construct the evaluated command once. Commit it as complete pending
   publication with resources/checkpoint and retain the identical value in
   ServiceVersionChain `commands`. Preserve synchronous transactions, exact
   retries, original-outcome retention, replay, projection and acknowledgement
   ownership. Keep browser-selected publication unchanged.
4. Remove packet-specific schemas, types, files, methods and reshaping, with
   no compatibility path. Update in-scope consumers, existing tests and current
   documentation. This change does not migrate the test runner or introduce a
   test harness API.
5. Changed fixed schemas require empty affected storage. No storage reset,
   translation migration or deployment is authorized or performed.

## Implementation and verification

1. Cut over shared Service history/publication schemas and Chain/projection
   consumers, then construct and recover the complete value in ServiceVersionRepo
   and validate full original input in ServiceChain acknowledgement.
2. Adapt existing verification files and fixtures in place. Prove canonical input
   retention, preservation of original `serviceVersion` during release-2 replay,
   exact mismatch rejection, lost-reply recovery, and unchanged selected output.
   Create no test, fixture, runner or configuration files.
3. Run the existing scoped Nx type/lint/test graph, including its required
   dependency builds. Never verify Explorer. Format affected files and inspect
   the final diff for obsolete executable representation names.
4. Reconcile governing ADRs, glossary, current module/architecture guidance and
   affected storage-review conclusions. Record actual verification and archive
   this plan only after all required work is complete.

## Outcome and verification

1. `IEvaluatedServiceCommand` now extends the complete encoded admitted Service
   command with `serviceIndex`, `outcome`, `dispositionChainHash` and ordered
   `operations`. Construction preserves canonical `id` and the original
   `serviceVersion`. Pending publication, permanent history, original replies
   and backend projection delivery use the same full value. Packet-specific
   runtime types, methods, files and manual field projection were removed.
2. ServiceChain original acknowledgement and VersionRepo recovery compare all
   immutable admitted fields. Restoring this release's retained evaluation does
   not repeat authored execution or outgoing work. A new parallel release binds
   its evaluating release separately and retains the original admitted version.
3. `pnpm nx run-many -t ts lint -p @zerospin/core system-worker` passed its scoped
   graph and required builds. Core lint reports 43 existing warnings, with no
   errors. After resolving two warnings in the touched Service code,
   `pnpm nx run system-worker:lint` passed with no warnings.
4. `pnpm nx run zerospin:test -- packages/system-worker/tests` passed complete
   test-program compilation and all 58 tests across three existing test files.
   The runtime scenarios cover full-input retention and mismatch rejection,
   lost publication replies and reconstruction, immutable history, original
   reply recovery and release-2 replay retaining `serviceVersion: 1`. The first
   sandboxed Vitest attempt stalled before Workerd startup; it was stopped and
   this successful run used local process/socket access. No test, fixture,
   runner or configuration files were created.
5. Current READMEs, glossary, patterns, governing ADRs, architecture and affected
   storage reviews describe the new representation. Dated historical evidence
   remains explicitly historical. Formatting, scoped obsolete-name inspection,
   semantic review and whitespace checks passed. Browser-selected publication
   remains unchanged; no storage reset, migration or deployment was performed.

Existing Workerd scenarios use trusted fixture paths and explicit activation
controls. Their results do not establish authenticated browser, real provider
or production automatic-activation journeys. Nx Cloud cache uploads were
unavailable; local verification completed successfully. Commands above used
`pnpm_config_verify_deps_before_run=false` to avoid unrelated automatic
dependency installation.

## Remaining work

None.
