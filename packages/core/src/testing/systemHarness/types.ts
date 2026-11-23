import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type {
  IAggregateCommand,
  IContractRelease,
  IContractFailure,
  IInferContractResult,
  IServiceCommand,
} from '../../contracts/types.ts';
import type { QuerySelection } from '../../models/make/makeQueryDbVersion.ts';
import type { ISystem } from '../../system/types.ts';
import type { ISystemApi } from '../../systemApi/ISystemApi.ts';

export type ISystemHarnessCommand = IAggregateCommand | IServiceCommand;

export type ISystemHarnessApi = Pick<
  ISystemApi,
  'executeServiceCommand' | 'executeServiceQuery'
>;

type IRegisteredAggregateRelease<SYSTEM extends ISystem> = {
  [NAME in keyof SYSTEM['aggregates']]: SYSTEM['aggregates'][NAME]['releases'][keyof SYSTEM['aggregates'][NAME]['releases']];
}[keyof SYSTEM['aggregates']];

type IRegisteredServiceRelease<SYSTEM extends ISystem> = {
  [NAME in keyof SYSTEM['services']]: SYSTEM['services'][NAME]['releases'][keyof SYSTEM['services'][NAME]['releases']];
}[keyof SYSTEM['services']];

export type ISystemHarnessOwner<SYSTEM extends ISystem> =
  | Readonly<{
      release: IRegisteredAggregateRelease<SYSTEM>;
      aggregateId: string;
    }>
  | Readonly<{
      release: IRegisteredServiceRelease<SYSTEM>;
      aggregateId?: never;
    }>;

type IReleaseResult<
  RELEASE,
  COMMAND extends ISystemHarnessCommand,
> = RELEASE extends { readonly contracts: infer CONTRACTS }
  ? {
      [NAME in keyof CONTRACTS]: [NAME & COMMAND['commandName']] extends [never]
        ? never
        : CONTRACTS[NAME] extends IContractRelease
          ? IInferContractResult<CONTRACTS[NAME]>
          : never;
    }[keyof CONTRACTS]
  : never;

type IAggregateResult<
  SYSTEM extends ISystem,
  COMMAND extends IAggregateCommand,
> = {
  [NAME in keyof SYSTEM['aggregates']]: [
    NAME & COMMAND['aggregateName'],
  ] extends [never]
    ? never
    : {
        [VERSION in keyof SYSTEM['aggregates'][NAME]['releases']]: [
          VERSION & COMMAND['aggregateVersion'],
        ] extends [never]
          ? never
          : IReleaseResult<
              SYSTEM['aggregates'][NAME]['releases'][VERSION],
              COMMAND
            >;
      }[keyof SYSTEM['aggregates'][NAME]['releases']];
}[keyof SYSTEM['aggregates']];

type IServiceResult<SYSTEM extends ISystem, COMMAND extends IServiceCommand> = {
  [NAME in keyof SYSTEM['services']]: [NAME & COMMAND['serviceName']] extends [
    never,
  ]
    ? never
    : {
        [VERSION in keyof SYSTEM['services'][NAME]['releases']]: [
          VERSION & COMMAND['serviceVersion'],
        ] extends [never]
          ? never
          : IReleaseResult<
              SYSTEM['services'][NAME]['releases'][VERSION],
              COMMAND
            >;
      }[keyof SYSTEM['services'][NAME]['releases']];
}[keyof SYSTEM['services']];

/** Preserve matching result unions; an erased System registry exposes unknown. */
export type ISystemHarnessResult<
  SYSTEM extends ISystem,
  COMMAND extends ISystemHarnessCommand,
> = string extends keyof SYSTEM['aggregates'] | keyof SYSTEM['services']
  ? unknown
  : COMMAND extends IAggregateCommand
    ? IAggregateResult<SYSTEM, COMMAND>
    : COMMAND extends IServiceCommand
      ? IServiceResult<SYSTEM, COMMAND>
      : never;

export interface ISystemHarness<SYSTEM extends ISystem> {
  push<COMMAND extends ISystemHarnessCommand>(
    command: COMMAND,
  ): Effect.Effect<ISystemHarnessResult<SYSTEM, COMMAND>, IContractFailure>;
  flush(): Effect.Effect<void, IAnyError>;
  query<A>(
    owner: ISystemHarnessOwner<SYSTEM>,
    selection: QuerySelection<A>,
  ): Effect.Effect<A, IAnyError>;
}
