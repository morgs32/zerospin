import { makeSystemAggregateCommandId } from '@zerospin/core/contracts/commandIds';
import { DirectSystemAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Schema from 'effect/Schema';

import { checkAdmissionGrant } from '../ownerOperations/admissionGrant.js';

import { appendAggregateCommand } from './admitAggregateCommands/appendAggregateCommand.js';
import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';

/** A fresh invocation has no retained-ID recovery path, even after an ambiguous timeout. */
export const admitDirectSystemAggregateCommandTx = makeTx(
  'AggregateChain.admitDirectSystemAggregateCommandTx',
)(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  props: {
    command: typeof DirectSystemAggregateCommandSchema.Type;
    key: { systemId: string; aggregateName: string; aggregateId: string };
    systemSpec: ISystemSpec;
  },
) {
  const { key } = props;
  const input = yield* Schema.decodeUnknownEffect(
    DirectSystemAggregateCommandSchema,
  )(props.command, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-command-input-invalid',
      prefix: 'Invalid direct System input',
    }),
  );
  const progress = tx
    .select()
    .from(aggregateChainDbConfig.schema.commandProgress)
    .where(eq(aggregateChainDbConfig.schema.commandProgress.singleton, 1))
    .get();
  if (progress === undefined) {
    return yield* makeZerospinError('aggregate-command-progress-missing');
  }
  const position = progress.admittedThroughIndex + 1;
  const command = {
    ...input,
    id: makeSystemAggregateCommandId(
      key.systemId,
      input.aggregateName,
      input.aggregateId,
      position,
    ),
  };
  if (
    command.aggregateName !== key.aggregateName ||
    command.aggregateId !== key.aggregateId
  ) {
    return yield* makeZerospinError('aggregate-command-scope-mismatch');
  }
  yield* checkAdmissionGrant(command, props.systemSpec);

  return yield* appendAggregateCommand(tx, command);
});
