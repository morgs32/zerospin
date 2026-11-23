import type { IAggregateAgentNodeState } from '../AggregateAgentNode/types.ts';
export type { IAgentNodeView } from '../AggregateAgentNode/types.ts';
export type IServiceAgentNodeState = Omit<
  IAggregateAgentNodeState,
  'aggregateIndex'
> &
  Readonly<{ serviceIndex: number | null }>;
