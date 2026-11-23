import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import {
  decodeAggregateHistoryCommand,
  readAggregateArchiveTip,
} from '../AggregateVersionChain/aggregateHistoryStorage.js';
import {
  encodeAggregateCommandProvenance,
  type IEvaluatedAggregateCommand,
} from '../AggregateVersionChain/evaluatedAggregateCommand.js';

import { aggregateVersionArchiveDbConfig } from './aggregateVersionArchiveDbConfig.js';

/** Append a complete ordered batch, or leave every new position uncommitted. */
export function appendEvaluatedCommandsTx(
  db: IDb<typeof aggregateVersionArchiveDbConfig>,
  props: {
    commands: readonly IEvaluatedAggregateCommand[];
    firstAggregateIndex: number;
  },
) {
  db.transaction(tx => {
    const { commands } = aggregateVersionArchiveDbConfig.schema;
    let tip = readAggregateArchiveTip(
      aggregateVersionArchiveDbConfig,
      tx,
      props.firstAggregateIndex,
    );
    let previousIndex = 0;
    for (const command of props.commands) {
      if (
        command.aggregateIndex < props.firstAggregateIndex ||
        command.aggregateIndex <= previousIndex
      ) {
        throw makeZerospinError('aggregate-version-archive-order-invalid');
      }
      previousIndex = command.aggregateIndex;
      const retained = tx
        .select()
        .from(commands)
        .where(eq(commands.aggregateIndex, command.aggregateIndex))
        .get();
      if (retained !== undefined) {
        if (
          !isEqual(
            decodeAggregateHistoryCommand(
              aggregateVersionArchiveDbConfig,
              retained,
            ),
            command,
          )
        ) {
          throw makeZerospinError('aggregate-version-archive-command-mismatch');
        }
        continue;
      }
      if (command.aggregateIndex !== tip + 1) {
        throw makeZerospinError('aggregate-version-archive-history-gap');
      }
      const row = Schema.encodeSync(
        aggregateVersionArchiveDbConfig.tables.commands.codec,
      )({ ...command, ...encodeAggregateCommandProvenance(command) });
      tx.insert(commands).values(row).run();
      tip = command.aggregateIndex;
    }
  });
}
