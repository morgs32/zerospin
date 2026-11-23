import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { readDevelopmentHistory } from '../../developmentHistory.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { AggregateActorVersionRepos } from '../../repoServices/AggregateActorVersionRepos.js';
import { Initialized } from '../Initialized.js';

/** Decode the request before executing the authorized session operation. */
export const getSnapshot = rpcMethod({
  name: 'AggregateSessionApi.getSnapshot',
  schema: rpcRequestSchema(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            nodeId: Schema.NullOr(Schema.String),
          }),
        ]),
      ),
    ),
  ),
  parseError: {
    code: 'aggregate-session-api-arguments-invalid',
    prefix: 'AggregateSessionApi.getSnapshot received invalid arguments',
  },
  linked: true,
})(
  function* (args) {
    const [{ nodeId }] = args;
    const authResults = yield* Initialized;

    const aggregateVersion = authResults.aggregateVersion;
    const actorRepos = yield* AggregateActorVersionRepos;
    const projectionRepo = yield* actorRepos.getRepo({
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
      projectionRepo.getSnapshot({
        aggregateId: authResults.aggregateId,
        aggregateName: authResults.aggregateName,
        actorName: authResults.actorName,
        actorVersion: authResults.actorVersion,
        claims: authResults.claims,
        sessionName: authResults.sessionName,
        nodeId,
      }),
    ).pipe(
      Effect.flatMap(envelope => readRpcEnvelope(envelope)),
      Effect.flatMap(snapshot =>
        Effect.gen(function* () {
          const developmentHistory = readDevelopmentHistory(
            authResults.systemId,
          );
          return {
            ...(developmentHistory === undefined ? {} : { developmentHistory }),
            environment: env.ZEROSPIN_ENVIRONMENT,
            aggregateId: snapshot.aggregateId,
            aggregateName: snapshot.aggregateName,
            aggregateVersion: snapshot.aggregateVersion,
            actorName: snapshot.actorName,
            actorVersion: snapshot.actorVersion,
            claims: snapshot.claims,
            sessionName: snapshot.sessionName,
            aggregateIndex: snapshot.aggregateIndex,

            dispositionChainHash: snapshot.dispositionChainHash,
            resolvedThrough: snapshot.resolvedThrough,
            resources: snapshot.resources.filter(resource =>
              Object.hasOwn(
                authResults.aggregateSessionLock.models,
                resource.modelName,
              ),
            ),
          };
        }),
      ),
    );
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
