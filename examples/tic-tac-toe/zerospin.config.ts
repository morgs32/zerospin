import { makeConfig } from '@zerospin/core/system/make/makeConfig';

import { system } from './src/system';

export const ownerReleaseSources = {
  aggregates: {
    game: {
      1: {
        module: './src/gameAggregateReleaseV1.ts',
        export: 'aggregateRelease',
      },
      2: { module: './src/gameAggregateReleaseV2.ts', export: 'gameReleaseV2' },
      3: { module: './src/gameAggregateReleaseV3.ts', export: 'gameReleaseV3' },
    },
  },
};

export default makeConfig({
  system,
  systemId: 'sys_tictactoe',
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
