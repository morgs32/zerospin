const aggregateDefinitionIdentity = Symbol.for(
  '@zerospin/core/AggregateContractDefinition',
);
const serviceDefinitionIdentity = Symbol.for(
  '@zerospin/core/ServiceContractDefinition',
);
const aggregateDefinitions = new WeakSet<object>();
const serviceDefinitions = new WeakSet<object>();

export class AggregateContractDefinition<NAME extends string = string> {
  declare private readonly aggregateDefinitionBrand: void;
  readonly [aggregateDefinitionIdentity] = true;

  constructor(readonly name: NAME) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('Contract name must be nonempty');
    }
    aggregateDefinitions.add(this);
  }
}
export class ServiceContractDefinition<NAME extends string = string> {
  declare private readonly serviceDefinitionBrand: void;
  readonly [serviceDefinitionIdentity] = true;

  constructor(readonly name: NAME) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('Contract name must be nonempty');
    }
    serviceDefinitions.add(this);
  }
}
export type IAggregateContractDefinition<NAME extends string = string> =
  AggregateContractDefinition<NAME>;
export type IServiceContractDefinition<NAME extends string = string> =
  ServiceContractDefinition<NAME>;
export type IContractDefinition<NAME extends string = string> =
  | IAggregateContractDefinition<NAME>
  | IServiceContractDefinition<NAME>;
export function isAggregateContractDefinition(
  value: unknown,
): value is IAggregateContractDefinition {
  return (
    value instanceof AggregateContractDefinition &&
    aggregateDefinitions.has(value)
  );
}
export function isServiceContractDefinition(
  value: unknown,
): value is IServiceContractDefinition {
  return (
    value instanceof ServiceContractDefinition && serviceDefinitions.has(value)
  );
}
