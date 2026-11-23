# 296 — Migrate QRK's SystemRepo catalog in place

**Status:** Complete. The in-place catalog migration and App promotion passed
live verification on November 10, 2026. The maintainer explicitly skipped the
isolated Workerd rehearsal before authorizing deployment.

Keep the Cloudflare Worker `qrk-zerospin`, its existing routes and bindings,
`sys_qrk_sh_1`, and all 21 Durable Object namespace IDs. Convert only
SystemRepo's accepted catalog. Keep the original accepted spec and its hash in
the same SystemRepo object. Preserve the registry authored in QRK, Clerk
accounts, uploads, API storage, secrets, and the other SystemRepo tables.

## Evidence and decisions

1. Live Worker `495cfbd0-1a34-4e14-832d-88ad2630a765` runs 39.0.0. The
   read-only Cloudflare inventory found no objects in the 20 child namespaces
   and one stored SystemRepo object. Its `repos` and `aggregates` were empty.
   Its one accepted spec selects `user@9` and contains 2,677,931 UTF-8 bytes.
   The stored hash is
   `84319b88954d1e6f68a08c7538a4f680dcda4a0cafbea3892e3650f2bef37d20`.
   The current 43.1.1 schema rejects the stored body. These are observations,
   not permanent assumptions. [Owner Chain reuse research](../../research/qrk-production-owner-chain-reuse.md)
2. Keep the existing active `acceptedSystemSpecs` format and immutability
   checks. Build a normalized historical baseline from the old spec, not from
   the incoming V9/V10 bundle. Simply accepting the incoming spec would skip
   comparison with production's accepted declarations. Replacing the Worker,
   assigning a new System ID, or renaming or deleting classes does not solve
   this requirement.
3. Scope conversion to this one reviewed legacy row. Use the existing SQL
   migration ledger for the provenance table, and a SystemRepo-owned
   activation transaction for the data conversion. The shared migration
   runner takes SQL strings. Keep its interface, the administrative RPCs, and
   normal SystemSpec acceptance as they are. Retain the provenance table and
   its ledger entry in subsequent builds so the upgraded database can reopen.

## Phase 1 — Derive and review the conversion

1. Read the exact production row via the existing authenticated inspection
   capability. Keep the raw SQLite `spec` text and row hash in a private
   temporary fixture. Record the SHA-256 of the raw UTF-8 bytes separately from
   the legacy spec's canonical content hash. Never substitute JSON reserialization
   for the captured raw text. Keep production credentials out of the fixture,
   the migration input, logs, and tracked files.
2. Validate the row with the published 39.0.0 schema and canonical hash
   implementation. Check the row hash, embedded hash, and recomputed hash
   agree. Decode strictly. Inventory all accepted model, contract, Actor,
   Agent, and release facts and their references.
3. Use the 39.0.0 and current SystemSpec projectors and schemas as the mapping
   authority. Hoist complete model, Actor, and Agent descriptors into their
   owner-local version registries. Keep the existing contract version
   registry and lineage, and turn embedded model and operation bindings into
   exact references. Check duplicate facts for equality. Preserve Actor
   projection limits, grants, selections, contract schemas, canonical
   selection, and the historical release map. For a compact legacy
   descriptor, recover complete facts only from other validated historical
   descriptors or independently attested historical declarations. If a
   required fact is absent or ambiguous, stop and report it.
4. Strictly validate the normalized historical spec against the current
   schema and recompute its content hash. Record which fields were relocated
   or represented differently, and verify that accepted immutable facts
   survive. Run the actual acceptance transaction on a local copy with this
   baseline and the intended QRK candidate. A conflict at the same accepted
   version blocks this plan. Do not adjust canonical selection, remove
   releases, or overwrite definitions to make the check pass.
5. Prepare a private migration input scoped to the reviewed QRK System ID,
   old row hash, old raw-byte digest, normalized historical spec and hash,
   and rehearsed candidate SystemSpec hash. Include only the normalized spec
   and attestations in the migration-capable Worker artifact. Do not embed
   the original production row in committed code or add an RPC that accepts
   caller-supplied conversion data.

## Phase 2 — Install the catalog in the same object

1. Add `legacyAcceptedSystemSpecs` with the original hash as a unique key,
   the original raw spec as text, the raw-byte digest, and the normalized
   hash. Append a SystemRepo migration ledger entry for this DDL. Copy text
   inside SQLite or bind it as a value. The observed row is below Cloudflare's
   8 MB row limit but above its 100 KB SQL statement limit.
   [Durable Object SQLite limits](https://developers.cloudflare.com/durable-objects/platform/limits/#sql-storage-limits)
2. Run the data step from SystemRepo activation after the ledger/schema gate
   and before serving events. Only a deployment with the reviewed migration
   input can run it. Check the addressed system ID, empty `repos` and
   `aggregates` for an unmigrated catalog, exactly one active row, exact
   expected row hash and raw-byte digest, strict normalized decoding, and
   both normalized and candidate hashes. Refuse unexpected state and leave
   the original active row in place.
3. In one synchronous SQLite transaction, write the original hash and
   unmodified text to provenance and replace the active legacy row with its
   normalized baseline. Read back and verify both. An interrupted DDL-only
   step leaves the old data intact. A data-step failure rolls back both writes.
   An already-applied activation verifies the provenance and normalized
   baseline and returns without changing either, including after ordinary
   candidate acceptance adds more rows.
4. Use the existing authenticated `acceptSystemSpec` and `initialize` calls
   after conversion. Verify acceptance against the converted historical
   baseline. Keep `repos`, `aggregates`, and `sessionWebSocketTickets` intact
   during migration. Ordinary runtime activity after acceptance may write to
   them. Do not alter the 20 child schemas or bindings.

For example, the observed row moves from the active catalog into provenance
without changing its bytes. The newly active historical row has the normalized
body and its own hash. Only then can ordinary acceptance record a separate
candidate row.

```text
Before conversion:  acceptedSystemSpecs       [39 hash → raw V9 spec]
After conversion:   legacyAcceptedSystemSpecs [39 hash → same raw V9 spec + normalized hash]
                    acceptedSystemSpecs       [normalized hash → historical V9 spec]
After acceptance:   acceptedSystemSpecs       [historical V9 baseline, reviewed V9/V10 candidate]
```

## Phase 3 — Local rehearsal (skipped by request)

1. Use the existing SystemRepo Workerd lifecycle suite and an isolated
   temporary SQLite state. Reproduce the 39 SystemRepo table graph and
   migration ledger using the published 39 runtime or verify an equivalent
   fixture against that runtime. Seed the exact captured row. Reopen the
   same object with the candidate build under Workerd. Keep the pre-rehearsal
   local fixture available to repeat the test. Use no live bindings.
2. Demonstrate the old row is rejected before the conversion, then run the
   conversion and prove raw-byte identity, both hashes, unchanged other
   tables, candidate acceptance, initialization, and a second cold reopen.
   Change an accepted same-version fact in a local candidate and show normal
   acceptance rejects it. Also verify failure for a wrong source digest,
   unexpected catalog rows or child registrations, and interruption after
   DDL or inside the data transaction. Run the existing `repo-lifecycle`
   Workerd project and QRK backend checks. Exercise one fresh V10 session
   against isolated local state with the repository's existing development
   flow if browser acceptance is needed for the go/no-go evidence.
3. Record the old and new hashes, candidate hash, byte comparison, untouched
   table checks, test results, and startup timing. Record the exact Worker
   artifact and preflight steps for later production approval. After
   implementation, reconcile the glossary and document the implemented
   storage decision if it warrants an ADR. Keep the plan open through
   the agreed verification. This phase was skipped for the current review.

## Later production gate

1. Before the first durable write, use the serving Worker’s read-only
   inspection path to recheck the Worker and system IDs, all 21 bindings,
   the object inventory, and the live source row’s hash and raw-byte digest.
   Verify the normalized historical baseline and compare its immutable
   declaration facts against the exact candidate. On drift or incompatibility,
   report the failed check or conflicting declaration and version. The serving
   Worker, original row, schema, and migration ledger must remain usable and
   unchanged. The raw-byte check protects the reviewed source and archived
   copy. The declaration comparison determines candidate compatibility.
2. The current review artifact runs its data guard after the ledger and DDL
   gate. It cannot serve as this read-only preflight. Do not call staged
   acceptance against the candidate with live bindings until the read-only
   check passes and the cutover is authorized. Fence writes for the cutover,
   recheck the attested source at the write boundary, and keep the App on
   the serving deployment until the upgraded backend is ready.
3. A rejected preflight needs no recovery procedure. After a migration commits,
   an older Worker may reject the new ledger or catalog. Plan any later
   restoration separately if returning to that Worker is required.
4. Use only an in-place Worker version change with identical class exports,
   routes, and namespace bindings. Verify the executing Worker version,
   provenance and normalized hashes, acceptance and initialization, all
   namespace IDs, and the protected bindings before promoting the matching
   App and running smoke checks. Do not execute this phase as part of the
   local rehearsal.

`+` creates a file. `~` modifies a file. The private fixture and migration
input are outside the tracked tree.

```text
zerospin/
├── packages/system-worker/
│   ├── src/SystemRepo/
│   │   ├── ~ SystemRepo.ts
│   │   ├── ~ systemRepoDbConfig.ts
│   │   └── + migrateAcceptedSystemSpec.ts
├── scripts/
│   └── + prepare-qrk-systemrepo-catalog-migration.mjs
└── wiki/plans/
    └── + 296-plan-qrk-systemrepo-catalog-migration.md
```

## Implementation evidence

1. Privately captured the exact 2,677,931-byte raw spec via the existing
   read-only RPC. Its raw SHA-256 is
   `c6c83ec246ba696d9d4db082aa993c42de06d137c75e1975f3421ac50cffc776`.
   Published 39.0.0 validation and canonical content hashing passed.
2. The offline converter verified historical descriptors and overlapping
   immutable facts against QRK `f8f2917ea`. The normalized hash is
   `8c92755a8e72704590aea28fd33dfa0716510d6e502b493538bda5eccc042f28`.
   The candidate hash is
   `c49bfc30fb8fe4bed05c38d065ee879daa96ad4c20baeaa4662502211a654f45`.
   Regenerating the manifest produced identical bytes. A deliberately
   changed accepted Actor at the same version was rejected offline.
3. SystemRepo migration 1 adds the provenance table. Only the private
   deployment config overlay supplies `acceptedSystemSpecMigration`.
   Activation checks that input and copies the original SQLite TEXT value
   into provenance before replacing the active row in one transaction.
   Normal acceptance still compares against the normalized V9 baseline.
4. Scoped TypeScript, formatting and lint passed. Wrangler dry-run packaging
   produced the source review bundle under
   `/private/tmp/qrk-296-review.uHnMR3/qrk-zerospin-review.bundle`, with
   SHA-256 `36c9ca78f1cee2f160d085cfe23687d139339710d25b39fb1f854b58b925dc50`.
   The config matches the existing Worker, System ID, routes and all 21
   class bindings. The raw production spec was kept private and excluded
   from the bundle. Build and offline checks did not activate a Durable
   Object or exercise the transaction, retry, or recovery at runtime.
5. No production storage, deployments, routes, credentials, or registry
   entries were changed.

## Production verification

1. Before upload, the live Worker, all 21 namespace IDs, and the raw accepted
   spec digest matched the inspected baseline. The 20 child namespaces still
   listed zero objects. SystemRepo still contained one object.
2. Cloudflare rejected the initial upload during startup validation before
   activation because the temporary bundle had two RoutePattern instances.
   The corrected build used one shared RoutePattern dependency and passed
   Wrangler's startup check. The exact deployed module SHA-256 was
   `bf68034cb6a40de277b1f15a8f1fa8b71eb3efe191171fd98508917452f76be3`.
   No authored declarations or migration logic changed in that rebuild.
3. Worker `qrk-zerospin` activated version
   `be614407-2485-4abe-bc73-ff094e9264a9` at 100%. System ID
   `sys_qrk_sh_1`, all 21 namespace IDs, and all binding names and types
   matched the previous version. No namespace lifecycle changes were applied.
4. Live administrative inspection verified that the provenance row's raw
   spec is identical to the captured original, including its SHA-256. The
   normalized V9 baseline validated and rehashed. Ordinary acceptance
   recorded the reviewed V9/V10 candidate, leaving two active catalog rows.
   Initialization succeeded and the administrative healthcheck returned healthy.
5. Vercel promoted `dpl_EoPKiMAkHmod2jqAPZwvQ7UkpBTc` to `app.qrk.sh`.
   The public shell, sign-in, service worker, SharedWorker and SQLite WASM
   returned HTTP 200. The V10 capability reached credential validation and
   correctly rejected malformed credentials without calling Clerk. No
   authenticated browser write was exercised. The API stayed on its existing
   version and its upload preflight returned HTTP 204.

## Remaining work

None.

## Follow-up preflight before durable writes

`SystemApi.acceptSystemSpec` checks a migration-configured candidate against the
reviewed historical baseline before addressing SystemRepo. SystemRepo checks the
stored catalog before any schema or migration ledger write. The migration uses
the same immutable declaration comparison as ordinary acceptance. The read-only
check reports the conflicting owner, declaration and version, or identifies the
source condition that failed. A digest mismatch includes the expected and actual
SHA-256. The data transaction rechecks the reviewed source and copies its exact
SQLite text to provenance. A push without migration input rejects an unreadable
legacy catalog before applying migration 1.

The Workerd Repo lifecycle tests cover declaration, source digest, and missing
migration input rejections. They verify the archive table is absent, the ledger
and accepted row retain their original values, and a corrected push archives the
original text. The native System API suite also passes. These are local checks.
