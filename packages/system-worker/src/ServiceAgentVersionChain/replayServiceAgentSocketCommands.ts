import type { IDb } from '@zerospin/core/drizzle/types';
import type { IServiceAgentSocketClientMessage } from '@zerospin/core/serviceAgentSession/ServiceAgentSocketProtocolSchema';
import type { IServiceSocketServerMessage } from '@zerospin/core/serviceSession/ServiceSocketProtocolSchema';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import type { Connection } from 'partyserver';

import { genesisDispositionChainHash } from '../serviceDispositionChainHash/serviceDispositionChainHash.js';

import { disposeConnection } from './connection.js';
import type { IServiceAgentConnectionState } from './connectionState.js';
import {
  readServiceAgentCommandPage,
  readServiceHistoryCheckpoint,
} from './readServiceAgentHistory.js';
import { serviceAgentVersionChainDbConfig } from './serviceAgentVersionChainDbConfig.js';
/** Replay fixed segments and perform the last durable read, sends and live marker in one turn. */
export const replayServiceAgentSocketCommands = Effect.fn(
  'ServiceAgentVersionChain.replaySocketCommands',
)(function* (props: {
  db: IDb;
  connection: Connection<IServiceAgentConnectionState>;
  admission: Extract<
    IServiceAgentConnectionState,
    { phase: 'awaiting-resume' }
  >;
  models: Readonly<Record<string, unknown>>;
  resume: IServiceAgentSocketClientMessage;
}) {
  const { db, connection, admission, models, resume } = props;
  const stateRequired = (
    failure: Extract<IServiceSocketServerMessage, { type: 'state-required' }>,
  ) => {
    disposeConnection({
      connection,
      code: 4003,
      reason: 'state-required',
      message: failure,
    });
  };
  if (admission.issuedNodeId !== resume.nodeId) {
    stateRequired({ type: 'state-required', reason: 'node-identity-mismatch' });
    return;
  }
  const table = serviceAgentVersionChainDbConfig.schema.exposedCommands;
  const hash =
    resume.serviceIndex === 0
      ? genesisDispositionChainHash()
      : db
          .select({ hash: table.dispositionChainHash })
          .from(table)
          .where(eq(table.serviceIndex, resume.serviceIndex))
          .get()?.hash;
  const current = readServiceHistoryCheckpoint(db);
  if (
    hash !== resume.dispositionChainHash ||
    current.serviceIndex < resume.serviceIndex
  ) {
    stateRequired({
      type: 'state-required',
      reason: 'checkpoint-conflict',
      requested: {
        serviceIndex: resume.serviceIndex,
        dispositionChainHash: resume.dispositionChainHash,
      },
      retainedDispositionChainHash: hash ?? null,
      current,
    });
    return;
  }
  const owner = { ...admission, nodeId: resume.nodeId };
  let serviceIndex = resume.serviceIndex,
    dispositionChainHash = resume.dispositionChainHash;
  connection.setState({ ...owner, phase: 'replaying' });
  const active = () =>
    connection.readyState === 1 &&
    connection.state?.phase === 'replaying' &&
    connection.state.nodeId === resume.nodeId;
  const deliverThrough = (through: number) => {
    if (!active()) {
      return true;
    }
    const commands = readServiceAgentCommandPage({
      db,
      afterServiceIndex: serviceIndex,
      throughServiceIndex: through,
      models,
    });
    if (commands.length > 0) {
      connection.send(JSON.stringify({ type: 'commands', commands }));
      const last = commands.at(-1);
      if (last !== undefined) {
        serviceIndex = last.serviceIndex;
        dispositionChainHash = last.dispositionChainHash;
      }
    }
    return serviceIndex === through;
  };
  for (;;) {
    if (!active()) {
      return;
    }
    const boundary = readServiceHistoryCheckpoint(db).serviceIndex;
    if (boundary < serviceIndex) {
      return yield* makeZerospinError({
        code: 'session-replay-gap',
        message: 'The service history moved behind the replayed checkpoint.',
      });
    }
    while (!deliverThrough(boundary)) {
      yield* Effect.yieldNow;
      if (!active()) {
        return;
      }
    }
    const joined = yield* Effect.sync(() => {
      if (!active()) {
        return true;
      }
      const tip = readServiceHistoryCheckpoint(db);
      if (tip.serviceIndex - serviceIndex > 64) {
        return false;
      }
      if (!deliverThrough(tip.serviceIndex)) {
        return false;
      }
      if (dispositionChainHash !== tip.dispositionChainHash) {
        throw makeZerospinError({
          code: 'service-replay-checkpoint-invalid',
          message:
            'The replayed service history does not match its retained checkpoint.',
        });
      }
      connection.send(
        JSON.stringify({
          type: 'replay-complete',
          serviceIndex,
          dispositionChainHash,
        }),
      );
      connection.setState({
        ...owner,
        phase: 'live',
      });
      return true;
    });
    if (joined) {
      return;
    }
    yield* Effect.yieldNow;
  }
});
