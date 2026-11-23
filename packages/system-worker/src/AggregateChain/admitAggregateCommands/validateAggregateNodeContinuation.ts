import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';

import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

/** Producer checkpoints survive removal of old command rows; they carry no outcome evidence. */
export const validateAggregateNodeBinding = Effect.fn(
  'validateAggregateNodeBinding',
)(function* (
  db: Pick<ITx<typeof aggregateChainDbConfig>, 'select'>,
  command: IEncodedCommand<IAggregateCommand>,
) {
  if (command.kind !== 'actor') return;
  if (command.id !== makeNodeCommandId(command.nodeId, command.pushIndex)) {
    return yield* makeZerospinError('node-command-identity-mismatch');
  }
  const { nodeProducers } = aggregateChainDbConfig.schema;
  const row = db
    .select()
    .from(nodeProducers)
    .where(eq(nodeProducers.nodeId, command.nodeId))
    .get();
  const saved =
    row === undefined
      ? undefined
      : yield* aggregateChainDbConfig.tables.nodeProducers.decodeRow(row);
  if (saved === undefined && env.ZEROSPIN_LOCAL_DEVELOPMENT === 'true') {
    return yield* makeZerospinError('node-producer-not-registered');
  }
  if (
    saved !== undefined &&
    (saved.aggregateVersion !== command.aggregateVersion ||
      saved.sessionName !== command.sessionName ||
      saved.actorName !== command.actorName ||
      saved.actorVersion !== command.actorVersion ||
      !isEqual(saved.claims, command.claims))
  ) {
    return yield* makeZerospinError('node-admission-identity-mismatch');
  }
  return saved;
});

/** Check and advance the durable position inside the append transaction. */
export const validateAggregateNodeContinuation = Effect.fn(
  'validateAggregateNodeContinuation',
)(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  command: IEncodedCommand<IAggregateCommand>,
) {
  if (command.kind !== 'actor') return;
  const saved = yield* validateAggregateNodeBinding(tx, command);
  const { nodeProducers } = aggregateChainDbConfig.schema;
  const expectedPushIndex = (saved?.lastPushIndex ?? 0) + 1;
  if (
    !Number.isSafeInteger(expectedPushIndex) ||
    command.pushIndex !== expectedPushIndex
  ) {
    return yield* makeZerospinError({
      code: 'node-admission-index-mismatch',
      message: 'Command is not the next producer position',
      extra: { expectedPushIndex, pushIndex: command.pushIndex },
    });
  }
  const producer = yield* aggregateChainDbConfig.tables.nodeProducers.encodeRow(
    {
      nodeId: command.nodeId,
      lastPushIndex: command.pushIndex,
      aggregateVersion: command.aggregateVersion,
      sessionName: command.sessionName,
      actorName: command.actorName,
      actorVersion: command.actorVersion,
      claims: command.claims,
    },
  );
  tx.insert(nodeProducers)
    .values(producer)
    .onConflictDoUpdate({
      target: nodeProducers.nodeId,
      set: { lastPushIndex: command.pushIndex },
    })
    .run();
});
