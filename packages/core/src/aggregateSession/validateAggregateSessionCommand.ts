import { type IRecognizedFailure, type IResult } from '@zerospin/error';
import { CuidFactory } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import type { IInferFailure } from '../contracts/types.ts';
import { rehearse } from '../drizzle/make/makeTx.ts';
import type { IInferPayloadInput } from '../models/types.ts';
import { MonotonicFactory } from '../services/MonotonicFactory.ts';
import { runSessionPreflight } from '../sessionExecution/runSessionPreflight.ts';

import { evaluateAggregateSessionCommandTx } from './evaluateAggregateSessionCommandTx.ts';
import { getAggregateSessionContract } from './executionDefinition.ts';
import {
  aggregateSessionUnavailable,
  makeSessionResult,
} from './makeSessionResult.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from './types.ts';

export function validateAggregateSessionCommand<
  DEFINITION extends IAggregateSessionDefinition,
  SERVICES,
  NAME extends keyof DEFINITION['contracts'] & string,
>(props: {
  session: IAggregateSession<DEFINITION, SERVICES>;
  contractName: NAME;
  payload: IInferPayloadInput<
    NonNullable<
      DEFINITION['contracts'][NAME]['__payloads']
    >[DEFINITION['contracts'][NAME]['version']]
  >;
}): IResult<
  void,
  IRecognizedFailure<IInferFailure<DEFINITION['contracts'][NAME]>>
>;
/** Rehearse the guard, program and operation application synchronously without retaining operations or consuming IDs. */
export function validateAggregateSessionCommand(props: {
  session: IAggregateSession<IAggregateSessionDefinition, unknown>;
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
      program: Effect.sync(() => ({
        _tag: 'Failure' as const,
        failure: aggregateSessionUnavailable(),
      })),
    });
  }
  const { initialized } = state;
  return session.runSync(
    Effect.gen(function* () {
      const contract = getAggregateSessionContract(
        session.sessionDefinition,
        contractName,
      );
      let localId = 0;
      return yield* rehearse(initialized.db, tx =>
        evaluateAggregateSessionCommandTx(tx, {
          initialized,
          contractName,
          contract,
          payload,
        }),
      ).pipe(
        Effect.provideService(CuidFactory, () =>
          Effect.sync(() => 'validation' + ++localId),
        ),
        Effect.provideService(MonotonicFactory, () =>
          Effect.sync(() => 'validation' + ++localId),
        ),
        makeSessionResult(contract),
      );
    }),
  );
}
