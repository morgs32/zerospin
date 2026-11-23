import { AggregateAuthenticationRequestSchema } from '@zerospin/core/identity/AggregateAuthenticationRequestSchema';

import { AggregateAccessApi } from '../../AggregateAccessApi/AggregateAccessApi.js';
import { AggregateAccessApiFailure } from '../../AggregateAccessApi/AggregateAccessApiFailure/AggregateAccessApiFailure.js';
import { rpcMethod } from '../../makeRpcApi/makeRpcApi.js';
import { callActorRelease } from '../../ownerOperations/callActorRelease.js';
import { Initialized } from '../Initialized.js';

import { authenticateAggregate } from './authenticateAggregate/authenticateAggregate.js';

/** Authenticate the selected Actor for the requested Aggregate. */
export const authenticate = rpcMethod({
  name: 'AggregateApi.authenticate',
  schema: AggregateAuthenticationRequestSchema,
  parseError: {
    code: 'aggregate-identity-arguments-invalid',
    prefix: 'Invalid aggregate identity arguments',
  },
})(
  function* (request) {
    const {
      systemName,
      aggregateName,
      aggregateVersion,
      actorName,
      actorVersion,
    } = yield* Initialized;
    const props = {
      aggregateName,
      aggregateVersion,
      actorName,
      actorVersion,
      request,
    };
    const authenticatedActor = yield* callActorRelease({
      release: { aggregateName, aggregateVersion },
      local: authenticateAggregate(props),
      remote: (worker, systemId) =>
        worker.authenticateAggregateActor(systemId, props),
    });
    return {
      systemName,
      aggregateName,
      aggregateVersion,
      actorName,
      actorVersion,
      authenticatedActor,
    };
  },
  {
    onSuccess: state => new AggregateAccessApi(state),
    onFailure: failure => new AggregateAccessApiFailure(failure),
  },
);
