import type { ISessionId } from '@zerospin/core/aggregateSession/types';
import type { IServiceNodeCommand } from '@zerospin/core/ServiceNode/types';
import { stageServiceSessionCommandTx } from '@zerospin/core/serviceSession/stageServiceSessionCommandTx';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { makeServiceReplicaValidator } from './makeServiceReplicaValidator.ts';
import type { openServiceReplica } from './openServiceReplica.ts';

/** This replica owns current-binding validation, staging transactions and background handoff. */
export const bindServiceReplicaCommands = Effect.fn(
  'bindServiceReplicaCommands',
)(function* <D extends IServiceSessionDefinition>(props: {
  session: IServiceSession<D, D['models'], unknown>;
  sessionId: ISessionId;
  replica: Effect.Success<ReturnType<typeof openServiceReplica<D, unknown>>>;
  current(): boolean;
  getEncodedClaims(): Readonly<Record<string, unknown>>;
  getOnCommandStaged?(): ((command: IServiceNodeCommand) => void) | undefined;
  stagedCommandOutbox: {
    observe(): void;
    pendingCount(): number;
  };
}) {
  const {
    session,
    sessionId,
    current,
    getEncodedClaims,
    getOnCommandStaged,
    stagedCommandOutbox,
    replica,
  } = props;
  const { db, definition } = replica;
  const { assertCurrent, validate } = makeServiceReplicaValidator({
    session,
    sessionId,
    db,
    definition,
    current,
    getEncodedClaims,
  });
  const unbind = session.bindCommandExecution({
    validate,
    stage: ({ contract, payload }) =>
      Effect.gen(function* () {
        yield* assertCurrent();
        if (definition.contracts[contract.commandName] !== contract) {
          return yield* makeZerospinError(
            'service-session-contract-unavailable',
          );
        }
        const onCommandStaged = getOnCommandStaged?.();
        const staged = yield* stageServiceSessionCommandTx({
          onCommandStaged,
          db,
          sessionId,
          definition,
          contract,
          payload,
          claims: Schema.decodeUnknownSync(definition.claimsSchema)(
            getEncodedClaims(),
          ),
        });

        try {
          stagedCommandOutbox.observe();
          const state = session.store.getState().nodeState;
          if (state != null) {
            session.store.setState({
              nodeState: {
                ...state,
                uncertainHandoffs: stagedCommandOutbox.pendingCount(),
              },
            });
          }
        } catch (cause) {
          // Publication cannot turn an already committed command into a staging failure.
          console.error(
            'Service session command handoff state observer threw',
            cause,
          );
        }
        return staged;
      }),
  });
  yield* Effect.addFinalizer(() => Effect.sync(unbind));
});
