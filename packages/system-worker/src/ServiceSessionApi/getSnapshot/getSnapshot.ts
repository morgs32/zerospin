import { ServiceSessionSnapshotSchema } from '@zerospin/core/serviceSession/ServiceSessionWireSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { readDevelopmentHistory } from '../../developmentHistory.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { ServiceActorVersionRepos } from '../../repoServices/ServiceActorVersionRepos.js';
import { Initialized } from '../Initialized.js';
/** Acquire the admitted selected owner and decode its single coherent snapshot at the wire boundary. */
export const getSnapshot = rpcMethod({
  name: 'ServiceSessionApi.getSnapshot',
  schema: rpcRequestSchema(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([
          Schema.Struct({ nodeId: Schema.NullOr(Schema.NonEmptyString) }),
        ]),
      ),
    ),
  ),
  parseError: {
    code: 'service-session-api-arguments-invalid',
    prefix: 'ServiceSessionApi.getSnapshot received invalid arguments',
  },
  linked: true,
})(
  function* (args) {
    const [{ nodeId }] = args;
    const session = yield* Initialized;
    const view = yield* (yield* ServiceActorVersionRepos).getRepo({
      key: {
        systemId: session.systemId,
        serviceName: session.serviceName,
        serviceVersion: session.serviceVersion,
        actorPath: session.actorPath,
        actorName: session.serviceSessionLock.actorName,
        actorVersion: session.serviceSessionLock.actorVersion,
      },
    });
    const snapshot = yield* Effect.promise(() =>
      view.getSnapshot({
        nodeId,
        sessionName: session.sessionName,
        claims: session.claims,
        serviceSessionLock: session.serviceSessionLock,
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    const developmentHistory = readDevelopmentHistory(session.systemId);
    return yield* Schema.decodeUnknownEffect(
      Schema.toType(ServiceSessionSnapshotSchema),
    )({
      ...snapshot,
      environment: env.ZEROSPIN_ENVIRONMENT,
      ...(developmentHistory === undefined ? {} : { developmentHistory }),
    }).pipe(
      mapParseError({
        code: 'service-session-snapshot-rpc-invalid',
        prefix: 'Invalid selected service snapshot',
      }),
    );
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
