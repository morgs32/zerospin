import type { IAggregateRegistry } from '@zerospin/core/aggregate/types';
import { resolveContractVersion } from '@zerospin/core/contracts/resolveContractVersion';

/** Owner-scoped declarations remain supported independently of their original release. */
export function resolveSupportedAggregateContract(
  aggregateRegistry: IAggregateRegistry,
  command: { commandName: string; contractVersion: number },
) {
  for (const aggregateRelease of Object.values(aggregateRegistry)) {
    const entry = aggregateRelease.contracts[command.commandName];
    if (entry === undefined) continue;
    const contract = resolveContractVersion(entry, command.contractVersion);
    if (contract !== undefined) return contract;
  }
  return undefined;
}
