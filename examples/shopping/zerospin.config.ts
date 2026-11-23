import * as sdk from '@zerospin/sdk';

import { system } from './src/zerospin/system';

export const ownerReleaseSources = {
  aggregates: {
    user: {
      1: {
        module: './src/zerospin/aggregates/user/userAggregateReleaseV1.ts',
        export: 'userAggregateReleaseV1',
      },
      2: {
        module: './src/zerospin/aggregates/user/userAggregateReleaseV2.ts',
        export: 'userAggregateReleaseV2',
      },
      3: {
        module: './src/zerospin/aggregates/user/userAggregateReleaseV3.ts',
        export: 'userAggregateReleaseV3',
      },
    },
  },
  services: {
    marketplace: {
      1: {
        module:
          './src/zerospin/services/marketplace/marketplaceServiceReleaseV1.ts',
        export: 'marketplaceServiceReleaseV1',
      },
    },
    promotion: {
      1: {
        module:
          './src/zerospin/services/promotion/promotionServiceReleaseV1.ts',
        export: 'promotionServiceReleaseV1',
      },
    },
  },
};

export default sdk.makeConfig({
  system,
  systemId: 'sys_shopping_20260907_pinned_replicas',
  ...(process.env['ZEROSPIN_TELEMETRY'] === '1'
    ? {
        telemetry: {
          otlp: {
            tracesEndpoint: 'http://127.0.0.1:4318/v1/traces',
            logsEndpoint: 'http://127.0.0.1:4318/v1/logs',
            samplingRate: 1,
          },
        },
      }
    : {}),
});
