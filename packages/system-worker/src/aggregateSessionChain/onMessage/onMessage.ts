import { AggregateAgentSocketClientMessageSchema } from '@zerospin/core/aggregateAgentSession/AggregateAgentSocketProtocolSchema';
import { AggregateSocketClientMessageSchema } from '@zerospin/core/aggregateSession/AggregateSocketProtocolSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import type { Connection, WSMessage } from 'partyserver';

import type { AggregateActorHistory } from '../../AggregateActorVersionChain/AggregateActorHistory.js';
import type { IAggregateProjectionKey } from '../../aggregateProjection/resolveAggregateProjectionView.js';
import type { IAggregateSessionConnectionState } from '../connectionState.js';
import { disposeConnection } from '../disposeConnection.js';
import { readAggregateConnectionCapabilities } from '../readAggregateConnectionCapabilities.js';

import { admitAggregateSocketCommand } from './admitAggregateSocketCommand.js';
import { replayAggregateSocketCommands } from './replayAggregateSocketCommands.js';

/** Validate the attachment and capabilities, decode the protocol, and dispatch the admitted phase. */
export const onMessage = makeFn('AggregateSessionChain.onMessage')(
  function* (props: {
    connection: Connection<IAggregateSessionConnectionState>;
    message: WSMessage;
    history?: AggregateActorHistory | undefined;
    db: IDb;
    key: IAggregateProjectionKey;
  }) {
    const { connection, message, db, key } = props;
    const stateRequired = () => {
      try {
        connection.send(
          JSON.stringify({
            type: 'state-required',
            reason: 'connection-state-invalid',
          }),
        );
      } finally {
        disposeConnection({
          db,
          key,
          connection,
          code: 4003,
          reason: 'state-required',
        });
      }
    };
    const admission = connection.state;
    if (admission === null || typeof message !== 'string') {
      stateRequired();
      return;
    }
    const decodedCapabilities = yield* readAggregateConnectionCapabilities({
      db,
      key,
      connectionId: connection.id,
      admission,
    }).pipe(Effect.result);
    if (Result.isFailure(decodedCapabilities)) {
      yield* Effect.logError(
        'Retained aggregate socket admission is invalid',
        decodedCapabilities.failure,
      );
      stateRequired();
      return;
    }
    const capabilities = decodedCapabilities.success;
    if (capabilities === null) {
      stateRequired();
      return;
    }
    const clientMessageSchema =
      'agentName' in key
        ? AggregateAgentSocketClientMessageSchema
        : AggregateSocketClientMessageSchema;
    const decoded = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(clientMessageSchema),
    )(message, { onExcessProperty: 'error' }).pipe(Effect.result);
    if (Result.isFailure(decoded)) {
      disposeConnection({
        db,
        key,
        connection,
        code: 4003,
        reason: 'aggregate-session-message-invalid',
      });
      return;
    }
    const request = decoded.success;
    if (
      request.type === 'resume' &&
      (admission.phase === 'awaiting-resume' ||
        (admission.phase === 'live' &&
          admission.admissionCommandId === null &&
          admission.nodeId === request.nodeId))
    ) {
      const replayAdmission: Extract<
        IAggregateSessionConnectionState,
        { phase: 'awaiting-resume' }
      > = {
        phase: 'awaiting-resume',
        issuedNodeId: admission.issuedNodeId,
        aggregateId: admission.aggregateId,
        aggregateName: admission.aggregateName,
        aggregateVersion: admission.aggregateVersion,
        ...('claims' in admission ? { claims: admission.claims } : {}),
        sessionName: admission.sessionName,
      };
      connection.setState(replayAdmission);
      yield* replayAggregateSocketCommands({
        connection,
        admission: replayAdmission,
        capabilities,
        history: props.history,
        resume: request,
        db,
        key,
      });
    } else if (
      request.type === 'pushAggregateCommand' &&
      'actorName' in key &&
      'claims' in admission &&
      admission.phase === 'live'
    ) {
      yield* admitAggregateSocketCommand({
        connection,
        admission,
        capabilities,
        command: request.command,
        db,
        key,
      });
    } else {
      stateRequired();
    }
  },
);
