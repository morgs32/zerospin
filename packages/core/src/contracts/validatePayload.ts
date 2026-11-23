import {
  makeZerospinError,
  mapParseError,
  type IZerospinError,
} from '@zerospin/error';
/* oxlint-disable typescript/no-explicit-any -- Erased contract payloads retain the existing runtime-validation boundary. */
import { makeEffectSchema, PrimitiveKind, type IShape } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import type {
  IInferCommandPayload,
  IInferPayloadInput,
} from '../models/types.ts';

import type { IContractRelease } from './types.ts';

export function validatePayload<
  PAYLOADS extends Record<number, IShape>,
  SOURCE_VERSION extends keyof PAYLOADS & number,
>(
  contract: IContractRelease<string, IShape, number, unknown, PAYLOADS>,
  props: {
    version: SOURCE_VERSION;
    payload: NoInfer<
      IShape extends PAYLOADS[SOURCE_VERSION]
        ? any
        : IInferPayloadInput<PAYLOADS[SOURCE_VERSION]>
    >;
  },
): Effect.Effect<
  IShape extends PAYLOADS[SOURCE_VERSION]
    ? any
    : IInferCommandPayload<PAYLOADS[SOURCE_VERSION]>,
  IZerospinError<
    | 'contract-payload-version-unsupported'
    | 'encode-command-json-payload-field-failed'
    | 'validate-command-payload-failed'
  >
>;
export function validatePayload(
  contract: IContractRelease<
    string,
    IShape,
    number,
    unknown,
    Record<number, IShape>
  >,
  props: { version: number; payload: Record<string, unknown> },
) {
  return Effect.fn('contracts.validatePayload')(function* () {
    const { commandName, version } = contract;
    const { payload: commandPayload, version: sourceVersion } = props;
    if (sourceVersion !== version) {
      const parent = contract.previous;
      if (parent !== undefined) {
        return yield* validatePayload(parent, props);
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
    return yield* validateCurrentPayload(contract, commandPayload);
  })();
}

/** Decode the authored current payload after the owning phase has resolved its version. */
export function validateCurrentPayload<PAYLOAD extends IShape>(
  contract: Pick<
    IContractRelease<string, PAYLOAD>,
    'commandName' | 'version' | 'payload'
  >,
  commandPayload: NoInfer<
    IShape extends PAYLOAD ? any : IInferPayloadInput<PAYLOAD>
  >,
): Effect.Effect<
  IShape extends PAYLOAD ? any : IInferCommandPayload<PAYLOAD>,
  IZerospinError<
    | 'encode-command-json-payload-field-failed'
    | 'validate-command-payload-failed'
  >
>;
export function validateCurrentPayload(
  contract: Pick<IContractRelease, 'commandName' | 'version' | 'payload'>,
  commandPayload: Record<string, unknown>,
) {
  return Effect.gen(function* () {
    const { commandName, version: sourceVersion, payload } = contract;
    const payloadSchema = makeEffectSchema(payload);
    const encodedPayload: Record<string, unknown> = { ...commandPayload };
    yield* Effect.all(
      mapValues(payload, (descriptor, key) =>
        Effect.gen(function* () {
          if (descriptor.kind !== PrimitiveKind.Json) {
            return;
          }
          const value = encodedPayload[key];
          if (
            value === undefined ||
            (value === null && descriptor.nullable === true)
          ) {
            return;
          }
          encodedPayload[key] = yield* Schema.encodeEffect(
            Schema.fromJsonString(descriptor.schema),
          )(value).pipe(
            mapParseError({
              code: 'encode-command-json-payload-field-failed',
              prefix: `Failed to encode JSON payload field "${key}" for command "${commandName}" at version "${sourceVersion}"`,
            }),
          );
        }),
      ),
      { concurrency: 1 },
    );
    return yield* Schema.decodeUnknownEffect(payloadSchema)(encodedPayload, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'validate-command-payload-failed',
        prefix: `Failed to validate payload for command "${commandName}" at version "${sourceVersion}"`,
        extra: { commandName, sourceVersion },
      }),
    );
  });
}
