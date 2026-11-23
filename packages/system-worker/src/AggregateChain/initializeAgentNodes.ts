import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';

import { getAggregateAgentNodeRepo } from '../AggregateAgentNodeRepo/getAggregateAgentNodeRepo.js';
import type { IRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';

/** Child initialization runs from recovery after the AggregateChain constructor gate opens. */
export const initializeAgentNodes = Effect.fn(
  'AggregateChain.initializeAgentNodes',
)(function* (props: {
  key: { systemId: string; aggregateId: string; aggregateName: string };
  recoveryRegistry: Pick<IRecoveryRegistry, 'release'>;
}) {
  const { key, recoveryRegistry } = props;

  const systemRepo = env.SYSTEM_REPO.getByName(key.systemId);
  const selections = yield* Effect.promise(() =>
    systemRepo.getSelectedAggregateAgentInstallations(key.aggregateName),
  );
  for (const { agentName, ...binding } of selections) {
    const node = yield* getAggregateAgentNodeRepo({
      key: { ...key, agentName },
    });
    yield* Effect.promise(() => node.initialize(false, binding)).pipe(
      Effect.flatMap(readRpcEnvelope),
    );
  }
  yield* recoveryRegistry.release('initializeAgentNodes');
});
