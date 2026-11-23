import * as Schema from 'effect/Schema';

/** Concrete durable Repo kinds accepted by the system inspection boundary. */
export const RepoTypeSchema = Schema.Literals([
  'SystemRepo',
  'AggregateChain',
  'AggregateVersionRepo',
  'AggregateVersionChain',
  'AggregateActorVersionArchive',
  'AggregateVersionArchive',
  'AggregateActorVersionRepo',
  'AggregateAgentVersionRepo',
  'AggregateAgentNodeRepo',
  'ServiceChain',
  'ServiceVersionRepo',
  'ServiceVersionChain',
  'ServiceActorVersionArchive',
  'ServiceVersionArchive',
  'ServiceActorVersionRepo',
  'ServiceAgentVersionRepo',
  'ServiceAgentNodeRepo',
  'AggregateActorVersionChain',
  'AggregateAgentVersionChain',
  'ServiceActorVersionChain',
  'ServiceAgentVersionChain',
]);
