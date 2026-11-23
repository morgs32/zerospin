# AggregateChain.applied_migrations

**Reviewed:** 2026-10-14

**Status:** Source review complete. The maintainer selected the two-column `migrationId`/`definitionChecksum` ledger while retaining the common migration-history lifecycle. Implementation is tracked separately.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

**Implementation subplan:** [Archived Plan 154](../../archive/plans/154-plan-migration-ledger-storage.md), implemented and verified on 2026-10-15. The findings below preserve the 2026-10-14 source-review snapshot; the current ledger has only `migrationId` and `definitionChecksum`.

## Verdict

This table belongs to framework storage initialization and evolution. It is separate from command admission, execution and delivery. A row records an immutable migration-history entry represented by this database, not necessarily a historical SQL script executed in it.

AggregateChain declares `migrations: []`, so its successfully activated storage currently contains exactly one synthesized baseline row. The migration framework is shared across all nine backend owners; this review covers its use by AggregateChain, not automatic approval of the other occurrences. [Concrete configuration](../../../packages/system-worker/src/AggregateChain/aggregateChainMigratableDORepoConfig.ts#L11-L15), [shared definition](../../../packages/system-worker/src/makeMigratableDORepo/migrationLedgerDbConfig.ts#L7-L15).

The strongest findings are that `checksum` is not a schema fingerprint, `appliedAt` is only a recording timestamp, and neither the persisted name nor timestamp adds an independent migration-control fact. If retaining the general migration lifecycle, identity plus definition checksum can preserve its correctness requirements with less metadata. Removing the general lifecycle itself requires a separate policy decision.

## Current row and ownership

The containing database is scoped by `systemId / aggregateId / aggregateName`. The ledger is provisioned separately from the owner's ordinary `dbConfig` and reserves the physical name `applied_migrations` for framework use. No owner identity columns belong on its rows. [Ledger composition/reservation](../../../packages/system-worker/src/makeMigratableDORepo/initializeMigratableSchema.ts#L43-L59).

The current AggregateChain baseline is:

```ts
{
  id: 0,
  name: "baseline",
  checksum: sha256(JSON.stringify([0, "baseline", []])),
  appliedAt: /* Unix epoch milliseconds at the ledger INSERT */,
}
```

The framework inserts all four nonnullable fields together and never updates/deletes a retained entry. The baseline checksum is constant across schema graphs. An empty or longer retained history cannot activate against this owner's current empty declared migration list. [Baseline preparation](../../../packages/system-worker/src/makeMigratableDORepo/migrationHistory.ts#L30-L46), [prefix validation](../../../packages/system-worker/src/makeMigratableDORepo/migrationHistory.ts#L57-L83), [writer](../../../packages/system-worker/src/makeMigratableDORepo/migrationLedger.ts#L38-L50).

## Every column

| Column      | Actual purpose and lifecycle                                                                                                                                                                                                                        | Disposition                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `id`        | Integer primary key and authored migration identity/order. Baseline is zero; later declared IDs are positive, safe and strictly increasing. IDs may have gaps. Rows are read in ID order and compared with the supported history prefix. Immutable. | Retain as `migrationId`. It is not a queue cursor or dense array ordinal.                 |
| `name`      | Exact authored human label. Checked for nonempty declaration and retained verbatim; compared at activation. Also included in the checksum's preimage. Here it is the constant `baseline`. Immutable.                                                | Remove the stored duplicate. Keep the authored label bound by the definition checksum.    |
| `checksum`  | Lowercase SHA-256 of the exact JSON tuple `[id, name, sqlStatements]`. Statement order and bytes matter. Compared against the current supported declaration. Here it hashes the baseline's empty SQL list. Immutable.                               | Retain as `definitionChecksum` to describe what it proves.                                |
| `appliedAt` | Integer Unix epoch milliseconds sampled with `Date.now()` when stamping, before transaction commit and durability confirmation. Validation checks only nonnegative safe integer; no control decision uses chronological value. Immutable.           | Remove without replacement. It contributes no ordering, recovery or durability guarantee. |

[Physical fields](../../../packages/system-worker/src/makeMigratableDORepo/migrationLedgerDbConfig.ts#L9-L14), [declaration validation/checksum](../../../packages/system-worker/src/makeMigratableDORepo/migrationHistory.ts#L14-L44), [stored-row checks](../../../packages/system-worker/src/makeMigratableDORepo/migrationHistory.ts#L68-L83), [read order and INSERT](../../../packages/system-worker/src/makeMigratableDORepo/migrationLedger.ts#L19-L44).

## Findings

### 1. History integrity and physical-schema integrity are different proofs

`checksum` binds migration identity, label and SQL declaration. It does not hash the actual database graph, provisioning statements, data rows or accepted JSON codecs. The baseline contains no schema description at all, so changing a graph cannot change its baseline checksum.

Physical structure is checked independently by `validateDbSchema`/`validateTableSchema`. For this owner, there are no pending migration entries; retained baseline validation proceeds directly to the current graph check. [Initialization](../../../packages/system-worker/src/makeMigratableDORepo/initializeMigratableSchema.ts#L92-L105), [database graph validation](../../../packages/core/src/drizzle/provisionDb/validateDbSchema.ts), [table validation](../../../packages/core/src/drizzle/provisionDb/validateTableSchema.ts).

Neither proof establishes every retained data semantic. A JSON codec can change while the SQL column remains text. Do not describe the baseline checksum as a schema version/fingerprint or treat it as permission to decode superseded data. The explicit hard-cutover policy remains controlling for changed fixed schemas.

### 2. Represented history does not always mean executed migration scripts

Fresh storage provisions the resolved current graph, validates it and stamps the entire declared history in one transaction. It does not run the historical SQL statements. Retained storage instead executes each pending migration's SQL and stamps that entry atomically. Both paths represent the same installed history. [Fresh provisioning](../../../packages/system-worker/src/makeMigratableDORepo/provisionMigratableSchemaTx.ts#L19-L24), [pending migration application](../../../packages/system-worker/src/makeMigratableDORepo/applyMigratableDORepoMigrationTx.ts#L23-L40).

Consequently the baseline is an initialization receipt, and a fresh database's migration stamps are not an execution audit. Keep this distinction explicit in table/column documentation. No extra “execution mode” discriminator is needed to support the current prefix protocol.

### 3. The name is already bound by the definition checksum

Current validation compares both the saved name and saved checksum. The supported history supplies the expected label and its checksum already binds that label, so the name column adds no independent history-integrity requirement. Its potential justification is direct human inspection of stored metadata. [Preimage](../../../packages/system-worker/src/makeMigratableDORepo/migrationHistory.ts#L35-L43), [comparison](../../../packages/system-worker/src/makeMigratableDORepo/migrationHistory.ts#L71-L80).

**Recommendation:** remove the stored name if inspection can resolve labels from the supported history. Do not remove the label from authored migration declarations merely because its persisted duplicate is unnecessary. Current policy intentionally makes labels immutable through the checksum; changing that rule is a separate decision.

### 4. The timestamp needs an honest event name or removal

`appliedAt` never drives history ordering, pending selection or recovery. It is sampled at the INSERT inside a transaction and is followed by commit and `storage.sync()`. On a fresh database with nonempty declared history, multiple old entries would be stamped now without running their old SQL. [Stamping](../../../packages/system-worker/src/makeMigratableDORepo/migrationLedger.ts#L38-L44), [durability confirmation](../../../packages/system-worker/src/makeMigratableDORepo/initializeMigratableSchema.ts#L34-L42).

Removing this timestamp would not remove a current ordering or durability guarantee; the current validator would need its incidental timestamp check removed too. If a diagnostic recording time is desired, call it `recordedAt` and document milliseconds. Do not pretend it is an exact commit instant or add another timestamp to patch the ambiguity.

Explorer currently calls this “commit time,” which is unsupported by the writer. Plan 154 removes that description with the timestamp column. [Current Explorer purpose](https://github.com/morgs32/zerospin/blob/ff1c4b34220320b25cc79c1e95e54ccf6f532e9e/explorer/src/data/table-purposes.ts#L1-L2).

### 5. The generalized capability and this owner's present need are separate questions

All nine located production owners currently declare empty migration lists; the shared lifecycle implements nonempty histories and existing acceptance coverage exercises them. AggregateChain today uses the baseline to distinguish initialized framework storage from unstamped storage, then validates the physical schema directly. Its current configuration does not demonstrate four independent row facts.

[ADR 009](../../adrs/009-forward-only-framework-storage.md) nevertheless explicitly adopts immutable checksummed forward-only framework history. Removing that whole lifecycle is a policy decision, not an automatic conclusion from empty current lists. Do not introduce a special AggregateChain-only compatibility or initialization path during a column cleanup.

If keeping the common migration lifecycle, the leanest justified representation is:

```ts
{
  migrationId: number;
  definitionChecksum: string;
}
```

Keep every represented entry and exact ordered-prefix validation. A single latest migration ID is insufficient: changing an earlier data-transforming SQL definition can leave the same final physical schema while producing different data. Earlier edits and missing history entries must remain detectable. The maintainer selected this two-column model on 2026-10-14; the persisted label and timestamp are removed without replacement.

## Transaction and recovery requirements

1. Prepare/validate declared history and compute checksums before migration transactions.
2. Refuse adoption when the ledger is missing but application objects or a bootstrap marker already exist. This is not permission to stamp unknown existing storage. [Missing-ledger rule](../../../packages/system-worker/src/makeMigratableDORepo/initializeMigratableSchema.ts#L75-L89).
3. Fresh provisioning and represented-history stamps share one synchronous transaction. Each subsequent migration's SQL, stamp and prefix check also share one transaction; the final migration verifies the current graph before commit.
4. Explicit `storage.sync()` confirms each committed step before proceeding. A failed step remains unstamped; confirmed earlier steps form the resumable prefix.
5. Storage-history or physical-schema refusal happens before owner activation and alarm dispatch. The recovery registry's retry behavior cannot bypass an unsafe schema initialization gate. Fixing a replay bug and fixing incompatible storage are different operations.

The user-supplied pre-release hard-cut policy governs any proposed fixed-schema change: require empty affected storage, create no compatibility path and perform no reset under this review.

## Evidence and verification limits

Two independent reviewers traced all four columns and both provisioning paths, then primary-agent reconciliation checked their meanings against current source. No runtime tests or storage inspection were performed; the baseline row above describes declared behavior, not a sampled live database.

Base commit: `7c98a5fcd7099dd965395a33b695d6b15a62a77d`. Ledger definition SHA-256: `b85915a38f0def823a8553e80028334315a4d793c87cc19e758952cb62cfadcc`. Other owners were inspected only to establish shared declaration use and have not been separately reviewed.

## Remaining work

The selected ledger change is implemented and verified in [archived Plan 154](../../archive/plans/154-plan-migration-ledger-storage.md), preserving the common history policy, exact definition checksum, complete prefix, atomic stamping and durability confirmation. No reset was performed. Parent Plan 151 and other table contexts remain active independently.
