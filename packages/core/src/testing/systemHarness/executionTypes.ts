import type { Schema, Semaphore } from 'effect';

import type { IAnyAggregateRelease } from '../../aggregate/types.ts';
import type { IExternalContractDefinition } from '../../contracts/externalContract.ts';
import type { IRecordedCommand } from '../../contracts/RecordedCommandSchema.ts';
import type {
  IAnyOperation,
  ICommand,
  IContractRelease,
  IEncodedCommand,
} from '../../contracts/types.ts';
import type { IDb } from '../../drizzle/types.ts';
import type { IAnyServiceRelease } from '../../service/types.ts';

import type { ISystemHarnessCommand } from './types.ts';

export type IHarnessStore =
  | Readonly<{
      kind: 'aggregate';
      release: IAnyAggregateRelease;
      aggregateId: string;
      db: IDb;
    }>
  | Readonly<{
      kind: 'service';
      release: IAnyServiceRelease;
      db: IDb;
    }>;

export type IHarnessOwnerStore = IHarnessStore &
  Readonly<{ execution: Semaphore.Semaphore }>;

export type IHarnessWork =
  | Readonly<{
      kind: 'command';
      command: IRecordedCommand;
      store: IHarnessStore;
    }>
  | Readonly<{
      kind: 'external';
      store: IHarnessStore;
      contract: IContractRelease & {
        readonly external: IExternalContractDefinition;
      };
      payload: typeof Schema.Json.Type;
      id: ICommand['id'];
    }>;

export type IQueuedHarnessWork =
  | IHarnessWork
  | Readonly<{ kind: 'agent'; command: ISystemHarnessCommand }>;

export type IPreparedHarnessOutput = Readonly<{
  modelOperations: readonly Readonly<{
    operation: IAnyOperation;
    operationIndex: number;
  }>[];
  work: readonly IHarnessWork[];
}>;
