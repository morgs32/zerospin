import { makeAggregateExposedCommand } from '@zerospin/core/aggregateSession/aggregateExposedCommandsTable';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { IAggregateProjectionKey } from '../aggregateProjection/resolveAggregateProjectionView.js';

import {
  AggregateAgentExposedPublicationSchema,
  type IAggregateAgentExposedPublication,
  type IAggregateExposedPublication,
} from './aggregateExposedPublication.js';
import { aggregateAgentSessionChainDbConfig } from './aggregateSessionChainDbConfig.js';

/** Agent history stays local; Actor publications belong to AggregateActorHistory. */
export const appendExposedCommands = makeTx(
  'AggregateSessionChain.appendExposedCommands',
)(function* (
  tx: ITx,
  props: {
    key: IAggregateProjectionKey;
    sourceKey: IAggregateProjectionKey;
    commands: readonly (
      | IAggregateExposedPublication
      | IAggregateAgentExposedPublication
    )[];
  },
) {
  const { key, sourceKey, commands } = props;
  if (!isEqual(key, sourceKey)) {
    return yield* makeZerospinError('projection-history-source-mismatch');
  }
  if ('actorName' in key) {
    return yield* makeZerospinError('aggregate-actor-history-required');
  }
  const table = aggregateAgentSessionChainDbConfig.schema.exposedCommands;
  let cursor =
    tx
      .select({ aggregateIndex: table.aggregateIndex })
      .from(table)
      .orderBy(desc(table.aggregateIndex))
      .limit(1)
      .get()?.aggregateIndex ?? 0;
  const broadcasts = [];
  for (const input of commands) {
    const command = yield* Schema.decodeUnknownEffect(
      Schema.toType(AggregateAgentExposedPublicationSchema),
    )(input, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'exposed-command-invalid',
        prefix: 'Invalid Agent exposed command',
      }),
    );
    if (command.aggregateIndex <= cursor) {
      const retained = tx
        .select()
        .from(table)
        .where(eq(table.aggregateIndex, command.aggregateIndex))
        .get();
      if (
        retained === undefined ||
        !isEqual(
          yield* aggregateAgentSessionChainDbConfig.tables.exposedCommands.decodeRow(
            retained,
          ),
          command,
        )
      ) {
        return yield* makeZerospinError('exposed-command-conflict');
      }
      continue;
    }
    if (command.aggregateIndex !== cursor + 1) {
      return yield* makeZerospinError('exposed-command-index-gap');
    }
    tx.insert(table)
      .values(
        yield* aggregateAgentSessionChainDbConfig.tables.exposedCommands.encodeRow(
          command,
        ),
      )
      .run();
    cursor = command.aggregateIndex;
    broadcasts.push({
      output: makeAggregateExposedCommand({ ...command, failure: null }),
      commandResolution: null,
    });
  }
  return broadcasts;
});
