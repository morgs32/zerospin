import { makeZerospinError } from '@zerospin/error';
import type { IInferIdFromAbbreviation, IShape } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import { makeId } from '../models/make/makeId.ts';
import type { IModel } from '../models/types.ts';
import { runSessionPreflight } from '../sessionExecution/runSessionPreflight.ts';

import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from './types.ts';

export function makeAggregateSessionModelId<
  DEFINITION extends IAggregateSessionDefinition,
  SERVICES,
  ATTRIBUTES extends IShape,
  ABBREVIATION extends string,
>(props: {
  session: IAggregateSession<DEFINITION, SERVICES>;
  model: IModel<ATTRIBUTES, ABBREVIATION>;
}): IInferIdFromAbbreviation<ABBREVIATION>;
/** Generate an identifier with the initialized owner's ID factory. */
export function makeAggregateSessionModelId<
  ATTRIBUTES extends IShape,
  ABBREVIATION extends string,
>(props: {
  session: IAggregateSession<IAggregateSessionDefinition, unknown>;
  model: IModel<ATTRIBUTES, ABBREVIATION>;
}) {
  const { session, model } = props;
  const lifecycle = session.store.getState();
  if (lifecycle.status === 'failed') throw lifecycle.failure;
  const initialized = runSessionPreflight({
    reportFailure: session.reportFailure,
    program: Effect.gen(function* () {
      const initialized = session.store.getState().initialized;
      if (initialized === null) {
        return yield* makeZerospinError('aggregate-session-not-ready');
      }
      return initialized;
    }),
  });
  return session.runSync(
    Effect.gen(function* () {
      if (session.store.getState().initialized !== initialized) {
        return yield* makeZerospinError('aggregate-session-not-ready');
      }
      return yield* makeId(model);
    }),
  );
}
