import { ServiceContractDefinition } from './definition.ts';

export function defineServiceContract<const NAME extends string>(
  name: NAME,
): ServiceContractDefinition<NAME> {
  return new ServiceContractDefinition(name);
}
