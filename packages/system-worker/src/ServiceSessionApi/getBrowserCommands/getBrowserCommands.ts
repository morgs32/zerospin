import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { filterServiceBrowserCommand } from '@zerospin/core/serviceSession/filterServiceBrowserCommand';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { ServiceActorVersionChains } from '../../repoServices/ServiceActorVersionChains.js';
import { readExecutingSystemSpec } from '../../workerConfiguration/workerConfiguration.js';
import { Initialized } from '../Initialized.js';

/** Decode the request before executing the authorized session operation. */
export const getBrowserCommands = rpcMethod({
  name: 'ServiceSessionApi.getBrowserCommands',
  schema: rpcRequestSchema(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            serviceVersion: VersionSchema,
            afterServiceIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isBetween({
                minimum: 0,
                maximum: Number.MAX_SAFE_INTEGER,
              }),
            ),
          }),
        ]),
      ),
    ),
  ),
  parseError: {
    code: 'service-session-api-arguments-invalid',
    prefix: 'ServiceSessionApi.getBrowserCommands received invalid arguments',
  },
  linked: true,
})(
  function* (args) {
    const [{ serviceVersion, afterServiceIndex }] = args;
    const authResults = yield* Initialized;
    const system = readExecutingSystemSpec();
    if (
      !Object.hasOwn(
        system.services[authResults.serviceName]?.releases ?? {},
        authResults.serviceVersion,
      ) ||
      serviceVersion !== authResults.serviceVersion
    ) {
      return yield* makeZerospinError({
        code: 'service-version-unavailable',
        message:
          'The requested version is not available through this capability',
      });
    }
    const chains = yield* ServiceActorVersionChains;
    const chain = yield* chains.getRepo({
      key: {
        systemId: authResults.systemId,
        serviceName: authResults.serviceName,
        serviceVersion,
        actorPath: authResults.actorPath,
        actorName: authResults.serviceSessionLock.actorName,
        actorVersion: authResults.serviceSessionLock.actorVersion,
      },
    });
    return yield* Effect.promise(() =>
      chain.getBrowserCommands({
        afterServiceIndex,
        models: authResults.serviceSessionLock.models,
      }),
    ).pipe(
      Effect.flatMap(envelope => readRpcEnvelope(envelope)),
      Effect.map(value => ({
        serviceIndex: value.serviceIndex,
        dispositionChainHash: value.dispositionChainHash,
        commands: value.commands.map(output =>
          filterServiceBrowserCommand(
            output,
            authResults.serviceSessionLock.models,
          ),
        ),
      })),
    );
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
