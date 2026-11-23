import { AggregateContractDefinition } from './definition.ts';

export function defineAggregateContract<const NAME extends string>(
  name: NAME,
): AggregateContractDefinition<NAME> {
  return new AggregateContractDefinition(name);
}
