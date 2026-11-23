import {
  makeZerospinError,
  mapParseError,
  type IZerospinError,
} from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IInferCommandPayload } from '../../models/types.ts';
import type { IContractRelease } from '../types.ts';

import { adaptPayload } from './adaptPayload/adaptPayload.ts';

export function decodeAndAdaptPayload<CONTRACT extends IContractRelease>(
  contract: CONTRACT,
  props: {
    command: {
      readonly commandName: string;
      readonly contractVersion: number;
      readonly payload: string;
    };
  },
): Effect.Effect<
  IInferCommandPayload<CONTRACT['payload']>,
  | IZerospinError<
      | 'contract-command-name-mismatch'
      | 'contract-payload-version-unsupported'
      | 'decode-command-payload-failed'
    >
  | Effect.Error<ReturnType<typeof adaptPayload>>
>;
export function decodeAndAdaptPayload(
  contract: IContractRelease,
  props: {
    command: {
      readonly commandName: string;
      readonly contractVersion: number;
      readonly payload: string;
    };
  },
) {
  return Effect.fn('contracts.decodeAndAdaptPayload')(function* () {
    const { commandName, version } = contract;
    const payloadSchema = makeEffectSchema(contract.payload);
    const payloadJsonSchema = Schema.fromJsonString(payloadSchema);
    const { command } = props;

    if (command.commandName !== commandName) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'contract-command-name-mismatch',
          message: `Contract "${commandName}" cannot decode command "${command.commandName}"`,
          extra: {
            commandName: command.commandName,
            contractName: commandName,
          },
        }),
      );
    }

    if (command.contractVersion !== version) {
      let source: IContractRelease | undefined = contract.previous;
      while (
        source !== undefined &&
        source.version !== command.contractVersion
      ) {
        source = source.previous;
      }
      let adapter: IContractRelease = contract;
      if (source === undefined) {
        source = contract.next;
        while (
          source !== undefined &&
          source.version !== command.contractVersion
        ) {
          source = source.next;
        }
        if (source !== undefined) adapter = source;
      }
      if (source !== undefined) {
        const sourcePayload = yield* decodeAndAdaptPayload(source, props);
        return yield* adaptPayload(adapter, {
          fromVersion: source.version,
          toVersion: version,
          payload: sourcePayload,
        });
      }
      return yield* Effect.fail(
        makeZerospinError({
          code: 'contract-payload-version-unsupported',
          message: `Contract "${commandName}" does not support payload version "${command.contractVersion}"`,
          extra: {
            commandName,
            currentVersion: version,
            sourceVersion: command.contractVersion,
          },
        }),
      );
    }

    return yield* Schema.decodeEffect(payloadJsonSchema)(command.payload, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'decode-command-payload-failed',
        extra: {
          commandName,
          sourceVersion: command.contractVersion,
        },
        prefix: `Failed to decode payload for command "${commandName}" at version "${command.contractVersion}"`,
      }),
    );
  })();
}
