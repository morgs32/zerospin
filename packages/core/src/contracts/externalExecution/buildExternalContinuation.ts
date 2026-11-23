import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeShapeCodecs } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { VersionSchema } from '../../declaration/VersionSchema.ts';
import type { IContinuationServices } from '../../execution/ownerReleaseLayer.ts';
import { encodeContinuationPayload } from '../encodeContinuationPayload.ts';
import { ExternalOutcomeSchema } from '../ExternalOutcomeSchema.ts';
import type { IContractRelease } from '../types.ts';

export const ExternalContinuationInputSchema = Schema.Struct({
  externalContractName: Schema.NonEmptyString,
  externalContractVersion: VersionSchema,
  payload: Schema.Json,
  externalOutcome: Schema.toType(ExternalOutcomeSchema),
});
export type IExternalContinuationInput =
  typeof ExternalContinuationInputSchema.Type;

type IExternalContinuationRelease = {
  external: Readonly<Record<string, IContractRelease>>;
  contracts: Readonly<Record<string, IContractRelease>>;
};

const mapExternalObservation = Effect.fn('buildExternalContinuation')(
  function* (
    release: IExternalContinuationRelease,
    work: IExternalContinuationInput,
  ) {
    const contract = release.external[work.externalContractName];
    const external = contract?.external;
    if (
      contract === undefined ||
      external === undefined ||
      contract.version !== work.externalContractVersion
    ) {
      return yield* makeZerospinError(
        'external-operation-definition-unavailable',
      );
    }
    const payload = yield* Schema.decodeUnknownEffect(
      makeShapeCodecs(contract.payload).portableCompleteCodec,
    )(work.payload, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'external-payload-invalid',
        prefix: 'Invalid frozen external payload',
      }),
    );

    const { externalOutcome } = work;
    const branch =
      externalOutcome._tag === 'Success'
        ? external.onSuccess
        : external.onFailure;
    const continuation = branch.contract;
    if (release.contracts[continuation.commandName] !== continuation) {
      return yield* makeZerospinError('external-continuation-unregistered');
    }
    const build =
      externalOutcome._tag === 'Success'
        ? yield* Schema.decodeUnknownEffect(external.response)(
            externalOutcome.success,
          ).pipe(
            mapParseError({
              code: 'external-continuation-response-invalid',
              prefix: 'Invalid retained external response',
            }),
            Effect.map(
              response => () =>
                external.onSuccess.payload({ payload, response }),
            ),
          )
        : () =>
            external.onFailure.payload({
              payload,
              failure: externalOutcome.failure,
            });
    return yield* encodeContinuationPayload({
      contract: continuation,
      build,
      mapperFailureCode: 'external-continuation-payload-failed',
    });
  },
);

/** Interpret the retained observation in the executable that emitted the request. */
export function buildExternalContinuation<
  RELEASE extends IExternalContinuationRelease,
>(
  release: RELEASE,
  work: IExternalContinuationInput,
): Effect.Effect<
  Effect.Success<ReturnType<typeof mapExternalObservation>>,
  Effect.Error<ReturnType<typeof mapExternalObservation>>,
  IContinuationServices<
    NonNullable<RELEASE['external'][keyof RELEASE['external']]['external']>
  >
>;
export function buildExternalContinuation(
  release: IExternalContinuationRelease,
  work: IExternalContinuationInput,
) {
  return mapExternalObservation(release, work);
}
