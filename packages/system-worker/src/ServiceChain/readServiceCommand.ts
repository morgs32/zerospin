import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { getPublishedServiceHistory } from './getPublishedServiceHistory.js';
import { readServiceCommandOccurrence } from './readServiceCommandOccurrence.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';
import type { IServiceCommandOccurrence } from './types.js';

/** Read an admitted command from published history or the local suffix. */
export const readServiceCommand = Effect.fn('ServiceChain.readServiceCommand')(
  function* (
    db: IDb<typeof serviceChainDbConfig>,
    key: { systemId: string; serviceName: string },
    serviceIndex: number,
  ) {
    const { commands, admissionPosition, finalizedPosition } =
      serviceChainDbConfig.schema;
    const admittedThrough =
      db.select().from(admissionPosition).get()?.lastIndex ?? 0;
    if (serviceIndex > admittedThrough) return null;
    const compactedThrough =
      db.select().from(finalizedPosition).get()?.compactedThroughIndex ?? 0;
    if (serviceIndex <= compactedThrough) {
      const history = yield* getPublishedServiceHistory({
        db,
        key,
        throughIndex: serviceIndex,
      });
      const evaluated = yield* Effect.promise(() =>
        history.getEvaluatedCommand({ serviceIndex }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
      if (evaluated === null) {
        return yield* makeZerospinError('service-finalized-history-missing');
      }
      const {
        operations: _operations,
        dispositionChainHash: _dispositionChainHash,
        outcome,
        ...command
      } = evaluated;
      if (outcome === null) {
        return yield* makeZerospinError('service-finalized-history-missing');
      }
      const admitted: IServiceCommandOccurrence = { ...command, outcome };
      return admitted;
    }
    const row = db
      .select()
      .from(commands)
      .where(eq(commands.serviceIndex, serviceIndex))
      .get();
    if (row === undefined) {
      return yield* makeZerospinError('service-admitted-history-missing');
    }
    return readServiceCommandOccurrence(row, key);
  },
);
