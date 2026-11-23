import * as Effect from 'effect/Effect';

/** Execute immediately for synchronous SQLite; suspend only for an async adapter. */
export function sqliteEffect<A>(work: () => A | PromiseLike<A>): Effect.Effect<A> {
  return Effect.suspend(() => {
    const value = work();
    return typeof value === 'object' && value !== null && 'then' in value
      ? Effect.promise(() => Promise.resolve(value))
      : Effect.succeed(value as A);
  });
}
