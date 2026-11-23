import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { isEqual } from 'es-toolkit';

import { serviceChainDbConfig } from './serviceChainDbConfig.js';

/** Register a fresh producer or verify an existing producer without advancing it. */
export const registerServiceNodeTx = makeTx(
  'ServiceChain.registerServiceNodeTx',
)(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  props: {
    nodeId: string;
    serviceVersion: number;
    sessionName: string;
    actorName: string;
    actorVersion: number;
    claims: Readonly<Record<string, unknown>>;
    create: boolean;
  },
) {
  const {
    nodeId,
    serviceVersion,
    sessionName,
    actorName,
    actorVersion,
    claims,
    create,
  } = props;
  const table = serviceChainDbConfig.schema.nodeProducers;
  const row = tx.select().from(table).where(eq(table.nodeId, nodeId)).get();
  if (row !== undefined) {
    const saved =
      yield* serviceChainDbConfig.tables.nodeProducers.decodeRow(row);
    if (
      saved.serviceVersion !== serviceVersion ||
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
  const producer = yield* serviceChainDbConfig.tables.nodeProducers.encodeRow({
    nodeId,
    lastPushIndex: 0,
    serviceVersion,
    sessionName,
    actorName,
    actorVersion,
    claims,
  });
  tx.insert(table).values(producer).run();
  return true;
});
