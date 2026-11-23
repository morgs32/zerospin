import type { IServiceAgentRelease } from '@zerospin/core/agent/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readSelectedResources } from '@zerospin/core/models/reads/readSelectedResources';

/** Read the Agent's declared selection from the replayed Service models. */
export function readServiceAgentResources(props: {
  db: IDb;
  agent: IServiceAgentRelease;
}) {
  const { db, agent } = props;

  return readSelectedResources({
    db,
    models: agent.db.models,
    exposedModels: agent.db.models,
    selections: agent.selections,
    requireReferenceClosure: false,
  });
}
