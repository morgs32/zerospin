import type { IAggregateSocketClientMessage } from '@zerospin/core/aggregateSession/AggregateSocketProtocolSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { emptyTelemetryBatch, encodeRpcExit, makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';
import type { Connection } from 'partyserver';

import type { IAggregateProjectionKey } from '../../aggregateProjection/resolveAggregateProjectionView.js';
import type { IAggregateConnectionCapabilities } from '../connectionCapabilities.js';
import type {
  IAggregateActorSessionConnectionState,
  IAggregateSessionConnectionState,
} from '../connectionState.js';
import { disposeConnection } from '../disposeConnection.js';

import { admitAggregateSessionCommand } from './admitAggregateSessionCommand.js';

/** Claim synchronously, acknowledge committed admission, and always release the claim. */
export const admitAggregateSocketCommand = makeFn(
  'AggregateSessionChain.admitAggregateSocketCommand',
)(function* (props: {
  connection: Connection<IAggregateSessionConnectionState>;
  admission: Extract<IAggregateActorSessionConnectionState, { phase: 'live' }>;
  capabilities: IAggregateConnectionCapabilities;
  command: Extract<
    IAggregateSocketClientMessage,
    { type: 'pushAggregateCommand' }
  >['command'];
  db: IDb;
  key: Extract<IAggregateProjectionKey, { actorName: string }>;
}) {
  const { connection, admission, command, capabilities, db, key } = props;
  yield* Effect.uninterruptibleMask(restore =>
    Effect.gen(function* () {
      const claimed = yield* Effect.sync(() => {
        const current = connection.state;
        if (
          current?.phase !== 'live' ||
          !isEqual(current, admission) ||
          current.admissionCommandId !== null ||
          connection.readyState !== 1
        ) {
          return false;
        }
        connection.setState({ ...current, admissionCommandId: command.id });
        return true;
      });
      if (!claimed) {
        disposeConnection({
          db,
          key,
          connection,
          code: 4003,
          reason: 'aggregate-admission-already-pending',
        });
        return;
      }
      yield* Effect.gen(function* () {
        const exit = yield* Effect.exit(
          restore(
            admitAggregateSessionCommand({
              command,
              admission,
              capabilities,
              key,
            }),
          ),
        );
        const settled = yield* encodeRpcExit(exit, emptyTelemetryBatch());
        yield* Effect.sync(() => {
          if (connection.readyState !== 1) return;
          connection.send(
            JSON.stringify(
              settled.result._tag === 'Success'
                ? {
                    type: 'aggregateCommandAdmission',
                    id: command.id,
                    pushIndex: settled.result.success.pushIndex,
                  }
                : {
                    type: 'aggregateCommandAdmissionFailed',
                    id: command.id,
                    failure: settled.result.failure,
                  },
            ),
          );
        });
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            const current = connection.state;
            if (
              current?.phase === 'live' &&
              current.admissionCommandId === command.id
            ) {
              connection.setState({ ...current, admissionCommandId: null });
            }
          }),
        ),
      );
      // The owning onMessage invocation exports after its receipt and claim release.
    }),
  );
});
