import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { isOrdinaryContract } from '../contracts/make/constructContractRelease.ts';
import { prepareAggregateInvocation } from '../contracts/prepare/prepareAggregateInvocation.ts';
import type { IAggregateContractRelease } from '../contracts/types.ts';
import { validateCurrentPayload } from '../contracts/validatePayload.ts';

import { getAggregateSessionContract } from './executionDefinition.ts';
import type { IInitializedAggregateSession } from './makeInitializedAggregateSession.ts';

/** Prepare input against the canonical contract and private admitted claims. */
export const prepareAggregateSessionCommand = Effect.fn(
  'prepareAggregateSessionCommand',
)(function* <CONTRACT extends IAggregateContractRelease>(props: {
  initialized: IInitializedAggregateSession;
  contractName: string;
  contract: CONTRACT | undefined;
  payload: unknown;
}) {
  const { initialized, contractName, contract, payload } = props;
  if (
    contract === undefined ||
    contract !==
      getAggregateSessionContract(initialized.sessionDefinition, contractName)
  ) {
    return yield* makeZerospinError('contract-not-found');
  }
  if (!isOrdinaryContract(contract)) {
    return yield* makeZerospinError('external-contract-kind-mismatch');
  }
  const decodedPayload = yield* validateCurrentPayload(contract, payload);
  const invocation = yield* prepareAggregateInvocation({
    contract,
    command: {
      commandName: contract.commandName,
      contractVersion: contract.version,
      payload: decodedPayload,
      aggregateId: initialized.aggregateId,
      aggregateName: initialized.sessionDefinition.aggregateName,
      aggregateVersion: initialized.sessionDefinition.aggregateVersion,
      kind: 'actor',
      actorName: initialized.sessionDefinition.actorName,
      actorVersion: initialized.sessionDefinition.actorVersion,
      claims: initialized.encodedClaims,
      sessionId: initialized.sessionId,
      sessionName: initialized.sessionDefinition.sessionName,
    },
    claims: initialized.claims,
  });
  return { contract, invocation };
});
