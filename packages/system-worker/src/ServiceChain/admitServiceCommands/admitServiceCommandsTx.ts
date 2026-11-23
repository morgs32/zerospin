import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { ISystemSpec } from '@zerospin/core/system/types';

import { checkAdmissionGrant } from '../../ownerOperations/admissionGrant.js';
import { readExecutingSystemSpec } from '../../workerConfiguration/workerConfiguration.js';
import { type serviceChainDbConfig } from '../serviceChainDbConfig.js';

import { appendServiceCommand } from './appendServiceCommand.js';
import { validateServiceNodeContinuation } from './validateServiceNodeContinuation.js';

/** Decide an ordered ordinary page once under the synchronous retention boundary. */
export const admitServiceCommandsTx = makeTx(
  'ServiceChain.admitServiceCommandsTx',
)(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  entries: readonly {
    command: IEncodedCommand<IServiceCommand>;
    registered: ISystemSpec | undefined;
  }[],
) {
  const admittedCommands: (IEncodedCommand<IServiceCommand> & {
    serviceIndex: number;
  })[] = [];
  for (const { command, registered } of entries) {
    yield* validateServiceNodeContinuation(tx, command);
    yield* checkAdmissionGrant(
      command,
      registered ?? readExecutingSystemSpec(),
    );
    const admittedCommand = yield* appendServiceCommand(tx, command);
    admittedCommands.push(admittedCommand);
  }
  return admittedCommands;
});
