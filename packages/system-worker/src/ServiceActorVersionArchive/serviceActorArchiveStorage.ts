import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import type { IServiceOutcomeOwner } from '../ServiceActorVersionChain/serviceActorOutcomeOwner.js';
import type { IServiceExposedPublication } from '../serviceProjection/serviceProjectionDbConfig.js';

import { serviceActorVersionArchiveDbConfig } from './serviceActorVersionArchiveDbConfig.js';

const { exposedCommands, commandResolutions } =
  serviceActorVersionArchiveDbConfig.schema;

export type IServiceActorResolutionSummary = {
  count: number;
  distinctCount: number;
  minPushIndex: number | null;
  maxPushIndex: number;
  mismatches: number;
};

export type IServiceActorArchivePage = {
  afterIndex: number;
  maxIndex?: number | undefined;
  nodeId?: string | undefined;
  afterPushIndex?: number | undefined;
};

function decodePublication(row: {
  command: typeof exposedCommands.$inferSelect;
  resolution: typeof commandResolutions.$inferSelect | null;
}): IServiceExposedPublication {
  const command = Effect.runSync(
    serviceActorVersionArchiveDbConfig.tables.exposedCommands.decodeRow(
      row.command,
    ),
  );
  const resolution =
    row.resolution === null
      ? null
      : Effect.runSync(
          serviceActorVersionArchiveDbConfig.tables.commandResolutions.decodeRow(
            row.resolution,
          ),
        );
  return {
    ...command,
    commandResolution:
      resolution === null
        ? null
        : {
            nodeId: resolution.nodeId,
            pushIndex: resolution.pushIndex,
            sessionName: resolution.sessionName,
            claims: resolution.claims,
            failure: resolution.failure,
          },
  };
}

export function readServiceActorPublication(
  db: IDb | ITx,
  serviceIndex: number,
): IServiceExposedPublication | null {
  const row = db
    .select({ command: exposedCommands, resolution: commandResolutions })
    .from(exposedCommands)
    .leftJoin(
      commandResolutions,
      eq(commandResolutions.serviceIndex, exposedCommands.serviceIndex),
    )
    .where(eq(exposedCommands.serviceIndex, serviceIndex))
    .get();
  return row === undefined ? null : decodePublication(row);
}

/** Fetch one row at a time so a large publication cannot allocate a whole page. */
export function readServiceActorPublicationPage(
  db: IDb | ITx,
  page: IServiceActorArchivePage,
  lastIndex: number,
) {
  const maximum = Math.min(lastIndex, page.maxIndex ?? lastIndex);
  const rows: IServiceExposedPublication[] = [];
  let cursor = page.afterIndex;
  let bytes = 0;
  while (rows.length < 64 && cursor < maximum) {
    const row = db
      .select({ command: exposedCommands, resolution: commandResolutions })
      .from(exposedCommands)
      .leftJoin(
        commandResolutions,
        eq(commandResolutions.serviceIndex, exposedCommands.serviceIndex),
      )
      .where(
        and(
          gt(exposedCommands.serviceIndex, cursor),
          lte(exposedCommands.serviceIndex, maximum),
          page.nodeId === undefined
            ? undefined
            : eq(commandResolutions.nodeId, page.nodeId),
          page.afterPushIndex === undefined
            ? undefined
            : gt(commandResolutions.pushIndex, page.afterPushIndex),
        ),
      )
      .orderBy(asc(exposedCommands.serviceIndex))
      .limit(1)
      .get();
    if (row === undefined) {
      if (page.nodeId === undefined) {
        throw makeZerospinError('service-actor-archive-history-missing');
      }
      break;
    }
    if (page.nodeId === undefined && row.command.serviceIndex !== cursor + 1) {
      throw makeZerospinError('service-actor-archive-history-missing');
    }
    const publication = decodePublication(row);
    const publicationBytes = new TextEncoder().encode(
      JSON.stringify(publication),
    ).byteLength;
    if (rows.length > 0 && bytes + publicationBytes > 1024 * 1024) break;
    rows.push(publication);
    bytes += publicationBytes;
    cursor = publication.serviceIndex;
  }
  return { rows, lastIndex };
}

/** Scalar recovery never reads or decodes public deltas. */
export function readServiceActorResolutionSummary(
  db: IDb | ITx,
  props: {
    owner: IServiceOutcomeOwner;
    throughServiceIndex: number;
    afterServiceIndex?: number | undefined;
  },
): IServiceActorResolutionSummary {
  const { owner, throughServiceIndex, afterServiceIndex = 0 } = props;
  if (owner.nodeId === null) {
    return {
      count: 0,
      distinctCount: 0,
      minPushIndex: null,
      maxPushIndex: 0,
      mismatches: 0,
    };
  }
  const encodedClaims = JSON.stringify(owner.claims);
  const claimsMismatch = sql`EXISTS (SELECT fullkey,type,atom FROM json_tree(${commandResolutions.claims}) EXCEPT SELECT fullkey,type,atom FROM json_tree(${encodedClaims})) OR EXISTS (SELECT fullkey,type,atom FROM json_tree(${encodedClaims}) EXCEPT SELECT fullkey,type,atom FROM json_tree(${commandResolutions.claims}))`;
  return (
    db
      .select({
        count: sql<number>`COUNT(*)`,
        distinctCount: sql<number>`COUNT(DISTINCT ${commandResolutions.pushIndex})`,
        minPushIndex: sql<number | null>`MIN(${commandResolutions.pushIndex})`,
        maxPushIndex: sql<number>`COALESCE(MAX(${commandResolutions.pushIndex}),0)`,
        mismatches: sql<number>`COALESCE(SUM(CASE WHEN (${commandResolutions.sessionName} != ${owner.sessionName} OR (${claimsMismatch})) THEN 1 ELSE 0 END),0)`,
      })
      .from(commandResolutions)
      .where(
        and(
          eq(commandResolutions.nodeId, owner.nodeId),
          gt(commandResolutions.serviceIndex, afterServiceIndex),
          lte(commandResolutions.serviceIndex, throughServiceIndex),
        ),
      )
      .get() ?? {
      count: 0,
      distinctCount: 0,
      minPushIndex: null,
      maxPushIndex: 0,
      mismatches: 0,
    }
  );
}
