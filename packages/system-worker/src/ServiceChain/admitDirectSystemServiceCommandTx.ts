import { makeSystemServiceCommandId } from '@zerospin/core/contracts/commandIds';
import { DirectSystemServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

import { checkAdmissionGrant } from '../ownerOperations/admissionGrant.js';
import { readExecutingSystemSpec } from '../workerConfiguration/workerConfiguration.js';

import { appendServiceCommand } from './admitServiceCommands/appendServiceCommand.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';

/** A fresh invocation has no retained-ID recovery path, even after an ambiguous timeout. */
export const admitDirectSystemServiceCommandTx = makeTx(
  'ServiceChain.admitDirectSystemServiceCommandTx',
)(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  props: {
    command: typeof DirectSystemServiceCommandSchema.Type;
    key: { systemId: string; serviceName: string };
  },
  registered?: ISystemSpec,
) {
  const { key } = props;
  const input = yield* Schema.decodeUnknownEffect(
    DirectSystemServiceCommandSchema,
  )(props.command, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-command-input-invalid',
      prefix: 'Invalid direct System input',
    }),
  );
  const position =
    (tx.select().from(serviceChainDbConfig.schema.admissionPosition).get()
      ?.lastIndex ?? 0) + 1;
  const command = {
    ...input,
    id: makeSystemServiceCommandId(key.systemId, input.serviceName, position),
  };
  yield* checkAdmissionGrant(command, registered ?? readExecutingSystemSpec());
  if (command.serviceName !== key.serviceName) {
    return yield* makeZerospinError('service-command-scope-mismatch');
  }
  return yield* appendServiceCommand(tx, command);
});
