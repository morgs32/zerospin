import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceAgentSocketClientMessageSchema } from '@zerospin/core/serviceAgentSession/ServiceAgentSocketProtocolSchema';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type { Connection, WSMessage } from 'partyserver';

import type { IServiceAgentProjectionKey } from '../serviceAgentProjection/resolveServiceAgentView.js';
import type { IServiceAgentExposedPublication } from '../serviceAgentProjection/serviceAgentProjectionDbConfig.js';

import { disposeConnection, readConnectionCapabilities } from './connection.js';
import type { IServiceAgentConnectionState } from './connectionState.js';
import { filterServiceAgentCommand } from './readServiceAgentHistory.js';
import { replayServiceAgentSocketCommands } from './replayServiceAgentSocketCommands.js';

/** Decode transport only after recovering this connection's exact immutable Agent capabilities. */
export const onMessage = Effect.fn('ServiceAgentVersionChain.onMessage')(
  function* (props: {
    db: IDb;
    key: IServiceAgentProjectionKey;
    connection: Connection<IServiceAgentConnectionState>;
    message: WSMessage;
  }) {
    const { connection, db, key, message: inputMessage } = props;
    const admitted = yield* readConnectionCapabilities({ key, connection });
    if (admitted === null) {
      disposeConnection({
        connection,
        code: 4003,
        reason: 'state-required',
        message: { type: 'state-required', reason: 'connection-state-invalid' },
      });
      return;
    }
    const message = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceAgentSocketClientMessageSchema),
    )(inputMessage, { onExcessProperty: 'error' });
    if (
      message.type === 'resume' &&
      (admitted.state.phase === 'awaiting-resume' ||
        (admitted.state.phase === 'live' &&
          admitted.state.nodeId === message.nodeId))
    ) {
      const state = admitted.state;
      const admission: Extract<
        IServiceAgentConnectionState,
        { phase: 'awaiting-resume' }
      > = {
        phase: 'awaiting-resume',
        issuedNodeId: state.issuedNodeId,
        serviceName: state.serviceName,
        serviceVersion: state.serviceVersion,
        agentName: state.agentName,
        agentVersion: state.agentVersion,
        sessionName: state.sessionName,
      };
      connection.setState(admission);
      return yield* replayServiceAgentSocketCommands({
        connection,
        db,
        admission,
        models: admitted.models,
        resume: message,
      });
    }
    disposeConnection({
      connection,
      code: 4003,
      reason: 'state-required',
      message: { type: 'state-required', reason: 'connection-state-invalid' },
    });
  },
);

/** Socket failure cannot reject the durable append that already retained every publication. */
export const broadcastCommands = Effect.fn(
  'ServiceAgentVersionChain.broadcastCommands',
)(function* (props: {
  key: IServiceAgentProjectionKey;
  publications: readonly IServiceAgentExposedPublication[];
  connections: () => Iterable<Connection<IServiceAgentConnectionState>>;
}) {
  const connections = props.connections.bind(props);
  const { publications, key } = props;
  for (const publication of publications) {
    for (const connection of connections()) {
      yield* Effect.gen(function* () {
        const admitted = yield* readConnectionCapabilities({
          key,
          connection,
        });
        if (admitted === null) {
          disposeConnection({
            connection,
            code: 4003,
            reason: 'state-required',
            message: {
              type: 'state-required',
              reason: 'connection-state-invalid',
            },
          });
          return;
        }
        if (admitted.state.phase !== 'live') return;
        connection.send(
          JSON.stringify({
            type: 'commands',
            commands: [filterServiceAgentCommand(publication, admitted.models)],
          }),
        );
      }).pipe(
        Effect.catchCause(() =>
          Effect.sync(() => {
            try {
              disposeConnection({
                connection,
                code: 1011,
                reason: 'service-agent-output-send-failed',
              });
            } catch {
              /* Socket cleanup cannot reject a committed history append. */
            }
          }),
        ),
      );
    }
  }
});
