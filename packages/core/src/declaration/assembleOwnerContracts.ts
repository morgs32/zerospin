import { mapValues } from 'es-toolkit';

import type { IAnyContracts, IContractRelease } from '../contracts/types.ts';

/** Collect declared inventory and direct grants; makeSystem validates their canonical bindings. */
export function assembleOwnerContracts(props: {
  actors: Readonly<Record<string, { readonly contracts: IAnyContracts }>>;
  declaredContracts?: IAnyContracts;
  system: IAnyContracts;
  external: IAnyContracts;
}): IAnyContracts {
  const { actors, declaredContracts = {}, system, external } = props;
  const contracts: Record<string, IContractRelease> = Object.assign(
    Object.create(null),
    system,
    external,
  );
  mapValues(actors, actor => Object.assign(contracts, actor.contracts));
  return Object.assign(contracts, declaredContracts);
}
