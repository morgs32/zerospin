import type {
  IAnyError,
  IFrameworkError,
  IRecognizedFailure,
  IScopedError,
} from '@zerospin/error';
import {
  type IInferDecodedRow,
  type IInferIdFromAbbreviation,
  type IShape,
} from '@zerospin/shapes';
import type { Effect, Schema } from 'effect';

import type {
  IInferCommandPayload,
  IInferResource,
  IModel,
} from '../models/types.ts';

import type { AggregateContractRelease } from './AggregateContractRelease.ts';
import type { IAggregateExternalOperation } from './aggregateExternalOperation.ts';
import type { ICommandOperation } from './commandOperation.ts';
import type { ICommandOutcome } from './CommandOutcomeSchema.ts';
import type {
  ActorCommandSchema,
  AgentCommandSchema,
  ServiceSessionSubmissionSchema,
  SystemCommandSchema,
} from './CommandSchema.ts';
import type { ContractSpecSchema } from './ContractSpecSchema.ts';
import type { ICreateOperation } from './createOperation.ts';
import type { IDeleteOperation } from './deleteOperation.ts';
import type { DownAdapterRefused } from './DownAdapterRefused.ts';
import type { IExternalContractDefinition } from './externalContract.ts';
import type { IFailureJson, IFailures, IFailureType } from './failures.ts';
import type { IContractReadDb } from './make/makeContractReadDb.ts';
import type { IMoveOperation } from './moveOperation.ts';
import type {
  IInferOperation,
  IOperationDefinitions,
  IRecordingOperations,
} from './operationDefinition.ts';
import type {
  IProjectedReadModels,
  IReadModels,
  IReadProjections,
} from './readProjection.ts';
import type { ServiceContractRelease } from './ServiceContractRelease.ts';
import type { IServiceExternalOperation } from './serviceExternalOperation.ts';
import type { StagingOutcomeSchema } from './StagingOutcomeSchema.ts';
import type { IUpdateOperation } from './updateOperation.ts';
export type IOperationName = 'create' | 'delete' | 'move' | 'update';
type IInferModelAttributesShape<MODEL extends IModel> = MODEL['attributes'];
export type IOperation<
  MODEL extends IModel = IModel,
  OPERATION_NAME extends IOperationName = IOperationName,
> = Extract<
  | ICreateOperation<MODEL>
  | IUpdateOperation<MODEL>
  | IDeleteOperation<MODEL>
  | IMoveOperation<MODEL>,
  {
    operationName: OPERATION_NAME;
  }
>;
/** Unfinalized operation union from contract programs; applyOperationTx adds apply metadata. */
export type IAnyOperation = IOperation<IModel, IOperationName>;
export type IContractOutput =
  | IAnyOperation
  | IAggregateExternalOperation
  | IServiceExternalOperation
  | ICommandOperation;
/** Pre-apply snapshot for undoing an applied operation. */
export type IInverseOperation =
  | Readonly<{
      attributes: Partial<IInferDecodedRow<IInferModelAttributesShape<IModel>>>;
    }>
  | Readonly<{
      resource: IInferResource<IModel>;
    }>
  | Readonly<{
      property: string;
      prevId: string | number | null;
    }>;
export type IAppliedOperation = IAnyOperation &
  Readonly<{
    appliedAt: Date;
    previousUpdatedAt: Date | null;
    inverseOperation: IInverseOperation | null;
  }>;
export type IAnyContracts = Readonly<Record<string, IContractRelease>>;
type IGrantKeys<SOURCE> = SOURCE extends unknown ? keyof SOURCE : never;
type IGrantValue<SOURCE, KEY extends PropertyKey> = SOURCE extends unknown
  ? KEY extends keyof SOURCE
    ? SOURCE[KEY]
    : never
  : never;
/** Preserve every exact canonical release across the four explicit grant sources. */
export type IGrantedContracts<SOURCE> = {
  readonly [KEY in IGrantKeys<SOURCE>]: IGrantValue<SOURCE, KEY>;
};

export type IAggregateContracts = Readonly<
  Record<string, IAggregateContractRelease>
>;
export type IServiceContracts = Readonly<
  Record<string, IServiceContractRelease>
>;
export type IOperationArraySchema = Schema.Codec<
  readonly IContractOutput[],
  unknown
>;
/** Discriminated domain values; framework failures use their own reserved tag. */
export type IBusinessFailure = IScopedError;
export type IContractFailure = IAnyError | IBusinessFailure;
export type IInferFailure<
  CONTRACT extends IContractRelease,
  VERSION extends keyof NonNullable<CONTRACT['__failures']> & number =
    CONTRACT['version'],
> = CONTRACT extends IContractRelease
  ? IFailureType<NonNullable<CONTRACT['__failures']>[VERSION]>
  : never;
export type IInferFailureJson<CONTRACT extends IContractRelease> =
  CONTRACT extends IContractRelease
    ? IFailureJson<CONTRACT['failures']>
    : never;
// --- Contracts & validation
export type IContractSpec = typeof ContractSpecSchema.Type;
export type IOperationSpec =
  | Readonly<{
      model: Readonly<{ modelName: string; version: number }>;
      operationName: IOperationName;
    }>
  | Readonly<{
      operationName: 'external';
      family: 'aggregate' | 'service';
      contractName: string;
      contractVersion: number;
      payloadJsonSchema: unknown;
    }>
  | Readonly<{
      operationName: 'command';
      family: 'aggregate' | 'service';
      destinationName: string;
      destinationVersion: number;
      contractName: string;
      contractVersion: number;
      payloadJsonSchema: unknown;
      onSuccess?: Readonly<{ commandName: string; version: number }>;
      onFailure?: Readonly<{ commandName: string; version: number }>;
    }>;
/** Encoded optimistic operation before worker application adds apply metadata. */
export type IEncodedOperation = Readonly<{
  commandId: string;
  operationIndex: number;
  modelName: string;
  modelVersion: number;
  resourceId: string;
  operationName: IOperationName;
  body: string;
}>;
/** Encoded applied operation at persistence, ledger, and rollback boundaries. */
export type IEncodedAppliedOperation = Readonly<{
  commandId: string;
  operationIndex: number;
  modelName: string;
  modelVersion: number;
  resourceId: string;
  operationName: IOperationName;
  body: string;
  appliedAt: Date;
  previousUpdatedAt: Date | null;
  inverseOperation: string;
}>;
export type IContractCallbackInput<
  PAYLOAD extends IShape = IShape,
  MODELS extends IReadModels = IReadModels,
  FAILURES extends IFailures = IFailures,
  CLAIMS = Readonly<Record<string, unknown>> | null,
  OWNER_SCOPE = { aggregateId?: string },
> = {
  db: IContractReadDb<[MODELS] extends [never] ? Record<never, never> : MODELS>;
  claims: CLAIMS;
  failures: FAILURES;
  command: OWNER_SCOPE extends { aggregateId: string }
    ? IDecodedAggregateCommand | IAggregateSessionSubmissionInput
    : OWNER_SCOPE extends { aggregateId?: never }
      ? IDecodedServiceCommand | IServiceSessionSubmissionInput
      :
          | IDecodedAggregateCommand
          | IDecodedServiceCommand
          | IAggregateSessionSubmissionInput
          | IServiceSessionSubmissionInput;
  payload: string extends keyof PAYLOAD
    ? // oxlint-disable-next-line typescript/no-explicit-any -- erased payload shape intentionally accepts any payload
      any
    : IInferCommandPayload<PAYLOAD>;
} & OWNER_SCOPE;

/** Original commands whose payload version is known to a contract lineage. */
export type IKnownCommand<
  PAYLOADS extends Record<number, IShape> = Record<number, IShape>,
  COMMAND_NAME extends string = string,
> = {
  [VERSION in keyof PAYLOADS & number]: (
    | IDecodedAggregateCommand
    | IDecodedServiceCommand
    | IAggregateSessionSubmissionInput
    | IServiceSessionSubmissionInput
  ) & {
    readonly commandName: COMMAND_NAME;
    readonly contractVersion: VERSION;
    readonly payload: IInferCommandPayload<PAYLOADS[VERSION]>;
  };
}[keyof PAYLOADS & number];

/** Program-only recording capabilities; guard and invocation inputs remain read-only. */
export type IContractProgramInput<
  INPUT,
  OPERATIONS extends IOperationDefinitions = IOperationDefinitions,
> = INPUT & {
  readonly operations: IRecordingOperations<
    [OPERATIONS] extends [never] ? Record<never, never> : OPERATIONS
  >;
};

/** Decoded arguments retained after the owning workflow resolves a contract. */
export type IPreparedInvocation<
  CONTRACT extends IContractRelease = IContractRelease,
> = Omit<Parameters<CONTRACT['evaluate']>[0], 'db'> &
  Readonly<{
    contract: CONTRACT;
    payload: IInferCommandPayload<CONTRACT['payload']>;
    aggregateId?: string;
  }>;

export type IEvaluatedContractOutput<
  CONTRACT extends IContractRelease = IContractRelease,
> = Readonly<{
  operations: readonly IInferContractOperations<CONTRACT>[];
  result: IInferContractResult<CONTRACT>;
}>;

/** Common schema and evaluation facts; concrete registry interfaces retain family provenance. */
export interface IContractRelease<
  COMMAND_NAME extends string = string,
  PAYLOAD extends IShape = IShape,
  VERSION extends number = number,
  RESULT = unknown,
  PAYLOADS extends Record<number, IShape> = { [K in VERSION]: PAYLOAD },
  MODELS extends IReadProjections = IReadProjections,
  PROGRAM extends Effect.Effect<unknown, IContractFailure, unknown> =
    Effect.Effect<unknown, IContractFailure, unknown>,
  HISTORICAL_EXECUTION_REQUIREMENTS = unknown,
  FAILURE extends IFailures = IFailures,
  FAILURES extends Record<number, IFailures> = Record<number, FAILURE>,
  CLAIMS extends Schema.Codec<
    Readonly<Record<string, unknown>> | null,
    unknown
  > = Schema.Codec<Readonly<Record<string, unknown>> | null, unknown>,
  GUARD_REQUIREMENTS = unknown,
  OWNER_SCOPE = {
    aggregateId?: string;
  },
  OPERATIONS extends IOperationDefinitions = IOperationDefinitions,
> {
  readonly external?: IExternalContractDefinition;
  readonly claims?: CLAIMS;
  readonly failures: FAILURE;
  readonly __failures?: FAILURES;
  readonly __historicalExecutionRequirements?: HISTORICAL_EXECUTION_REQUIREMENTS;
  readonly __program?: PROGRAM;
  readonly __guardRequirements?: GUARD_REQUIREMENTS;
  readonly models: MODELS;
  readonly operations: OPERATIONS;
  readonly operationsSchema: Schema.Codec<
    readonly IInferOperation<OPERATIONS[keyof OPERATIONS]>[],
    unknown
  >;
  readonly previous:
    | IContractRelease<
        COMMAND_NAME,
        IShape,
        number,
        unknown,
        Record<number, IShape>,
        IReadProjections,
        Effect.Effect<
          unknown,
          IContractFailure,
          HISTORICAL_EXECUTION_REQUIREMENTS
        >,
        HISTORICAL_EXECUTION_REQUIREMENTS,
        IFailures,
        Record<number, IFailures>,
        Schema.Codec<Readonly<Record<string, unknown>> | null, unknown>,
        HISTORICAL_EXECUTION_REQUIREMENTS,
        OWNER_SCOPE
      >
    | undefined;
  readonly next: IContractRelease | undefined;
  readonly up:
    | ((props: { payload: unknown }) => Effect.Effect<unknown, IAnyError>)
    | undefined;
  readonly down:
    | ((props: { payload: unknown }) => Effect.Effect<unknown, IAnyError>)
    | undefined;
  readonly commandName: COMMAND_NAME;
  readonly knownCommandSchema: Schema.Codec<
    IKnownCommand<PAYLOADS, COMMAND_NAME>,
    unknown
  >;
  readonly payload: PAYLOAD;
  readonly __payloads?: PAYLOADS;
  readonly version: VERSION;
  readonly evaluate: {
    bivarianceHack(
      input: Omit<
        IContractCallbackInput<
          PAYLOAD,
          IProjectedReadModels<MODELS>,
          FAILURE,
          [CLAIMS] extends [never]
            ? Readonly<Record<string, unknown>> | null
            : CLAIMS['Type'],
          OWNER_SCOPE
        >,
        'failures' | 'payload' | 'aggregateId'
      >,
    ): Effect.Effect<
      Readonly<{
        operations: readonly IInferOperation<OPERATIONS[keyof OPERATIONS]>[];
        result: RESULT;
      }>,
      | IFrameworkError
      | typeof DownAdapterRefused
      | Extract<IFailureType<FAILURE>, { scope: 'contract' }>
      | Effect.Error<PROGRAM>,
      Effect.Services<PROGRAM> | GUARD_REQUIREMENTS
    >;
  }['bivarianceHack'];
  readonly result?: Schema.Codec<RESULT, unknown>;
}

type IConcreteEvaluation<C extends IContractRelease, COMMAND> = {
  bivarianceHack(
    input: Omit<Parameters<C['evaluate']>[0], 'command'> & {
      command: C extends { readonly external: IExternalContractDefinition }
        ? never
        : COMMAND;
    },
  ): ReturnType<C['evaluate']>;
}['bivarianceHack'];
export type IAggregateContractRelease<
  CONTRACT extends IContractRelease = IContractRelease,
> = Omit<CONTRACT, 'evaluate' | 'previous' | 'next'> &
  AggregateContractRelease & {
    readonly evaluate: IConcreteEvaluation<
      CONTRACT,
      IDecodedAggregateCommand | IAggregateSessionSubmissionInput
    >;
    readonly previous:
      | IAggregateContractRelease<NonNullable<CONTRACT['previous']>>
      | undefined;
    readonly next: IAggregateContractRelease | undefined;
    readonly __stagedCommand: IAggregateSessionSubmission<
      IInferAggregateSessionSubmissionInput<CONTRACT>,
      IInferContractResult<CONTRACT>
    >;
    readonly __stagingFailure: IRecognizedFailure<IInferFailure<CONTRACT>>;
  };
export type IServiceContractRelease<
  CONTRACT extends IContractRelease = IContractRelease,
> = Omit<CONTRACT, 'evaluate' | 'previous' | 'next'> &
  ServiceContractRelease & {
    readonly evaluate: IConcreteEvaluation<
      CONTRACT,
      IDecodedServiceCommand | IServiceSessionSubmissionInput
    >;
    readonly previous:
      | IServiceContractRelease<NonNullable<CONTRACT['previous']>>
      | undefined;
    readonly next: IServiceContractRelease | undefined;
  };

// --- Command pipeline types
export type ICommand<
  COMMAND_NAME extends string = string,
  CONTRACT_VERSION extends number = number,
  PAYLOAD = unknown,
> = Readonly<{
  id: IInferIdFromAbbreviation<'cmd'>;
  commandName: COMMAND_NAME;
  contractVersion: CONTRACT_VERSION;
  payload: PAYLOAD;
}>;
export type IServiceSessionSubmissionInput =
  typeof ServiceSessionSubmissionSchema.Type;
export type ISessionId = IInferIdFromAbbreviation<'sesn'>;
/** Encode payload to string immediately before persisting a command row. */
export type IEncodedCommand<
  COMMAND extends Pick<ICommand, 'commandName' | 'contractVersion' | 'payload'>,
> = {
  readonly [KEY in keyof COMMAND]: KEY extends 'payload'
    ? string
    : COMMAND[KEY];
};
export type IInferAggregateSessionSubmissionInput<
  CONTRACT extends IContractRelease,
  VERSION extends keyof NonNullable<CONTRACT['__payloads']> & number =
    CONTRACT['version'],
> = IAggregateSessionSubmissionInput<
  ICommand<
    CONTRACT['commandName'],
    VERSION,
    IInferCommandPayload<NonNullable<CONTRACT['__payloads']>[VERSION]>
  >
>;
export type IAggregateCommand<
  COMMAND extends ICommand = ICommand,
  AGGREGATE_NAME extends string = string,
> = COMMAND &
  Readonly<{
    aggregateId: string;
    aggregateName: AGGREGATE_NAME;
    aggregateVersion: number;
  }> &
  (
    | typeof ActorCommandSchema.Type
    | typeof AgentCommandSchema.Type
    | typeof SystemCommandSchema.Type
  );
export type IServiceCommand<
  COMMAND extends ICommand = ICommand,
  SERVICE_NAME extends string = string,
> = COMMAND &
  Readonly<{
    serviceName: SERVICE_NAME;
    serviceVersion: number;
  }> &
  (
    | typeof ActorCommandSchema.Type
    | typeof AgentCommandSchema.Type
    | typeof SystemCommandSchema.Type
  );
export type IDecodedAggregateCommand = IAggregateCommand;
export type IDecodedServiceCommand = IServiceCommand;
export type IAggregateSessionSubmissionInput<
  COMMAND extends Pick<
    ICommand,
    'commandName' | 'contractVersion' | 'payload'
  > = ICommand,
> = Omit<COMMAND, 'id'> &
  Readonly<{
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: number;
    kind: 'actor';
    actorName: string;
    actorVersion: number;
    claims: Readonly<Record<string, unknown>>;
    sessionName: string;
    sessionId: ISessionId;
  }>;
/** A successfully staged session command owns its original local result. */
export type IAggregateSessionSubmission<
  COMMAND extends Pick<
    ICommand,
    'commandName' | 'contractVersion' | 'payload'
  > = ICommand,
  RESULT = typeof Schema.Json.Type,
> = IAggregateSessionSubmissionInput<COMMAND> &
  Readonly<{
    sessionIndex: number;
    stagingOutcome: Omit<typeof StagingOutcomeSchema.Type, 'result'> & {
      readonly result: RESULT;
    };
  }>;
export type IChainedCommand<COMMAND extends ICommand = ICommand> = COMMAND &
  Readonly<{
    outcome: ICommandOutcome | null;
  }>;
export type IInferContractResult<CONTRACT extends IContractRelease> =
  NonNullable<CONTRACT['result']>['Type'];
export type IInferContractExecutionRequirements<
  CONTRACT extends IContractRelease,
> =
  | Effect.Services<ReturnType<CONTRACT['evaluate']>>
  | NonNullable<CONTRACT['__historicalExecutionRequirements']>;
export type IInferContractOperations<CONTRACT extends IContractRelease> =
  CONTRACT['operationsSchema']['Type'][number];
