import { type IRecognizedFailure, type IResult } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type {
  IAggregateContractRelease,
  IInferAggregateSessionSubmissionInput,
  IInferContractResult,
  IInferFailure,
  IAggregateSessionSubmission,
} from '../../contracts/types.ts';
import type { IInferPayloadInput } from '../../models/types.ts';
import { runSessionPreflight } from '../../sessionExecution/runSessionPreflight.ts';
import { getAggregateSessionContract } from '../executionDefinition.ts';
import {
  aggregateSessionUnavailable,
  makeSessionResult,
} from '../makeSessionResult.ts';
import type { IAggregateCommandSession } from '../types.ts';

import { stageAggregateSessionCommandTx } from './stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts';

export function stageAggregateSessionCommand<
  CONTRACTS extends Readonly<Record<string, IAggregateContractRelease>>,
  SERVICES,
  NAME extends keyof CONTRACTS & string,
>(
  props: {
    session: IAggregateCommandSession<CONTRACTS, SERVICES>;
    contractName: NAME;
  } & {
    [KEY in keyof NoInfer<CONTRACTS> & string]: {
      contractName: KEY;
      payload: IInferPayloadInput<
        NonNullable<
          NoInfer<CONTRACTS>[KEY]['__payloads']
        >[NoInfer<CONTRACTS>[KEY]['version']]
      >;
    };
  }[keyof NoInfer<CONTRACTS> & string],
): IResult<
  IAggregateSessionSubmission<
    IInferAggregateSessionSubmissionInput<CONTRACTS[NAME]>,
    IInferContractResult<CONTRACTS[NAME]>
  >,
  IRecognizedFailure<IInferFailure<CONTRACTS[NAME]>>
>;
/** Evaluate and retain optimism synchronously in its owning Aggregate session. */
export function stageAggregateSessionCommand(props: {
  session: IAggregateCommandSession<
    Readonly<Record<string, IAggregateContractRelease>>,
    unknown
  >;
  contractName: string;
  payload: unknown;
}) {
  const { session, contractName, payload } = props;
  const lifecycle = session.store.getState();
  if (lifecycle.status === 'failed') throw lifecycle.failure;
  const state = runSessionPreflight({
    program: Effect.sync(() => session.store.getState()),
    reportFailure: session.reportFailure,
  });
  if (state.initialized === null) {
    return runSessionPreflight({
      reportFailure: session.reportFailure,
      program: Effect.sync(() => {
        const failure = aggregateSessionUnavailable();
        session.reportFailure({ origin: 'command', error: failure });
        return { _tag: 'Failure' as const, failure };
      }),
    });
  }
  const { initialized } = state;
  return session.runSync(
    Effect.gen(function* () {
      const contract = getAggregateSessionContract(
        session.sessionDefinition,
        contractName,
      );
      const result = yield* stageAggregateSessionCommandTx(initialized.db, {
        initialized,
        contract,
        contractName,
        payload,
        onCommandStaged: initialized.onCommandStaged,
      }).pipe(makeSessionResult(contract));
      if (result._tag === 'Failure') {
        session.reportFailure({ origin: 'command', error: result.failure });
      }
      return result;
    }),
  );
}
