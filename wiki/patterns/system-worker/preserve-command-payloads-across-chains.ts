/**
 * Retain complete original input at admission and provenance at each owner that needs it;
 * keep delivery bookkeeping and browser projection fields with the owner that needs them.
 * AggregateChain and ServiceChain retain admitted input in their canonical source order.
 * ServiceChain derives serviceName from its owner when transporting a complete occurrence.
 * Retain Actor, Agent and System command kind independently of the all-null or
 * complete Service producer tuple. Continuations are ordinary System commands.
 * AggregateChain retains admitted input plus nullable outcome, set once with
 * complete pending external requests. It retains no evaluated-command history or hash.
 * AggregateVersionChain retains the full admitted IEvaluatedAggregateCommand with canonical id, including payload, source
 * contract/release, owner identity, Origin and producer tuple, plus release-local
 * outcome { result, finalizedAt }, hash and one ordered operations union. Model members keep create/update/delete/move;
 * external descriptions use operationName: 'external'. Preserve authored operationIndex
 * and explicit model versions. Derive nested model commandId and external
 * originCommandId from the parent command. Derive the emitting release from
 * the admitted input. Replay filtering never renumbers sparse model indexes;
 * projections apply model members only using parent id and outcome.finalizedAt.
 * Each originating Chain retains externalCommandId, externalContractName,
 * externalContractVersion, frozen payload, originCommandId and emitting release
 * version with the pending request. It records the first externalOutcome before
 * the pinned emitting Worker selects and maps the ordinary continuation. A
 * committed construction failure stays on that pending row until the Chain
 * admits the child with a null payload and the public failure. Child admission
 * and deletion of the pending request are one transaction. Evaluated-command
 * history preserves parent identity and sparse operationIndex.
 * Service publication/history uses the full admitted IEvaluatedServiceCommand,
 * retaining canonical id, payload, contractVersion, serviceName
 * and original serviceVersion with serviceIndex, outcome, hash and ordered operations.
 * The bound ServiceVersionRepo/ServiceVersionChain identifies the evaluating release;
 * replay never overwrites the admitted serviceVersion. Derive model commandId and external
 * originCommandId from parent id, and external serviceVersion from
 * the bound executing release. Preserve sparse operationIndex, exact declaration
 * versions and stable external IDs. ServiceChain retains nullable commands.outcome,
 * set once with its complete pending external requests and command deliveries, without originalExecutions
 * or a hash. Equal-outcome repeated receipts return before request insertion;
 * compare finalizedAt too, but leave full-output equality and hash validation to
 * ServiceVersionChain.commands. Direct point/replay reads use the contiguous
 * nonnull-outcome prefix. VersionRepos retain resources, checkpoint and complete
 * pending publication without permanent command/model-operation history. Sample one
 * logical finalizedAt inside materialization and use it for source model writes,
 * outcome and projection model application. Recover the complete pending publication
 * or permanent VersionChain output without reevaluation or resampling. Forward validated encoded
 * shared columns without reconstructing the payload or rerunning the original program.
 * Pending outbox rows contain stable input and required delivery metadata; deleting
 * acknowledged pending delivery never deletes the receiving owner's durable history.
 * Browser optimism belongs to local Node/session journals, not server resource tables.
 *
 * Project direct IAggregateExposedCommand or IServiceExposedCommand values with id,
 * commandName, selected delta, nullable private failure, and aggregateIndex or serviceIndex
 * plus dispositionChainHash. Exact recipient claims, node and session govern private failures.
 * Canonical results stay on the server; local staging results stay in their session. Keep input, claims, operation bodies, and
 * server timings out of browser command frames. Preserve required telemetry envelopes
 * separately from the browser command value.
 *
 * Allocate nodeIndex for every retained Node journal row, including local originals
 * and observed final commands. Allocate pushIndex only for local submissions. Keep
 * admittedThroughPushIndex as acceptance progress and outcomeIndex as the contiguous
 * private finalization prefix. AggregateNode stores seven nodeMetadata fields:
 * nodeId, aggregateId, sessionKey, admittedThroughPushIndex, nullable aggregateIndex/
 * dispositionChainHash, and pushPaused, with exact singleton reads and no key.
 * Its durable producer exists before baseline authentication; both checkpoint fields
 * remain null until resources and their checkpoint commit atomically. Refuse partial
 * pairs; zero/genesis is a valid present baseline. Preserve unknown prebaseline
 * readiness without a copied initialized flag or fabricated public checkpoint.
 * AggregateNode derives append/producer maxima from retained commands inside each
 * append transaction; exact retries precede new-allocation exhaustion guards.
 * Derive private outcomeIndex from ordered original push positions and same-ID
 * finals, stopping at the first gap rather than taking a finalized maximum.
 * Snapshot nodeIndex/pushIndex/outcomeIndex remain top-level real progress beside
 * raw SQL metadata. Preserve fingerprint/same-owner reset, pause and generation/
 * acknowledgement/close fences. ServiceNode stores six nodeMetadata fields:
 * nodeId, sessionKey, admittedThroughPushIndex, nullable serviceIndex/
 * dispositionChainHash, and pushPaused. Its exact singleton producer exists before
 * authentication; checkpoint absence replaces initialized, while partial pairs
 * are invalid and zero/genesis remains ready. Full storage binding persists through
 * connected replacement, with no extra owner column or standalone Service host.
 * ServiceNode also derives append/producer maxima and first-gap same-ID private
 * completion from retained commands. Allocate inside appends, preserve exact
 * retries before exhaustion, expose snapshot progress at top level and retain
 * receipt-only admission/validated rewind independently of final exposure.
 * Preserve atomic resources/checkpoint/reset, pause, identity and close fences.
 * ServiceNode commands keeps ten fields: nodeIndex/id/pushIndex/commandName,
 * payload/stagingOutcome, failure/serviceIndex/dispositionChainHash/exposedDelta.
 * Reconstruct full bound Service/Actor/session/claims from the immutable definition
 * and source version from its exact selected contract. Require own selected key,
 * matching canonical name and exact incoming version before new-original writes.
 * Compare complete reconstructed retry input before current admission/allocation
 * guards; keep the full protocol for recovery/subscription/dispatch. Retain both
 * immutable phases and all position/phase constraints. Reject mixed phase rows and
 * invalid coordinates; foreign finals need not use a selected original name.
 * Preserve original staging evidence and map SQL exposedDelta to wire delta.
 * AggregateNode commands keeps eleven fields: nodeIndex/id/pushIndex/commandName,
 * payload/claims/stagingOutcome, failure/aggregateIndex/dispositionChainHash/exposedDelta.
 * Reconstruct bound Aggregate/session identity and exact contract version from the
 * captured Node definition/lock. New originals must match selected name/version;
 * exact retry compares complete reconstructed input. Derive Actor Origin kind/name/
 * version but retain complete original claims, including standalone cross-claims.
 * Keep compact stagingOutcome as immutable original result/completedAt, not replay
 * state. SQL exposedDelta maps to unchanged wire delta. Preserve immutable phases,
 * positions/indexes and generation retention. Shared snapshot validation resolves
 * capture bounds once from actual owner checkpoint fields; both families use
 * inclusive snapshot.nodeIndex. Shared top-level progress is not a family tag.
 * Validate coverage/receipts/unresolved/known retention
 * before projection mutation without copying bound input fields into SQL.
 * Advance the public checkpoint from validated canonical commands, never from an
 * acceptance receipt.
 * Allocate sessionIndex from sessionMetadata.lastSessionIndex in the synchronous staging
 * transaction, rolling it back on rejection and preserving it across history discard for
 * the same sessionId. Session submissions carry immutable input and stagingOutcome with
 * no canonical ID. Handoff allocates Node append/producer coordinates once for exact
 * Session coordinates; changed immutable input rejects. Original Node rows retain
 * sessionId/sessionIndex and derive command ID from nodeId/pushIndex. Final rows retain
 * canonical IDs. Nullable Session Node coordinates form a complete triple; recording
 * them stops handoff retries while optimism remains until a covering view installs.
 * Chain admission retains logical position and per-node frozen producer bindings
 * independently of command history. Node retries recover producer progress rather
 * than historical commands; reconciliation cannot rewind or exceed local issuance.
 * Agent observers retain selected rows plus the owner index/hash checkpoint only.
 * Automatic Agent Node Repos freeze complete canonical commands with null producer
 * coordinates in the same transaction as selected state and one-shot attempts.
 * Exact durable admission acknowledgement deletes only pending command delivery;
 * retained outcomes belong to Chains, without Agent private recovery.
 *
 * @bad Put staging data in the server command or copy queue bookkeeping into another store.
 * @bad Duplicate command identity, positions, or payload inside a failure/result JSON value.
 * @bad Spread private authentication or owned operation bodies into a browser final command.
 * @bad Manufacture a receiving command ID or rerun an originating command program during actor projection.
 * @bad Treat acceptance, public resource progress, and private finalization as one cursor.
 */
export function retainCommand<COMMAND>(props: {
  command: COMMAND;
  insert(command: COMMAND): void;
}) {
  props.insert(props.command);
  return props.command;
}
