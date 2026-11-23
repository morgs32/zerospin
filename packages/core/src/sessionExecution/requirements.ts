import type { Scope } from 'effect';

import type { IInferAggregateSessionExecutionContract } from '../aggregateSession/executionDefinition.ts';
import type { IAggregateSessionDefinition } from '../aggregateSession/types.ts';
import type { IInferContractExecutionRequirements } from '../contracts/types.ts';
import type { IServiceSessionDefinition } from '../serviceSession/types.ts';

export type IAggregateSessionReplayRequirements<
  D extends IAggregateSessionDefinition,
> = '__initializeRequirements' extends keyof D
  ? Exclude<NonNullable<D['__initializeRequirements']>, Scope.Scope>
  : Exclude<
      IInferContractExecutionRequirements<
        IInferAggregateSessionExecutionContract<
          D['contracts'][keyof D['contracts']]
        >
      >,
      Scope.Scope
    >;
export type IServiceSessionReplayRequirements<
  D extends IServiceSessionDefinition,
> = Exclude<
  IInferContractExecutionRequirements<D['contracts'][keyof D['contracts']]>,
  Scope.Scope
>;
