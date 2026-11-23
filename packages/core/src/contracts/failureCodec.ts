import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  mapParseError,
  PublicFailureSchema,
  recognizeZerospinError,
  type IRecognizedFailure,
  type IScopedError,
  type IZerospinError,
} from '@zerospin/error';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IAggregateSessionDefinition } from '../aggregateSession/types.ts';

import { getFailuresCodec } from './failures.ts';
import type { IContractRelease, IInferFailure } from './types.ts';

/** Codec execution cannot borrow services from the caller's runtime. */
const isolateFailureCodec = <A, E>(program: Effect.Effect<A, E>) =>
  program.pipe(Effect.updateContext<never, never>(() => Context.empty()));

/** The same public JSON value is stored, transported, and optionally recognized. */
export type IFailure = typeof PublicFailureSchema.Type;

/** A declared business codec retains its mandatory scope on the public wire value. */
const PublicBusinessFailureSchema = Schema.Struct({
  ...PublicFailureSchema.fields,
  scope: Schema.Literals(['contract', 'actor', 'aggregate']),
});

export const encodeFailure = (
  contract: IContractRelease,
  failure: unknown,
): Effect.Effect<
  IFailure,
  Effect.Error<ReturnType<typeof encodeBusinessFailure>>
> =>
  isZerospinError(failure) && !('scope' in failure)
    ? encodeError(failure)
    : encodeBusinessFailure(contract, failure);

export const validateFailure = Effect.fn('contracts.validateFailure')(
  function* (
    contract: Pick<IContractRelease, 'commandName' | 'version' | 'failures'>,
    failure: unknown,
    scope?: IScopedError['scope'],
  ) {
    if (
      Object.keys(contract.failures).length === 0 ||
      failure === null ||
      typeof failure !== 'object' ||
      !('scope' in failure) ||
      (scope !== undefined && failure.scope !== scope)
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'contract-failure-undeclared',
          message: `Undeclared business failure for ${contract.commandName}@${contract.version}`,
        }),
      );
    }
    return yield* isolateFailureCodec(
      Schema.decodeUnknownEffect(
        Schema.toType(getFailuresCodec(contract.failures)),
      )(failure, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'contract-failure-invalid',
          prefix: 'Invalid business failure',
        }),
      ),
    );
  },
);

export const encodeBusinessFailure = Effect.fn(
  'contracts.encodeBusinessFailure',
)(function* (contract: IContractRelease, failure: unknown) {
  if (
    failure === null ||
    typeof failure !== 'object' ||
    !('scope' in failure)
  ) {
    return yield* Effect.fail(makeZerospinError('contract-failure-undeclared'));
  }
  const encoded = yield* isolateFailureCodec(
    Schema.encodeUnknownEffect(getFailuresCodec(contract.failures))(failure, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'contract-failure-encode-failed',
        prefix: 'Cannot encode business failure',
      }),
    ),
  );
  return yield* Schema.decodeUnknownEffect(PublicBusinessFailureSchema)(
    encoded,
  ).pipe(
    mapParseError({
      code: 'contract-failure-encoding-invalid',
      prefix: 'Failure codec must produce a public JSON error',
    }),
  );
});

/** Recognition never changes the stored or transported failure. */
export function resolveFailure<CONTRACT extends IContractRelease>(
  contract: CONTRACT | undefined,
  failure: IFailure,
): Effect.Effect<
  IRecognizedFailure<IInferFailure<CONTRACT>>,
  IZerospinError<'contract-failure-decode-failed'>
>;
export function resolveFailure(
  contract: IContractRelease | undefined,
  failure: IFailure,
) {
  return Effect.try({
    try: () =>
      recognizeZerospinError(
        contract === undefined
          ? Schema.Never
          : getFailuresCodec(contract.failures),
        failure,
      ),
    catch: () => makeZerospinError('contract-failure-decode-failed'),
  });
}

export const resolveSessionFailure = (
  definition: IAggregateSessionDefinition,
  commandName: string,
  failure: IFailure,
) => resolveFailure(definition.contracts[commandName], failure);
