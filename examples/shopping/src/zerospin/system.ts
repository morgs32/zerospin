import * as sdk from '@zerospin/sdk';

import { purchasesAgentV1 } from './agents/purchasesAgentV1';
import { reservationsAgentV1 } from './agents/reservationsAgentV1';
import { userAggregateReleaseV1 } from './aggregates/user/userAggregateReleaseV1';
import { userAggregateReleaseV2 } from './aggregates/user/userAggregateReleaseV2';
import { userAggregateReleaseV3 } from './aggregates/user/userAggregateReleaseV3';
import { marketplaceServiceReleaseV1 } from './services/marketplace/marketplaceServiceReleaseV1';
import { promotionServiceReleaseV1 } from './services/promotion/promotionServiceReleaseV1';
import { latestUserRelease } from './userReleaseSelection';

const userReleasesByLatestVersion = {
  1: { 1: userAggregateReleaseV1 },
  2: { 1: userAggregateReleaseV1, 2: userAggregateReleaseV2 },
  3: {
    1: userAggregateReleaseV1,
    2: userAggregateReleaseV2,
    3: userAggregateReleaseV3,
  },
};

export const system = sdk.makeSystem({
  name: 'shopping',
  aggregateAgents: {
    user: { purchases: { releases: { 1: purchasesAgentV1 }, active: 1 } },
  },
  serviceAgents: {
    promotion: {
      reservations: { releases: { 1: reservationsAgentV1 }, active: 1 },
    },
  },
  aggregates: {
    user: {
      releases: userReleasesByLatestVersion[latestUserRelease],
    },
  },
  services: {
    marketplace: { releases: { 1: marketplaceServiceReleaseV1 } },
    promotion: {
      releases: { 1: promotionServiceReleaseV1 },
    },
  },
});
