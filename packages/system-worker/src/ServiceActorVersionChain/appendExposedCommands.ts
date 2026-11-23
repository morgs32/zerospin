import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeServiceExposedCommand } from '@zerospin/core/serviceSession/makeServiceExposedCommand';
import { ServiceExposedCommandSchema } from '@zerospin/core/serviceSession/ServiceSessionWireSchema';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { IServiceProjectionKey } from '../serviceProjection/resolveServiceActorView.js';
import { serviceExposedCommandsTable } from '../serviceProjection/serviceExposedCommandsTable.js';
import {
  serviceProjectionDbConfig,
  type IServiceExposedPublication,
} from '../serviceProjection/serviceProjectionDbConfig.js';

import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';

/** Public insertion seals its private resolution or its absence before acknowledging the complete publication. */
export const appendExposedCommands = makeTx(
  'ServiceActorVersionChain.appendExposedCommands',
)(function* (
  tx: ITx,
  props: {
    key: IServiceProjectionKey;
    sourceKey: IServiceProjectionKey;
    commands: readonly IServiceExposedPublication[];
  },
) {
  const { key, sourceKey, commands } = props;

  if (!isEqual(key, sourceKey)) {
    return yield* makeZerospinError('projection-history-source-mismatch');
  }
  const { exposedCommands, commandResolutions } =
    serviceActorVersionChainDbConfig.schema;
  const publications = serviceProjectionDbConfig.tables.exposedCommandOutbox;
  const { historyHead } = serviceActorVersionChainDbConfig.schema;
  let cursor =
    tx.select().from(historyHead).where(eq(historyHead.singletonId, 1)).get()
      ?.serviceIndex ?? 0;
  const newCount = commands.filter(
    command => command.serviceIndex > cursor,
  ).length;
  if (newCount > 64) {
    return yield* makeZerospinError(
      'service-actor-publication-batch-too-large',
    );
  }
  const retainedCount =
    tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(exposedCommands)
      .get()?.count ?? 0;
  if (retainedCount + newCount > 64) {
    return yield* makeZerospinError('service-actor-archive-backlog-full');
  }
  const broadcasts = [];
  for (const input of commands) {
    const publication = yield* Schema.decodeUnknownEffect(
      Schema.toType(publications.codec),
    )(input, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'exposed-command-invalid',
        prefix: 'Invalid exposed service command',
      }),
    );
    const output = makeServiceExposedCommand(publication);
    yield* Schema.decodeUnknownEffect(
      Schema.toType(ServiceExposedCommandSchema),
    )(output).pipe(
      mapParseError({
        code: 'exposed-command-invalid',
        prefix: 'Invalid exposed service output',
      }),
    );
    const { commandResolution, ...command } = publication;
    if (command.serviceIndex <= cursor) {
      continue;
    }
    if (command.serviceIndex !== cursor + 1) {
      return yield* makeZerospinError('exposed-command-index-gap');
    }
    tx.insert(exposedCommands)
      .values(yield* serviceExposedCommandsTable.encodeRow(command))
      .run();
    if (commandResolution !== null) {
      tx.insert(commandResolutions)
        .values(
          yield* serviceActorVersionChainDbConfig.tables.commandResolutions.encodeRow(
            { serviceIndex: command.serviceIndex, ...commandResolution },
          ),
        )
        .run();
    }
    cursor = command.serviceIndex;
    tx.insert(historyHead)
      .values({
        singletonId: 1,
        serviceIndex: cursor,
        dispositionChainHash: command.dispositionChainHash,
      })
      .onConflictDoUpdate({
        target: historyHead.singletonId,
        set: {
          serviceIndex: cursor,
          dispositionChainHash: command.dispositionChainHash,
        },
      })
      .run();
    broadcasts.push({
      output,
      owner:
        commandResolution === null
          ? undefined
          : {
              kind: 'actor' as const,
              actorName: key.actorName,
              actorVersion: key.actorVersion,
              claims: commandResolution.claims,
              nodeId: commandResolution.nodeId,
              sessionName: commandResolution.sessionName,
              pushIndex: commandResolution.pushIndex,
            },
    });
  }
  return broadcasts;
});
