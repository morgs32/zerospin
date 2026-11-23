import type { IAgentConnectionState } from '../agent/types.ts';
import type { ISelection } from '../models/make/makeQueryDbVersion.ts';

export type IAgentNodeView = Readonly<{
  readSelection(
    selection: ISelection,
    identity: Readonly<Record<string, string>>,
  ): ReturnType<ISelection['all']>;
}>;
export type IAggregateAgentNodeState = Readonly<{
  view: IAgentNodeView | null;
  connection: IAgentConnectionState;
  aggregateIndex: number | null;
  dispositionChainHash: string | null;
}>;
