import { createHash } from 'node:crypto';

import type { ICommandOutcome } from '@zerospin/core/contracts/CommandOutcomeSchema';
import { encodeDispositionTuple } from '@zerospin/core/contracts/dispositionChainHash';
export const GENESIS_DISPOSITION_PREIMAGE = 'zerospin.service.disposition.v1';

/*
 * Empty service history uses this deterministic seed for execution,
 * publication validation, and cutover checkpoint comparison.
 *
 * 1. Hash the shared genesis preimage.
 */
export const genesisDispositionChainHash = (): string =>
  // 1 — use SHA-256 over genesisDispositionPreimage and return hexadecimal
  createHash('sha256').update(GENESIS_DISPOSITION_PREIMAGE).digest('hex');

/*
 * Version-owned execution and retained-history validation extend the same
 * dispositionChainHash. The hash includes the previous prefix, service position,
 * command ID and final Success/Failure tag in a fixed tuple order.
 *
 * 1. Hash the next disposition tuple.
 */
export const advanceDispositionChainHash = (props: {
  previousDispositionChainHash: string;
  serviceIndex: number;
  commandId: string;
  outcome: NonNullable<ICommandOutcome>;
}): string => {
  const { serviceIndex, commandId, outcome, previousDispositionChainHash } =
    props;

  // 1 — SHA-256 the JSON tuple [previousDispositionChainHash, serviceIndex, commandId, disposition]
  return createHash('sha256')
    .update(
      encodeDispositionTuple({
        previousHash: previousDispositionChainHash,
        index: serviceIndex,
        commandId,
        outcome,
      }),
    )
    .digest('hex');
};
