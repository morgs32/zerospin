import { makeZerospinError } from '@zerospin/error';
import type { IInferIdFromAbbreviation, IShape } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import { makeId } from '../models/make/makeId.ts';
import type { IAnyModels, IModel } from '../models/types.ts';
import { runSessionPreflight } from '../sessionExecution/runSessionPreflight.ts';

import type { IServiceSession, IServiceSessionDefinition } from './types.ts';

/** Generate a model identifier through the initialized service owner's ID factory. */
export function makeServiceSessionModelId<
  DEFINITION extends IServiceSessionDefinition,
  MODELS extends IAnyModels,
  SERVICES,
  ATTRIBUTES extends IShape,
  ABBREVIATION extends string,
>(props: {
  session: IServiceSession<DEFINITION, MODELS, SERVICES>;
  model: IModel<ATTRIBUTES, ABBREVIATION>;
}): IInferIdFromAbbreviation<ABBREVIATION> {
  const { session, model } = props;
  const lifecycle = session.store.getState();
  if (lifecycle.status === 'failed') throw lifecycle.failure;
  const initialized = runSessionPreflight({
    reportFailure: session.reportFailure,
    program: Effect.gen(function* () {
      const state = session.store.getState().initialized;
      if (state === null) {
        return yield* makeZerospinError('service-session-not-ready');
      }
      return state;
    }),
  });
  return session.runSync(
    Effect.gen(function* () {
      const current = session.store.getState().initialized;
      if (
        current === null ||
        current.db !== initialized.db ||
        current.sessionId !== initialized.sessionId
      ) {
        return yield* makeZerospinError('service-session-not-ready');
      }
      return yield* makeId(model);
    }),
  );
}
