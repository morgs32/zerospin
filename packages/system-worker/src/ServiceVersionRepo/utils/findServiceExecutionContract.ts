import type { RetainedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { isOrdinaryContract } from '@zerospin/core/contracts/make/constructContractRelease';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';

/** Service replay uses the same receiving release grant as original execution. */
export function findServiceExecutionContract(
  release: IAnyServiceRelease,
  command: typeof RetainedServiceCommandSchema.Type,
) {
  const contract =
    command.kind === 'actor'
      ? release.actors[command.actorName]?.contracts[command.commandName]
      : release.contracts[command.commandName];
  return contract !== undefined && isOrdinaryContract(contract)
    ? contract
    : undefined;
}
