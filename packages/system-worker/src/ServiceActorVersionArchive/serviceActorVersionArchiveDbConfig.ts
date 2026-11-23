import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';

import { serviceActorVersionChainDbConfig } from '../ServiceActorVersionChain/serviceActorVersionChainDbConfig.js';

/** Physical history contains only the immutable public/private publication pair. */
export const serviceActorVersionArchiveDbConfig = makeDbConfig({
  tables: {
    exposedCommands: serviceActorVersionChainDbConfig.tables.exposedCommands,
    commandResolutions:
      serviceActorVersionChainDbConfig.tables.commandResolutions,
  },
});
