import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';

import type { IStandaloneSessionAttachment } from './StandaloneBrowserSessionApi.ts';
/** Retain original commands under the bound Node incarnation before scheduling execution. */
export async function receiveCommandRows(props: {
  rows: readonly IAggregateNodeCommand[];
  attachment: IStandaloneSessionAttachment;
  check(): void;
  drain(): Promise<void>;
}) {
  const { rows, attachment, check, drain } = props;
  check();
  if (rows.length === 0) return [];
  const records = [];
  for (const command of rows) {
    check();
    records.push(await attachment.node.accept(command, attachment.boundNodeId));
  }
  check();
  void drain().catch(() => undefined);
  return records;
}
