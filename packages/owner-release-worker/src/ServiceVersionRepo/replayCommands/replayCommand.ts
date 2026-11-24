import type { IDb } from '@zerospin/core/drizzle/types';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  ensureZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import { ServiceChains } from '@zerospin/system-worker/repoServices/ServiceChains';
import type { IServiceCommandOccurrence } from '@zerospin/system-worker/ServiceChain/types';
import {
  PreparedServiceReplayInputSchema,
  type IPreparedServiceReplayInput,
} from '@zerospin/system-worker/serviceReplayAdapter/prepareServiceReplaySource';
import { env } from 'cloudflare:workers';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type * as Semaphore from 'effect/Semaphore';

import { findEvaluatedCommand } from '../findEvaluatedCommand.js';
import { materializeCommandTx } from '../materializeCommandTx.js';
import { readEvaluatedCommand } from '../readEvaluatedCommand.js';
import { readServiceMaterializationHead } from '../readServiceMaterializationHead.js';
import { validateCommandIdentity } from '../validateCommandIdentity.js';

/** Restore retained release output; only a fresh parallel release evaluates history anew. */
export const replayCommand = Effect.fn('ServiceVersionRepo.replayCommand')(
  function* (props: {
    db: IDb;
    key: {
      systemId: string;
      serviceName: string;
      serviceVersion: number;
    };
    command: IServiceCommandOccurrence;
    execution: Semaphore.Semaphore;
    source: 'pull' | 'push';
  }) {
    const { db, key, command, execution, source } = props;
    if (command.outcome === null) {
      return yield* makeZerospinError('service-replay-command-pending');
    }
    if (source !== 'pull') {
      yield* validateCommandIdentity(undefined, command, key);
    }
    if (
      command.serviceIndex <= readServiceMaterializationHead(db).serviceIndex
    ) {
      yield* readEvaluatedCommand({
        db,
        key,
        serviceIndex: command.serviceIndex,
        command,
      });
      return;
    }
    let retainedCommand = yield* findEvaluatedCommand({
      db,
      key,
      serviceIndex: command.serviceIndex,
      command,
    });
    if (
      retainedCommand === null &&
      command.serviceVersion === key.serviceVersion
    ) {
      return yield* makeZerospinError('service-committed-result-missing');
    }
    const system = yield* System;
    const registry = yield* getByKeyOrThrow({
      record: system.services,
      key: key.serviceName,
      recordKind: 'services',
    });
    const serviceRelease = yield* getByKeyOrThrow({
      record: registry.releases,
      key: key.serviceVersion,
      recordKind: 'listed versions',
    });
    if (serviceRelease.branchFrom !== undefined && retainedCommand === null) {
      const issuer = env.ZEROSPIN_HOSTED_RELEASE_RPC;
      if (issuer === undefined) {
        const chain = yield* (yield* ServiceChains).getRepo({ key });
        retainedCommand = yield* Effect.promise(() =>
          chain.readServiceBranchCommand({
            serviceVersion: key.serviceVersion,
            serviceIndex: command.serviceIndex,
          }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
      } else {
        retainedCommand = yield* Effect.promise(async () => {
          using rpc = await issuer.getReleaseRpc();
          return await rpc.readServiceBranchCommand(command.serviceIndex);
        }).pipe(Effect.flatMap(readRpcEnvelope));
      }
    }
    let preparedReplayInput: IPreparedServiceReplayInput | undefined;
    const sourceRelease = registry.releases[command.serviceVersion];
    if (
      retainedCommand === null &&
      command.payload !== null &&
      (sourceRelease === undefined ||
        (command.kind === 'actor' &&
          sourceRelease.actors[command.actorName]?.version !==
            command.actorVersion))
    ) {
      const issuer = env.ZEROSPIN_HOSTED_RELEASE_RPC;
      const load =
        issuer === undefined
          ? yield* (yield* ServiceChains).getRepo({ key }).pipe(
              Effect.map(
                chain => () =>
                  chain.prepareServiceReplayInput({
                    systemId: key.systemId,
                    serviceName: key.serviceName,
                    serviceIndex: command.serviceIndex,
                    commandId: command.id,
                    receivingServiceVersion: key.serviceVersion,
                  }),
              ),
            )
          : async () => {
              using rpc = await issuer.getReleaseRpc();
              return await rpc.prepareServiceReplayInput(
                command.serviceIndex,
                command.id,
              );
            };
      preparedReplayInput = yield* Effect.tryPromise({
        try: load,
        catch: error =>
          ensureZerospinError({ code: 'service-replay-adapter-failed', error }),
      }).pipe(
        Effect.timeoutOrElse({
          duration: '5 seconds',
          orElse: () =>
            Effect.fail(makeZerospinError('service-replay-adapter-timeout')),
        }),
        Effect.flatMap(readRpcEnvelope),
        Effect.flatMap(reply =>
          Schema.decodeUnknownEffect(PreparedServiceReplayInputSchema)(reply, {
            onExcessProperty: 'error',
          }).pipe(
            mapParseError({
              code: 'service-replay-adapter-output-invalid',
              prefix: 'Invalid Service replay adapter output',
            }),
          ),
        ),
      );
    }
    const context: Context.Context<unknown> = yield* Effect.context<unknown>();
    const committed = yield* execution.withPermits(1)(
      materializeCommandTx(db, {
        row: command,
        serviceRelease,
        key,
        mode: 'replay',
        retainedCommand,
        preparedReplayInput,
      }).pipe(Effect.provideContext(context)),
    );
    if (committed === undefined) {
      yield* readEvaluatedCommand({
        db,
        key,
        serviceIndex: command.serviceIndex,
        command,
      });
    } else {
      yield* validateCommandIdentity(command, committed, key);
    }
  },
  Effect.scoped,
);
