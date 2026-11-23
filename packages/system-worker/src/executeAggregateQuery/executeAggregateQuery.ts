import type { ISystemId } from '@zerospin/core/system/types';
import type { IAggregateQuery } from '@zerospin/core/systemApi/AggregateQuerySchema';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { getSystemSpec } from '../getSystemSpec/getSystemSpec.js';
import { AggregateVersionRepos } from '../repoServices/AggregateVersionRepos.js';

/** Resolve the exact aggregate release in the authenticated system before dispatch. */
export const executeAggregateQuery = makeFn(
  'SystemWorker.executeAggregateQuery',
)(function* (props: IAggregateQuery & { systemId: ISystemId }) {
  const {
    systemId,
    aggregateName,
    aggregateVersion,
    aggregateId,
    modelName,
    mode,
    config,
    models,
  } = props;
  const system = yield* getSystemSpec();
  const registry = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: aggregateName,
    recordKind: 'aggregates',
  });
  yield* getByKeyOrThrow({
    record: registry.releases,
    key: aggregateVersion,
    recordKind: 'listed versions',
  });
  const repos = yield* AggregateVersionRepos;
  const repo = yield* repos.getRepo({
    key: { systemId, aggregateName, aggregateVersion, aggregateId },
  });
  return yield* Effect.promise(() =>
    repo.executeAggregateQuery({ modelName, mode, config, models }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
});
