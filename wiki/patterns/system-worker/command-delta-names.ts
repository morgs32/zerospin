/**
 * Aggregate and Service replicas retain original stagingOutcome and compact final position/failure.
 * Node/Chain history owns exposedDelta; attached replicas install the Node optimistic graph.
 * Current inverseOperations live separately on the same command row and change on rebase.
 * They never enter Node input; neither replica has a separate optimism table.
 * stagingOutcome contains only result/completedAt; replay preserves both fields.
 * One completedAt supplies initial local resource timestamps and every replay.
 * inverseOperations is null without applied optimism, or [] for an applied no-op.
 * Agent browser Nodes own only selected resources and checkpoint metadata. Their
 * snapshots/deltas and checkpoints commit together, without command rows, staging,
 * optimism, producer positions or private completion. Automatic command production
 * belongs to unversioned Agent Node Repos with canonical IDs and null producer coordinates.
 * Browser IBrowserCommand exposes the session-filtered IActorDelta as delta.
 * Its other common fields are id, commandName, and nullable private failure.
 * Aggregate/service command fields add positions and checkpoint hashes.
 * Command outcome result and failure are private to the submitting session.
 * Admission receipts contain identities and positions, never outcome verdicts.
 * Captures survive business rejection; committed outputs do not.
 *
 * @bad Add completion flags, phase summaries, or owner fields to IBrowserCommand.
 * @bad Replace the original command ID with a synthetic delivery ID.
 */
export type ICommandDeltas = {
  stagingOutcome: { result: unknown; completedAt: Date };
  inverseOperations: readonly unknown[] | null;
  outcome: {
    readonly result:
      | { readonly _tag: 'Success'; readonly success: unknown }
      | { readonly _tag: 'Failure'; readonly failure: unknown };
    readonly finalizedAt: Date;
  } | null;
  exposedDelta: { upserted: readonly unknown[]; deleted: readonly unknown[] };
};
