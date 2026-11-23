import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { DirectSystemServiceCommandSchema } from '../../contracts/CommandSchema.ts';
import { encodePayload } from '../../contracts/encodePayload.ts';
import { validateCurrentPayload } from '../../contracts/validatePayload.ts';
import type { IInferPayloadInput } from '../../models/types.ts';
import type { IAnyServiceRelease } from '../../service/types.ts';

export type ISystemServiceCommandInput<
  RELEASE extends IAnyServiceRelease,
  NAME extends keyof RELEASE['system'] & string,
> = {
  contractName: NAME;
  payload: NoInfer<IInferPayloadInput<RELEASE['system'][NAME]['payload']>>;
};

/** Freeze immutable invocation input; each execution admits a new command. */
export function prepareSystemServiceCommand<
  RELEASE extends IAnyServiceRelease,
  NAME extends keyof RELEASE['system'] & string,
>(release: RELEASE, input: ISystemServiceCommandInput<RELEASE, NAME>) {
  return Effect.runSyncExit(
    Effect.gen(function* () {
      const submitted = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          contractName: Schema.String,
          payload: Schema.Unknown,
        }),
      )(input, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'system-command-input-invalid',
          prefix: 'Invalid administrative command input',
        }),
      );
      const contract = release.system[submitted.contractName];
      if (
        !Object.hasOwn(release.system, submitted.contractName) ||
        contract === undefined ||
        contract.external !== undefined ||
        contract.claims !== undefined
      ) {
        return yield* makeZerospinError('administrative-contract-unavailable');
      }
      const decodedPayload = yield* validateCurrentPayload(
        contract,
        submitted.payload,
      );
      const payload = yield* encodePayload(contract, {
        version: contract.version,
        payload: decodedPayload,
      });
      const command = yield* Schema.encodeEffect(
        DirectSystemServiceCommandSchema,
      )({
        serviceName: release.name,
        serviceVersion: release.version,
        commandName: contract.commandName,
        contractVersion: contract.version,
        payload,
        kind: 'system',
      }).pipe(
        mapParseError({
          code: 'system-command-encode-failed',
          prefix: 'Cannot encode administrative command',
        }),
      );
      return Object.freeze(command);
    }),
  );
}
