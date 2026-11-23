const contractIdentity = Symbol.for('@zerospin/core/AggregateContractRelease');
/** Nominal contract provenance; construction publishes only completed instances. */
export class AggregateContractRelease {
  declare private readonly aggregateContractBrand: void;
  readonly [contractIdentity] = true;
}
