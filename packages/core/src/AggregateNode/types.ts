import type { IAggregateSessionLock } from '../aggregateSession/AggregateSessionLockSchema.ts';
import type { IEncodedResourceShape } from '../models/types.ts';

import type { AggregateNodeCommandSchema } from './AggregateNodeCommandSchema.ts';

export type IAggregateNodeCommand = typeof AggregateNodeCommandSchema.Type;
export type IAggregateNodeIdentity = Readonly<{
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  aggregateName: string;
  aggregateVersion: number;
  aggregateId: string;
  actorName: string;
  actorVersion: number;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  definitionHash: string;
}>;
export type IAggregateNodeDefinition = Readonly<{
  identity: IAggregateNodeIdentity;
  lock: IAggregateSessionLock;
}>;
export type IAggregateNodeBaseline = Readonly<{
  aggregateIndex: number;
  dispositionChainHash: string;
  resolvedThrough: number;
  resources: readonly IEncodedResourceShape[];
}>;
