import { encodeError, type IErrorJson, type IResult } from '@zerospin/error';
import * as Effect from 'effect/Effect';

export function encodeRpcOutcome<A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<IResult<A, IErrorJson<E>>, never, R> {
  return program.pipe(
    Effect.matchEffect({
      onFailure: failure =>
        encodeError(failure).pipe(
          Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
        ),
      onSuccess: success =>
        Effect.succeed({ _tag: 'Success' as const, success }),
    }),
  );
}
