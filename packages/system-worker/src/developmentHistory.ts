import { DevelopmentHistorySchema } from '@zerospin/core/Node/DevelopmentHistorySchema';
import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { getSystemSpec } from './getSystemSpec/getSystemSpec.js';
import { SystemRepos } from './repoServices/SystemRepos.js';

const decodeHistory = Schema.decodeUnknownSync(
  Schema.fromJsonString(DevelopmentHistorySchema),
);

/** Expose only the local CLI's history for the authenticated System. */
export function readDevelopmentHistory(systemId: string) {
  if (
    env.ZEROSPIN_LOCAL_DEVELOPMENT !== 'true' ||
    env.ZEROSPIN_ENVIRONMENT !== 'dev' ||
    env.ZEROSPIN_DEV_HISTORY === undefined
  ) {
    return undefined;
  }
  const history = decodeHistory(env.ZEROSPIN_DEV_HISTORY);
  if (history.systemId !== systemId || systemId !== env.ZEROSPIN_SYSTEM_ID) {
    throw makeZerospinError('node-development-history-mismatch');
  }
  return history;
}

/** Session admission may race the CLI that accepts a freshly cleaned System's spec. */
export const requireDevelopmentSystemReady = Effect.fn(
  'requireDevelopmentSystemReady',
)(function* () {
  const hash = env.ZEROSPIN_DEV_STARTUP_SPEC_HASH;
  if (!hash || !readDevelopmentHistory(env.ZEROSPIN_SYSTEM_ID)) return;
  const repo = yield* (yield* SystemRepos).getRepo({
    key: { systemId: env.ZEROSPIN_SYSTEM_ID },
  });
  const executing = yield* getSystemSpec();
  if (yield* Effect.promise(() => repo.hasAcceptedSystemSpec(executing.hash))) {
    return;
  }
  if (executing.hash !== hash) {
    return yield* makeZerospinError({
      code: 'zerospin-dev-system-spec-changed',
      message:
        'SystemSpec changed. Finish your edits, then restart zerospin dev.',
    });
  }
  return yield* makeZerospinError({
    code: 'node-development-system-starting',
    status: 503,
    message: 'The local development System is starting.',
  });
});
