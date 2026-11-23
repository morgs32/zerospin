import {
  makeZerospinError,
  type IRecognizedFailure,
  type IResult,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { makeSessionResult } from '../aggregateSession/makeSessionResult.ts';
import type {
  IInferContractResult,
  IInferFailure,
} from '../contracts/types.ts';
import type { IAnyModels, IInferPayloadInput } from '../models/types.ts';
import { runSessionPreflight } from '../sessionExecution/runSessionPreflight.ts';

import { ServiceSessionCommandExecution } from './ServiceSessionCommandExecution.ts';
import type {
  IServiceSession,
  IServiceSessionDefinition,
  IServiceSessionSubmission,
} from './types.ts';

/** Evaluate and retain optimism synchronously in the owning session's local journal. */
export function stageServiceSessionCommand<
  D extends IServiceSessionDefinition,
  MODELS extends IAnyModels,
  SERVICES,
  K extends keyof NoInfer<D['contracts']> & string,
>(props: {
  session: IServiceSession<D, MODELS, SERVICES>;
  contractName: K;
  payload: IInferPayloadInput<
    NonNullable<D['contracts'][K]['__payloads']>[D['contracts'][K]['version']]
  >;
}): IResult<
  IServiceSessionSubmission<IInferContractResult<D['contracts'][K]>>,
  IRecognizedFailure<IInferFailure<D['contracts'][K]>>
> {
  const { session, contractName, payload } = props;
  const lifecycle = session.store.getState();
  if (lifecycle.status === 'failed') throw lifecycle.failure;
  const contracts: D['contracts'] = session.sessionDefinition.contracts;
  const contract: D['contracts'][K] | undefined = contracts[contractName];
  const state = runSessionPreflight({
    program: Effect.sync(() => session.store.getState().initialized),
    reportFailure: session.reportFailure,
  });
  const recognize = makeSessionResult<D['contracts'][K]>(contract);
  const staged =
    state === null
      ? runSessionPreflight({
          reportFailure: session.reportFailure,
          program: Effect.fail(
            makeZerospinError('service-session-not-ready'),
          ).pipe(recognize),
        })
      : session.runSync(
          Effect.gen(function* () {
            const execute =
              (yield* ServiceSessionCommandExecution).getCurrent();
            if (execute === undefined) {
              return yield* makeZerospinError('service-session-not-ready');
            }
            if (contract === undefined) {
              return yield* makeZerospinError(
                'service-session-contract-unavailable',
              );
            }
            return yield* execute.stage({ contract, payload });
          }).pipe(recognize),
        );
  if (staged._tag === 'Failure') {
    session.reportFailure({ origin: 'command', error: staged.failure });
    return staged;
  }
  const { command, result } = staged.success;
  const {
    id: _id,
    nodeId: _nodeId,
    nodeIndex: _nodeIndex,
    pushIndex: _pushIndex,
    ...submission
  } = command;
  return {
    _tag: 'Success',
    success: {
      ...submission,
      stagingOutcome: { ...command.stagingOutcome, result },
    },
  };
}
