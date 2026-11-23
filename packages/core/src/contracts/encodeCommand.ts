import * as Effect from 'effect/Effect';

import { encodePayload } from './encodePayload.ts';
import type { ICommand, IContractRelease } from './types.ts';

export const encodeCommand = Effect.fn('encodeCommand')(function* <
  const COMMAND extends Pick<
    ICommand,
    'commandName' | 'contractVersion' | 'payload'
  >,
>(props: { contract: IContractRelease; command: COMMAND }) {
  const { contract, command } = props;
  const payload = yield* encodePayload(contract, {
    version: command.contractVersion,
    payload: command.payload,
  });
  const { payload: _payload, ...commandFields } = command;

  return {
    ...commandFields,
    payload,
  };
});
