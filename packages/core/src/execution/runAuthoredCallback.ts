import {
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinError,
} from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';

/** A Cause with no Fail reasons carries no typed callback error. */
export function isNonFailureCause<E>(
  cause: Cause.Cause<E>,
): cause is Cause.Cause<never> {
  return cause.reasons.every(reason => !Cause.isFailReason(reason));
}

export function runAuthoredCallback<A, E, R, const CODE extends string>(props: {
  program: Effect.Effect<A, E, R>;
  code: CODE;
  validateBusinessFailure?: undefined;
}): Effect.Effect<A, E | IZerospinError<CODE>, R>;
export function runAuthoredCallback<
  A,
  E,
  R,
  const CODE extends string,
  BUSINESS,
  VALIDATION_ERROR,
>(props: {
  program: Effect.Effect<A, E, R>;
  code: CODE;
  validateBusinessFailure: (
    failure: unknown,
  ) => Effect.Effect<BUSINESS, VALIDATION_ERROR>;
}): Effect.Effect<A, E | IZerospinError<CODE> | BUSINESS | VALIDATION_ERROR, R>;

/** Normalize one authored framework refusal; business codecs and complete non-failure Causes retain their owners. */
export function runAuthoredCallback<
  A,
  E,
  R,
  const CODE extends string,
  BUSINESS = never,
  VALIDATION_ERROR = never,
>(props: {
  program: Effect.Effect<A, E, R>;
  code: CODE;
  validateBusinessFailure?:
    | ((failure: unknown) => Effect.Effect<BUSINESS, VALIDATION_ERROR>)
    | undefined;
}): Effect.Effect<
  A,
  E | IZerospinError<CODE> | BUSINESS | VALIDATION_ERROR,
  R
> {
  const validateBusinessFailure = props.validateBusinessFailure?.bind(props);
  const { program, code } = props;
  return program.pipe(
    Effect.catchCause(
      (
        cause,
      ): Effect.Effect<
        never,
        E | IZerospinError<CODE> | BUSINESS | VALIDATION_ERROR
      > => {
        if (isNonFailureCause(cause)) {
          return Effect.failCause(cause);
        }
        // A composite cannot identify one business refusal. Propagate every reason
        // unchanged so the enclosing execution policy retains the complete Cause.
        if (cause.reasons.length !== 1) {
          return Effect.failCause(cause);
        }
        const reason = cause.reasons[0];
        if (reason === undefined || !Cause.isFailReason(reason)) {
          return Effect.failCause(cause);
        }
        const failure = reason.error;
        if (
          validateBusinessFailure !== undefined &&
          typeof failure === 'object' &&
          failure !== null &&
          'scope' in failure
        ) {
          return validateBusinessFailure(failure).pipe(
            Effect.flatMap(Effect.fail),
          );
        }
        return Effect.fail(
          makeZerospinError({
            code,
            message: `Authored callback failed at ${code}`,
            cause: prettyUnknownFailure(cause),
          }),
        );
      },
    ),
  );
}
