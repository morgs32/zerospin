# Accepted-definition key/spec storage

**Date:** 2026-10-16

**Status:** Complete — implemented and verified 2026-10-23 under Plan 151. The parent plan remains active with its independent obligations.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [SystemRepo.acceptedDefinitions](../../reviews/storage-tables/system-repo-accepted-definitions.md). **Architecture:** [ADR 007](../../adrs/007-canonical-results-and-selected-chain-ownership.md), whose independent immutable-definition catalogue decision remains governing.

## Current agreed design

1. SystemRepo.acceptedDefinitions has exactly two required columns: unique text `key` and typed JSON `spec`. Persist neither `definition` nor a duplicate identity. Keep the canonical tagged JSON tuple format; add no parser, hash, extra index or parallel representation.
2. Retain six identity kinds: Aggregate/Service release, Aggregate/Service Actor and Aggregate/Service Agent. Release keys retain owner name/version. Actor keys retain owner name and Actor name/version, excluding the enclosing release version. Agent keys retain owner name/version and Agent name, with no independent Agent version. The kind distinguishes Aggregate from Service ownership.
3. Keep complete current projected specs: release Actor definitions, models, contracts and nested portable schemas, selections, operations, indexes and Agent behaviors. Strict spec-only validation preserves complete overlapping branches without silent truncation and carries the complete spec union into the fixed JSON schema representation.
4. Strictly validate incoming logical `{ identity, spec }` before deriving a key or stored spec. Strictly validate requested identity before lookup, then reconstruct and strictly validate that logical envelope from caller identity and retained spec. Wrong branch/name/version, excess fields or invalid retained JSON produce `system-spec-invalid`; only an absent exact key returns undefined. The canonical key is the durable ownership association; there is no independent persisted identity/key comparison.
5. One synchronous acceptance transaction compares complete retained specs, leaves equal rows untouched and inserts unseen identities. Conflict or malformed entry rolls back every new insertion in the supplied batch. Preserve path-sensitive JSON patch diagnostics.
6. Registration requires prior equal acceptance and inserts no definitions. Complete release specs and independent Actor entries serve separate full-release and cross-release Actor-lock responsibilities. Preserve exact Agent ownership and all other scopes.
7. Accepted rows are permanent, including definitions omitted from a later candidate or left by failed promotion. No update, delete, expiry or acknowledgement lifecycle exists. Executable declarations remain in the configured System; stored specs never reconstruct callbacks. Keep activation/deployment ordering unchanged.
8. This fixed-schema cutover requires empty affected SystemRepo storage. Add no aliases, fallback decoders, migration or automatic reset. No existing-store reset, deployment, publication or commit is authorized here. Other table reviews and Plans 221/222 remain independent.

## Superseded descriptions and reused evidence

[Plan 255](255-plan-typed-system-service-reads.md) removes Service query registries. Current Service specs retain models, contracts and Actors; strict acceptance and retained reads must reject `queries`, including `{}`. Earlier lossless-query assertions are superseded, not compatibility requirements.

[Plan 249](249-plan-aggregate-agent-backend-node.md) and Plan 151 replace the old System-level versioned Agent identity with owner-bound Aggregate/Service Agent identities. The old five-identity description and independent Agent version are superseded. Freeze projected Agent meaning under the retained owner release.

[Plan 257](257-plan-direct-system-worker-verifications.md) retires the earlier acceptance runner. Current direct production-class Workerd specs prove successful SystemRepo acceptance during setup and initialized Repo/alarm behavior, but do not by themselves establish catalogue immutability, rejection or rollback. Extend only the existing `repo-lifecycle.workerd.spec.ts` using its existing `servicePublicationConfig` declarations and stock cloudflare:test controls. Create no test/fixture/runner/configuration files or fixture API.

The original source-only review and implementation deliberately deferred all checks. The maintainer's current request ends that deferral for this bounded verification. Historical assertion edits and source conclusions are not passing runtime evidence.

## Required verification

1. Prove the actual SQL two-column shape, required fields and sole key uniqueness, with no old `definition` column. Roundtrip every projected entry from the current authored fixture, including all six identity scopes and nested declaration facts. Check the table-owned spec codec and complete fixed JSON schema representation.
2. Prove exact canonical identity lookup, full-spec retention and strict caller-bound reconstruction. Exercise malformed requested/incoming identity/spec relationships at their owning boundaries; exercise explicitly required retained JSON/shape rejection without treating corruption as absence. Reject removed Service queries through the actual public acceptance method before writes.
3. Make equal reacceptance fail if it attempts INSERT/UPDATE/DELETE, then prove equal acceptance succeeds and preserves bytes. Omit accepted definitions in a later candidate and reconstruct SystemRepo to prove permanent retention rather than dependence on current candidate contents.
4. Insert a valid unseen identity before a later conflict or malformed entry; prove synchronous rollback of the complete batch. Assert a concrete nested mismatch path. Prove both Aggregate and Service Actor versions remain locked across owner release versions, while unchanged reuse succeeds.
5. Prove registration refuses unseen or mismatched definitions without accepting them or writing Repo metadata. An equal accepted bundle can register without rewriting catalogue rows. Reuse existing initialized production-Repo evidence for activation; do not add a new activation protocol or claim authenticated SystemApi/provider coverage.
6. Run scoped Nx test typing, required dependency builds, affected Workerd tests and the System Worker suite, plus scoped lint and formatting. Never verify Explorer. Preserve unrelated WIP and compare the fresh 398-module production baseline under `/private/tmp/plan220-verification-before`; distinguish source preservation from physical storage evidence.
7. Reconcile SystemRepo/module documentation, the affected catalogue sections/citations in AuthoredSystem/SystemApi, glossary, local lifecycle guidance, governing ADR 007, the finding and Plan 151. Refresh only affected source provenance; do not reopen unrelated architecture or purpose reviews. Obtain independent review and resolve findings before further reviews.
8. Record actual results and proof limits. Set Remaining work to None and archive this same filename with inbound/relative links repaired only after required checks pass. Keep Plan 151 and ADR 007 active.

## Verification — 2026-10-23

Four cases extend only the existing lifecycle spec; its original alarm case is preserved. All **five focused cases pass**, followed by all **92 System Worker tests across 25 files**, test TypeScript compilation and required dependency builds. Test-local Cloudflare.GlobalProps supplies stock typed `exports.SystemRepo` access without a new fixture API, worker, configuration, dependency or production namespace change.

The cases prove the exact two-required-column SQL shape and sole key uniqueness; all six current identities and complete nested specs through the actual reader, table codec and generated JSON Schema; no INSERT/UPDATE/DELETE on equal acceptance or successful registration; omission retention after actual reconstruction; strict public query-registry rejection and caller-bound retained corruption/name/version/owner checks; exact-key absence; whole-batch rollback and a concrete nested JSON patch; both Aggregate and Service Actor rejection and unchanged reuse across owner releases; and require-only registration before metadata writes. Corruption fixtures restore exact retained JSON bytes.

**Implemented finding:** the first runtime run exposed an unconstrained `{}` JSON Schema export. Effect's canonical JSON conversion replaced the Unknown root and lost the original refinement metadata. AcceptedDefinitionSpecSchema now starts with Schema.Record(Schema.String, Schema.Unknown), preserving all object fields and the complete union representation while retaining the existing strict predicate. The generated document now rejects an empty object and accepts every current fixture spec; full-value retention is proved separately through actual stored-row decoding and reads. No fallback, cast, custom codec or duplicate schema is introduced.

Independent implementation review found no remaining correction. Exactly **one of 398 captured production modules changes**: AcceptedDefinitionSchema.ts; the other 397 remain byte-identical. This is source preservation, not proof of unchanged physical storage. Actual SQL assertions establish the catalogue shape; other SystemRepo table declarations remain unchanged. Existing rows/stores and unrelated WIP are preserved; stock cloudflare:test resets affect only disposable verification storage.

**Proof limits:** Actual exported SystemRepo loopback RPCs and stock Workerd inspection exercise production acceptance, read and require-only registration against disposable SQLite. They do not establish secret-key/provider authentication, ticket issuance/consumption, complete deployment/promotion behavior, deployed activation or broader Plan 222 registration guarantees. Omission and reconstruction prove retained catalogue rows without claiming a real deployment. Plans 221/222 and the other Plan 151 groups remain independent.

System Worker lint passes with zero errors and the one existing unrelated curly warning. Scoped Nx formatting/format checks and whitespace checks pass. The final type-only import cleanup passes typing and all five focused cases again. All 664 scoped local links, 42 source line ranges and 14 affected catalogue source hashes/ranges validate. SystemRepo documentation, the current finding, governing ADR 007, affected architecture sections, glossary, local guidance and Plan 151 are reconciled. The original alarm test body remains byte-identical. This plan is archived with inbound and relative links repaired.

## Remaining work

None for this bounded accepted-definition catalogue implementation and verification. Plan 151, Plans 221/222 and ADR 007 retain their independent responsibilities.
