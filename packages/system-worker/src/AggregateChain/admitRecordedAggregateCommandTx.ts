import { EncodedSystemAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { and, eq, or } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import { checkAdmissionGrant } from '../ownerOperations/admissionGrant.js';
import { readExecutingSystemSpec } from '../workerConfiguration/workerConfiguration.js';

import { appendAggregateCommand } from './admitAggregateCommands/appendAggregateCommand.js';
import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';

type IAggregateKey = {
  systemId: string;
  aggregateName: string;
  aggregateId: string;
};
type IDeliveryPosition = { sourceIndex: number; operationIndex: number };

const admitNewRecordedCommand = Effect.fn(
  'AggregateChain.admitNewRecordedCommand',
)(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  command: unknown,
  key: IAggregateKey,
) {
  const decoded = yield* Schema.decodeUnknownEffect(
    EncodedSystemAggregateCommandSchema,
  )(command, { onExcessProperty: 'error' });
  if (
    decoded.aggregateName !== key.aggregateName ||
    decoded.aggregateId !== key.aggregateId
  ) {
    return yield* makeZerospinError('aggregate-command-owner-mismatch');
  }
  yield* checkAdmissionGrant(decoded, readExecutingSystemSpec());
  return yield* appendAggregateCommand(tx, decoded);
});

/** Retain each independently delivered source position and its destination index. */
const admitOnce = Effect.fn('AggregateChain.admitRecordedOnce')(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  props: {
    key: IAggregateKey;
    source: string;
    position: IDeliveryPosition;
    command: unknown;
  },
) {
  const { key, source, position } = props;
  const command = yield* Schema.decodeUnknownEffect(
    EncodedSystemAggregateCommandSchema,
  )(props.command, { onExcessProperty: 'error' });
  const table = aggregateChainDbConfig.schema.recordedCommandAdmissions;
  const row = tx
    .select()
    .from(table)
    .where(
      or(
        eq(table.commandId, command.id),
        and(
          eq(table.source, source),
          eq(table.sourceIndex, position.sourceIndex),
          eq(table.operationIndex, position.operationIndex),
        ),
      ),
    )
    .get();
  if (row !== undefined) {
    const retained =
      yield* aggregateChainDbConfig.tables.recordedCommandAdmissions.decodeRow(
        row,
      );
    if (
      retained.commandId !== command.id ||
      retained.source !== source ||
      retained.sourceIndex !== position.sourceIndex ||
      retained.operationIndex !== position.operationIndex ||
      !isEqual(retained.command, command)
    ) {
      return yield* makeZerospinError('aggregate-recorded-command-conflict');
    }
    return {
      acknowledgedSourceIndex: position.sourceIndex,
      acknowledgedOperationIndex: position.operationIndex,
      destinationIndex: retained.destinationIndex,
    };
  }
  const admitted = yield* admitNewRecordedCommand(tx, command, key);
  const encoded =
    yield* aggregateChainDbConfig.tables.recordedCommandAdmissions.encodeRow({
      commandId: command.id,
      source,
      ...position,
      command: yield* Schema.decodeUnknownEffect(Schema.Json)(command),
      destinationIndex: admitted.aggregateIndex,
    });
  tx.insert(table).values(encoded).run();
  return {
    acknowledgedSourceIndex: position.sourceIndex,
    acknowledgedOperationIndex: position.operationIndex,
    destinationIndex: admitted.aggregateIndex,
  };
});

/** Admit or deduplicate a recorded command from an AggregateChain. */
export const admitFromAggregateChainTx = makeTx(
  'AggregateChain.admitFromAggregateChainTx',
)(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  props: {
    source: IAggregateKey;
    position: IDeliveryPosition;
    command: unknown;
    key: IAggregateKey;
  },
) {
  const { source, position, command, key } = props;
  if (source.systemId !== key.systemId) {
    return yield* makeZerospinError('aggregate-producer-binding-invalid');
  }
  return yield* admitOnce(tx, {
    key,
    source: JSON.stringify([
      source.systemId,
      source.aggregateName,
      source.aggregateId,
    ]),
    position,
    command,
  });
});

/** Admit or deduplicate a recorded command from a ServiceChain. */
export const admitFromServiceChainTx = makeTx(
  'AggregateChain.admitFromServiceChainTx',
)(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  props: {
    source: { systemId: string; serviceName: string };
    position: IDeliveryPosition;
    command: unknown;
    key: IAggregateKey;
  },
) {
  const { source, position, command, key } = props;
  if (source.systemId !== key.systemId) {
    return yield* makeZerospinError('aggregate-producer-binding-invalid');
  }
  return yield* admitOnce(tx, {
    key,
    source: JSON.stringify([source.systemId, source.serviceName]),
    position,
    command,
  });
});
