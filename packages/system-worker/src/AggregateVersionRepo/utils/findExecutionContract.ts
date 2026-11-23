import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { isOrdinaryContract } from '@zerospin/core/contracts/make/constructContractRelease';
import type { IAggregateCommand } from '@zerospin/core/contracts/types';
/** Ordinary actors execute only contracts exposed by their actor in this release. */
export function findExecutionContract(
  executionAggregateRelease: IAnyAggregateRelease,
  command: IAggregateCommand,
) {
  const contract =
    command.kind === 'actor'
      ? executionAggregateRelease.actors[command.actorName]?.contracts[
          command.commandName
        ]
      : executionAggregateRelease.contracts[command.commandName];
  return contract !== undefined &&
    isOrdinaryContract(contract) &&
    (command.kind === 'actor' || contract.claims === undefined)
    ? contract
    : undefined;
}
