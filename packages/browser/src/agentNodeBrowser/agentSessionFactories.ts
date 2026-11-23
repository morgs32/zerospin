import type {
  IAggregateAgentSession,
  IAggregateAgentSessionInputs,
  IServiceAgentSession,
  IServiceAgentSessionInputs,
} from '@zerospin/core/agent/types';

/** Browser host composition closes its exact definition and application layer. */
export type IAgentSessionFactory =
  | Readonly<{
      kind: 'aggregate';
      makeSession(inputs: IAggregateAgentSessionInputs): IAggregateAgentSession;
    }>
  | Readonly<{
      kind: 'service';
      makeSession(inputs: IServiceAgentSessionInputs): IServiceAgentSession;
    }>;

export type IAgentSessionFactories = Readonly<
  Record<string, IAgentSessionFactory>
>;
