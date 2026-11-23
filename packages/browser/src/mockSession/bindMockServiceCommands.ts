import type { ISessionId } from '@zerospin/core/aggregateSession/types';
import { stageServiceSessionCommandTx } from '@zerospin/core/serviceSession/stageServiceSessionCommandTx';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { makeServiceReplicaValidator } from '../sessionReplica/makeServiceReplicaValidator.ts';
import type { openServiceReplica } from '../sessionReplica/openServiceReplica.ts';

/** Rehearse local validation while refusing transport-dependent work before staging. */
export const bindMockServiceCommands = Effect.fn('bindMockServiceCommands')(
  function* <D extends IServiceSessionDefinition>(props: {
    session: IServiceSession<D, D['models'], unknown>;
    sessionId: ISessionId;
    replica: Effect.Success<ReturnType<typeof openServiceReplica<D, unknown>>>;
    signal: AbortSignal;
    getEncodedClaims(): Readonly<Record<string, unknown>>;
  }) {
    const { session, sessionId, replica, signal, getEncodedClaims } = props;
    const { db, definition } = replica;
    const { validate, assertCurrent } = makeServiceReplicaValidator({
      session,
      sessionId,
      db,
      definition,
      current: () => !signal.aborted,
      getEncodedClaims,
    });
    const unbind = session.bindCommandExecution({
      stage: ({ contract, payload }) =>
        Effect.gen(function* () {
          yield* assertCurrent();
          if (definition.contracts[contract.commandName] !== contract) {
            return yield* makeZerospinError(
              'service-session-contract-unavailable',
            );
          }
          return yield* stageServiceSessionCommandTx({
            db,
            definition,
            sessionId,
            contract,
            payload,
            claims: Schema.decodeUnknownSync(definition.claimsSchema)(
              getEncodedClaims(),
            ),
          });
        }),
      validate,
    });
    yield* Effect.addFinalizer(() => Effect.sync(unbind));
  },
);
