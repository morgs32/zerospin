import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { and, asc, desc, eq, gt, lte, or, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { IAggregateProjectionKey } from '../aggregateProjection/resolveAggregateProjectionView.js';
import {
  AggregateExposedPublicationSchema,
  type IAggregateExposedPublication,
} from '../aggregateSessionChain/aggregateExposedPublication.js';
import { aggregateSessionChainDbConfig } from '../aggregateSessionChain/aggregateSessionChainDbConfig.js';

export type IAggregateActorHistoryKey = Extract<
  IAggregateProjectionKey,
  { actorName: string }
>;
export type IAggregateActorPage = {
  afterAggregateIndex?: number;
  afterScannedIndex?: number;
  throughAggregateIndex?: number;
  nodeId?: string;
  afterPushIndex?: number;
  limit?: number;
};
export type IAggregateResolutionRequest = {
  nodeId: string;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  throughAggregateIndex: number;
};
export type IAggregateResolutionSummary = {
  count: number;
  distinctCount: number;
  minPushIndex: number;
  maxPushIndex: number;
  mismatches: number;
};

const { exposedCommands, commandResolutions } =
  aggregateSessionChainDbConfig.schema;

export function readLocalAggregateActorTip(db: IDb, firstAggregateIndex = 1) {
  return (
    db
      .select({ aggregateIndex: exposedCommands.aggregateIndex })
      .from(exposedCommands)
      .orderBy(desc(exposedCommands.aggregateIndex))
      .limit(1)
      .get()?.aggregateIndex ?? firstAggregateIndex - 1
  );
}

export function readLocalAggregateActorPublication(
  db: IDb,
  aggregateIndex: number,
): IAggregateExposedPublication | null {
  const row = db
    .select({ command: exposedCommands, resolution: commandResolutions })
    .from(exposedCommands)
    .leftJoin(
      commandResolutions,
      eq(commandResolutions.aggregateIndex, exposedCommands.aggregateIndex),
    )
    .where(eq(exposedCommands.aggregateIndex, aggregateIndex))
    .get();
  if (row === undefined) return null;
  const command = Effect.runSync(
    aggregateSessionChainDbConfig.tables.exposedCommands.decodeRow(row.command),
  );
  if (row.resolution === null) {
    return Schema.decodeUnknownSync(
      Schema.toType(AggregateExposedPublicationSchema),
    )({ ...command, commandResolution: null });
  }
  const { aggregateIndex: _index, ...commandResolution } = Effect.runSync(
    aggregateSessionChainDbConfig.tables.commandResolutions.decodeRow(
      row.resolution,
    ),
  );
  return Schema.decodeUnknownSync(
    Schema.toType(AggregateExposedPublicationSchema),
  )({ ...command, commandResolution });
}

/** Read candidates incrementally; scannedThrough also advances across empty private ranges. */
export function readLocalAggregateActorPage(
  db: IDb,
  props: IAggregateActorPage,
  maximum: number,
) {
  const commands: IAggregateExposedPublication[] = [];
  let scannedThrough = props.afterScannedIndex ?? 0;
  let bytes = 0;
  const limit = Math.min(props.limit ?? 64, 64);
  while (commands.length < limit && scannedThrough < maximum) {
    const row = db
      .select({ aggregateIndex: exposedCommands.aggregateIndex })
      .from(exposedCommands)
      .leftJoin(
        commandResolutions,
        eq(commandResolutions.aggregateIndex, exposedCommands.aggregateIndex),
      )
      .where(
        and(
          gt(exposedCommands.aggregateIndex, scannedThrough),
          lte(exposedCommands.aggregateIndex, maximum),
          or(
            gt(exposedCommands.aggregateIndex, props.afterAggregateIndex ?? 0),
            props.nodeId === undefined
              ? undefined
              : and(
                  eq(commandResolutions.nodeId, props.nodeId),
                  gt(commandResolutions.pushIndex, props.afterPushIndex ?? 0),
                ),
          ),
        ),
      )
      .orderBy(asc(exposedCommands.aggregateIndex))
      .limit(1)
      .get();
    if (row === undefined) {
      if (maximum > Math.max(props.afterAggregateIndex ?? 0, scannedThrough)) {
        throw makeZerospinError('projection-history-command-missing');
      }
      scannedThrough = maximum;
      break;
    }
    const command = readLocalAggregateActorPublication(db, row.aggregateIndex);
    if (command === null) {
      throw makeZerospinError('projection-history-command-missing');
    }
    const size = new TextEncoder().encode(JSON.stringify(command)).byteLength;
    if (commands.length > 0 && bytes + size > 1024 * 1024) break;
    commands.push(command);
    bytes += size;
    scannedThrough = command.aggregateIndex;
  }
  return { commands, scannedThrough };
}

/** A scalar prefix read must not decode the public delta. */
export function readLocalAggregateResolutionSummary(
  db: IDb,
  props: IAggregateResolutionRequest,
  afterAggregateIndex = 0,
): IAggregateResolutionSummary {
  const encodedClaims = JSON.stringify(props.claims);
  const claimsMismatch = sql`EXISTS (SELECT fullkey,type,atom FROM json_tree(${commandResolutions.claims}) EXCEPT SELECT fullkey,type,atom FROM json_tree(${encodedClaims})) OR EXISTS (SELECT fullkey,type,atom FROM json_tree(${encodedClaims}) EXCEPT SELECT fullkey,type,atom FROM json_tree(${commandResolutions.claims}))`;
  return (
    db
      .select({
        count: sql<number>`COUNT(*)`,
        distinctCount: sql<number>`COUNT(DISTINCT ${commandResolutions.pushIndex})`,
        minPushIndex: sql<number>`COALESCE(MIN(${commandResolutions.pushIndex}),0)`,
        maxPushIndex: sql<number>`COALESCE(MAX(${commandResolutions.pushIndex}),0)`,
        mismatches: sql<number>`COALESCE(SUM(CASE WHEN (${commandResolutions.sessionName} != ${props.sessionName} OR (${claimsMismatch})) THEN 1 ELSE 0 END),0)`,
      })
      .from(commandResolutions)
      .where(
        and(
          eq(commandResolutions.nodeId, props.nodeId),
          gt(commandResolutions.aggregateIndex, afterAggregateIndex),
          lte(commandResolutions.aggregateIndex, props.throughAggregateIndex),
        ),
      )
      .get() ?? {
      count: 0,
      distinctCount: 0,
      minPushIndex: 0,
      maxPushIndex: 0,
      mismatches: 0,
    }
  );
}

/** Seal complete public/private publications in one synchronous transaction. */
export function appendLocalAggregateActorPublications(
  tx: ITx,
  commands: readonly IAggregateExposedPublication[],
  currentIndex: number,
) {
  let cursor = currentIndex;
  let previous = 0;
  for (const input of commands) {
    const publication = Schema.decodeUnknownSync(
      Schema.toType(AggregateExposedPublicationSchema),
    )(input, { onExcessProperty: 'error' });
    if (publication.aggregateIndex <= previous) {
      throw makeZerospinError('exposed-command-index-gap');
    }
    previous = publication.aggregateIndex;
    if (publication.aggregateIndex <= cursor) {
      if (
        !isEqual(
          readLocalAggregateActorPublication(tx, publication.aggregateIndex),
          publication,
        )
      ) {
        throw makeZerospinError('exposed-command-conflict');
      }
      continue;
    }
    if (publication.aggregateIndex !== cursor + 1) {
      throw makeZerospinError('exposed-command-index-gap');
    }
    const { commandResolution, ...command } = publication;
    tx.insert(exposedCommands)
      .values(
        Schema.encodeSync(
          aggregateSessionChainDbConfig.tables.exposedCommands.codec,
        )(command),
      )
      .run();
    if (commandResolution !== null) {
      tx.insert(commandResolutions)
        .values(
          Schema.encodeSync(
            aggregateSessionChainDbConfig.tables.commandResolutions.codec,
          )({ aggregateIndex: command.aggregateIndex, ...commandResolution }),
        )
        .run();
    }
    cursor = command.aggregateIndex;
  }
}
