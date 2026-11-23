import type { IContractRelease } from './types.ts';

/** Resolve exact public payload versions along the authored bidirectional lineage. */
export function resolveContractVersion(
  contract: IContractRelease,
  contractVersion: number,
): IContractRelease | undefined {
  let selected: IContractRelease | undefined = contract;
  while (selected !== undefined) {
    if (selected.version === contractVersion) return selected;
    selected = selected.previous;
  }
  selected = contract.next;
  while (selected !== undefined) {
    if (selected.version === contractVersion) return selected;
    selected = selected.next;
  }
  return undefined;
}
