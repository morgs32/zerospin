/**
 * AggregateActorVersionRepo owns resources, selection, materializationHead and
 * complete exposedCommandOutbox messages. Each pending row has aggregateIndex,
 * dispositionChainHash, canonical admitted id, commandName, delta and nullable
 * commandResolution { nodeId, pushIndex, sessionName, full claims, failure }.
 * AggregateActorVersionChain owns public exposedCommands, optional private
 * commandResolutions, locks and sockets. The child position is its primary/foreign
 * key and (nodeId, pushIndex) is unique. Both relations append before one ack;
 * insertion seals the exact resolution or its absence. Retries compare both parts.
 * Bound actor kind/name/version derive from the immutable Chain owner.
 * AggregateAgentVersionRepo owns five-field public exposedCommandOutbox rows;
 * AggregateAgentVersionChain retains the same public exposedCommands fields.
 * Agent projections have no private commandResolution or commandResolutions.
 * Their version is the owner release, and Agent Origin is kind/name only.
 * Agent has no SQL connectionLocks. Full authored Agent lock equality at connect
 * fixes readable model names and lock contract facts for that exact owner.
 * Agent sockets only resume public observation; lock contract facts grant no
 * command submission or private completion authority. Service Agent attachments
 * derive their readable models from the exact pinned Agent's db.models.
 * Derive Aggregate lock facts with Agent contract unwrapping/external exclusion;
 * never substitute the Aggregate release's larger model graph. The trusted socket
 * attachment retains admission, issued/resumed observer Node and replay phase.
 * Validate attachment Aggregate/Agent/session/Node identity on message and broadcast
 * paths. Supply configured System explicitly for synchronous broadcast/replay reads.
 * Agent teardown fences attachment authority and attempts closure even on failure;
 * Actor retains its selected capabilities, SQL disposal and orphan reconciliation.
 * Aggregate projection checkpoint is { singletonId, aggregateIndex,
 * dispositionChainHash } in slot 1. ServiceActorVersionRepo uses serviceIndex
 * instead; its exposedCommandOutbox and ServiceActorVersionChain's exposedCommands/
 * commandResolutions use the same atomic publication and immutable-absence model.
 * ServiceVersionChain.commands retains ten-field execution packets. The logical
 * actorVersionRepoFanout delivers them directly to ServiceActorVersionRepo; receipts
 * advance only subscriber cursors without a second payload table, backfill or pruning. Its one ordered
 * operations union contains compact model/external members. Apply model members
 * only, restoring commandId from the parent and using outcome.finalizedAt for the
 * same resource time as source writes. Preserve sparse indexes and exact versions;
 * never execute external descriptions from history. Selected history needs no
 * separate clock column. Actor exposedModels chooses published models
 * and columns; db.models remains canonical query authority.
 * Retain the aggregate release's full graph while concrete where.RAW SQL can read
 * canonical tables without a complete declared dependency graph. Only selected rows
 * cross the browser boundary. Compare selections before and after each command.
 *
 * Read immutable complete evaluated commands from AggregateVersionChain, never
 * reevaluate programs in projections. Validate exact model versions, canonical body,
 * authored sparse indexes and parent outcome.finalizedAt before duplicate skipping.
 * Immutable source history fixes repeated evaluated-command identity; old positions cannot
 * reapply resources. Apply a contiguous page, selected deltas, materializationHead and
 * complete publication rows in one synchronous transaction. Selected publication
 * retains no redundant timestamp column; its delta already carries resource times. Refusals and no-ops
 * still retain individual positions and publish empty deltas when appropriate.
 *
 * Publish outside SQL to the exact source-bound history Chain. Append validates
 * complete duplicate equality and contiguous new positions before acknowledgement.
 * Delete pending publication only after history retention. Broadcast follows commit;
 * socket failure cannot undo history or projection progress. Source fanout confirms
 * projection commit independently of later selected-history publication.
 *
 * Retain private commandResolution only for the exact Actor path and
 * complete producer tuple. Use decoded selectionBindings for resource queries and
 * canonical encodedIdentity for encoded provenance. Actor resolutions preserve full
 * original encoded claims and recover locally from commandResolutions. Require contiguous pushes
 * within the captured parent-position bound; never derive private recovery from
 * AggregateVersionChain. Compare node, session and full Origin before revealing a
 * refusal; redact others.
 *
 * Activation catches up and enrolls the projection subscriber outside SQL. Ordinary
 * snapshots read its current committed graph without VersionRepo progress or another
 * forced source-tip replay; they accept no caller-supplied minimum index.
 * Capture selected resources and actual index/hash N together
 * locally, then publish through N and verify that exact history checkpoint. Derive
 * the node/session's private contiguous resolvedThrough from immutable history
 * through N. Newer concurrent publication cannot relabel the captured resources.
 * Agent opening returns a coherent public snapshot; it has no private prefix.
 *
 * @bad Recompute a pending delta from a newer resource graph.
 * @bad Merge refusal/no-op positions or renumber filtered model operations.
 * @bad Publish speculative staging or persist it in confirmed resource tables.
 * @bad Compare decoded identity directly with encoded command claims.
 * @bad Derive private completion from a maximum or the public resource index.
 * @bad Label captured resources with a later remote tip or hold SQL across RPC.
 */
export {};
