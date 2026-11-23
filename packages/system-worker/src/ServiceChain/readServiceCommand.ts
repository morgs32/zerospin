import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { getServiceVersionChain } from '../ownerOperations/releaseRepoNamespaces.js';
import type { IEvaluatedServiceCommand } from '../ServiceVersionChain/evaluatedServiceCommand.js';
import type { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';

import { readServiceCommandOccurrence } from './readServiceCommandOccurrence.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';
import type { IServiceCommandOccurrence } from './types.js';

/** Release output is not part of the shared admitted occurrence. */
export function serviceHistoryInput(
  command: IEvaluatedServiceCommand,
): IServiceCommandOccurrence {
  const {
    operations: _operations,
    dispositionChainHash: _dispositionChainHash,
    ...input
  } = command;
  return input;
}

/** Capture placement before awaiting immutable history; SQL owns only the newer suffix. */
export const readServiceCommand = Effect.fn('ServiceChain.readServiceCommand')(
  function* (
    db: IDb<typeof serviceChainDbConfig>,
    key: { systemId: string; serviceName: string },
    serviceIndex: number,
  ) {
    const { canonicalHistory, commands, admissionPosition } =
      serviceChainDbConfig.schema;
    const adopted = db.select().from(canonicalHistory).get();
    const admittedThrough =
      db.select().from(admissionPosition).get()?.lastIndex ?? 0;
    if (serviceIndex > admittedThrough) return null;
    if (adopted !== undefined && serviceIndex <= adopted.serviceIndex) {
      const history = yield* getServiceVersionChain({
        key: { ...key, serviceVersion: adopted.serviceVersion },
      });
      const command = yield* Effect.promise(() =>
        history.getEvaluatedCommand({ serviceIndex }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
      if (command === null || command.serviceIndex !== serviceIndex) {
        return yield* makeZerospinError('service-canonical-history-missing');
      }
      return serviceHistoryInput(command);
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
