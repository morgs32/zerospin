import * as Effect from 'effect/Effect';

/** Runs the selected branch, evaluating an Effect condition once per execution. */
export function ifTrue<A, E, R, B, E2, R2, E3 = never, R3 = never>(
  condition: boolean | Effect.Effect<boolean, E3, R3>,
  props: {
    onTrue: Effect.Effect<A, E, R>;
    onFalse: Effect.Effect<B, E2, R2>;
  },
) {
  const { onTrue, onFalse } = props;
  return Effect.gen(function* () {
    const isTrue =
      typeof condition === 'boolean' ? condition : yield* condition;
    if (isTrue) {
      return yield* onTrue;
    }
    return yield* onFalse;
  });
}
