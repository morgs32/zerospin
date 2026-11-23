import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { isEqual } from 'es-toolkit';

import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';

/** Register a fresh producer or verify an existing producer without advancing it. */
export const registerAggregateNodeTx = makeTx(
  'AggregateChain.registerAggregateNodeTx',
)(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  props: {
    nodeId: string;
    aggregateVersion: number;
    sessionName: string;
    actorName: string;
    actorVersion: number;
    claims: Readonly<Record<string, unknown>>;
    create: boolean;
  },
) {
  const {
    nodeId,
    aggregateVersion,
    sessionName,
    actorName,
    actorVersion,
    claims,
    create,
  } = props;
  const table = aggregateChainDbConfig.schema.nodeProducers;
  const row = tx.select().from(table).where(eq(table.nodeId, nodeId)).get();
  if (row !== undefined) {
    const saved =
      yield* aggregateChainDbConfig.tables.nodeProducers.decodeRow(row);
    if (
      saved.aggregateVersion !== aggregateVersion ||
      saved.sessionName !== sessionName ||
      saved.actorName !== actorName ||
      saved.actorVersion !== actorVersion ||
      !isEqual(saved.claims, claims)
    ) {
      return yield* makeZerospinError('node-admission-identity-mismatch');
    }
    return true;
  }
  if (!create) return false;
  const producer = yield* aggregateChainDbConfig.tables.nodeProducers.encodeRow(
    {
      nodeId,
      lastPushIndex: 0,
      aggregateVersion,
      sessionName,
      actorName,
      actorVersion,
      claims,
    },
  );
  tx.insert(table).values(producer).run();
  return true;
});
