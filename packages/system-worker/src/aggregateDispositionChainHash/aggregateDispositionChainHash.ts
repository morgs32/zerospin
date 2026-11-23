import type { ICommandOutcome } from '@zerospin/core/contracts/CommandOutcomeSchema';
import { encodeDispositionTuple } from '@zerospin/core/contracts/dispositionChainHash';
import { sha256 } from '@zerospin/core/utils/sha256';
export const GENESIS_DISPOSITION_PREIMAGE = 'zerospin.aggregate.disposition.v1';

/*
 * Empty aggregate history uses this deterministic seed for execution,
 * publication validation, and cutover checkpoint comparison.
 *
 * 1. Hash the shared genesis preimage.
 */
export const genesisDispositionChainHash = (): string =>
  // 1 — use SHA-256 over genesisDispositionPreimage and return hexadecimal
  sha256(GENESIS_DISPOSITION_PREIMAGE);

/*
 * Version-owned execution and retained-history validation extend the same
 * dispositionChainHash. The hash includes the previous prefix, aggregate position,
 * command ID and final Success/Failure tag in a fixed tuple order.
 *
 * 1. Hash the next disposition tuple.
 */
export const advanceDispositionChainHash = (props: {
  previousDispositionChainHash: string;
  aggregateIndex: number;
  commandId: string;
  outcome: NonNullable<ICommandOutcome>;
}): string => {
  const { aggregateIndex, commandId, outcome, previousDispositionChainHash } =
    props;

  // 1 — SHA-256 the JSON tuple [previousDispositionChainHash, aggregateIndex, commandId, disposition]
  return sha256(
    encodeDispositionTuple({
      previousHash: previousDispositionChainHash,
      index: aggregateIndex,
      commandId,
      outcome,
    }),
  );
};
