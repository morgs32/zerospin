import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { AggregateActorVersionChains } from '../../repoServices/AggregateActorVersionChains.js';
import { readExecutingSystemSpec } from '../../workerConfiguration/workerConfiguration.js';
import { Initialized } from '../Initialized.js';

/** Decode the request before executing the authorized session operation. */
export const getBrowserCommands = rpcMethod({
  name: 'AggregateSessionApi.getBrowserCommands',
  schema: rpcRequestSchema(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            aggregateVersion: VersionSchema,
            afterAggregateIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isGreaterThanOrEqualTo(0),
            ),
          }),
        ]),
      ),
    ),
  ),
  parseError: {
    code: 'aggregate-session-api-arguments-invalid',
    prefix: 'AggregateSessionApi.getBrowserCommands received invalid arguments',
  },
  linked: true,
})(
  function* (args) {
    const [{ aggregateVersion, afterAggregateIndex }] = args;
    const authResults = yield* Initialized;
    if (aggregateVersion !== authResults.aggregateVersion) {
      return yield* makeZerospinError({
        code: 'aggregate-version-unavailable',
        message:
          'The requested version is not available through this capability',
      });
    }
    const system = readExecutingSystemSpec();
    if (
      !Object.hasOwn(
        system.aggregates[authResults.aggregateName]?.releases ?? {},
        authResults.aggregateVersion,
      )
    ) {
      return yield* makeZerospinError('aggregate-version-unavailable');
    }
    const chains = yield* AggregateActorVersionChains;
    const chain = yield* chains.getRepo({
      key: {
        systemId: authResults.systemId,
        aggregateVersion,
        aggregateId: authResults.aggregateId,
        aggregateName: authResults.aggregateName,
        actorName: authResults.actorName,
        actorVersion: authResults.actorVersion,
        actorPath: authResults.actorPath,
      },
    });
    return yield* Effect.promise(() =>
      chain.getBrowserCommands({
        afterAggregateIndex,
        definition: {
          name: authResults.sessionName,
          actorName: authResults.actorName,
          actorVersion: authResults.actorVersion,
          claims: authResults.claims,
          modelNames: Object.keys(authResults.aggregateSessionLock.models),
        },
      }),
    ).pipe(
      Effect.flatMap(envelope => readRpcEnvelope(envelope)),
      Effect.map(page => ({ tip: page.tip, commands: page.commands })),
    );
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
