import type { IOperationDefinitions } from '../contracts/operationDefinition.ts';
import { getReleaseCommandOperations } from '../contracts/operationSchema.ts';
import type { IAnyContracts, IContractRelease } from '../contracts/types.ts';

type IReleaseContinuationDeclarations = {
  readonly contracts: IAnyContracts;
  readonly external: IAnyContracts;
  readonly extensions?: Readonly<
    Record<string, { operations: IOperationDefinitions }>
  >;
};

export function getReleaseContinuationContracts(
  release: IReleaseContinuationDeclarations,
): readonly IContractRelease[] {
  const contracts: IContractRelease[] = [];
  for (const contract of Object.values(release.external)) {
    if (contract.external !== undefined) {
      contracts.push(
        contract.external.onSuccess.contract,
        contract.external.onFailure.contract,
      );
    }
  }
  for (const operation of getReleaseCommandOperations(release)) {
    if (operation.onSuccess !== undefined) {
      contracts.push(operation.onSuccess.contract);
    }
    if (operation.onFailure !== undefined) {
      contracts.push(operation.onFailure.contract);
    }
  }
  return contracts;
}

/** Operation branches grant authority only to exact explicitly registered ordinary follow-ups. */
export function validateReleaseContinuations(
  release: IReleaseContinuationDeclarations & {
    readonly name: string;
    readonly version: number;
    readonly system: IAnyContracts;
    readonly actors: Readonly<
      Record<string, { readonly contracts: IAnyContracts }>
    >;
  },
  declaredContracts: IAnyContracts,
): void {
  for (const contract of getReleaseContinuationContracts(release)) {
    const name = contract.commandName;
    if (
      declaredContracts[name] !== contract ||
      release.contracts[name] !== contract ||
      contract.external !== undefined ||
      contract.claims !== undefined
    ) {
      throw new Error(
        `Continuation ${name}@${contract.version} must be a claims-free ordinary contract explicitly registered in ${release.name}@${release.version}.contracts`,
      );
    }
    if (
      Object.hasOwn(release.system, name) ||
      Object.hasOwn(release.external, name) ||
      Object.values(release.actors).some(actor =>
        Object.hasOwn(actor.contracts, name),
      )
    ) {
      throw new Error(
        `Continuation ${name} cannot have another invocation grant`,
      );
    }
  }
}
