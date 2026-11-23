import { evaluatePreparedContract } from '@zerospin/core/contracts/make/constructContractRelease';
import { makeActorContractReadDb } from '@zerospin/core/contracts/make/makeActorContractReadDb';
import { makeContractReadDb } from '@zerospin/core/contracts/make/makeContractReadDb';
import { encodeContractResult } from '@zerospin/core/contracts/resultCodec';
import { validateServiceCommand } from '@zerospin/core/contracts/validateServiceCommand';
import { makeFn } from '@zerospin/logger';
import type * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { readServiceOccurrenceTx } from './readServiceOccurrenceTx.js';
import type { resolveServiceExecution } from './resolveServiceExecution.js';

/** Evaluate owner guards and the prepared invocation before applying writes. */
export const evaluateServiceCommand = makeFn(
  'ServiceVersionRepo.evaluateServiceCommand',
)(function* (
  tx: Parameters<typeof readServiceOccurrenceTx>[0],
  command: Parameters<typeof resolveServiceExecution>[0],
  executionRelease: Parameters<typeof resolveServiceExecution>[1],
  execution: Effect.Success<ReturnType<typeof resolveServiceExecution>>,
) {
  const { executionContract: contract, actorClaims, invocation } = execution;
  yield* validateServiceCommand({
    serviceRelease: executionRelease,
    actorName: command.kind === 'actor' ? command.actorName : undefined,
    contract,
    db: tx,
    command: invocation.command,
    payload: invocation.payload,
    claims: actorClaims,
  });
  const canonicalDb = makeContractReadDb({
    db: tx,
    models: executionRelease.models,
  });
  const visibleActor =
    command.kind === 'actor'
      ? executionRelease.actors[command.actorName]
      : undefined;
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
