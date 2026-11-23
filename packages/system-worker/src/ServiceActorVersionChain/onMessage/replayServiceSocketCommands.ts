import type { IDb } from '@zerospin/core/drizzle/types';
import type {
  IServiceSocketClientMessage,
  IServiceSocketServerMessage,
} from '@zerospin/core/serviceSession/ServiceSocketProtocolSchema';
import { System } from '@zerospin/core/system/System';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';
import type { Connection } from 'partyserver';

import { getServiceChain } from '../../ServiceChain/getServiceChain.js';
import type { IServiceProjectionKey } from '../../serviceProjection/resolveServiceActorView.js';
import type { IServiceConnectionState } from '../connectionState.js';
import { disposeConnection } from '../disposeConnection.js';
import { readServiceConnectionCapabilities } from '../readServiceConnectionCapabilities.js';
import type { ServiceActorHistory } from '../ServiceActorHistory.js';

/** Fetch immutable replay pages before the synchronous authority/head check and live handoff. */
export const replayServiceSocketCommands = Effect.fn(
  'ServiceSession.replaySocketCommands',
)(function* (props: {
  db: IDb;
  key: IServiceProjectionKey;
  history: ServiceActorHistory;
  connection: Connection<IServiceConnectionState>;
  admission: Extract<IServiceConnectionState, { phase: 'awaiting-resume' }>;
  models: Readonly<Record<string, unknown>>;
  resume: Extract<IServiceSocketClientMessage, { type: 'resume' }>;
}) {
  const { db, key, history, connection, admission, models, resume } = props;
  const system = yield* System;
  const originalCapabilities = readServiceConnectionCapabilities({
    db,
    key,
    system,
    connection,
  });
  const retainsCapabilities = (state: IServiceConnectionState) => {
    if (connection.readyState !== 1 || !isEqual(connection.state, state)) {
      return false;
    }
    const admitted = readServiceConnectionCapabilities({
      db,
      key,
      system,
      connection,
    });
    return (
      admitted !== null &&
      originalCapabilities !== null &&
      isEqual(admitted.models, models) &&
      isEqual(admitted.contractVersions, originalCapabilities.contractVersions)
    );
  };
  if (!retainsCapabilities(admission)) return;
  const stateRequired = (
    message: Extract<IServiceSocketServerMessage, { type: 'state-required' }>,
  ) =>
    disposeConnection({
      db,
      connection,
      code: 4003,
      reason: 'state-required',
      message,
    });
  if (
    admission.issuedNodeId !== null &&
    admission.issuedNodeId !== resume.nodeId
  ) {
    stateRequired({ type: 'state-required', reason: 'node-identity-mismatch' });
    return;
  }
  if (env.ZEROSPIN_LOCAL_DEVELOPMENT === 'true') {
    const chain = yield* getServiceChain({
      key: { systemId: key.systemId, serviceName: key.serviceName },
    });
    const registered = yield* Effect.promise(() =>
      chain.registerNode({
        nodeId: resume.nodeId,
        serviceVersion: admission.serviceVersion,
        sessionName: admission.sessionName,
        actorName: admission.actorName,
        actorVersion: admission.actorVersion,
        claims: admission.claims,
        create: false,
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    if (!retainsCapabilities(admission)) return;
    if (!registered) {
      stateRequired({
        type: 'state-required',
        reason: 'node-producer-not-registered',
      });
      return;
    }
  }
  const checkpoint = yield* history
    .getCheckpoint(resume.serviceIndex)
    .pipe(
      Effect.catch(error =>
        error.code === 'service-projection-checkpoint-invalid'
          ? Effect.succeed(null)
          : Effect.fail(error),
      ),
    );
  if (!retainsCapabilities(admission)) return;
  const current = history.readHead();
  if (
    checkpoint?.dispositionChainHash !== resume.dispositionChainHash ||
    current.serviceIndex < resume.serviceIndex
  ) {
    stateRequired({
      type: 'state-required',
      reason: 'checkpoint-conflict',
      requested: {
        serviceIndex: resume.serviceIndex,
        dispositionChainHash: resume.dispositionChainHash,
      },
      retainedDispositionChainHash: checkpoint?.dispositionChainHash ?? null,
      current,
    });
    return;
  }
  const owner = { ...admission, nodeId: resume.nodeId };
  let serviceIndex = resume.serviceIndex;
  let outcomeIndex = resume.outcomeIndex;
  let dispositionChainHash = resume.dispositionChainHash;
  yield* history.getResolvedThrough({
    owner,
    afterOutcomeIndex: outcomeIndex,
    throughServiceIndex: current.serviceIndex,
  });
  if (!retainsCapabilities(admission)) return;
  const replaying = { ...owner, phase: 'replaying' as const };
  connection.setState(replaying);
  const active = () => retainsCapabilities(replaying);
  for (;;) {
    if (!active()) return;
    const boundary = history.readHead();
    if (boundary.serviceIndex < serviceIndex) {
      return yield* makeZerospinError('session-replay-gap');
    }
    const resolvedThrough = yield* history.getResolvedThrough({
      owner,
      afterOutcomeIndex: outcomeIndex,
      throughServiceIndex: boundary.serviceIndex,
    });
    if (!active()) return;
    const oldResolvedThrough = yield* history.getResolvedThrough({
      owner,
      afterOutcomeIndex: outcomeIndex,
      throughServiceIndex: serviceIndex,
    });
    if (!active()) return;
    while (outcomeIndex < oldResolvedThrough) {
      const page = yield* history.readNodeOutcomes({
        owner,
        afterOutcomeIndex: outcomeIndex,
        throughServiceIndex: serviceIndex,
        models,
      });
      if (!active()) return;
      if (page.commands.length === 0 || page.outcomeThrough <= outcomeIndex) {
        return yield* makeZerospinError('node-outcome-gap');
      }
      connection.send(
        JSON.stringify({ type: 'commands', commands: page.commands }),
      );
      outcomeIndex = page.outcomeThrough;
    }
    while (serviceIndex < boundary.serviceIndex) {
      const commands = yield* history.readBrowserPage({
        owner,
        afterServiceIndex: serviceIndex,
        throughServiceIndex: boundary.serviceIndex,
        models,
      });
      if (!active()) return;
      if (commands.length === 0) {
        return yield* makeZerospinError('session-replay-gap');
      }
      connection.send(JSON.stringify({ type: 'commands', commands }));
      const last = commands.at(-1)!;
      serviceIndex = last.serviceIndex;
      dispositionChainHash = last.dispositionChainHash;
      outcomeIndex = yield* history.getResolvedThrough({
        owner,
        afterOutcomeIndex: outcomeIndex,
        throughServiceIndex: serviceIndex,
      });
      if (!active()) return;
    }
    if (
      outcomeIndex !== resolvedThrough ||
      dispositionChainHash !== boundary.dispositionChainHash
    ) {
      return yield* makeZerospinError('service-replay-checkpoint-invalid');
    }
    const live = yield* Effect.sync(() => {
      if (!active()) return true;
      const head = history.readHead();
      if (
        head.serviceIndex !== boundary.serviceIndex ||
        head.dispositionChainHash !== boundary.dispositionChainHash
      ) {
        return false;
      }
      connection.send(
        JSON.stringify({
          type: 'replay-complete',
          serviceIndex,
          dispositionChainHash,
          outcomeIndex,
        }),
      );
      connection.setState({
        ...owner,
        phase: 'live',
        admissionCommandId: null,
      });
      return true;
    });
    if (live) return;
    yield* Effect.yieldNow;
  }
});
