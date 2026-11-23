import * as Effect from 'effect/Effect';

import type { IAnyAggregateRelease } from '../aggregate/types.ts';
import type { IDb } from '../drizzle/types.ts';
import { runAuthoredCallback } from '../execution/runAuthoredCallback.ts';

import { validateFailure } from './failureCodec.ts';
import { makeContractReadDb } from './make/makeContractReadDb.ts';
import type {
  IContractRelease,
  IDecodedAggregateCommand,
  IAggregateSessionSubmissionInput,
} from './types.ts';

/** Authoritative only: the caller must apply operations in the same savepoint. */
export const validateAggregateCommand = Effect.fn('validateAggregateCommand')(
  function* (props: {
    aggregateRelease: IAnyAggregateRelease;
    actorName: string | undefined;
    contract: IContractRelease;
    db: Readonly<Pick<IDb, 'query'>>;
    command: IDecodedAggregateCommand | IAggregateSessionSubmissionInput;
    payload: unknown;
    claims: Readonly<Record<string, unknown>> | undefined;
  }) {
    const {
      aggregateRelease,
      actorName,
      contract,
      db,
      command,
      payload,
      claims,
    } = props;
    if (actorName === undefined) return;
    const guard = aggregateRelease.guards[actorName]?.[contract.commandName];
    yield* runAuthoredCallback({
      program: Effect.suspend(
        () =>
          guard?.({
            db: makeContractReadDb({
              db,
              models: aggregateRelease.models,
            }),
            command,
            payload,
            claims: claims ?? {},
            failures: contract.failures,
          }) ?? Effect.void,
      ),
      code: 'aggregate-guard-failed',
      validateBusinessFailure: failure => validateFailure(contract, failure),
    });
  },
);
