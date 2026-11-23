/**
 * AggregateChain retains admitted commands and their order. Admission is synchronous
 * and local, returning complete commands and their assigned indices without
 * per-command admission outcomes. Every admitted command follows canonical guard
 * and program execution; business refusals arise inside the command savepoint.
 * Execute original commands sequentially through finalizeCommandOutbox, routing by
 * their retained aggregateVersion. The reply is the full admitted IEvaluatedAggregateCommand with canonical id, an ordered
 * operations union, outcome { result, finalizedAt } and release-local dispositionChainHash.
 * Model members keep create/update/delete/move; external members use operationName: 'external'.
 * Keep each authored operationIndex and explicit model version. Derive model commandId
 * and external initiatingCommandId/Origin from parent id/kind, and the external
 * aggregateVersion from the bound execution release.
 * Public Failure has an empty operations array; fresh parallel evaluation removes external
 * and destination-command descriptions before preparation/ID allocation, preserving sparse model indexes.
 * Reconstruction reads this release's complete immutable output outside SQL/the permit,
 * rechecks progress and predecessor hash in the transaction, and applies only its model members
 * at retained outcome.finalizedAt. Republish that identical complete output without reevaluation,
 * allocation or dispatch. Missing original-release output fails; no equality weakening or regeneration.
 * AggregateChain validates
 * identity, designated release and finalized predecessor in its acknowledgement
 * transaction before selecting later originals. Null AggregateChain.commands.outcome
 * means pending original delivery. First receipt sets that outcome and inserts complete
 * pending requests atomically; exact-outcome retries return without recreating requests.
 * AC retains no evaluated-command history or dispositionChainHash; AVC keeps complete equality.
 * No dispatch flag or reverse outcome queue remains.
 * Before original n, replay through n - 1. Check materializationHead before catch-up
 * and recheck under the execution permit before fresh declaration resolution.
 * AggregateVersionRepo executes the pending original delivered by AggregateChain.
 * On redelivery it compares that input with the complete evaluated command from its
 * outbox or AggregateVersionChain, outside SQL and the permit, and returns the saved outcome.
 * Missing/unavailable history fails recovery; it cannot authorize execution.
 * The original-delivery completion hook acquires/releases the replay producer lease
 * before releasing its alarm, including recovery with no pending original rows.
 * replayCommandsFanout exposes only the contiguous finalized prefix; a fresh receiving
 * version runs its own program and guards against its owned state in index order.
 * Replay validates recorded source provenance and input before retaining a
 * release-local refusal for an omitted ordinary command or actor exposure. That
 * refusal has no operations and advances the checkpoint. Missing source declarations,
 * unsupported lineage, incompatible contract kinds, invalid input and broken adapters
 * still abort without outcome or progress until the developer corrects the release.
 * Business Failure from guards/programs after successful resolution remains an
 * evaluated outcome. Original and post-resolution technical-error policies stay separate.
 * Await local catchupMaterialization during VersionRepo activation inside the existing
 * constructor gate. Pull one fixed finalized prefix using the existing .catchup();
 * source Chains retain authored release membership. A local checkpoint ahead of
 * that prefix is valid after a lost original reply. Arm publication/fanout and
 * output recovery even without new replay; AggregateChain owns external recovery; remote delivery does not gate startup.
 * Ordinary queries, authorization and snapshots read current committed state
 * without forced source-tip replay or original execution. Explicit authorizer
 * commands and command-specific predecessor/result waits remain.
 * Infrastructure failure blocks later originals; pending external work does not.
 * The retained command.aggregateVersion is the source release and direct-execution
 * pin. Only original evaluation freezes external operations in the complete evaluated command, committed
 * with resources/checkpoint. AVR publication, AVC history/fanout and original recovery
 * use the same full admitted IEvaluatedAggregateCommand. Service uses the corresponding full
 * admitted IEvaluatedServiceCommand: canonical id and original serviceVersion remain
 * unchanged, while the bound owner identifies the evaluating release. Its ordered
 * model/external operations derive repeated context from parent id/kind and that
 * bound executing release. ServiceVersionChain
 * retains commands; ServiceChain retains only first commands.outcome and complete
 * pending requests, without originalExecutions or a hash. Exact outcome retries
 * return before work insertion; complete-output equality belongs to ServiceVersionChain.
 * Service source writes, outcome and projection application share one logical
 * outcome.finalizedAt sampled inside materialization after authority/progress checks.
 * Projections apply model members only. No extra admission-Chain output queue exists.
 * AggregateChain sets commands.outcome and inserts complete pending
 * externalOperationOutbox rows atomically. Each row retains the stable
 * externalCommandId, exact external contract name/version, frozen outgoing
 * payload, originCommandId and emitting Aggregate version. Requests run
 * outside SQL and execution permits. The Chain records the first
 * externalOutcome before the pinned emitting Worker maps the ordinary
 * continuation. Admission appends that command and deletes pending work
 * atomically. AggregateVersionRepo only evaluates admitted commands. Fresh
 * parallel evaluation discards outgoing descriptions. Retained-output
 * restoration preserves complete publication and applies model members only.
 * AVR validates access once and evaluates the admitted command inside its business
 * savepoint. Every guard/program read uses that transaction before any output
 * is applied. AVR applies create/update/delete/move in authored order.
 * Rejection rolls back writes/outputs; final disposition, cursor and delivery
 * commit together. Infrastructure failure aborts the enclosing transaction.
 * Every version queues its final output for AVC. Model publication material survives
 * until AVC acknowledges, including after restart; pending external work is independent of
 * history publication and deleted atomically with ordinary continuation admission. awaitCommandResult requests bounded original progress,
 * catches up replay, and recovers results from pending output or AVC. Replay page
 * reads never execute originals.
 * Actor repos project committed AVC operations; sessions replay pending local
 * operations over confirmed actor state. Fanout cursors belong to these streams.
 * Changed fixed schemas require empty storage.
 * @bad Mix original execution and replay through one VersionRepo.execute method.
 * @bad Fan out pending admitted rows as replay availability.
 * @bad Carry prepared execution or guard closures across the transaction boundary.
 * @bad Hold a SQL transaction across RPC delivery or asynchronous preparation.
 */
export {};
