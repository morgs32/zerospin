import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

/** The Durable Object activation gate has already opened before readiness RPC dispatch. */
export const awaitStartup = makeFn('DORepo.awaitStartup')(function* () {
  return yield* Effect.void;
});
