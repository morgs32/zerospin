import {
  makeZerospinError,
  type IRecognizedFailure,
  type IResult,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { makeSessionResult } from '../aggregateSession/makeSessionResult.ts';
import type { IInferFailure } from '../contracts/types.ts';
import type { IAnyModels, IInferPayloadInput } from '../models/types.ts';
import { runSessionPreflight } from '../sessionExecution/runSessionPreflight.ts';

import { ServiceSessionCommandExecution } from './ServiceSessionCommandExecution.ts';
import type { IServiceSession, IServiceSessionDefinition } from './types.ts';

/** Rehearse the bound guard and program; recognized failures remain silent. */
export function validateServiceSessionCommand<
  DEFINITION extends IServiceSessionDefinition,
  MODELS extends IAnyModels,
  SERVICES,
  NAME extends keyof NoInfer<DEFINITION['contracts']> & string,
>(props: {
  session: IServiceSession<DEFINITION, MODELS, SERVICES>;
  contractName: NAME;
  payload: IInferPayloadInput<
    NonNullable<
      DEFINITION['contracts'][NAME]['__payloads']
    >[DEFINITION['contracts'][NAME]['version']]
  >;
}): IResult<
  void,
  IRecognizedFailure<IInferFailure<DEFINITION['contracts'][NAME]>>
> {
  const { session, contractName, payload } = props;
  const lifecycle = session.store.getState();
  if (lifecycle.status === 'failed') throw lifecycle.failure;
  const contracts: DEFINITION['contracts'] =
    session.sessionDefinition.contracts;
  const contract: DEFINITION['contracts'][NAME] | undefined =
    contracts[contractName];
  const state = runSessionPreflight({
    program: Effect.sync(() => session.store.getState().initialized),
    reportFailure: session.reportFailure,
  });
  const recognize = makeSessionResult<DEFINITION['contracts'][NAME]>(contract);
  if (state === null) {
    return runSessionPreflight({
      reportFailure: session.reportFailure,
      program: Effect.fail(makeZerospinError('service-session-not-ready')).pipe(
        recognize,
      ),
    });
  }
  return session.runSync(
    Effect.gen(function* () {
      const execute = (yield* ServiceSessionCommandExecution).getCurrent();
      if (execute === undefined) {
        return yield* makeZerospinError('service-session-not-ready');
      }
      if (contract === undefined) {
        return yield* makeZerospinError('service-session-contract-unavailable');
      }
      yield* execute.validate({ contract, payload });
    }).pipe(recognize),
  );
}
