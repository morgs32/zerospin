const contractIdentity = Symbol.for('@zerospin/core/ServiceContractRelease');
/** Nominal contract provenance; construction publishes only completed instances. */
export class ServiceContractRelease {
  declare private readonly serviceContractBrand: void;
  readonly [contractIdentity] = true;
}
