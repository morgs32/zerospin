import type { ICommandOutcome } from './CommandOutcomeSchema.ts';

export const GENESIS_EXECUTED_PREIMAGE = 'zerospin.executed.disposition.v1';

/** Chain predecessor, position and ID with only the outcome's Success/Failure tag. */
export function encodeDispositionTuple(props: {
  previousHash: string;
  index: number;
  commandId: string;
  outcome: ICommandOutcome;
}): string {
  const { previousHash, index, commandId, outcome } = props;

  return JSON.stringify([previousHash, index, commandId, outcome.result._tag]);
}

export async function hashDispositionChain(preimage: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(preimage),
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}
