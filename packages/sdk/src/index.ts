export {
  makeAgentCommandRef,
  type IAgentCommandRef,
} from '@zerospin/core/agent/makeAgentCommandRef';
export type { IAgentRelease } from '@zerospin/core/agent/AgentReleaseSchema';
export { makeLimitedModelVersion } from '@zerospin/core/models/make/makeLimitedModelVersion';
export { makeAggregateAgentRelease } from '@zerospin/core/agent/makeAggregateAgentRelease';
export { makeServiceAgentRelease } from '@zerospin/core/agent/makeServiceAgentRelease';
export type {
  IAggregateAgentRelease,
  IServiceAgentRelease,
} from '@zerospin/core/agent/types';
export { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
export { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
export { makeAggregateContractExtension } from '@zerospin/core/contracts/makeAggregateContractExtension';
export { makeServiceContractExtension } from '@zerospin/core/contracts/makeServiceContractExtension';
export { defineAggregateActor } from '@zerospin/core/aggregateActor/defineAggregateActor';
export { makeAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
export type { IAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
export type {
  IAggregateActorAuthorization,
  IAggregateQuerySelections,
  IAnyAggregateActorRelease,
} from '@zerospin/core/aggregateActor/types';
export { updateAggregateActorRelease } from '@zerospin/core/aggregateActor/updateAggregateActorRelease';
export { validateAggregateSessionCommand } from '@zerospin/core/aggregateSession/validateAggregateSessionCommand';
export { validateServiceSessionCommand } from '@zerospin/core/serviceSession/validateServiceSessionCommand';
export { DownAdapterRefused } from '@zerospin/core/contracts/DownAdapterRefused';
export { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
export { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
export {
  resolveFailure,
  resolveSessionFailure,
} from '@zerospin/core/contracts/failureCodec';

export type { ICommandOutcome } from '@zerospin/core/contracts/CommandOutcomeSchema';
export type {
  IExternalOutcome,
  IExternalRequestFailure,
} from '@zerospin/core/contracts/ExternalOutcomeSchema';
export type {
  IAggregateCommand,
  ICommand,
  IServiceCommand,
  IInferFailure,
} from '@zerospin/core/contracts/types';
export type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
export { makeGuard } from '@zerospin/core/guards/make/makeGuard';
export { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
export { defineModel } from '@zerospin/core/models/defineModel';
export { modelId } from '@zerospin/core/models/modelId';
export { modelRef } from '@zerospin/core/models/modelRef';
export { makeId } from '@zerospin/core/models/make/makeId';
export { makeIdSchema } from '@zerospin/core/models/make/makeIdSchema';
export {
  makeModelVersion,
  upgradeModelVersion,
} from '@zerospin/core/models/make/makeModelVersion';
export { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
export { prefixId } from '@zerospin/core/models/prefixId';
export type {
  IAggregateId,
  IInferCommandPayload,
  IInferPayloadInput,
  IInferResource,
} from '@zerospin/core/models/types';
export { defineService } from '@zerospin/core/service/defineService';
export { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
export { defineServiceActor } from '@zerospin/core/serviceActor/defineServiceActor';
export { makeServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';
export type { IServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';
export type {
  IAnyServiceActorRelease,
  IServiceActorAuthorization,
  IServiceQuerySelections,
} from '@zerospin/core/serviceActor/types';
export { updateServiceActorRelease } from '@zerospin/core/serviceActor/updateServiceActorRelease';
export { PublishableKey } from '@zerospin/core/services/PublishableKey';
export { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
export { ZerospinSuccess } from '@zerospin/core/success/ZerospinSuccess';
export { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
export { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
export { makeConfig } from '@zerospin/core/system/make/makeConfig';
export type {
  ISystemConfig,
  ISystemId,
  ISystemSpec,
} from '@zerospin/core/system/types';
export { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
export {
  ActorError,
  AggregateError,
  ContractError,
  ZerospinError,
  encodeError,
  ensureZerospinError,
  getBackendTrace,
  isZerospinError,
  makeZerospinError,
  matchZerospinErrorCode,
  prettyUnknownFailure,
  type IErrorJson,
  type IAnyError,
  type IBackendTrace,
  type IRecognizedFailure,
  type IResult,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
export { CuidFactory, primitives } from '@zerospin/shapes';
export { ZEROSPIN_SDK_VERSION } from './version.js';

export { resolveContractResult } from '@zerospin/core/contracts/resultCodec';
export type {
  IAggregateSessionSubmission,
  IInferContractOperations,
  IInferContractResult,
} from '@zerospin/core/contracts/types';

export type { IBrowserCommand } from '@zerospin/core/contracts/BrowserCommandSchema';

export { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
export { makeAggregateExternalContractRelease } from '@zerospin/core/contracts/make/makeAggregateExternalContractRelease';
export { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
export { makeServiceExternalContractRelease } from '@zerospin/core/contracts/make/makeServiceExternalContractRelease';
export { upgradeAggregateContractRelease } from '@zerospin/core/contracts/make/upgradeAggregateContractRelease';
export { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';

export { findFirst } from '@zerospin/core/contracts/findFirst';
export { findMany } from '@zerospin/core/contracts/findMany';
export { makeCommandOperation } from '@zerospin/core/contracts/makeCommandOperation';

export type { ISystemApi } from '@zerospin/core/systemApi/ISystemApi';
export type { ISeedProgram } from '@zerospin/core/systemApi/ISeedProgram';

export { defineAggregateExternalContract } from '@zerospin/core/contracts/defineAggregateExternalContract';
export { defineServiceExternalContract } from '@zerospin/core/contracts/defineServiceExternalContract';
export type { IAggregateDefinition } from '@zerospin/core/aggregate/defineAggregate';
export type { IServiceDefinition } from '@zerospin/core/service/defineService';
export type { IAggregateExternalContractDefinition } from '@zerospin/core/contracts/defineAggregateExternalContract';
export type { IServiceExternalContractDefinition } from '@zerospin/core/contracts/defineServiceExternalContract';
