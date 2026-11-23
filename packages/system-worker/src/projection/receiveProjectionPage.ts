import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type * as Scope from 'effect/Scope';

/** Relieve a full projection outbox by publishing its committed prefix before retrying the page. */
export function receiveProjectionPage<E, R, D, S>(props: {
  apply: Effect.Effect<void, E, R>;
  outbox: {
    producerLease: Effect.Effect<void, never, Scope.Scope>;
    drain(index: number): Effect.Effect<void, D, S>;
    wake(): Effect.Effect<void>;
  };
  currentIndex(): number;
}) {
  const { apply, outbox } = props;
  return Effect.gen(function* () {
    yield* outbox.producerLease;
    const applied = yield* Effect.result(apply);
    if (applied._tag === 'Success') return;
    const { failure } = applied;
    if (
      typeof failure !== 'object' ||
      failure === null ||
      !('code' in failure) ||
      (failure.code !== 'projection-publication-backlog-full' &&
        failure.code !== 'service-projection-publication-backlog-full')
    ) {
      return yield* Effect.fail(failure);
    }
    const drained = yield* Effect.exit(outbox.drain(props.currentIndex()));
    if (Exit.isFailure(drained)) {
      if (Cause.hasInterrupts(drained.cause)) {
        return yield* Effect.failCause(drained.cause);
      }
      return yield* Effect.fail(failure);
    }
    yield* apply;
  }).pipe(Effect.ensuring(outbox.wake().pipe(Effect.exit)), Effect.scoped);
}
