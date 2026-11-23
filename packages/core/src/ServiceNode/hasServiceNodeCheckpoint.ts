import type { serviceNodeMetadata } from './serviceNodeTables.ts';

type IServiceNodeMetadata = typeof serviceNodeMetadata.$inferSelect;

/** A present checkpoint proves baseline installation, including a valid index-zero baseline. */
export function hasServiceNodeCheckpoint(
  metadata: IServiceNodeMetadata,
): metadata is IServiceNodeMetadata & {
  serviceIndex: number;
  dispositionChainHash: string;
} {
  return metadata.serviceIndex !== null && metadata.dispositionChainHash !== null;
}
