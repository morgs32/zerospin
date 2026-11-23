import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IDb } from '../drizzle/types.ts';
import { runAuthoredCallback } from '../execution/runAuthoredCallback.ts';
import type { IAnyServiceRelease } from '../service/types.ts';

import { validateFailure } from './failureCodec.ts';
import { makeContractReadDb } from './make/makeContractReadDb.ts';
import type {
  IDecodedServiceCommand,
  IServiceContractRelease,
  IServiceSessionSubmissionInput,
} from './types.ts';

/** Validate the Actor grant and run its Service guard. */
export const validateServiceCommand = Effect.fn('validateServiceCommand')(
  function* (props: {
    serviceRelease: IAnyServiceRelease;
    actorName: string | undefined;
    contract: IServiceContractRelease;
    db: Readonly<Pick<IDb, 'query'>>;
    command: IDecodedServiceCommand | IServiceSessionSubmissionInput;
    payload: unknown;
    claims: Readonly<Record<string, unknown>> | undefined;
  }) {
    const {
      serviceRelease,
      actorName,
      contract,
      db,
      command,
      payload,
      claims,
    } = props;
    if (actorName === undefined) {
      return;
    }
    const actor = serviceRelease.actors[actorName];
    const actorContract = actor?.contracts[contract.commandName];
    if (
      actor === undefined ||
      actorContract === undefined ||
      actorContract !== contract
    ) {
      return yield* makeZerospinError('service-command-actor-forbidden');
    }
    if (claims === undefined) {
      return yield* makeZerospinError('service-command-claims-invalid');
    }
    yield* runAuthoredCallback({
      program: Effect.suspend(
        () =>
          actor.guards[contract.commandName]?.({
            db: makeContractReadDb({
              db,
              models: serviceRelease.models,
            }),
            command,
            payload,
            claims,
            failures: contract.failures,
          }) ?? Effect.void,
      ),
      code: 'actor-guard-failed',
      validateBusinessFailure: failure =>
        validateFailure(contract, failure, 'actor'),
    });
  },
);
