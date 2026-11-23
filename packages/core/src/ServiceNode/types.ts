import type { IEncodedResourceShape } from '../models/types.ts';
import type { IServiceSessionLock } from '../serviceSession/ServiceSessionLockSchema.ts';

import type { ServiceNodeCommandSchema } from './ServiceNodeCommandSchema.ts';

export type IServiceNodeCommand = typeof ServiceNodeCommandSchema.Type;
export type IServiceNodeIdentity = Readonly<{
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  serviceName: string;
  serviceVersion: number;
  actorName: string;
  actorVersion: number;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  definitionHash: string;
}>;
export type IServiceNodeDefinition = Readonly<{
  identity: IServiceNodeIdentity;
  lock: IServiceSessionLock;
}>;
export type IServiceNodeBaseline = Readonly<{
  serviceIndex: number;
  dispositionChainHash: string;
  resolvedThrough: number;
  resources: readonly IEncodedResourceShape[];
}>;
