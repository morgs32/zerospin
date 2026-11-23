import type { Effect } from 'effect';

export type ISessionExecution<SERVICES = never> = {
  readonly runSync: <A, E>(program: Effect.Effect<A, E, SERVICES>) => A;
  readonly runPromise: <A, E>(
    program: Effect.Effect<A, E, SERVICES>,
    options?: Effect.RunOptions,
  ) => Promise<A>;
};
