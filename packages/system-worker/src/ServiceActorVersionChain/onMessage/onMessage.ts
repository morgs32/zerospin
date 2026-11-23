import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceSocketClientMessageSchema } from '@zerospin/core/serviceSession/ServiceSocketProtocolSchema';
import { System } from '@zerospin/core/system/System';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type { Connection, WSMessage } from 'partyserver';

import type { IServiceProjectionKey } from '../../serviceProjection/resolveServiceActorView.js';
import type { IServiceConnectionState } from '../connectionState.js';
import { disposeConnection } from '../disposeConnection.js';
import { readServiceConnectionCapabilities } from '../readServiceConnectionCapabilities.js';
import type { ServiceActorHistory } from '../ServiceActorHistory.js';

import { admitServiceSocketCommand } from './admitServiceSocketCommand.js';
import { replayServiceSocketCommands } from './replayServiceSocketCommands.js';

/** Recover bound admitted capabilities before decoding one phase-specific socket message. */
export const onMessage = Effect.fn('ServiceActorVersionChain.onMessage')(
  function* (props: {
    connection: Connection<IServiceConnectionState>;
    message: WSMessage;
    db: IDb;
    key: IServiceProjectionKey;
    history: ServiceActorHistory;
  }) {
    const { connection, db, key, message: encodedMessage } = props;
    const system = yield* System;
    const admitted = readServiceConnectionCapabilities({
      db,
      key,
      system,
      connection,
    });
    if (admitted === null) {
      disposeConnection({
        db,
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
    const { state, models, contractVersions } = admitted;
    const message = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceSocketClientMessageSchema),
    )(encodedMessage, { onExcessProperty: 'error' });
    if (message.type === 'resume' && state.phase === 'awaiting-resume') {
      return yield* replayServiceSocketCommands({
        connection,
        db,
        key,
        admission: state,
        models,
        resume: message,
        history: props.history,
      });
    }
    if (message.type !== 'pushServiceCommand' || state.phase !== 'live') {
      disposeConnection({
        db,
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
    yield* admitServiceSocketCommand({
      connection,
      key,
      contractVersions,
      command: message.command,
    });
  },
);
