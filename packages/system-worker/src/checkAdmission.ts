import type {
  IContractRelease,
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { makeEffectSchema } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

/** Validate an ordinary contract's submitted version and encoded payload. */
export const checkAdmission = makeFn('checkAdmission')(function* (props: {
  command: Pick<
    IEncodedCommand<IServiceCommand>,
    'commandName' | 'contractVersion' | 'payload'
  > & { id?: string };
  contract: IContractRelease | undefined;
}) {
  const { command, contract } = props;
  if (contract?.external !== undefined) {
    return yield* makeZerospinError('public-async-command-forbidden');
  }
  const submitted =
    contract?.version === command.contractVersion ? contract : undefined;
  if (submitted === undefined) {
    return yield* makeZerospinError({
      code: 'admission-contract-not-found',
      message: `Unknown submitted contract ${command.commandName}@${command.contractVersion}`,
    });
  }
  yield* Schema.decodeEffect(
    Schema.fromJsonString(makeEffectSchema(submitted.payload)),
  )(command.payload, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'decode-command-payload-failed',
      extra: {
        ...(command.id === undefined ? {} : { commandId: command.id }),
        commandName: submitted.commandName,
        sourceVersion: command.contractVersion,
      },
      prefix: `Failed to decode payload for command "${submitted.commandName}" at version "${command.contractVersion}"`,
    }),
  );
});
