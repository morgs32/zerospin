export {
  makeAgentCommandRef,
  type IAgentCommandRef,
} from '@zerospin/core/agent/makeAgentCommandRef';
export type { IAgentRelease } from '@zerospin/core/agent/AgentReleaseSchema';
export { makeConnectedAggregateSession } from './makeConnectedAggregateSession.ts';
export { makeConnectedServiceSession } from './makeConnectedServiceSession.ts';
export { makeStandaloneAggregateSession } from './makeStandaloneAggregateSession.ts';
export { makeMockAggregateSession } from './makeMockAggregateSession.ts';
export { makeMockServiceSession } from './makeMockServiceSession.ts';
export type {
  IBrowserSession,
  IBrowserSessionInitializeOptions,
  IStandaloneSessionInitialization,
} from './browserSession/types.ts';
export type { IAggregateAgentSession } from '@zerospin/core/agent/types';

export { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
export { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
export type {
  ISessionStatus,
  ISessionLifecycleState,
  ISessionFailureReport,
  ISessionFailureReporter,
} from '@zerospin/core/sessionFailure/types';

export { makeAggregateAgentSession } from './makeAggregateAgentSession.ts';
export { makeServiceAgentSession } from './makeServiceAgentSession.ts';
export type { IServiceAgentSession } from '@zerospin/core/agent/types';
export { makeAggregateAgentRelease } from '@zerospin/core/agent/makeAggregateAgentRelease';
export { makeServiceAgentRelease } from '@zerospin/core/agent/makeServiceAgentRelease';
export type {
  IAggregateAgentRelease,
  IServiceAgentRelease,
} from '@zerospin/core/agent/types';
export type {
  IAgentSessionFactory,
  IAgentSessionFactories,
} from './agentNodeBrowser/agentSessionFactories.ts';
