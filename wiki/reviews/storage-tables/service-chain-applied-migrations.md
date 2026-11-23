# ServiceChain.applied_migrations

**Reviewed:** 2026-10-15

**Status:** Source review complete. Retain both current columns unchanged. The common two-column cutover is already implemented in [Plan 154](../../archive/plans/154-plan-migration-ledger-storage.md); no additional service-ledger work is required.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

## Verdict and concrete owner

One immutable row represents a supported framework migration-history entry installed in this physical ServiceChain database. This is storage initialization/evolution metadata; service commands and replay do not consume it as command lifecycle state.

The database owner is `{ systemId, serviceName }`, spanning service releases. ServiceChain declares `migrations: []` and omits bootstrap, which normalizes to null. Its expected supported history therefore contains exactly one synthesized baseline entry. No service name, service release or command position belongs on this row. [Owner](../../../packages/system-worker/src/ServiceChain/serviceChainName.ts), [concrete configuration](../../../packages/system-worker/src/ServiceChain/serviceChainMigratableDORepoConfig.ts), [bootstrap normalization](../../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepoConfig.ts).

The ledger is added separately to the owner's provisioning graph by the shared lifecycle. Its physical name is reserved; it is intentionally absent from ServiceChain's authored `tables` block. [Composition and reservation](../../../packages/system-worker/src/makeMigratableDORepo/initializeMigratableSchema.ts#L43-L60).

## Every column

| Column               | Actual purpose and lifecycle                                                                                                                                                                                                                                         | Disposition                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `migrationId`        | Nonnullable integer primary key identifying and ordering the represented entry. Synthesized baseline is 0; authored entries use positive, safe, strictly increasing IDs, with gaps allowed. Written during provisioning/migration, read in ID order, then immutable. | Retain. Precise framework migration identity, independent of `serviceVersion` or `serviceIndex`. |
| `definitionChecksum` | Nonnullable lowercase SHA-256 of the exact JSON tuple `[id, name, sqlStatements]`. Written with the entry and compared against supported immutable history on initialization. Immutable.                                                                             | Retain. Detects changed migration definitions without duplicating their authored label.          |

[Physical declaration](../../../packages/system-worker/src/makeMigratableDORepo/migrationLedgerDbConfig.ts#L7-L12), [ordered reader and atomic writer](../../../packages/system-worker/src/makeMigratableDORepo/migrationLedger.ts), [definition preparation and prefix validation](../../../packages/system-worker/src/makeMigratableDORepo/migrationHistory.ts).

For this owner's current empty authored migration list, the expected row is:

```ts
{
  migrationId: 0,
  definitionChecksum: sha256(JSON.stringify([0, 'baseline', []])),
}
```

This describes declared behavior, not a sampled database. There is no stored migration name, timestamp or owner mirror left to remove.

## What the checksum proves

The definition checksum binds the migration's ID, authored name and exact ordered SQL bytes. The baseline contains no schema description and its checksum is constant across ServiceChain schema changes. It is not a checksum of service definitions, the physical graph, retained command payloads or JSON codecs. [Checksum preimage](../../../packages/system-worker/src/makeMigratableDORepo/migrationHistory.ts#L30-L44).

The physical ledger shape and complete installed graph are checked separately. A valid baseline receipt cannot authorize an old command/subscriber shape. Conversely a JSON-only semantic change may leave the SQL graph unchanged; neither baseline integrity nor graph validation proves arbitrary retained-row compatibility. The repository's explicit empty-storage hard cut remains controlling. Do not add a service release/version column, redefine the baseline hash or claim every codec change automatically refuses storage.

Both fields are necessary under the settled immutable-history protocol. The ID identifies the represented entry; the checksum detects edits to that definition. Keep complete prefix validation even though this owner currently has only baseline: a future SQL transformation can change retained data without changing the final physical graph. This is not a new proposal to expand migration policy.

## Initialization, refusal and service recovery

1. The common constructor binds the physical owner and rejects a foreign configured System. ServiceChain also supplies its Repo type and authored System; SystemRepo registration/admission precedes local schema initialization. A later local refusal can therefore leave confirmed SystemRepo registration intact. [Service class](../../../packages/system-worker/src/ServiceChain/ServiceChain.ts), [owner/activation gate](../../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts#L198-L216), [registration ordering](../../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts#L281-L309).
2. Fresh empty storage provisions the current application graph plus ledger, validates it and stamps represented history in one synchronous transaction, followed by awaited `storage.sync()`. Fresh provisioning does not run historical ALTER statements. Missing ledger with existing application objects or a bootstrap marker is refused. [Initialization](../../../packages/system-worker/src/makeMigratableDORepo/initializeMigratableSchema.ts#L75-L89), [provisioning transaction](../../../packages/system-worker/src/makeMigratableDORepo/provisionMigratableSchemaTx.ts#L19-L24).
3. Reopening validates the ledger's exact two-column physical shape and complete supported history prefix. Empty history, changed IDs/checksums, unsupported extra entries and the old four-column ledger are refused. Since ServiceChain has no pending migrations, its valid baseline then proceeds directly to validation of the current physical graph. [Ledger reader](../../../packages/system-worker/src/makeMigratableDORepo/migrationLedger.ts#L17-L25), [prefix checks](../../../packages/system-worker/src/makeMigratableDORepo/migrationHistory.ts#L57-L77), [reopen path](../../../packages/system-worker/src/makeMigratableDORepo/initializeMigratableSchema.ts#L92-L109).
4. The shared pending-migration path, if later authored, keeps SQL, its stamp and prefix validation in one transaction, with final graph validation inside the last step and `storage.sync()` after each committed step. This capability does not authorize compatibility migrations under the current hard-cut policy. [Migration transaction](../../../packages/system-worker/src/makeMigratableDORepo/applyMigratableDORepoMigrationTx.ts), [durability confirmation](../../../packages/system-worker/src/makeMigratableDORepo/initializeMigratableSchema.ts#L34-L42).
5. ServiceChain has no bootstrap callback or new bootstrap marker. Only after schema readiness does owner activation enroll/reconcile receiving service releases and arm original/replay recovery. Incoming RPCs and alarm dispatch remain behind the activation gate. The recovery registry cannot bypass an invalid ledger or graph. [Constructor sequencing](../../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts#L311-L343), [service activation](../../../packages/system-worker/src/ServiceChain/onRepoStartup/onRepoStartup.ts).

The command and replay table cutovers in Plans [157](../../archive/plans/157-plan-service-chain-command-storage.md) and [158](../../archive/plans/158-plan-service-chain-replay-subscribers.md) change those tables' representation, not this ledger's two fields. Their implementation status is tracked in each child. Preserve the shared gate and empty-affected-storage policy; create no ServiceChain-only ledger, adoption path or automatic reset.

## Evidence and remaining work

Two independent reviewers traced this concrete owner and both current columns, then the primary agent reconciled the findings with the common source. No service-specific ledger requirement, redundant field or additional design decision was found.

Base commit: `7184c8ed01f6a78e84b7818186fcb0a9b3c6f98b`. Ledger declaration SHA-256: `60c7615b912f79d70e2781d28a4a741e49dc1db95c2d804268d30a33ca2ce87b`; ServiceChain migration-config SHA-256: `3a48dc51ae4ae594e97a8aefeb9776beb064faf2e10740ec547d8e72c1ce1ce9`. Other work continues in the shared checkout; recheck source before implementation.

This review performed no tests, live storage inspection, source edits or reset. Plan 154 records its earlier shared implementation verification; that evidence was not rerun here. Keep this ledger unchanged and continue with AggregateVersionRepo.asyncOperations.
