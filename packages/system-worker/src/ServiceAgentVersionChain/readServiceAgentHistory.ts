import type { IDb } from '@zerospin/core/drizzle/types';
import type { IServiceExposedCommand } from '@zerospin/core/serviceSession/types';
import { makeZerospinError } from '@zerospin/error';
import { and, asc, gt, lte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { readServiceHistoryCheckpoint } from '../ServiceActorVersionChain/readServiceHistoryCheckpoint.js';
import type { IServiceAgentExposedPublication } from '../serviceAgentProjection/serviceAgentProjectionDbConfig.js';

import { serviceAgentVersionChainDbConfig } from './serviceAgentVersionChainDbConfig.js';
export { readServiceHistoryCheckpoint };

/** Public Agent observation filters selected model visibility. */
export function filterServiceAgentCommand(
  publication: IServiceAgentExposedPublication,
  models: Readonly<Record<string, unknown>>,
): IServiceExposedCommand {
  return {
    ...publication,
    failure: null,
    delta: {
      upserted: publication.delta.upserted.filter(row =>
        Object.hasOwn(models, row.modelName),
      ),
      deleted: publication.delta.deleted.filter(row =>
        Object.hasOwn(models, row.modelName),
      ),
    },
  };
}

/** Read a contiguous retained public page, including empty selected transitions. */
export function readServiceAgentCommandPage(props: {
  db: IDb;
  afterServiceIndex: number;
  throughServiceIndex: number;
  models?: Readonly<Record<string, unknown>>;
}) {
  const { afterServiceIndex, throughServiceIndex, db, models } = props;

  if (
    !Number.isSafeInteger(afterServiceIndex) ||
    afterServiceIndex < 0 ||
    !Number.isSafeInteger(throughServiceIndex) ||
    throughServiceIndex < afterServiceIndex
  ) {
    throw makeZerospinError('session-replay-cursor-invalid');
  }
  const table = serviceAgentVersionChainDbConfig.schema.exposedCommands;
  return db
    .select()
    .from(table)
    .where(
      and(
        gt(table.serviceIndex, afterServiceIndex),
        lte(table.serviceIndex, throughServiceIndex),
      ),
    )
    .orderBy(asc(table.serviceIndex))
    .limit(64)
    .all()
    .map((row, i) => {
      if (row.serviceIndex !== afterServiceIndex + i + 1) {
        throw makeZerospinError('session-replay-gap');
      }
      const publication = Effect.runSync(
        serviceAgentVersionChainDbConfig.tables.exposedCommands.decodeRow(row),
      );
      return models === undefined
        ? { ...publication, failure: null }
        : filterServiceAgentCommand(publication, models);
    });
}
