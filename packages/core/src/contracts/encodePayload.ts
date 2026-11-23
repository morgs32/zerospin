import {
  makeZerospinError,
  mapParseError,
  type IZerospinError,
} from '@zerospin/error';
/* oxlint-disable typescript/no-explicit-any -- Erased contract payloads retain the existing runtime-validation boundary. */
import { makeEffectSchema, type IShape } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IInferCommandPayload } from '../models/types.ts';

import type { IContractRelease } from './types.ts';

export function encodePayload<
  CONTRACT extends IContractRelease,
  SOURCE_VERSION extends keyof NonNullable<CONTRACT['__payloads']> & number,
>(
  contract: CONTRACT,
  props: {
    version: SOURCE_VERSION;
    payload: IShape extends NonNullable<CONTRACT['__payloads']>[SOURCE_VERSION]
      ? any
      : IInferCommandPayload<
          NoInfer<NonNullable<CONTRACT['__payloads']>[SOURCE_VERSION]>
        >;
  },
): Effect.Effect<
  string,
  IZerospinError<
    'contract-payload-version-unsupported' | 'encode-command-payload-failed'
  >
> {
  return Effect.fn('contracts.encodePayload')(function* () {
    const { commandName, version } = contract;
    const payloadSchema = makeEffectSchema(contract.payload);
    const payloadJsonSchema = Schema.fromJsonString(payloadSchema);
    const { payload, version: sourceVersion } = props;
    if (sourceVersion !== version) {
      const parent = contract.previous;
      if (parent !== undefined) {
        return yield* encodePayload(parent, props);
      }
      return yield* Effect.fail(
        makeZerospinError({
          code: 'contract-payload-version-unsupported',
          message: `Contract "${commandName}" does not support payload version "${sourceVersion}"`,
          extra: {
            commandName,
            currentVersion: version,
            sourceVersion,
          },
        }),
      );
    }
    return yield* Schema.encodeEffect(payloadJsonSchema)(payload, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'encode-command-payload-failed',
        prefix: `Failed to encode payload for command "${commandName}" at version "${sourceVersion}"`,
        extra: { commandName, sourceVersion },
      }),
    );
  })();
}
