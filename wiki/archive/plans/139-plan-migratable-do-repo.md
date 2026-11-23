# Forward-only Durable Object storage migrations

Status: Implemented and verified on 2026-10-12.

## Scope and behavior

1. Strengthen `makeMigratableDORepo`, verify through `*.workerd.spec.ts`, then baseline all nine System-Worker owners. Existing fixed storage requires empty storage; no adoption or translation.
2. Framework storage revisions belong to each physical DO. Authored aggregate/service/model/contract versions and their immutable accepted definitions remain separate. No global system version or separate runtime Worker work in this plan.
3. Migrations are **up-only**, append-only and ordered. The ledger retains ID, name, SQL checksum and time. Require an exact supported prefix; reject duplicate, edited, missing or newer history before recovery.
4. Fresh storage provisions the resolved **current** database graph and records its baseline and complete declared history atomically. Do not replay historical ALTER statements against already-current tables. Reserve revision zero for the baseline; actual migrations begin at one.
5. Existing migrated storage runs only pending migrations. Each migration's SQL and ledger stamp share one synchronous transaction. Confirm writes with `storage.sync()` before the next step: a failed migration remains unstamped and earlier committed migrations remain a resumable prefix. Hash preparation happens outside transactions.
6. Verify the resulting schema without silently creating missing tables/indexes. Check inside the final migration transaction, or read-only when none are pending. Fresh and upgraded storage must converge.
7. Preserve identity validation, accepted-definition registration, once-only bootstrap and the existing constructor gate. Schema work precedes `onDOActivation()` and alarm dispatch. Bootstrap failure after schema commit retries bootstrap without rerunning migrations. Migration failure admits no recovery or alarm work.
8. Preserve physical names, namespaces, queue deadlines and alarm ownership. This establishes local schema evolution; it does not resolve arbitrary changes to queue or external-effect semantics.

Source: [factory](../../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts), [activation](../../../packages/system-worker/src/makeDORepo/makeDORepo.ts), [provisioning](../../../packages/core/src/drizzle/provisionDb/provisionDbTx/provisionDbTx.ts). Preserve [ADR 001](../../adrs/001-async-replay-retains-output-without-production.md) and [ADR 008](../../adrs/008-ordinary-and-recorded-continuation-authority.md).

## Implementation order

1. Extract transaction-level provisioning and non-mutating schema validation. Reuse the existing compiled table definitions; do not nest `provisionDbTx` inside another `makeTx`.
2. Implement history checks and atomic provisioning/migrations. Missing ledger with application tables or a bootstrap marker requires empty storage. Exclude Cloudflare's internal tables from this check.
3. Add the workerd suite below and make the factory cases pass before converting production owners. Keep the generic factory independent of application `config`; pass the common base's existing identity/registration hooks through explicitly.
4. Convert SystemRepo, SystemLogRepo, AggregateChain, ServiceChain, AggregateVersionRepo, ServiceVersionRepo, AggregateActorVersionChain, AggregateAgentVersionChain and ServiceActorVersionChain. Move existing admission procedures/namespaces; update config names/static callers and remove superseded fixed paths/exports without aliases. Production histories initially contain only the baseline.
5. Run scoped factory tests, actual nine-owner activation tests, and the affected library/type/lint checks. Reconcile lifecycle README/patterns and glossary afterward; create an ADR only if the implemented decision meets the repository criteria. Archive this plan only when implementation and verification pass.

## Workerd verification

Add the currently absent `test-workerd` lane, discovering `test/**/*.workerd.spec.ts`. Vitest controls real Miniflare/Workerd bundles; SQL and lifecycle execute inside Workerd. Keep fixtures/typechecking separate from production exports.

1. **Fresh/reopen:** correct schema/history; bootstrap once; rows/stamp times survive. Fresh latest storage does not replay historical ALTER statements.
2. **Real upgrade:** bundle A → B with identical persisted storage and DO identity. Add a column, rebuild a table to remove another, preserve rows; compare with fresh B.
3. **Failure/retry:** later SQL failure and stamp failure each roll back DDL/DML and stamp. Retry the identical definition once after removing the transient failure. Bootstrap retries independently.
4. **Refusals:** edited SQL/name, missing stamp, duplicate declaration, newer stored revision, schema drift and unstamped legacy storage reject before recovery without modifying retained state.
5. **Alarms:** retain a scheduled alarm across upgrade; real dispatch sees migrated schema/pending work. Failed migration blocks its operation. Use persisted observations and bounded coordination, not direct `alarm()` calls.
6. **Real owners:** all nine activate under a valid accepted test System. Wrong system, unavailable release and rejected registration precede local writes. Aggregate/service results survive reopening. Include service/actor/agent declarations; Explorer alone cannot cover nine owners.

Use temporary `resourcePersistencePath`, direct test dependencies and runtime cleanup. Prove failed-constructor storage inspection first; use a same-namespace inspection bundle if needed. These tests establish local migration/dispatch, not production retry timing or arbitrary crash recovery. References: [testing APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), [SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

Run proposed `system-worker:test-workerd`/test typecheck through pnpm Nx, existing `:lib`, `:ts`, `:lint`, and affected Core/dev/production Worker checks.

## Planned files

Legend: `+` create, `~` modify, `-` remove. Grouped owner entries cover the nine classes named above; renames remove the old filenames.

```text
zerospin/
  ~ AGENTS.md                                      # concision preference, done
  ~ pnpm-lock.yaml
  packages/core/src/drizzle/provisionDb/
    ~ provisionDbTx/provisionDbTx.ts
    - provisionDbTx/validateExistingFixedTable.ts
    + validateTableSchema.ts
    + provisionDbTables.ts
    + validateDbSchema.ts
  packages/system-worker/
    ~ package.json
    ~ env-types.d.ts
    + vitest.workerd.config.ts
    src/
      ~ makeMigratableDORepo/{types,makeMigratableDORepoConfig,makeMigratableDORepo}.ts
      ~ makeMigratableDORepo/applyMigratableDORepoMigration/applyMigratableDORepoMigrationTx.ts
      - makeMigratableDORepo/applyMigratableDORepoMigration/applyMigratableDORepoMigration.ts
      + makeMigratableDORepo/initializeMigratableSchema.ts
      + makeMigratableDORepo/provisionMigratableSchemaTx.ts
      + makeMigratableDORepo/validateMigrationHistory.ts
      + makeMigratableDORepo/migrationLedger.ts
      + makeMigratableDORepo/migrationLedgerDbConfig.ts
      ~ makeDORepo/makeDORepo.ts                    # hook types only if needed
      + makeDORepo/systemRepoNamespaces.ts          # move namespace declarations
      + makeDORepo/validateSystemRepoIdentity.ts    # move existing validator
      + makeDORepo/registerRepoWithSystem.ts        # move existing registration
      + makeDORepo/makeSystemRepoHooks.ts
      - makeFixedDORepo/
      ~ {SystemRepo,SystemLogRepo,AggregateChain,ServiceChain,AggregateVersionRepo,
         ServiceVersionRepo,AggregateActorVersionChain,AggregateAgentVersionChain,
         ServiceActorVersionChain}/*.ts             # factory/config/static callers
      ~ {AggregateChain,ServiceChain}/onDOActivation/onDOActivation.ts
      ~ makeDORepo/README.md
    test/
      + tsconfig.json
      migratable-do-repo/
        + migratable-do-repo.workerd.spec.ts
        + system-repo-activation.workerd.spec.ts
        + worker.ts
        + owners.worker.ts
        + inspect.worker.ts
        + system.ts
        + startWorker.ts
  wiki/
    + plans/139-plan-migratable-do-repo.md
    ~ patterns/system-worker/repo-lifecycle.md
    ~ patterns/system-worker/make-fixed-do-repo-config-contextual-callbacks.ts
    ~ patterns/system-worker/use-fixed-do-repo-config-static-access.ts
    ~ patterns/index.md
    ~ glossary.md
    ~ architecture/AuthoredSystem.md
    + adrs/009-forward-only-framework-storage.md
  explorer/
    ~ scripts/capture-schema.mjs
    ~ src/data/{schema-snapshot.json,table-purposes.ts}
    ~ README.md
```

## Verification — 2026-10-12

1. Real Workerd: two `*.workerd.spec.ts` files, five tests pass. Covers persistent bundle upgrades, SQL/stamp rollback and retry, bootstrap retry, history refusal, scheduled alarm gating, all nine owners and successful aggregate/service receipts across cold restart.
2. Core/System-Worker/dev/production Worker library builds, worker/test typechecks and lint pass. Final System-Worker lint has no source warnings. Explorer typecheck and lint pass with six existing warnings in unchanged UI files. Schema capture reports nine owners/53 declarations; scoped formatting and whitespace checks pass. Logs: `/tmp/zerospin-migration-final-1.log`, `/tmp/zerospin-migration-final-2.log`, `/tmp/zerospin-migration-lint-final.log`, `/tmp/zerospin-migration-explorer-1.log`. Nx Cloud 401 warnings did not prevent local checks.
3. Workerd exposed internal metadata table names and constructor write coalescing. Shared metadata filtering and explicit durability confirmation correct both. Namespace augmentation imports survive declaration emission while standalone factories retain independent type/runtime closures.
4. Implemented terminology is in the glossary and lifecycle guidance; [ADR 009](../../adrs/009-forward-only-framework-storage.md) records the persistence trade-off.

## Remaining work

None. Separate runtime Worker migration remains outside this plan.
