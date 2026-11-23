import type { ISystemId } from '@zerospin/core/system/types';
import type { IServiceQuery } from '@zerospin/core/systemApi/ServiceQuerySchema';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { getSystemSpec } from '../getSystemSpec/getSystemSpec.js';
import { ServiceVersionRepos } from '../repoServices/ServiceVersionRepos.js';

/** Resolve the exact service release in the authenticated system before dispatch. */
export const executeServiceQuery = makeFn('SystemWorker.executeServiceQuery')(
  function* (props: IServiceQuery & { systemId: ISystemId }) {
    const {
      systemId,
      serviceName,
      serviceVersion,
      modelName,
      mode,
      config,
      models,
    } = props;
    const system = yield* getSystemSpec(systemId, {
      serviceName,
      serviceVersion,
    });
    const registry = yield* getByKeyOrThrow({
      record: system.services,
      key: serviceName,
      recordKind: 'services',
    });
    yield* getByKeyOrThrow({
      record: registry.releases,
      key: serviceVersion,
      recordKind: 'listed versions',
    });
    const repos = yield* ServiceVersionRepos;
    const repo = yield* repos.getRepo({
      key: { systemId, serviceName, serviceVersion },
    });
    return yield* Effect.promise(() =>
      repo.executeServiceQuery({ modelName, mode, config, models }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
  },
);
