import type { aggregateNodeMetadata } from './aggregateNodeTables.ts';

type IAggregateNodeMetadata = typeof aggregateNodeMetadata.$inferSelect;

/** A present checkpoint proves baseline installation, including a valid index-zero baseline. */
export function hasAggregateNodeCheckpoint(
  metadata: IAggregateNodeMetadata,
): metadata is IAggregateNodeMetadata & {
  aggregateIndex: number;
  dispositionChainHash: string;
} {
  return metadata.aggregateIndex !== null && metadata.dispositionChainHash !== null;
}
