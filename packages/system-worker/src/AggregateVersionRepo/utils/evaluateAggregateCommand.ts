import { evaluatePreparedContract } from '@zerospin/core/contracts/make/constructContractRelease';
import { makeActorContractReadDb } from '@zerospin/core/contracts/make/makeActorContractReadDb';
import { makeContractReadDb } from '@zerospin/core/contracts/make/makeContractReadDb';
import { encodeContractResult } from '@zerospin/core/contracts/resultCodec';
import { validateAggregateCommand } from '@zerospin/core/contracts/validateAggregateCommand';
import { makeFn } from '@zerospin/logger';
import type * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { readAggregateCommandTx } from './readAggregateCommandTx.js';
import type { resolveAggregateExecution } from './resolveAggregateExecution.js';

/** Evaluate owner guards and the prepared invocation before applying writes. */
export const evaluateAggregateCommand = makeFn(
  'AggregateVersionRepo.evaluateAggregateCommand',
)(function* (
  tx: Parameters<typeof readAggregateCommandTx>[0],
  command: Parameters<typeof resolveAggregateExecution>[0],
  executionAggregateRelease: Parameters<typeof resolveAggregateExecution>[1],
  execution: Effect.Success<ReturnType<typeof resolveAggregateExecution>>,
) {
  const {
    executionContract: contract,
    actorName,
    actorClaims,
    invocation,
  } = execution;
  yield* validateAggregateCommand({
    aggregateRelease: executionAggregateRelease,
    actorName,
    contract,
    db: tx,
    command: invocation.command,
    payload: invocation.payload,
    claims: actorClaims,
  });
  const canonicalDb = makeContractReadDb({
    db: tx,
    models: executionAggregateRelease.models,
  });
  const visibleActor =
    actorName === undefined
      ? undefined
      : executionAggregateRelease.actors[actorName];
  const actorDb =
    visibleActor === undefined
      ? undefined
      : makeActorContractReadDb({
          db: tx,
          actor: visibleActor,
          identity: Schema.decodeUnknownSync(
            visibleActor.identity.identitySchema,
          )(command.kind === 'actor' ? command.claims : undefined),
        });
  const evaluated = yield* evaluatePreparedContract(
    invocation,
    actorDb ?? canonicalDb,
  );
  const encodedResult = yield* encodeContractResult(contract, evaluated.result);
  return { operations: evaluated.operations, encodedResult };
});
