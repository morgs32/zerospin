import type { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';

import type { AggregateNodeSynchronization } from './AggregateNodeSynchronization.ts';
/** The retained subscriber uses the Node's actual acceptance gate for each validated row. */
export async function receiveCommandRows(props: {
  rows: readonly IAggregateNodeCommand[];
  expectedNodeId: string;
  node: Pick<AggregateNode, 'accept'>;
  check(): void;
  synchronization: Pick<AggregateNodeSynchronization, 'push'>;
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
