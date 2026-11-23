import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import { mapValues } from 'es-toolkit';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import type { IRecoveryRegistry } from '../../makeRecoveryRegistry/makeRecoveryRegistry.js';
import { ServiceChains } from '../../repoServices/ServiceChains.js';
import { ServiceVersionRepos } from '../../repoServices/ServiceVersionRepos.js';
import type { systemRepoDbConfig } from '../systemRepoDbConfig.js';

import { initializeAgentNodes } from './initializeAgentNodes.js';

/** Recover owners and registered Agent Node Repos in declaration order and release the lease only after completion. */
export const initializeOwners = makeFn('SystemRepo.initializeOwners')(
  function* (props: {
    systemId: string;
    db: IDb<typeof systemRepoDbConfig>;
    recoveryRegistry: Pick<IRecoveryRegistry, 'release'>;
    retryFailed?: boolean;
  }) {
    const { systemId, recoveryRegistry } = props;
    const system = yield* getSystemSpec();
    const serviceChains = yield* ServiceChains;
    const serviceVersionRepos = yield* ServiceVersionRepos;
    yield* Effect.all(
      mapValues(system.services, (_versions, serviceName) =>
        Effect.gen(function* () {
          const chain = yield* serviceChains.getRepo({
            key: { systemId, serviceName },
          });
          yield* Effect.promise(() => chain.awaitStartup()).pipe(
            Effect.flatMap(readRpcEnvelope),
          );
        }),
      ),
      { concurrency: 1 },
    );
    yield* Effect.all(
      mapValues(system.services, (versions, serviceName) =>
        Effect.all(
          mapValues(versions.releases, serviceRelease =>
            Effect.gen(function* () {
              const repo = yield* serviceVersionRepos.getRepo({
                key: {
                  systemId,
                  serviceName,
                  serviceVersion: serviceRelease.version,
                },
              });
              yield* Effect.promise(() => repo.awaitStartup()).pipe(
                Effect.flatMap(readRpcEnvelope),
              );
            }),
          ),
          { concurrency: 1 },
        ),
      ),
      { concurrency: 1 },
    );
    const failures = yield* initializeAgentNodes(props);
    yield* recoveryRegistry.release('initializeOwners');
    return failures;
  },
);

/** Explicit RPC initialization acquires the same recovery hold as scheduled recovery. */
export const initialize = makeFn('SystemRepo.initialize')(function* (props: {
  systemId: string;
  db: IDb<typeof systemRepoDbConfig>;
  recoveryRegistry: Pick<IRecoveryRegistry, 'hold' | 'release'>;
}) {
  const { recoveryRegistry } = props;
  yield* recoveryRegistry.hold('initializeOwners');
  return yield* initializeOwners({ ...props, retryFailed: true });
});
