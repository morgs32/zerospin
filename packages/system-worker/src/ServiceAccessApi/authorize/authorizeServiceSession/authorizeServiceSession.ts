import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import * as Effect from 'effect/Effect';

import { ServiceVersionRepos } from '../../../repoServices/ServiceVersionRepos.js';
import type { IServiceVersionRepo } from '../../../ServiceVersionRepo/types.js';

/** Run native lock validation and resource authorization on the exact Service release. */
export const authorizeServiceSession = Effect.fn(
  'ServiceAccessApi.authorizeServiceSession',
  { root: true },
)(function* (props: {
  systemId: string;
  claims: Readonly<Record<string, unknown>>;
  serviceName: string;
  serviceVersion: number;
  sessionName: string;
  serviceSessionLock: IServiceSessionLock;
}) {
  const {
    systemId,
    claims,
    serviceName,
    sessionName,
    serviceSessionLock,
    serviceVersion,
  } = props;

  const serviceRepo = yield* (yield* ServiceVersionRepos).getRepo({
    key: { systemId, serviceName, serviceVersion },
  });
  const envelope = yield* Effect.promise<
    Awaited<ReturnType<IServiceVersionRepo['authorizeServiceSession']>>
  >(() =>
    serviceRepo.authorizeServiceSession({
      serviceSessionLock,
      sessionName,
      claims,
    }),
  );
  return yield* readRpcEnvelope(envelope);
});
