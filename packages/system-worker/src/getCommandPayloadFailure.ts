import type { ICommandOutcome } from '@zerospin/core/contracts/CommandOutcomeSchema';
import type { PublicFailureSchema } from '@zerospin/error';

/** The mapper failure moves from pending admission to the finalized outcome. */
export function getCommandPayloadFailure(command: {
  payload: string | null;
  payloadFailure?: typeof PublicFailureSchema.Type;
  outcome: ICommandOutcome | null;
}) {
  const { payload, payloadFailure, outcome } = command;
  if (payload !== null) return undefined;
  if (outcome === null) return payloadFailure;
  return outcome.result._tag === 'Failure' ? outcome.result.failure : undefined;
}
