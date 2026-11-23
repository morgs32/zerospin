import type { PublicFailureSchema } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IAggregateDefinition } from '../aggregate/defineAggregate.ts';
import type { IInferCommandPayload } from '../models/types.ts';
import type { IServiceDefinition } from '../service/defineService.ts';

import type {
  IAggregateContractRelease,
  IInferContractResult,
  IServiceContractRelease,
} from './types.ts';

export type ICommandDestination =
  | Readonly<{
      aggregate: IAggregateDefinition;
      version: number;
      service?: never;
    }>
  | Readonly<{
      service: IServiceDefinition;
      version: number;
      aggregate?: never;
    }>;
export type ICommandContinuationContract =
  | IAggregateContractRelease
  | IServiceContractRelease;

export type ICommandContinuationBranch<
  CONTRACT extends ICommandContinuationContract,
  INPUT,
  SERVICES = unknown,
> = Readonly<{
  contract: CONTRACT & {
    readonly external?: undefined;
    readonly claims?: undefined;
  };
  payload(
    input: INPUT,
  ): Effect.Effect<
    IInferCommandPayload<NoInfer<CONTRACT['payload']>>,
    unknown,
    SERVICES
  >;
}>;

export type ICommandContinuationBranches<
  CONTRACT extends ICommandContinuationContract = ICommandContinuationContract,
  SUCCESS extends ICommandContinuationContract = ICommandContinuationContract,
  FAILURE extends ICommandContinuationContract = ICommandContinuationContract,
  SUCCESS_SERVICES = unknown,
  FAILURE_SERVICES = unknown,
> = Readonly<{
  onSuccess?: ICommandContinuationBranch<
    SUCCESS,
    {
      payload: IInferCommandPayload<NoInfer<CONTRACT['payload']>>;
      success: [IInferContractResult<NoInfer<CONTRACT>>] extends [void]
        ? null
        : IInferContractResult<NoInfer<CONTRACT>>;
    },
    SUCCESS_SERVICES
  >;
  onFailure?: ICommandContinuationBranch<
    FAILURE,
    {
      payload: IInferCommandPayload<NoInfer<CONTRACT['payload']>>;
      failure: typeof PublicFailureSchema.Type;
    },
    FAILURE_SERVICES
  >;
}>;

export type ICommandOperation<
  DESTINATION extends ICommandDestination = ICommandDestination,
  CONTRACT extends IAggregateContractRelease | IServiceContractRelease =
    | IAggregateContractRelease
    | IServiceContractRelease,
  SUCCESS_SERVICES = unknown,
  FAILURE_SERVICES = unknown,
> = Readonly<{
  operationName: 'command';
  destination: DESTINATION;
  contract: CONTRACT;
  payload: IInferCommandPayload<CONTRACT['payload']>;
  aggregateId: string | null;
}> &
  ICommandContinuationBranches<
    ICommandContinuationContract,
    ICommandContinuationContract,
    ICommandContinuationContract,
    SUCCESS_SERVICES,
    FAILURE_SERVICES
  >;

export type ICommandOperationProps<
  DESTINATION extends ICommandDestination,
  CONTRACT extends IAggregateContractRelease | IServiceContractRelease,
> = Readonly<{ payload: IInferCommandPayload<CONTRACT['payload']> }> &
  (DESTINATION extends { readonly aggregate: IAggregateDefinition }
    ? Readonly<{ aggregateId: string }>
    : Readonly<{ aggregateId?: never }>);

export function commandContinuationRefs(
  branches: ICommandContinuationBranches,
) {
  const { onSuccess, onFailure } = branches;
  return {
    ...(onSuccess === undefined
      ? {}
      : {
          onSuccess: {
            commandName: onSuccess.contract.commandName,
            version: onSuccess.contract.version,
          },
        }),
    ...(onFailure === undefined
      ? {}
      : {
          onFailure: {
            commandName: onFailure.contract.commandName,
            version: onFailure.contract.version,
          },
        }),
  };
}
