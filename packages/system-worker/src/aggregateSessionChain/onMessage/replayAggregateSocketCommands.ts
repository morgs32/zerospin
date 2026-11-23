import type { IAggregateAgentSocketClientMessage } from '@zerospin/core/aggregateAgentSession/AggregateAgentSocketProtocolSchema';
import type {
  IAggregateSocketClientMessage,
  IAggregateSocketServerMessage,
} from '@zerospin/core/aggregateSession/AggregateSocketProtocolSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { System } from '@zerospin/core/system/System';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { desc, eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';
import type { Connection } from 'partyserver';

import type { AggregateActorHistory } from '../../AggregateActorVersionChain/AggregateActorHistory.js';
import { genesisDispositionChainHash } from '../../aggregateDispositionChainHash/aggregateDispositionChainHash.js';
import type { IAggregateProjectionKey } from '../../aggregateProjection/resolveAggregateProjectionView.js';
import { AggregateChains } from '../../repoServices/AggregateChains.js';
import { aggregateAgentSessionChainDbConfig } from '../aggregateSessionChainDbConfig.js';
import type { IAggregateConnectionCapabilities } from '../connectionCapabilities.js';
import type { IAggregateSessionConnectionState } from '../connectionState.js';
import { disposeConnection } from '../disposeConnection.js';
import {
  getExecutionBrowserCommands,
  readNodeBrowserCommandPage,
} from '../getBrowserCommands/getBrowserCommands.js';
import { validateNodeReplayPrefix } from '../getBrowserCommands/validateNodeReplay.js';
import { readAggregateConnectionCapabilities } from '../readAggregateConnectionCapabilities.js';

/** Replay immutable fixed segments asynchronously, then join live delivery in one synchronous turn. */
export const replayAggregateSocketCommands = makeFn(
  'AggregateSessionChain.replayAggregateSocketCommands',
)(function* (props: {
  connection: Connection<IAggregateSessionConnectionState>;
  admission: Extract<
    IAggregateSessionConnectionState,
    { phase: 'awaiting-resume' }
  >;
  capabilities: IAggregateConnectionCapabilities;
  resume: Extract<
    IAggregateSocketClientMessage | IAggregateAgentSocketClientMessage,
    { type: 'resume' }
  >;
  history?: AggregateActorHistory | undefined;
  db: IDb;
  key: IAggregateProjectionKey;
}) {
  const { connection, admission, capabilities, resume, history, db, key } =
    props;
  const system = yield* System;
  const stateRequired = (
    failure: Extract<IAggregateSocketServerMessage, { type: 'state-required' }>,
  ) => {
    try {
      connection.send(JSON.stringify(failure));
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
  if ('actorName' in key && history === undefined) {
    return yield* makeZerospinError('aggregate-actor-history-required');
  }
  const table = aggregateAgentSessionChainDbConfig.schema.exposedCommands;
  const currentCheckpoint = () =>
    history?.readHead() ??
    db
      .select({
        aggregateIndex: table.aggregateIndex,
        dispositionChainHash: table.dispositionChainHash,
      })
      .from(table)
      .orderBy(desc(table.aggregateIndex))
      .limit(1)
      .get() ?? {
      aggregateIndex: 0,
      dispositionChainHash: genesisDispositionChainHash(),
    };
  if (
    admission.issuedNodeId !== null &&
    admission.issuedNodeId !== resume.nodeId
  ) {
    stateRequired({ type: 'state-required', reason: 'node-identity-mismatch' });
    return;
  }
  if (
    env.ZEROSPIN_LOCAL_DEVELOPMENT === 'true' &&
    'actorName' in key &&
    'claims' in admission
  ) {
    const chains = yield* AggregateChains;
    const chain = yield* chains.getRepo({
      key: {
        systemId: key.systemId,
        aggregateId: key.aggregateId,
        aggregateName: key.aggregateName,
      },
    });
    const registered = yield* Effect.promise(() =>
      chain.registerNode({
        nodeId: resume.nodeId,
        aggregateVersion: admission.aggregateVersion,
        sessionName: admission.sessionName,
        actorName: key.actorName,
        actorVersion: key.actorVersion,
        claims: admission.claims,
        create: false,
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    if (connection.readyState !== 1 || !isEqual(connection.state, admission))
      return;
    if (!registered) {
      stateRequired({
        type: 'state-required',
        reason: 'node-producer-not-registered',
      });
      return;
    }
  }
  let checkpoint: string | undefined;
  if (resume.aggregateIndex === 0) {
    checkpoint = genesisDispositionChainHash();
  } else if (
    history !== undefined &&
    resume.aggregateIndex <= currentCheckpoint().aggregateIndex
  ) {
    checkpoint = (yield* history.getCheckpoint(resume.aggregateIndex))
      .dispositionChainHash;
  } else {
    checkpoint = db
      .select({ dispositionChainHash: table.dispositionChainHash })
      .from(table)
      .where(eq(table.aggregateIndex, resume.aggregateIndex))
      .get()?.dispositionChainHash;
  }
  const current = currentCheckpoint();
  if (
    checkpoint !== resume.dispositionChainHash ||
    current.aggregateIndex < resume.aggregateIndex
  ) {
    stateRequired({
      type: 'state-required',
      reason: 'checkpoint-conflict',
      requested: {
        aggregateIndex: resume.aggregateIndex,
        dispositionChainHash: resume.dispositionChainHash,
      },
      retainedDispositionChainHash: checkpoint ?? null,
      current,
    });
    return;
  }
  const readCurrentCapabilities = () =>
    Effect.runSync(
      readAggregateConnectionCapabilities({
        db,
        key,
        connectionId: connection.id,
        admission: connection.state,
      }).pipe(Effect.provideService(System, system)),
    );
  // The checkpoint lookup may have awaited an Archive after this connection was disposed.
  if (
    !isEqual(connection.state, admission) ||
    readCurrentCapabilities() === null
  ) {
    stateRequired({
      type: 'state-required',
      reason: 'connection-state-invalid',
    });
    return;
  }
  const replaying = {
    ...admission,
    phase: 'replaying' as const,
    nodeId: resume.nodeId,
  };
  connection.setState(replaying);
  const active = () =>
    connection.readyState === 1 &&
    isEqual(connection.state, replaying) &&
    readCurrentCapabilities() !== null;
  let outcomeIndex = 'outcomeIndex' in resume ? resume.outcomeIndex : undefined;
  let aggregateIndex = resume.aggregateIndex;
  let dispositionChainHash = resume.dispositionChainHash;
  const definition =
    'actorName' in key && 'claims' in admission
      ? {
          name: admission.sessionName,
          modelNames: capabilities.modelNames,
          actorName: key.actorName,
          actorVersion: key.actorVersion,
          claims: admission.claims,
        }
      : { name: admission.sessionName, modelNames: capabilities.modelNames };
  const readPage = (throughAggregateIndex: number) => {
    const page = {
      db,
      key,
      history,
      afterAggregateIndex: aggregateIndex,
      throughAggregateIndex,
      definition,
    };
    return outcomeIndex === undefined
      ? getExecutionBrowserCommands(page)
      : readNodeBrowserCommandPage({
          ...page,
          nodeId: resume.nodeId,
          afterPushIndex: outcomeIndex,
        });
  };
  if (outcomeIndex !== undefined) {
    yield* validateNodeReplayPrefix({
      db,
      key,
      history,
      nodeId: resume.nodeId,
      afterAggregateIndex: aggregateIndex,
      afterPushIndex: outcomeIndex,
      throughAggregateIndex: currentCheckpoint().aggregateIndex,
      definition,
    });
  }
  for (;;) {
    if (!active()) return;
    const boundary = currentCheckpoint();
    let resolvedThrough: number | undefined;
    if (
      outcomeIndex !== undefined &&
      'actorName' in key &&
      'claims' in admission
    ) {
      if (history === undefined) {
        return yield* makeZerospinError('aggregate-actor-history-required');
      }
      resolvedThrough = yield* history.getResolvedThrough({
        nodeId: resume.nodeId,
        sessionName: admission.sessionName,
        actorName: key.actorName,
        actorVersion: key.actorVersion,
        claims: admission.claims,
        throughAggregateIndex: boundary.aggregateIndex,
      });
    }
    if (!active()) return;
    while (
      aggregateIndex < boundary.aggregateIndex ||
      (outcomeIndex !== undefined &&
        resolvedThrough !== undefined &&
        outcomeIndex < resolvedThrough)
    ) {
      const beforeAggregate = aggregateIndex;
      const beforeOutcome = outcomeIndex;
      const page = yield* readPage(boundary.aggregateIndex);
      if (!active()) return;
      for (const command of page.commands) {
        if (command.aggregateIndex <= aggregateIndex) continue;
        if (command.aggregateIndex !== aggregateIndex + 1) {
          return yield* makeZerospinError('session-replay-gap');
        }
        aggregateIndex = command.aggregateIndex;
        dispositionChainHash = command.dispositionChainHash;
      }
      connection.send(
        JSON.stringify({ type: 'commands', commands: page.commands }),
      );
      if (outcomeIndex !== undefined) outcomeIndex = page.pushThrough;
      if (
        aggregateIndex === beforeAggregate &&
        outcomeIndex === beforeOutcome
      ) {
        return yield* makeZerospinError('session-replay-gap');
      }
      yield* Effect.yieldNow;
    }
    // No Archive RPC can interleave the final head check, completion frame and live marker.
    const live = yield* Effect.sync(() => {
      if (!active()) return true;
      const capabilitiesNow = Effect.runSync(
        readAggregateConnectionCapabilities({
          db,
          key,
          connectionId: connection.id,
          admission: connection.state,
        }).pipe(Effect.provideService(System, system)),
      );
      if (capabilitiesNow === null) {
        stateRequired({
          type: 'state-required',
          reason: 'connection-state-invalid',
        });
        return true;
      }
      if (!isEqual(currentCheckpoint(), boundary)) return false;
      if (
        aggregateIndex !== boundary.aggregateIndex ||
        dispositionChainHash !== boundary.dispositionChainHash
      ) {
        throw makeZerospinError('aggregate-replay-checkpoint-invalid');
      }
      connection.send(
        JSON.stringify({
          type: 'replay-complete',
          aggregateIndex,
          dispositionChainHash,
          ...(outcomeIndex === undefined ? {} : { outcomeIndex }),
        }),
      );
      connection.setState({
        ...admission,
        phase: 'live',
        nodeId: resume.nodeId,
        admissionCommandId: null,
      });
      return true;
    });
    if (live) return;
    yield* Effect.yieldNow;
  }
});
