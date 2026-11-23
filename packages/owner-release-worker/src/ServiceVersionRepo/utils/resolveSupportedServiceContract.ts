import { resolveContractVersion } from '@zerospin/core/contracts/resolveContractVersion';
import type { IServiceRegistry } from '@zerospin/core/service/types';

/** Historical declarations remain supported independently of their original Service release. */
export function resolveSupportedServiceContract(
  serviceRegistry: IServiceRegistry,
  command: { commandName: string; contractVersion: number },
) {
  for (const serviceRelease of Object.values(serviceRegistry)) {
    const entry = serviceRelease.contracts[command.commandName];
    if (entry === undefined) continue;
    const contract = resolveContractVersion(entry, command.contractVersion);
    if (contract !== undefined) return contract;
  }
  return undefined;
}
