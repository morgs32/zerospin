import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { IServiceAgentProjectionKey } from '../serviceAgentProjection/resolveServiceAgentView.js';
import {
  serviceAgentProjectionDbConfig,
  type IServiceAgentExposedPublication,
} from '../serviceAgentProjection/serviceAgentProjectionDbConfig.js';

import { serviceAgentVersionChainDbConfig } from './serviceAgentVersionChainDbConfig.js';

/** Seal complete public transitions before acknowledging publication. */
export const appendExposedCommands = makeTx(
  'ServiceAgentVersionChain.appendExposedCommands',
)(function* (
  tx: ITx,
  props: {
    key: IServiceAgentProjectionKey;
    sourceKey: IServiceAgentProjectionKey;
    commands: readonly IServiceAgentExposedPublication[];
  },
) {
  const { key, sourceKey, commands } = props;

  if (!isEqual(key, sourceKey)) {
    return yield* makeZerospinError('projection-history-source-mismatch');
  }
  const table = serviceAgentVersionChainDbConfig.schema.exposedCommands;
  const codec = serviceAgentVersionChainDbConfig.tables.exposedCommands;
  let cursor =
    tx
      .select({ serviceIndex: table.serviceIndex })
      .from(table)
      .orderBy(desc(table.serviceIndex))
      .limit(1)
      .get()?.serviceIndex ?? 0;
  const broadcasts: IServiceAgentExposedPublication[] = [];
  for (const input of commands) {
    const command = yield* Schema.decodeUnknownEffect(
      Schema.toType(
        serviceAgentProjectionDbConfig.tables.exposedCommandOutbox.codec,
      ),
    )(input, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'exposed-command-invalid',
        prefix: 'Invalid Service Agent publication',
      }),
    );
    if (command.serviceIndex <= cursor) {
      const row = tx
        .select()
        .from(table)
        .where(eq(table.serviceIndex, command.serviceIndex))
        .get();
      if (row === undefined || !isEqual(yield* codec.decodeRow(row), command)) {
        return yield* makeZerospinError('exposed-command-conflict');
      }
      continue;
    }
    if (command.serviceIndex !== cursor + 1) {
      return yield* makeZerospinError('exposed-command-index-gap');
    }
    tx.insert(table)
      .values(yield* codec.encodeRow(command))
      .run();
    cursor = command.serviceIndex;
    broadcasts.push(command);
  }
  return broadcasts;
});
