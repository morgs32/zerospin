import { EncodedSystemServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { and, eq, or } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import { checkAdmissionGrant } from '../ownerOperations/admissionGrant.js';
import { readExecutingSystemSpec } from '../workerConfiguration/workerConfiguration.js';

import { appendServiceCommand } from './admitServiceCommands/appendServiceCommand.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';

const sourceIndex = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
const operationIndex = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
const positionSchema = Schema.Struct({ sourceIndex, operationIndex });
type IPosition = typeof positionSchema.Type;
type IServiceOwner = { systemId: string; serviceName: string };

function acknowledgement(position: IPosition) {
  return {
    acknowledgedSourceIndex: position.sourceIndex,
    acknowledgedOperationIndex: position.operationIndex,
  };
}
const appendRecordedInput = Effect.fn(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  key: IServiceOwner,
  input: unknown,
  registered?: ISystemSpec,
) {
  const command = yield* Schema.decodeUnknownEffect(
    EncodedSystemServiceCommandSchema,
  )(input, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'service-produced-command-invalid',
      prefix: 'Invalid recorded Service command',
    }),
  );
  if (command.serviceName !== key.serviceName) {
    return yield* makeZerospinError('service-command-scope-mismatch');
  }
  yield* checkAdmissionGrant(command, registered ?? readExecutingSystemSpec());
  return yield* appendServiceCommand(tx, command);
});

/** Retain each independently delivered source position and its destination index. */
const admitOnce = Effect.fn('ServiceChain.admitRecordedOnce')(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  props: {
    key: IServiceOwner;
    source: string;
    position: IPosition;
    command: typeof EncodedSystemServiceCommandSchema.Type;
  },
  registered?: ISystemSpec,
) {
  const { key, source, position, command } = props;
  const table = serviceChainDbConfig.schema.recordedCommandAdmissions;
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
      yield* serviceChainDbConfig.tables.recordedCommandAdmissions.decodeRow(
        row,
      );
    if (
      retained.commandId !== command.id ||
      retained.source !== source ||
      retained.sourceIndex !== position.sourceIndex ||
      retained.operationIndex !== position.operationIndex ||
      !isEqual(retained.command, command)
    ) {
      return yield* makeZerospinError('service-recorded-command-conflict');
    }
    return {
      ...acknowledgement(position),
      destinationIndex: retained.destinationIndex,
    };
  }
  const admitted = yield* appendRecordedInput(tx, key, command, registered);
  const encoded =
    yield* serviceChainDbConfig.tables.recordedCommandAdmissions.encodeRow({
      commandId: command.id,
      source,
      ...position,
      command: yield* Schema.decodeUnknownEffect(Schema.Json)(command),
      destinationIndex: admitted.serviceIndex,
    });
  tx.insert(table).values(encoded).run();
  return {
    ...acknowledgement(position),
    destinationIndex: admitted.serviceIndex,
  };
});

/** Admit or deduplicate a recorded command from an AggregateChain. */
export const admitFromAggregateChainTx = makeTx(
  'ServiceChain.admitFromAggregateChain',
)(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  props: {
    key: IServiceOwner;
    source: { systemId: string; aggregateName: string; aggregateId: string };
    position: IPosition;
    command: typeof EncodedSystemServiceCommandSchema.Type;
  },
  registered?: ISystemSpec,
) {
  const source = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      systemId: Schema.NonEmptyString,
      aggregateName: Schema.NonEmptyString,
      aggregateId: Schema.NonEmptyString,
    }),
  )(props.source, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'service-command-producer-invalid',
      prefix: 'Invalid AggregateChain producer',
    }),
  );
  const position = yield* Schema.decodeUnknownEffect(positionSchema)(
    props.position,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'service-command-producer-invalid',
      prefix: 'Invalid producer position',
    }),
  );
  if (source.systemId !== props.key.systemId) {
    return yield* makeZerospinError('service-command-producer-mismatch');
  }
  return yield* admitOnce(
    tx,
    {
      key: props.key,
      source: JSON.stringify([
        source.systemId,
        source.aggregateName,
        source.aggregateId,
      ]),
      position,
      command: props.command,
    },
    registered,
  );
});

/** Admit or deduplicate a recorded command from a ServiceChain. */
export const admitFromServiceChainTx = makeTx(
  'ServiceChain.admitFromServiceChain',
)(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  props: {
    key: IServiceOwner;
    source: IServiceOwner;
    position: IPosition;
    command: typeof EncodedSystemServiceCommandSchema.Type;
  },
  registered?: ISystemSpec,
) {
  const source = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      systemId: Schema.NonEmptyString,
      serviceName: Schema.NonEmptyString,
    }),
  )(props.source, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'service-command-producer-invalid',
      prefix: 'Invalid ServiceChain producer',
    }),
  );
  const position = yield* Schema.decodeUnknownEffect(positionSchema)(
    props.position,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'service-command-producer-invalid',
      prefix: 'Invalid producer position',
    }),
  );
  if (source.systemId !== props.key.systemId) {
    return yield* makeZerospinError('service-command-producer-mismatch');
  }
  return yield* admitOnce(
    tx,
    {
      key: props.key,
      source: JSON.stringify([source.systemId, source.serviceName]),
      position,
      command: props.command,
    },
    registered,
  );
});
