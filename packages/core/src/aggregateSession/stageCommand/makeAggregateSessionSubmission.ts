import * as Effect from 'effect/Effect';

import type {
  IAggregateContractRelease,
  IInferAggregateSessionSubmissionInput,
  ISessionId,
} from '../../contracts/types.ts';

export const makeAggregateSessionSubmission = Effect.fn(
  'makeAggregateSessionSubmission',
)(function* <
  CONTRACT extends IAggregateContractRelease,
  VERSION extends keyof NonNullable<CONTRACT['__payloads']> & number,
>(props: {
  aggregateId: string;
  aggregateName: string;
  aggregateVersion: number;
  actorName: string;
  actorVersion: number;
  claims: Readonly<Record<string, unknown>>;
  contract: CONTRACT;
  version: VERSION;
  validatedPayload: NoInfer<
    IInferAggregateSessionSubmissionInput<CONTRACT, VERSION>['payload']
  >;
  sessionId: ISessionId;
  sessionName: string;
}): Effect.fn.Return<
  IInferAggregateSessionSubmissionInput<CONTRACT, VERSION>,
  never,
  never
> {
  const {
    aggregateId,
    aggregateName,
    aggregateVersion,
    actorName,
    actorVersion,
    claims,
    contract,
    version,
    validatedPayload,
    sessionId,
    sessionName,
  } = props;

  return {
    commandName: contract.commandName,
    contractVersion: version,
    payload: validatedPayload,
    aggregateId,
    aggregateName,
    aggregateVersion,
    kind: 'actor',
    actorName,
    actorVersion,
    claims,
    sessionId,
    sessionName,
  };
});
