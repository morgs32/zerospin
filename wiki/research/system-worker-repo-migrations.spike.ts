/*
 * SPIKE ONLY: commented pseudocode for future framework storage upgrades.
 * No production wiring, storage conversion, new schema, or policy change.
 * Read alongside wiki/research/system-worker-storage-evolution.md and
 * wiki/research/system-worker-protocol-rollout.spike.ts.
 *
 * Keep the same DO namespace and physical name for every Repo/Chain kind.
 * Framework migrations preserve command identity/order/finalization, retained
 * async observations and producer authority, outboxes, and checkpoints.
 * SQL changes must not rerun business contracts or external requests.
 */

/*
 * Sketch A: keep system admission while changing schema initialization.
 *
 * makeDORepo(BaseClass, {
 *   ...resolvedRepoConfig,
 *   namespaceBinding,
 *   managedRuntime,
 *   validateKey: existingSystemIdentityValidation,
 *   registerRepo: existingAcceptedDefinitionRegistration,
 *   initializeSchema: initializeFrameworkSchema,
 * });
 *
 * Reuse the callbacks from:
 * packages/system-worker/src/makeFixedDORepo/makeFixedDORepo.ts
 * (validateFixedRepoIdentity and registerFixedRepo). Preserve SystemRepo's
 * self-registration exemption and validation before storage access.
 *
 * Reuse constructor ordering from:
 * packages/system-worker/src/makeDORepo/makeDORepo.ts
 * registration -> schema -> once-only bootstrap -> onDOActivation.
 * Schema initialization stays inside the existing constructor event gate.
 * No separate alarm pause or graph-wide schema transaction is introduced.
 */

/*
 * Sketch B: validate history, migrate locally, then resume recovery.
 * The procedure names below describe proposed steps; they do not exist yet.
 *
 * function initializeFrameworkSchema({ db, dbConfig, migrations }) {
 *   validatePublishedMigrationHistory(migrations);
 *   const history = readAppliedMigrationHistory(db);
 *
 *   if (isFreshDatabase(db)) {
 *     // [1] Fresh initialization: current definition or historical SQL?
 *     provisionCurrentDefinitionAndStampHistoryTx(db, {
 *       definition: dbConfig.definition,
 *       migrations,
 *     });
 *     return;
 *   }
 *
 *   requireKnownUnchangedHistory(history, migrations);
 *   for (const migration of pendingMigrations(history, migrations)) {
 *     applyMigratableDORepoMigration({ db, migration });
 *   }
 *   validateCurrentPhysicalDefinition(db, dbConfig.definition);
 * }
 *
 * Reuse packages/system-worker/src/makeMigratableDORepo/
 * applyMigratableDORepoMigration/applyMigratableDORepoMigrationTx.ts:
 * each migration's SQL and ledger stamp share one synchronous transaction.
 * Earlier completed migrations survive a later migration's failure.
 * Refuse unknown/ahead revisions, a non-prefix history, or changed applied SQL;
 * the current ID-set subtraction alone cannot establish these guarantees.
 * Never infer a migration baseline from the fixed _isBootstrapped boolean.
 *
 * [1] Candidate A: provision the resolved current graph for fresh storage and
 * mark its full historical prefix as satisfied, atomically. This follows the
 * current table graph and avoids replaying obsolete table creation.
 * Stamping only the latest ID would make set subtraction rerun older IDs.
 * Candidate B: replay framework SQL history, then provision/validate the
 * authored model graph. Both paths must reach the same physical definition.
 *
 * VersionRepo and selected Chain definitions merge framework tables with
 * release.models. See packages/system-worker/src/AggregateVersionRepo/
 * AggregateVersionRepo.ts and packages/core/src/drizzle/make/makeDbConfig/
 * makeDbConfig.ts. A universal SQL file cannot hard-code author model tables.
 *
 * This sketch assumes short local conversions. A conversion exceeding the
 * constructor gate's bound needs a separate resumable-conversion sketch.
 */

/*
 * [2] Generated model columns also participate in authored definition locks.
 * Metadata-table migration does not resolve every physical schema change.
 *
 * packages/core/src/models/make/makeModelVersion.ts synthesizes id, modelName,
 * createdAt, updatedAt, and version into propertiesShape and model.spec.
 * Changing those columns currently changes accepted authored definitions too.
 *
 * TODO: decide whether physical framework envelopes remain part of authored
 * locks, or whether a future definition model separates their identities.
 * Neither separation nor rewriting accepted definitions is approved here.
 * Existing authored model/aggregate/service versions remain exact and locked.
 */
