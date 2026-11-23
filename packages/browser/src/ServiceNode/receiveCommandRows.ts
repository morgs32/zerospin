import type { ServiceNode } from '@zerospin/core/ServiceNode/ServiceNode';
import type { IServiceNodeCommand } from '@zerospin/core/ServiceNode/types';

import type { ServiceNodeSynchronization } from './ServiceNodeSynchronization.ts';
/** The retained subscriber uses the Node's actual acceptance gate for each validated row. */
export async function receiveCommandRows(props: {
  rows: readonly IServiceNodeCommand[];
  expectedNodeId: string;
  node: Pick<ServiceNode, 'accept'>;
  check(): void;
  synchronization: Pick<ServiceNodeSynchronization, 'push'>;
}) {
  const { rows, expectedNodeId, node, check, synchronization } = props;
  const records = [];
  for (const command of rows) {
    check();
    records.push(await node.accept(command, expectedNodeId, check));
  }
  check();
  void synchronization.push().catch(() => undefined);
  return records;
}
