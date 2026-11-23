import * as Effect from 'effect/Effect';

import { evaluatePreparedContract } from '../contracts/make/constructContractRelease.ts';
import { makeContractReadDb } from '../contracts/make/makeContractReadDb.ts';
import { encodeContractResult } from '../contracts/resultCodec.ts';
import type { IAggregateContractRelease } from '../contracts/types.ts';
import type { ITx } from '../drizzle/types.ts';
import { applyOptimisticOperationsTx } from '../sessionExecution/applyOptimisticOperationsTx.ts';
import { evaluateSynchronousSavepoint } from '../sessionExecution/evaluateSynchronousSavepoint.ts';
import { dutils } from '../utils/dutils.ts';

import { getAggregateSessionModels } from './executionDefinition.ts';
import type { IInitializedAggregateSession } from './makeInitializedAggregateSession.ts';
import { prepareAggregateSessionCommand } from './prepareAggregateSessionCommand.ts';
import { makeAggregateSessionSubmission } from './stageCommand/makeAggregateSessionSubmission.ts';

/** Prepare, evaluate, validate results and rehearse mutations under one synchronous savepoint. */
export const evaluateAggregateSessionCommandTx = Effect.fn(
  'evaluateAggregateSessionCommandTx',
)(function* (
  tx: ITx,
  props: {
    initialized: IInitializedAggregateSession;
    contractName: string;
    contract: IAggregateContractRelease | undefined;
    payload: unknown;
  },
) {
  const { initialized, contractName, contract: inputContract, payload } = props;

  return yield* evaluateSynchronousSavepoint({
    tx,
    program: ({ tx }) =>
      Effect.gen(function* () {
        const { contract, invocation } = yield* prepareAggregateSessionCommand({
          initialized,
          contractName,
          contract: inputContract,
          payload,
        });
        const { sessionDefinition } = initialized;
        const command = yield* makeAggregateSessionSubmission<
          IAggregateContractRelease,
          IAggregateContractRelease['version']
        >({
          aggregateId: initialized.aggregateId,
          aggregateName: sessionDefinition.aggregateName,
          aggregateVersion: sessionDefinition.aggregateVersion,
          actorName: sessionDefinition.actorName,
          actorVersion: sessionDefinition.actorVersion,
          claims: initialized.encodedClaims,
          contract,
          sessionName: sessionDefinition.sessionName,
          sessionId: initialized.sessionId,
          validatedPayload: invocation.payload,
          version: contract.version,
        });
        const madeOperations = yield* evaluatePreparedContract(
          invocation,
          makeContractReadDb({
            db: tx,
            models: getAggregateSessionModels(sessionDefinition),
          }),
        );
        const encodedResult = yield* encodeContractResult(
          contract,
          madeOperations.result,
        );
        const completedAt = yield* dutils.date();
        const inverseOperations = yield* applyOptimisticOperationsTx({
          tx,
          operations: madeOperations.operations,
          operationsSchema: contract.operationsSchema,
          appliedAt: completedAt,
        });

        return {
          contract,
          command,
          madeOperations,
          encodedResult,
          inverseOperations,
          completedAt,
        };
      }).pipe(Effect.scoped),
  });
});
