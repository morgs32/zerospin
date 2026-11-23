import type { IAggregateNodeSnapshot } from '@zerospin/core/AggregateNode/AggregateNode';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import type { IServiceNodeSnapshot } from '@zerospin/core/ServiceNode/ServiceNode';
import type { IServiceNodeCommand } from '@zerospin/core/ServiceNode/types';

import type { IStagedCommandAttachment } from '../outbox/makeSessionCommandHandoff.ts';

export type IAggregateReplicaConnection = {
  journalIdentityKey?(): string | undefined;
  stagedCommandAttachment(
    nodeId: string,
  ): IStagedCommandAttachment<IAggregateNodeCommand> | null;
};
export type IServiceReplicaConnection = {
  journalIdentityKey?(): string | undefined;
  stagedCommandAttachment(
    nodeId: string,
  ): IStagedCommandAttachment<IServiceNodeCommand> | null;
};
export type IAggregateReplica = {
  pendingCommands(): readonly IAggregateNodeCommand[];
  view(snapshot: IAggregateNodeSnapshot): Promise<void>;
  reset(options?: { preservePending?: boolean }): Promise<void>;
  recoveryWarning(failure: { error: unknown }): void;
  state(state: IAggregateNodeSnapshot['state']): void;
  attachmentReady(): Promise<void>;
  connectionFailed(failure: { error: unknown }): void;
};
export type IServiceReplica = {
  pendingCommands(): readonly IServiceNodeCommand[];
  view(snapshot: IServiceNodeSnapshot): Promise<void>;
  reset(options?: { preservePending?: boolean }): Promise<void>;
  recoveryWarning(failure: { error: unknown }): void;
  state(state: IServiceNodeSnapshot['state']): void;
  attachmentReady(): Promise<void>;
  connectionFailed(failure: { error: unknown }): void;
};
