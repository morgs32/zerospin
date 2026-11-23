import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { readDevelopmentHistory } from '../../developmentHistory.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { ServiceChains } from '../../repoServices/ServiceChains.js';
import { Initialized } from '../Initialized.js';

/** Register or verify a producer only through its authorized session capability. */
export const registerNode = rpcMethod({
  name: 'ServiceSessionApi.registerNode',
  schema: rpcRequestSchema(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            nodeId: Schema.NonEmptyString,
            create: Schema.Boolean,
            developmentHistoryId: Schema.optionalKey(Schema.String),
          }),
        ]),
      ),
    ),
  ),
  parseError: {
    code: 'service-session-api-arguments-invalid',
    prefix: 'ServiceSessionApi.registerNode received invalid arguments',
  },
  linked: true,
})(
  function* (args) {
    const [{ nodeId, create, developmentHistoryId }] = args;
    if (env.ZEROSPIN_LOCAL_DEVELOPMENT !== 'true') return 'not-local' as const;
    const session = yield* Initialized;
    const history = readDevelopmentHistory(session.systemId);
    if (history?.id !== developmentHistoryId) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'node-development-history-mismatch',
          message:
            'The local System history changed. Reconnect to verify its current history.',
        }),
      );
    }
    const chains = yield* ServiceChains;
    const chain = yield* chains.getRepo({
      key: { systemId: session.systemId, serviceName: session.serviceName },
    });
    const registered = yield* Effect.promise(() =>
      chain.registerNode({
        nodeId,
        serviceVersion: session.serviceVersion,
        sessionName: session.sessionName,
        actorName: session.serviceSessionLock.actorName,
        actorVersion: session.serviceSessionLock.actorVersion,
        claims: session.claims,
        create,
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    return registered ? ('registered' as const) : ('missing' as const);
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
