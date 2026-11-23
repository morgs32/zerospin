import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { rpcMethod } from '../../makeRpcApi/makeRpcApi.js';
import { callActorRelease } from '../../ownerOperations/callActorRelease.js';
import { ServiceAccessApi } from '../../ServiceAccessApi/ServiceAccessApi.js';
import { ServiceAccessApiFailure } from '../../ServiceAccessApi/ServiceAccessApiFailure/ServiceAccessApiFailure.js';
import { Initialized } from '../Initialized.js';

import { admitService } from './admitService/admitService.js';

/** Validate input before admission; construct the capability after optional telemetry delivery. */
export const admit = rpcMethod({
  name: 'ServiceApi.admit',
  schema: Schema.Union([
    Schema.Struct({
      claims: Schema.Unknown,
      actorName: Schema.String,
      actorVersion: VersionSchema,
    }),
    Schema.Struct({
      credentials: Schema.Unknown,
      actorName: Schema.String,
      actorVersion: VersionSchema,
    }),
  ]),
  parseError: {
    code: 'service-identity-arguments-invalid',
    prefix: 'Invalid service identity arguments',
  },
})(
  function* (request) {
    const { actorName, actorVersion } = request;
    const { systemName, serviceName, serviceVersion } = yield* Initialized;
    const props = {
      serviceName,
      serviceVersion,
      request:
        'claims' in request
          ? { claims: request.claims }
          : { credentials: request.credentials },
      actorName,
      actorVersion,
    };
    const admitted = yield* callActorRelease({
      release: { serviceName, serviceVersion },
      local: admitService(props),
      remote: (worker, systemId) =>
        worker.authenticateServiceActor(systemId, props),
    });
    return {
      systemName,
      serviceName,
      serviceVersion,
      actorName,
      actorVersion,
      admitted,
    };
  },
  {
    onSuccess: state => new ServiceAccessApi(state),
    onFailure: failure => new ServiceAccessApiFailure(failure),
  },
);
