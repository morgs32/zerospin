import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';

import { aggregateSessionChainDbConfig } from '../aggregateSessionChain/aggregateSessionChainDbConfig.js';

/** Archive only immutable public/private publications, never live connections. */
export const aggregateActorVersionArchiveDbConfig = makeDbConfig({
  tables: {
    exposedCommands: aggregateSessionChainDbConfig.tables.exposedCommands,
    commandResolutions: aggregateSessionChainDbConfig.tables.commandResolutions,
  },
});
