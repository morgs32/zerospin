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

import { runAuthoredCallback } from '../../../execution/runAuthoredCallback.ts';
import type { IInferCommandPayload } from '../../../models/types.ts';
import { DownAdapterRefused } from '../../DownAdapterRefused.ts';
import type { IContractRelease } from '../../types.ts';

export function adaptPayload<
  CONTRACT extends IContractRelease,
  FROM extends keyof NonNullable<CONTRACT['__payloads']> & number,
  TO extends keyof NonNullable<CONTRACT['__payloads']> & number,
>(
  contract: CONTRACT,
  props: {
    fromVersion: FROM;
    toVersion: TO;
    payload: IShape extends NonNullable<CONTRACT['__payloads']>[FROM]
      ? any
      : IInferCommandPayload<
          NoInfer<NonNullable<CONTRACT['__payloads']>[FROM]>
        >;
  },
): Effect.Effect<
  IShape extends NonNullable<CONTRACT['__payloads']>[TO]
    ? any
    : IInferCommandPayload<NonNullable<CONTRACT['__payloads']>[TO]>,
  | typeof DownAdapterRefused
  | IZerospinError<
      | 'contract-payload-version-unsupported'
      | 'validate-command-payload-failed'
      | 'encode-command-json-payload-field-failed'
      | 'contract-payload-adapter-missing'
      | 'contract-payload-adapter-failed'
      | 'contract-payload-adapter-output-invalid'
    >
>;
export function adaptPayload(
  contract: IContractRelease,
  props: { fromVersion: number; toVersion: number; payload: unknown },
): Effect.Effect<unknown, typeof DownAdapterRefused | IZerospinError>;
export function adaptPayload(
  contract: IContractRelease,
  props: { fromVersion: number; toVersion: number; payload: unknown },
) {
  const { fromVersion, toVersion, payload } = props;

  return Effect.fn('contracts.adaptPayload')(function* () {
    const { commandName } = contract;
    const lineage: IContractRelease[] = [];
    let ancestor: IContractRelease | undefined = contract;
    while (ancestor !== undefined) {
      lineage.push(ancestor);
      ancestor = ancestor.previous;
    }
    let index = lineage.findIndex(item => item.version === fromVersion);
    const targetIndex = lineage.findIndex(item => item.version === toVersion);
    const source = lineage[index];
    if (source === undefined || targetIndex === -1) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'contract-payload-version-unsupported',
          message: `Unknown adaptation version for ${commandName}`,
          extra: { fromVersion, toVersion },
        }),
      );
    }
    if (Schema.is(Schema.Record(Schema.String, Schema.Unknown))(payload)) {
      yield* Effect.all(
        mapValues(source.payload, (descriptor, key) => {
          const value = payload[key];
          if (
            descriptor.kind !== PrimitiveKind.Json ||
            value === undefined ||
            (value === null && descriptor.nullable === true)
          ) {
            return Effect.void;
          }
          return Schema.decodeUnknownEffect(Schema.toType(descriptor.schema))(
            value,
          ).pipe(
            mapParseError({
              code: 'encode-command-json-payload-field-failed',
              prefix: `Failed to encode JSON payload field "${key}" for command "${commandName}" at version "${source.version}"`,
            }),
          );
        }),
        { concurrency: 1 },
      );
    }
    let adapted = yield* Schema.decodeUnknownEffect(
      Schema.toType(makeEffectSchema(source.payload)),
    )(payload, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'validate-command-payload-failed',
        prefix: `Invalid source payload for ${commandName}@${source.version}`,
      }),
    );
    while (index !== targetIndex) {
      const upward = index > targetIndex;
      const nextIndex = upward ? index - 1 : index + 1;
      const child = lineage[upward ? nextIndex : index];
      const destination = lineage[nextIndex];
      const adapter = upward ? child?.up : child?.down;
      if (adapter === undefined || destination === undefined) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'contract-payload-adapter-missing',
            message: `Missing ${upward ? 'up' : 'down'} adapter for ${commandName}`,
            extra: {
              fromVersion,
              toVersion,
            },
          }),
        );
      }
      const result = yield* runAuthoredCallback({
        program: Effect.suspend(() => adapter({ payload: adapted })),
        code: 'contract-payload-adapter-failed',
      });
      if (!upward && result === DownAdapterRefused) {
        return yield* Effect.fail(DownAdapterRefused);
      }
      adapted = yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(destination.payload)),
      )(result, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'contract-payload-adapter-output-invalid',
          prefix: `Invalid adapter output for ${commandName}@${destination.version}`,
        }),
      );
      index = nextIndex;
    }
    return adapted;
  })();
}
