import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { makeAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { DownAdapterRefused } from '@zerospin/core/contracts/DownAdapterRefused';
import { encodeOperation } from '@zerospin/core/contracts/encodeAppliedOperation';
import { buildExternalContinuation } from '@zerospin/core/contracts/externalExecution/buildExternalContinuation';
import type { IExternalOutcome } from '@zerospin/core/contracts/ExternalOutcomeSchema';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { upgradeAggregateContractRelease } from '@zerospin/core/contracts/make/upgradeAggregateContractRelease';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { OwnerReleaseIdentitySchema } from '@zerospin/core/system/ownerReleaseDeployment';
import { System } from '@zerospin/core/system/System';
import { ContractError, makeZerospinError } from '@zerospin/error';
import * as shapeIds from '@zerospin/shapes';
import { primitives } from '@zerospin/shapes';
import {
  abortAllDurableObjects,
  createExecutionContext,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { getTableName, sql } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import * as Struct from 'effect/Struct';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// oxlint-disable-next-line eslint/no-restricted-imports -- Canonical replay observes the actual Game provider.
import { ChooseComputerMove } from '../../../../examples/tic-tac-toe/src/chooseComputerMove.ts';
// oxlint-disable-next-line eslint/no-restricted-imports -- Canonical replay freezes the actual Game external declaration.
import { playExternalOMoveDefinitionV1 } from '../../../../examples/tic-tac-toe/src/contracts/playExternalOMoveDefinitionV1.ts';
// oxlint-disable-next-line eslint/no-restricted-imports -- Replay decodes the example's actual evolved saved-position schema.
import { SavedPositionContentV2 } from '../../../../examples/tic-tac-toe/src/savedPositionV2.ts';
import { appendAggregateCommand } from '../../src/AggregateChain/admitAggregateCommands/appendAggregateCommand.ts';
import type { aggregateChainDbConfig } from '../../src/AggregateChain/aggregateChainDbConfig.ts';
import { recordExternalOutcomeAndAdmitCommandTx } from '../../src/AggregateChain/recordExternalOutcomeAndAdmitCommandTx.ts';
import { recordOriginalCommandOutcomeTx } from '../../src/AggregateChain/recordOriginalCommandOutcomeTx.ts';
import type { IAdmittedAggregateCommand } from '../../src/AggregateChain/types.ts';
import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../../src/aggregateDispositionChainHash/aggregateDispositionChainHash.ts';
import {
  decodeAggregateEvaluatedCommandRow,
  type IEvaluatedAggregateCommand,
} from '../../src/AggregateVersionChain/evaluatedAggregateCommand.ts';
import { aggregateVersionRepoDbConfig } from '../../src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts';
import { materializeCommandTx } from '../../src/AggregateVersionRepo/materializeCommandTx.ts';
import { prepareAggregateExternalOperation } from '../../src/externalOperations/prepareExternalOperation.ts';
import { runExternalContinuation } from '../../src/externalOperations/runExternalOperation.ts';
import { getAggregateVersionChain } from '../../src/ownerOperations/releaseRepoNamespaces.ts';

import {
  readAggregateExternalAttempts,
  releaseAggregateExternalProbeFinalizers,
} from './aggregateExternalProbeControls.ts';
import type { GameReplayWriter } from './gameReplayWriter.ts';
import { probeAggregateReservationWorkDefinitionV1 as aggregateExternalProbeDefinition1 } from './probeAggregateReservationWorkV1.ts';
import config, {
  payment,
  pinnedOlderConfig,
  pinnedStableConfig,
  system,
} from './system.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      GAME_REPLAY_WRITER: DurableObjectNamespace<GameReplayWriter>;
      PINNED_SYSTEM_REPO: IDORepoNamespaces['SYSTEM_REPO'];
      PINNED_AGGREGATE_CHAIN: IDORepoNamespaces['AGGREGATE_CHAIN'];
      PINNED_OLDER_AGGREGATE_VERSION_CHAIN: IDORepoNamespaces['AGGREGATE_VERSION_CHAIN'];
      PINNED_NEWER_AGGREGATE_VERSION_CHAIN: IDORepoNamespaces['AGGREGATE_VERSION_CHAIN'];
      PINNED_SERVICE_CHAIN: IDORepoNamespaces['SERVICE_CHAIN'];
      PINNED_OLDER_REPO: IDORepoNamespaces['AGGREGATE_VERSION_REPO'];
      PINNED_NEWER_REPO: IDORepoNamespaces['AGGREGATE_VERSION_REPO'];
      PINNED_OLDER_OWNER: Fetcher & {
        getOwnerReleaseIdentity(): Promise<unknown>;
      };
      PINNED_NEWER_OWNER: Fetcher & {
        getOwnerReleaseIdentity(): Promise<unknown>;
      };
      PINNED_PROVIDER: R2Bucket;
    }
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  await releaseAggregateExternalProbeFinalizers();
  await reset();
});

it('replays an ordinary payment continuation across independently pinned Aggregate owner Workers', async () => {
  const { system: pinnedSystem, systemId } = pinnedStableConfig();
  const olderSystem = pinnedOlderConfig().system;
  const systemRepo = env.PINNED_SYSTEM_REPO.getByName(systemId);
  expect(
    (
      await systemRepo.registerSystemSpec({
        spec: makeSystemSpec({ system: olderSystem }),
      })
    ).result._tag,
  ).toBe('Success');
  expect(
    (
      await systemRepo.registerSystemSpec({
        spec: makeSystemSpec({ system: pinnedSystem }),
      })
    ).result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');

  const olderIdentity = Schema.decodeUnknownSync(OwnerReleaseIdentitySchema)(
    await env.PINNED_OLDER_OWNER.getOwnerReleaseIdentity(),
  );
  const newerIdentity = Schema.decodeUnknownSync(OwnerReleaseIdentitySchema)(
    await env.PINNED_NEWER_OWNER.getOwnerReleaseIdentity(),
  );
  expect(olderIdentity).toMatchObject({
    systemId,
    release: { aggregateName: 'checkout', aggregateVersion: 1 },
  });
  expect(newerIdentity).toMatchObject({
    systemId,
    release: { aggregateName: 'checkout', aggregateVersion: 2 },
  });
  expect(olderIdentity.versionId).not.toBe(newerIdentity.versionId);
  expect(pinnedSystem.aggregates.checkout.releases[1].external).toEqual({});

  const aggregateId = 'acc_pinned_payment';
  const aggregateName = 'checkout';
  const path = systemId + '/' + aggregateId + '/' + aggregateName;
  const chain = env.PINNED_AGGREGATE_CHAIN.getByName('ac_' + path);
  const older = env.PINNED_OLDER_REPO.getByName('avr_' + path + '/1');
  const newer = env.PINNED_NEWER_REPO.getByName('avr_' + path + '/2');
  const olderHistory = env.PINNED_OLDER_AGGREGATE_VERSION_CHAIN.getByName(
    'avc_' + path + '/1',
  );
  const newerHistory = env.PINNED_NEWER_AGGREGATE_VERSION_CHAIN.getByName(
    'avc_' + path + '/2',
  );
  const destination = env.PINNED_SERVICE_CHAIN.getByName(
    'sc_' + systemId + '/reservations',
  );
  const paymentId = 'pay_pinned';
  const admitNewer = (
    commandName: string,
    payload: object = {},
    contractVersion = 1,
  ) =>
    chain.admitDirectSystemCommand({
      command: {
        aggregateId,
        aggregateName,
        aggregateVersion: 2,
        commandName,
        contractVersion,
        kind: 'system',
        payload: JSON.stringify(payload),
      },
    });
  const readChain = async (aggregateIndex: number) =>
    (await chain.getAggregateCommand({ aggregateIndex })).result;

  const parent = (await admitNewer('requestPayment', { paymentId })).result;
  expect(parent).toMatchObject({
    _tag: 'Success',
    success: { aggregateIndex: 1 },
  });
  expect((await chain.executeCommandsThrough(1)).result._tag).toBe('Success');
  await expect
    .poll(() => readChain(2))
    .toMatchObject({
      _tag: 'Success',
      success: {
        kind: 'system',
        commandName: 'recordPayment',
        contractVersion: 2,
        aggregateVersion: 2,
        outcome: { result: { _tag: 'Success' } },
      },
    });
  const child = await readChain(2);
  if (
    child._tag !== 'Success' ||
    child.success === null ||
    child.success.payload === null
  ) {
    expect.fail(
      'Expected AggregateChain to retain the ordinary payment command',
    );
  }
  expect(JSON.parse(child.success.payload)).toEqual({
    paymentId,
    providerDecision: 'declined',
  });

  const readDestination = async (serviceIndex: number) =>
    (await destination.getServiceCommand({ serviceIndex })).result;
  await expect
    .poll(() => readDestination(1))
    .toMatchObject({
      _tag: 'Success',
      success: {
        commandName: 'createReservation',
        outcome: { result: { _tag: 'Success' } },
      },
    });
  const firstDestination = await readDestination(1);
  const providerCalls = () => env.PINNED_PROVIDER.list({ prefix: 'provider/' });
  expect((await providerCalls()).objects).toHaveLength(1);

  expect(
    (await admitNewer('requestPayment', { paymentId: 'pay_review' })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { aggregateIndex: 3 },
  });
  expect((await chain.executeCommandsThrough(3)).result._tag).toBe('Success');
  await expect
    .poll(() => readChain(4))
    .toMatchObject({
      _tag: 'Success',
      success: {
        kind: 'system',
        commandName: 'reviewPayment',
        contractVersion: 1,
        aggregateVersion: 2,
      },
    });
  expect(
    (await newer.awaitCommandResult({ aggregateIndex: 4 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { outcome: { result: { _tag: 'Success' } } },
  });
  for (const [parentIndex, paymentId, commandName, contractVersion] of [
    [5, 'pay_mapper_failure', 'recordPayment', 2],
    [7, 'pay_review_mapper_failure', 'reviewPayment', 1],
  ] as const) {
    const aggregateIndex = parentIndex + 1;
    expect(
      (await admitNewer('requestPayment', { paymentId })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: { aggregateIndex: parentIndex },
    });
    const parent = (
      await newer.awaitCommandResult({ aggregateIndex: parentIndex })
    ).result;
    if (parent._tag !== 'Success') {
      expect.fail('Payment request did not finalize');
    }
    const request = parent.success.operations[0];
    if (request?.operationName !== 'external') {
      expect.fail('Payment request did not retain an external operation');
    }

    await expect
      .poll(() => readChain(aggregateIndex))
      .toMatchObject({
        _tag: 'Success',
        success: {
          id: request.externalCommandId,
          commandName,
          contractVersion,
          aggregateVersion: 2,
          payload: null,
          outcome: {
            result: {
              _tag: 'Failure',
              failure: { code: 'external-continuation-payload-failed' },
            },
          },
        },
      });
    const failedChild = await readChain(aggregateIndex);
    if (failedChild._tag !== 'Success' || failedChild.success === null) {
      expect.fail('AggregateChain lost the failed child');
    }
    expect(
      (await older.awaitCommandResult({ aggregateIndex })).result._tag,
    ).toBe('Success');
    for (const history of [olderHistory, newerHistory]) {
      await expect
        .poll(
          async () =>
            (await history.getEvaluatedCommand({ aggregateIndex })).result,
        )
        .toMatchObject({
          _tag: 'Success',
          success: {
            id: request.externalCommandId,
            commandName,
            contractVersion,
            payload: null,
            outcome: failedChild.success.outcome,
            operations: [],
          },
        });
    }
  }
  const { objects: firstCalls } = await providerCalls();
  expect(firstCalls).toHaveLength(4);
  await expect
    .poll(
      async () =>
        (await olderHistory.getEvaluatedCommand({ aggregateIndex: 2 })).result,
    )
    .toMatchObject({
      _tag: 'Success',
      success: {
        id: child.success.id,
        outcome: { result: { _tag: 'Success' } },
      },
    });
  await expect
    .poll(
      async () =>
        (await olderHistory.getEvaluatedCommand({ aggregateIndex: 4 })).result,
    )
    .toMatchObject({
      _tag: 'Success',
      success: {
        commandName: 'reviewPayment',
        outcome: {
          result: {
            _tag: 'Failure',
            failure: { code: 'aggregate-contract-unsupported' },
          },
        },
      },
    });

  const paymentTable = getTableName(payment.drizzleSchema);
  for (const [repo, decision] of [
    [older, 'adapted-declined'],
    [newer, 'declined'],
  ] as const) {
    expect(
      await repo.getRepoTableRows({ tableName: paymentTable }),
    ).toMatchObject({
      result: {
        _tag: 'Success',
        success: {
          rows: [expect.objectContaining({ id: paymentId, decision })],
        },
      },
    });
    expect(
      await repo.getRepoTableRows({ tableName: 'materializationHead' }),
    ).toMatchObject({
      result: {
        _tag: 'Success',
        success: { rows: [expect.objectContaining({ aggregateIndex: 8 })] },
      },
    });
    for (const aggregateIndex of [1, 2, 3, 4]) {
      expect(
        (await repo.awaitCommandResult({ aggregateIndex })).result._tag,
      ).toBe('Success');
    }
  }
  await env.PINNED_PROVIDER.put('replay-source-unavailable', '');
  expect(
    (await admitNewer('finishCheckout', { reason: 'completed' }, 2)).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { aggregateIndex: 9 },
  });
  const pulled = await older.awaitCommandResult({ aggregateIndex: 9 });
  expect(pulled.result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-replay-adapter-failed' },
  });
  const spans = pulled.telemetry.spans.map(span => span.name);
  expect(spans).toContain('FanoutQueue.getPage');
  expect(spans).not.toContain('AggregateChain.readAggregateCommand');

  using replay = await older.replayCommandsFanoutSubscriber({
    systemId,
    aggregateId,
    aggregateName,
  });
  const finalized = await readChain(9);
  if (finalized._tag !== 'Success' || finalized.success?.outcome == null) {
    expect.fail('Expected AggregateChain to have finalized position 9');
  }
  const pushed = await replay.receive({
    rows: [{ ...finalized.success, payload: '{"reason":"changed"}' }],
    lastIndex: 9,
  });
  expect(pushed.result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-command-identity-mismatch' },
  });
  expect(pushed.telemetry.spans.map(span => span.name)).toContain(
    'AggregateChain.readAggregateCommand',
  );
  expect(
    await older.getRepoTableRows({ tableName: 'materializationHead' }),
  ).toMatchObject({
    result: { _tag: 'Success', success: { rows: [{ aggregateIndex: 8 }] } },
  });
  await env.PINNED_PROVIDER.delete('replay-source-unavailable');
  expect(
    (await older.awaitCommandResult({ aggregateIndex: 9 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: {
      commandName: 'finishCheckout',
      outcome: { result: { _tag: 'Success' } },
    },
  });
  for (const [repo, history] of [
    [older, olderHistory],
    [newer, newerHistory],
  ] as const) {
    expect(
      await repo.getRepoTableRows({ tableName: 'materializationHead' }),
    ).toMatchObject({
      result: {
        _tag: 'Success',
        success: { rows: [expect.objectContaining({ aggregateIndex: 9 })] },
      },
    });
    await expect
      .poll(
        async () =>
          (await history.getEvaluatedCommand({ aggregateIndex: 9 })).result,
      )
      .toMatchObject({
        _tag: 'Success',
        success: {
          commandName: 'finishCheckout',
          outcome: { result: { _tag: 'Success' } },
        },
      });
  }
  expect((await providerCalls()).objects.map(object => object.key)).toEqual(
    firstCalls.map(object => object.key),
  );
  expect(await readDestination(1)).toEqual(firstDestination);
  expect(await readDestination(2)).toEqual({ _tag: 'Success', success: null });

  const pendingRequests = async () => {
    const reply = await chain.getRepoTableRows({
      tableName: 'externalOperationOutbox',
    });
    return Schema.decodeUnknownSync(
      Schema.Struct({
        result: Schema.Struct({
          _tag: Schema.Literal('Success'),
          success: Schema.Struct({
            rows: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
          }),
        }),
      }),
    )(reply).result.success.rows;
  };
  const bucket = env.PINNED_PROVIDER;
  const ownerCalls = async (prefix: 'owner-attempt/' | 'owner-reply/') =>
    (await bucket.list({ prefix })).objects.length;
  const attemptsBefore = await ownerCalls('owner-attempt/');
  const repliesBefore = await ownerCalls('owner-reply/');
  const nextIndex = 11;
  await bucket.put('owner-fault', 'unavailable');
  expect(
    (await admitNewer('requestPayment', { paymentId: 'pay_review' })).result,
  ).toMatchObject({ _tag: 'Success', success: { aggregateIndex: 10 } });
  expect((await chain.executeCommandsThrough(10)).result._tag).toBe('Success');
  const finalizedRequest = (
    await newer.awaitCommandResult({ aggregateIndex: 10 })
  ).result;
  if (finalizedRequest._tag !== 'Success') {
    expect.fail('The recovery request did not finalize');
  }
  const operation = finalizedRequest.success.operations[0];
  if (operation?.operationName !== 'external') {
    expect.fail('The recovery request did not retain its external operation');
  }
  await expect
    .poll(() => ownerCalls('owner-attempt/'))
    .toBeGreaterThan(attemptsBefore);
  const pending = await pendingRequests();
  expect(pending).toEqual([
    expect.objectContaining({
      externalCommandId: operation.externalCommandId,
      aggregateVersion: 2,
      continuationFailure: null,
      externalOutcome: expect.stringContaining('external-request-failed'),
    }),
  ]);
  expect(await ownerCalls('owner-reply/')).toBe(repliesBefore);
  expect(await readChain(nextIndex)).toEqual({
    _tag: 'Success',
    success: null,
  });
  const { objects: recoveryProviderCalls } = await providerCalls();
  expect(recoveryProviderCalls).toHaveLength(5);

  await bucket.put('owner-fault', 'lost-reply');
  await expect
    .poll(() => ownerCalls('owner-reply/'), { timeout: 4_000 })
    .toBeGreaterThan(repliesBefore);
  expect(await pendingRequests()).toEqual(pending);
  expect(await readChain(nextIndex)).toEqual({
    _tag: 'Success',
    success: null,
  });

  await bucket.delete('owner-fault');
  await expect
    .poll(() => readChain(nextIndex), { timeout: 4_000 })
    .toMatchObject({
      _tag: 'Success',
      success: {
        id: operation.externalCommandId,
        aggregateVersion: 2,
        commandName: 'reviewPayment',
      },
    });
  expect(
    (await newer.awaitCommandResult({ aggregateIndex: nextIndex })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { outcome: { result: { _tag: 'Success' } } },
  });
  expect(await pendingRequests()).toEqual([]);
  expect(Object.keys(olderSystem.aggregates.checkout.releases)).toEqual(['1']);
  expect(
    olderSystem.aggregates.checkout.releases[1].system.finishCheckout.next,
  ).toBeUndefined();
  expect(olderSystem.aggregateAgents).toEqual({});
  const agentName = 'paymentReviewer';
  const generation = 1;
  expect(
    (
      await chain.transitionAgentNodeProducer({
        agentName,
        generation,
        active: true,
      })
    ).result._tag,
  ).toBe('Success');
  const agentCommandId = 'cmd_pinned_finish_checkout';
  const agentPayload = JSON.stringify({ reason: 'completed by Agent' });
  expect(
    (
      await chain.admitFromAggregateAgentNode({
        source: { systemId, aggregateName, aggregateId, agentName },
        generation,
        producerIndex: 1,
        command: {
          id: agentCommandId,
          commandName: 'finishCheckout',
          contractVersion: 2,
          kind: 'agent',
          agentName,
          agentVersion: 1,
          aggregateName,
          aggregateId,
          aggregateVersion: 2,
          payload: agentPayload,
        },
      })
    ).result._tag,
  ).toBe('Success');
  expect((await chain.executeCommandsThrough(nextIndex + 1)).result._tag).toBe(
    'Success',
  );
  for (const history of [newerHistory, olderHistory]) {
    await expect
      .poll(
        async () =>
          (await history.getEvaluatedCommand({ aggregateIndex: nextIndex + 1 }))
            .result,
      )
      .toMatchObject({
        _tag: 'Success',
        success: {
          id: agentCommandId,
          commandName: 'finishCheckout',
          contractVersion: 2,
          payload: agentPayload,
          kind: 'agent',
          agentName,
          agentVersion: 1,
          aggregateVersion: 2,
          outcome: { result: { _tag: 'Success' } },
        },
      });
  }
  expect(await readChain(nextIndex + 2)).toEqual({
    _tag: 'Success',
    success: null,
  });
  expect(
    (await admitNewer('finishCheckout', { reason: 'completed' }, 2)).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { aggregateIndex: nextIndex + 2 },
  });
  expect(
    (await older.awaitCommandResult({ aggregateIndex: nextIndex + 2 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: {
      commandName: 'finishCheckout',
      outcome: { result: { _tag: 'Success' } },
    },
  });
  expect((await providerCalls()).objects.map(object => object.key)).toEqual(
    recoveryProviderCalls.map(object => object.key),
  );
  expect(await readDestination(1)).toEqual(firstDestination);
  expect(await readDestination(2)).toEqual({ _tag: 'Success', success: null });
}, 30_000);

it('replays saved Game positions through the newer writer without changing history or producing more external work', async () => {
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result._tag,
  ).toBe('Success');
  const original = env.AGGREGATE_VERSION_REPO.getByName(
    'avr_sys_servicePublication/game_replay/game/2',
  );
  const parallel = env.GAME_REPLAY_WRITER.getByName(
    'avr_sys_servicePublication/game_replay/game/3',
  );
  await runInDurableObject(original, () => undefined);
  expect((await parallel.awaitStartup()).result._tag).toBe('Success');
  const newCommandIds = vi.spyOn(shapeIds, 'makeIdFromAbbreviation');
  const chooser = vi.fn(() => Effect.succeed(4));
  const gameRows = shapeIds.makeDrizzleSchemaFromTable(
    system.aggregates.game.releases[2].models.game.table,
  );
  const source = await runInDurableObject(original, instance =>
    config.managedRuntime.runPromise(
      Effect.gen(function* () {
        const { db, schema, key } = instance;
        const release = system.aggregates.game.releases[2];
        const create: IAdmittedAggregateCommand = {
          id: 'cmd_game_create',
          aggregateName: 'game',
          aggregateVersion: 2,
          aggregateId: key.aggregateId,
          aggregateIndex: 1,
          kind: 'actor',
          actorName: 'human',
          actorVersion: 2,
          claims: { aggregateId: key.aggregateId, instanceId: 'gam_replay' },
          nodeId: 'node_game_replay',
          sessionName: 'game',
          pushIndex: 1,
          commandName: 'createGame',
          contractVersion: 1,
          payload: JSON.stringify({ id: 'gam_replay' }),
          outcome: null,
        };
        const created = yield* materializeCommandTx(db, {
          row: create,
          aggregateRelease: release,
          key,
          mode: 'original',
        });
        if (created === undefined) throw new Error('Game creation skipped');

        const x: IAdmittedAggregateCommand = {
          ...create,
          id: 'cmd_game_retained_x',
          aggregateIndex: 2,
          pushIndex: 2,
          commandName: 'playX',
          payload: JSON.stringify({
            id: 'gam_replay',
            board: '.........',
            square: 0,
          }),
        };
        const modelOperation = yield* encodeOperation({
          commandId: x.id,
          operationIndex: 0,
          operation: {
            operationName: 'update',
            model: release.models.game,
            modelVersion: 1,
            resourceId: 'gam_replay',
            body: { attributes: { board: 'X........' } },
          },
        });
        const frozen = yield* playExternalOMoveDefinitionV1.externalOperation
          .make({ payload: { id: 'gam_replay', board: 'X........' } })
          .pipe(
            Effect.flatMap(operation =>
              prepareAggregateExternalOperation({
                aggregateRelease: release,
                initiatingCommandId: x.id,
                operationIndex: 1,
                operation,
              }),
            ),
          );
        const outcome: IEvaluatedAggregateCommand['outcome'] = {
          result: { _tag: 'Success', success: null },
          finalizedAt: new Date(),
        };
        const retained: IEvaluatedAggregateCommand = {
          ...x,
          outcome,
          operations: [
            Struct.omit(modelOperation, ['commandId']),
            {
              operationName: 'external',
              ...Struct.omit(frozen, [
                'initiatingCommandId',
                'aggregateVersion',
              ]),
            },
          ],
          dispositionChainHash: advanceDispositionChainHash({
            previousDispositionChainHash: created.dispositionChainHash,
            aggregateIndex: x.aggregateIndex,
            commandId: x.id,
            outcome,
          }),
        };
        newCommandIds.mockClear();
        const restored = yield* materializeCommandTx(db, {
          row: { ...x, outcome },
          aggregateRelease: release,
          key,
          mode: 'replay',
          retainedCommand: retained,
        });
        expect(restored).toEqual(retained);
        expect(newCommandIds).not.toHaveBeenCalled();

        const saved = yield* materializeCommandTx(db, {
          row: {
            ...x,
            id: 'cmd_game_old_save',
            aggregateIndex: 3,
            pushIndex: 3,
            commandName: 'savePosition',
            payload: JSON.stringify({
              gameId: 'gam_replay',
              positionId: 'pos_retained',
            }),
          },
          aggregateRelease: release,
          key,
          mode: 'original',
        });
        if (saved === undefined) throw new Error('Saved position skipped');
        expect(saved.outcome.result._tag).toBe('Success');
        expect(saved.operations).toMatchObject([
          {
            operationName: 'create',
            modelName: 'savedPosition',
            modelVersion: 1,
            resourceId: 'pos_retained',
          },
        ]);

        const continuation = yield* buildExternalContinuation(release, {
          externalContractName: frozen.externalContractName,
          externalContractVersion: frozen.externalContractVersion,
          payload: frozen.payload,
          externalOutcome: {
            _tag: 'Success',
            success: 4,
            recordedAt: new Date(),
          },
        });
        const { payload, failure, ...contract } = continuation;
        if (payload === null) throw failure;
        const observed = yield* materializeCommandTx(db, {
          row: {
            ...contract,
            payload,
            id: frozen.externalCommandId,
            aggregateName: 'game',
            aggregateId: key.aggregateId,
            aggregateVersion: 2,
            aggregateIndex: 4,
            kind: 'system',
            outcome: null,
          },
          aggregateRelease: release,
          key,
          mode: 'original',
        });
        const moved = yield* materializeCommandTx(db, {
          row: {
            ...x,
            id: 'cmd_game_original_x',
            aggregateIndex: 5,
            pushIndex: 4,
            payload: JSON.stringify({
              id: 'gam_replay',
              board: 'X...O....',
              square: 1,
            }),
          },
          aggregateRelease: release,
          key,
          mode: 'original',
        });
        if (
          restored === undefined ||
          observed === undefined ||
          moved === undefined
        ) {
          throw new Error('Game execution skipped');
        }
        expect(observed.outcome.result._tag).toBe('Success');
        expect(moved.operations).toMatchObject([
          { operationName: 'update', operationIndex: 0 },
          {
            operationName: 'external',
            operationIndex: 1,
            externalContractName: 'playExternalOMove',
            externalContractVersion: 1,
            payload: { id: 'gam_replay', board: 'XX..O....' },
          },
        ]);
        expect(newCommandIds).toHaveBeenCalledTimes(1);
        const commands = [created, restored, saved, observed, moved];
        const publication = yield* Effect.forEach(
          db.select().from(schema.aggregateVersionChainOutbox).all(),
          row =>
            aggregateVersionRepoDbConfig.tables.aggregateVersionChainOutbox
              .decodeRow(row)
              .pipe(Effect.flatMap(decodeAggregateEvaluatedCommandRow)),
        );
        expect(publication).toEqual(commands);
        return {
          commands,
          resources: db.select().from(gameRows).all(),
          positions: db
            .select()
            .from(
              shapeIds.makeDrizzleSchemaFromTable(
                release.models.savedPosition.table,
              ),
            )
            .all(),
          head: db.select().from(schema.materializationHead).all(),
        };
      }).pipe(Effect.provideService(ChooseComputerMove, chooser)),
    ),
  );
  expect(source.resources).toMatchObject([
    { id: 'gam_replay', board: 'XX..O....', computerMoveFailure: null },
  ]);
  expect(source.positions).toMatchObject([
    {
      id: 'pos_retained',
      gameId: 'gam_replay',
      content: JSON.stringify({ board: 'X........' }),
    },
  ]);
  expect(source.head).toEqual([
    {
      singletonId: 1,
      aggregateIndex: 5,
      dispositionChainHash: source.commands[4]?.dispositionChainHash,
    },
  ]);
  newCommandIds.mockClear();
  const newSavedCommand = await parallel.replaySavedPosition({
    commands: source.commands,
    resources: source.resources,
    head: source.head,
  });
  await runInDurableObject(original, instance =>
    config.managedRuntime.runPromise(
      Effect.gen(function* () {
        const { db, key } = instance;
        const {
          operations: _operations,
          dispositionChainHash: _hash,
          ...row
        } = newSavedCommand;
        const reversed = yield* materializeCommandTx(db, {
          row,
          aggregateRelease: system.aggregates.game.releases[2],
          key,
          mode: 'replay',
          retainedCommand: null,
        });
        if (reversed === undefined) {
          throw new Error('Reverse save replay skipped');
        }
        expect(reversed.outcome.result._tag).toBe('Success');
        expect(reversed.operations).toMatchObject([
          {
            operationName: 'create',
            modelName: 'savedPosition',
            modelVersion: 1,
            resourceId: 'pos_reverse',
          },
        ]);
        expect(
          yield* materializeCommandTx(db, {
            row,
            aggregateRelease: system.aggregates.game.releases[2],
            key,
            mode: 'replay',
            retainedCommand: null,
          }),
        ).toBeUndefined();
        const positions = db
          .select()
          .from(
            shapeIds.makeDrizzleSchemaFromTable(
              system.aggregates.game.releases[2].models.savedPosition.table,
            ),
          )
          .all();
        expect(positions).toHaveLength(2);
        expect(
          positions.find(position => position.id === 'pos_retained'),
        ).toEqual(source.positions[0]);
        expect(
          positions.find(position => position.id === 'pos_reverse'),
        ).toMatchObject({
          content: JSON.stringify({ board: 'XX..O....' }),
        });
      }).pipe(Effect.provideService(System, system)),
    ),
  );
  expect(newCommandIds).not.toHaveBeenCalled();
  expect(chooser).not.toHaveBeenCalled();
});

it('saves finished Games with no next turn and refuses unavailable or differently claimed Games', async () => {
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result._tag,
  ).toBe('Success');
  const repo = env.AGGREGATE_VERSION_REPO.getByName(
    'avr_sys_servicePublication/game_finished/game/3',
  );
  await runInDurableObject(repo, instance =>
    config.managedRuntime.runPromise(
      Effect.gen(function* () {
        const { db, key } = instance;
        const release = system.aggregates.game.releases[3];
        const gameRows = shapeIds.makeDrizzleSchemaFromTable(
          release.models.game.table,
        );
        const positions = shapeIds.makeDrizzleSchemaFromTable(
          release.models.savedPosition.table,
        );
        let aggregateIndex = 1;
        let pushIndex = 1;
        const create: IAdmittedAggregateCommand = {
          id: 'cmd_finished_create',
          aggregateName: 'game',
          aggregateVersion: 3,
          aggregateId: key.aggregateId,
          aggregateIndex,
          kind: 'actor',
          actorName: 'human',
          actorVersion: 3,
          claims: { aggregateId: key.aggregateId, instanceId: 'gam_finished' },
          nodeId: 'node_finished',
          sessionName: 'game',
          pushIndex,
          commandName: 'createGame',
          contractVersion: 1,
          payload: JSON.stringify({ id: 'gam_finished' }),
          outcome: null,
        };
        const created = yield* materializeCommandTx(db, {
          row: create,
          aggregateRelease: release,
          key,
          mode: 'original',
        });
        expect(created?.outcome.result._tag).toBe('Success');
        for (const { square, computerSquare } of [
          { square: 0, computerSquare: 3 },
          { square: 1, computerSquare: 4 },
          { square: 2, computerSquare: null },
        ]) {
          const current = db.select().from(gameRows).get();
          if (current === undefined) {
            throw new Error('Command-created Game is missing');
          }
          const moved = yield* materializeCommandTx(db, {
            row: {
              ...create,
              id: `cmd_finished_x_${square}`,
              aggregateIndex: ++aggregateIndex,
              pushIndex: ++pushIndex,
              commandName: 'playX',
              payload: JSON.stringify({
                id: 'gam_finished',
                board: current.board,
                square,
              }),
            },
            aggregateRelease: release,
            key,
            mode: 'original',
          });
          if (moved === undefined) throw new Error('Game move skipped');
          expect(moved.outcome.result._tag).toBe('Success');
          const external = moved.operations.find(
            operation => operation.operationName === 'external',
          );
          if (computerSquare === null) {
            expect(external).toBeUndefined();
            continue;
          }
          if (external === undefined) {
            throw new Error('Expected recorded O move');
          }
          const continuation = yield* buildExternalContinuation(release, {
            externalContractName: external.externalContractName,
            externalContractVersion: external.externalContractVersion,
            payload: external.payload,
            externalOutcome: {
              _tag: 'Success',
              success: computerSquare,
              recordedAt: new Date(),
            },
          });
          const { payload, failure, ...contract } = continuation;
          if (payload === null) throw failure;
          const observed = yield* materializeCommandTx(db, {
            row: {
              ...contract,
              payload,
              id: external.externalCommandId,
              aggregateName: 'game',
              aggregateVersion: 3,
              aggregateId: key.aggregateId,
              aggregateIndex: ++aggregateIndex,
              kind: 'system',
              outcome: null,
            },
            aggregateRelease: release,
            key,
            mode: 'original',
          });
          expect(observed?.outcome.result._tag).toBe('Success');
        }
        expect(db.select().from(gameRows).get()).toMatchObject({
          board: 'XXXOO....',
        });
        const saved = yield* materializeCommandTx(db, {
          row: {
            ...create,
            id: 'cmd_finished_save',
            aggregateIndex: ++aggregateIndex,
            pushIndex: ++pushIndex,
            commandName: 'savePosition',
            contractVersion: 2,
            payload: JSON.stringify({
              gameId: 'gam_finished',
              positionId: 'pos_finished',
            }),
          },
          aggregateRelease: release,
          key,
          mode: 'original',
        });
        expect(saved?.outcome.result._tag).toBe('Success');
        const finished = db.select().from(positions).get();
        if (finished === undefined) {
          throw new Error('Finished saved position is missing');
        }
        expect(
          yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(SavedPositionContentV2),
          )(finished.content),
        ).toEqual({ board: 'XXXOO....', turn: null });
        const beforeRefusals = db.select().from(positions).all();
        for (const { gameId, instanceId, positionId } of [
          {
            gameId: 'gam_missing',
            instanceId: 'gam_missing',
            positionId: 'pos_missing',
          },
          {
            gameId: 'gam_finished',
            instanceId: 'gam_other',
            positionId: 'pos_wrong_claim',
          },
        ]) {
          const refused = yield* materializeCommandTx(db, {
            row: {
              ...create,
              id: `cmd_refuse_${positionId}`,
              aggregateIndex: ++aggregateIndex,
              pushIndex: ++pushIndex,
              commandName: 'savePosition',
              contractVersion: 2,
              claims: { aggregateId: key.aggregateId, instanceId },
              payload: JSON.stringify({ gameId, positionId }),
            },
            aggregateRelease: release,
            key,
            mode: 'original',
          });
          expect(refused?.outcome.result).toMatchObject({
            _tag: 'Failure',
            failure: { code: 'game-unavailable' },
          });
        }
        expect(db.select().from(positions).all()).toEqual(beforeRefusals);
      }),
    ),
  );
});

it.each([
  'missing',
  'actor',
  'lineage',
  'source',
  'payload',
  'claims',
  'provenance',
] as const)(
  'retains Aggregate support refusals and preserves unresolved replay failures: %s',
  async scenario => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
        .result._tag,
    ).toBe('Success');
    const repo = env.AGGREGATE_VERSION_REPO.getByName(
      'avr_sys_servicePublication/acc_replay/account/2',
    );
    const actorCommand =
      scenario === 'actor' ||
      scenario === 'claims' ||
      scenario === 'provenance';
    const missingCommand =
      scenario === 'missing' || scenario === 'source' || scenario === 'payload';
    let programExecutions = 0;
    const ordinarySource = makeAggregateContractRelease(
      defineAggregateContract('replayCommand'),
      {
        version: scenario === 'lineage' ? 2 : 1,
        payload: {},
        program: () =>
          Effect.sync(() => {
            programExecutions += 1;
          }),
      },
    );
    const afterRefusal = makeAggregateContractRelease(
      defineAggregateContract('afterRefusal'),
      {
        version: 1,
        payload: {},
        program: () => Effect.void,
      },
    );
    const localContract = actorCommand
      ? ordinarySource
      : makeAggregateContractRelease(defineAggregateContract('replayCommand'), {
          version: 1,
          payload: {},
          program: () =>
            Effect.sync(() => {
              programExecutions += 1;
            }),
        });
    const declaredActor = system.aggregates.account.releases[1].actors.viewer;
    const actorProps = {
      db: declaredActor.db,
      identity: declaredActor.identity,
      authentication: declaredActor.authentication,
      exposedModels: {},
      selections: {},
    };
    const sourceActor = makeAggregateActorRelease(
      { name: 'viewer' },
      {
        ...actorProps,
        version: 1,
        contracts: { replayCommand: ordinarySource },
      },
    );
    const localActor = makeAggregateActorRelease(
      { name: 'viewer' },
      {
        ...actorProps,
        version: 2,
        contracts: {},
      },
    );
    const sourceRelease = makeAggregateRelease(
      { name: 'account' },
      {
        version: 1,
        models: {},
        actors: actorCommand ? { viewer: sourceActor } : {},
        system:
          scenario === 'source'
            ? { afterRefusal }
            : { replayCommand: ordinarySource, afterRefusal },
      },
    );
    const contracts: Readonly<
      Record<string, typeof localContract | typeof afterRefusal>
    > = missingCommand
      ? { afterRefusal }
      : { replayCommand: localContract, afterRefusal };
    const aggregateRelease = makeAggregateRelease(
      { name: 'account' },
      {
        version: 2,
        rebuildFrom: sourceRelease,
        models: {},
        actors: actorCommand ? { viewer: localActor } : {},
        system: contracts,
      },
    );
    const localSystem = makeSystem({
      name: 'replayResolution',
      aggregates: {
        account: {
          releases: { 1: sourceRelease, 2: aggregateRelease },
        },
      },
    });
    const command: IAdmittedAggregateCommand = {
      id: 'cmd_replay',
      commandName: 'replayCommand',
      contractVersion: ordinarySource.version,
      payload: scenario === 'payload' ? '{"unexpected":' : '{}',
      aggregateName: 'account',
      aggregateId: 'acc_replay',
      aggregateVersion: 1,
      aggregateIndex: 1,
      ...(actorCommand
        ? {
            kind: 'actor',
            actorName: 'viewer',
            actorVersion: scenario === 'provenance' ? 99 : 1,
            claims: {
              aggregateId: 'acc_replay',
              viewerId: scenario === 'claims' ? 42 : 'one',
            },
            nodeId: 'node_replay',
            sessionName: 'viewer',
            pushIndex: 1,
          }
        : { kind: 'system' }),
      outcome: {
        finalizedAt: new Date(1_000),
        result: { _tag: 'Success', success: null },
      },
    };
    const exit = await runInDurableObject(repo, instance =>
      config.managedRuntime.runPromise(
        materializeCommandTx(instance.db, {
          row: command,
          aggregateRelease,
          key: instance.key,
          mode: 'replay',
          retainedCommand: null,
        }).pipe(Effect.provideService(System, localSystem), Effect.exit),
      ),
    );
    expect(programExecutions).toBe(0);
    if (
      scenario === 'missing' ||
      scenario === 'actor' ||
      scenario === 'lineage'
    ) {
      expect(Exit.isSuccess(exit)).toBe(true);
      if (!Exit.isSuccess(exit) || exit.value === undefined) {
        throw new Error('Support refusal was not retained');
      }
      const refused = exit.value;
      expect(refused).toMatchObject({
        operations: [],
        outcome: {
          finalizedAt: command.outcome?.finalizedAt,
          result: {
            _tag: 'Failure',
            failure: {
              code: 'aggregate-contract-unsupported',
            },
          },
        },
      });
      await runInDurableObject(repo, async instance => {
        expect(
          instance.db.select().from(instance.schema.materializationHead).all(),
        ).toMatchObject([
          {
            aggregateIndex: 1,
            dispositionChainHash: refused.dispositionChainHash,
          },
        ]);
        expect(
          instance.db
            .select()
            .from(instance.schema.aggregateVersionChainOutbox)
            .all(),
        ).toHaveLength(1);
        const next: IAdmittedAggregateCommand = {
          id: 'cmd_after_refusal',
          commandName: 'afterRefusal',
          contractVersion: 1,
          payload: '{}',
          aggregateName: 'account',
          aggregateVersion: 1,
          aggregateId: 'acc_replay',
          aggregateIndex: 2,
          kind: 'system',
          outcome: {
            result: { _tag: 'Success', success: null },
            finalizedAt: new Date(2_000),
          },
        };
        const evaluated = await config.managedRuntime.runPromise(
          materializeCommandTx(instance.db, {
            row: next,
            aggregateRelease,
            key: instance.key,
            mode: 'replay',
            retainedCommand: null,
          }).pipe(Effect.provideService(System, localSystem)),
        );
        expect(evaluated?.outcome.result._tag).toBe('Success');
        expect(
          instance.db.select().from(instance.schema.materializationHead).all(),
        ).toMatchObject([{ aggregateIndex: 2 }]);
      });
      return;
    }
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const reason = exit.cause.reasons[0];
      expect(
        reason !== undefined && Cause.isFailReason(reason)
          ? reason.error
          : undefined,
      ).toMatchObject({
        code:
          scenario === 'source'
            ? 'actor-contract-lineage-unsupported'
            : scenario === 'payload'
              ? 'decode-command-payload-failed'
              : scenario === 'claims'
                ? 'command-claims-unsupported'
                : 'actor-version-unsupported',
      });
    }
    expect(
      await runInDurableObject(repo, ({ db, schema }) => ({
        head: db.select().from(schema.materializationHead).all(),
        outbox: db.select().from(schema.aggregateVersionChainOutbox).all(),
      })),
    ).toEqual({ head: [], outbox: [] });
  },
);

it.each(['accept', 'refuse'] as const)(
  'records the ordinary continuation guard and program outcome: %s',
  async admission => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
        .result._tag,
    ).toBe('Success');
    const repo = env.AGGREGATE_VERSION_REPO.getByName(
      'avr_sys_servicePublication/acc_external/account/1',
    );
    const executions: string[] = [];
    const contract = makeAggregateContractRelease(
      defineAggregateContract('continueWithoutActor'),
      {
        version: 1,
        payload: {},
        failures: {
          refused: ContractError.schema({ code: 'external-refused' }),
        },
        guard: ({ claims, failures }) =>
          Effect.gen(function* () {
            expect(claims).toBeNull();
            executions.push('guard');
            if (admission === 'refuse') {
              return yield* failures.refused.make({
                message: 'External guard refused',
              });
            }
          }),
        program: ({ claims }) =>
          Effect.sync(() => {
            expect(claims).toBeNull();
            executions.push('program');
          }),
      },
    );
    const aggregateRelease = makeAggregateRelease(
      { name: 'account' },
      {
        version: 1,
        models: {},
        actors: {},
        system: {},
        contracts: { continueWithoutActor: contract },
      },
    );
    const localSystem = makeSystem({
      name: 'claimsFreeExternalCommands',
      aggregates: {
        account: { releases: { 1: aggregateRelease } },
      },
    });
    const command: IAdmittedAggregateCommand = {
      id: 'cmd_claims_free',
      commandName: 'continueWithoutActor',
      contractVersion: 1,
      payload: '{}',
      aggregateName: 'account',
      aggregateId: 'acc_external',
      aggregateVersion: 1,
      aggregateIndex: 1,
      kind: 'system',
      outcome: null,
    };
    const result = await runInDurableObject(repo, instance =>
      config.managedRuntime.runPromise(
        materializeCommandTx(instance.db, {
          row: command,
          aggregateRelease,
          key: instance.key,
          mode: 'original',
        }).pipe(Effect.provideService(System, localSystem)),
      ),
    );
    if (admission === 'refuse') {
      expect(result?.outcome.result).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'external-refused' },
      });
      expect(executions).toEqual(['guard']);
    } else {
      expect(result?.outcome.result).toEqual({
        _tag: 'Success',
        success: null,
      });
      expect(executions).toEqual(['guard', 'program']);
    }
    expect(result).toMatchObject({
      kind: 'system',
    });
    expect(result).not.toHaveProperty('claims');
  },
);

it.each(['guard', 'program'] as const)(
  'retains an evaluated Aggregate %s refusal and advances replay',
  async phase => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
        .result._tag,
    ).toBe('Success');
    const repo = env.AGGREGATE_VERSION_REPO.getByName(
      'avr_sys_servicePublication/acc_refused/account/2',
    );
    const sourceContract = makeAggregateContractRelease(
      defineAggregateContract('refuseReplay'),
      {
        version: 1,
        payload: {},
        failures: { refused: ContractError.schema({ code: 'replay-refused' }) },
        program: () => Effect.void,
      },
    );
    const localContract = upgradeAggregateContractRelease(sourceContract, {
      version: 2,
      guard: ({ failures }) =>
        phase === 'guard'
          ? failures.refused.make({ message: 'Guard refused replay' })
          : Effect.void,
      program: ({ failures }) =>
        failures.refused.make({ message: 'Program refused replay' }),
    });
    const sourceRelease = makeAggregateRelease(
      { name: 'account' },
      {
        version: 1,
        models: {},
        actors: {},
        system: { refuseReplay: sourceContract },
        external: {},
      },
    );
    const aggregateRelease = makeAggregateRelease(
      { name: 'account' },
      {
        version: 2,
        rebuildFrom: sourceRelease,
        models: {},
        actors: {},
        system: { refuseReplay: localContract },
        external: {},
      },
    );
    const localSystem = makeSystem({
      name: 'replayRefusals',
      aggregates: {
        account: {
          releases: { 1: sourceRelease, 2: aggregateRelease },
        },
      },
    });
    const command: IAdmittedAggregateCommand = {
      id: 'cmd_refused',
      commandName: 'refuseReplay',
      contractVersion: 1,
      payload: '{}',
      aggregateName: 'account',
      aggregateId: 'acc_refused',
      aggregateVersion: 1,
      aggregateIndex: 1,
      kind: 'system',
      outcome: {
        finalizedAt: new Date(1_000),
        result: { _tag: 'Success', success: null },
      },
    };
    const result = await runInDurableObject(repo, instance =>
      config.managedRuntime.runPromise(
        materializeCommandTx(instance.db, {
          row: command,
          aggregateRelease,
          key: instance.key,
          mode: 'replay',
          retainedCommand: null,
        }).pipe(Effect.provideService(System, localSystem)),
      ),
    );
    expect(result?.outcome.result).toMatchObject({
      _tag: 'Failure',
      failure: {
        code: 'replay-refused',
        message:
          phase === 'guard' ? 'Guard refused replay' : 'Program refused replay',
      },
    });
    expect(result?.operations).toEqual([]);
    const state = await runInDurableObject(repo, ({ db, schema }) => ({
      head: db.select().from(schema.materializationHead).all(),
      outbox: db.select().from(schema.aggregateVersionChainOutbox).all(),
    }));
    expect(state.head).toMatchObject([{ aggregateIndex: 1 }]);
    expect(state.outbox.map(row => JSON.parse(row.outcome))).toEqual([
      JSON.parse(JSON.stringify(result?.outcome)),
    ]);
  },
);

for (const failure of [
  'missing',
  'failed',
  'invalid',
  'async',
  'refused',
] as const) {
  it.each(['original', 'replay'] as const)(
    `handles Aggregate ${failure} payload adaptation during %s execution`,
    async mode => {
      const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
      expect(
        (
          await systemRepo.registerSystemSpec({
            spec: makeSystemSpec({ system }),
          })
        ).result._tag,
      ).toBe('Success');
      const repo = env.AGGREGATE_VERSION_REPO.getByName(
        'avr_sys_servicePublication/acc_adapter/account/1',
      );
      let programExecutions = 0;
      const contract = makeAggregateContractRelease(
        defineAggregateContract('adaptPayload'),
        {
          version: 1,
          payload: { value: primitives.integer() },
          program: () =>
            Effect.sync(() => {
              programExecutions += 1;
            }),
        },
      );
      upgradeAggregateContractRelease(contract, {
        version: 2,
        ...(failure === 'missing'
          ? {}
          : {
              down: () =>
                failure === 'refused'
                  ? Effect.succeed(DownAdapterRefused)
                  : failure === 'failed'
                    ? Effect.fail(
                        makeZerospinError('contract-down-adapter-refused'),
                      )
                    : failure === 'invalid'
                      ? Effect.succeed({ value: 1.5 })
                      : Effect.promise(() => Promise.resolve({ value: 0 })),
            }),
      });
      const aggregateRelease = makeAggregateRelease(
        { name: 'account' },
        {
          version: 1,
          models: {},
          actors: {},
          system: { adaptPayload: contract },
          external: {},
        },
      );
      const localSystem = makeSystem({
        name: 'adapterFailures',
        aggregates: {
          account: { releases: { 1: aggregateRelease } },
        },
      });
      const command: IAdmittedAggregateCommand = {
        id: 'cmd_adapter',
        commandName: 'adaptPayload',
        contractVersion: 2,
        payload: '{"value":0}',
        aggregateName: 'account',
        aggregateId: 'acc_adapter',
        aggregateVersion: mode === 'replay' ? 2 : 1,
        aggregateIndex: 1,
        kind: 'system',
        outcome:
          mode === 'replay'
            ? {
                finalizedAt: new Date(1_000),
                result: { _tag: 'Success', success: null },
              }
            : null,
      };
      const exit = await runInDurableObject(repo, instance =>
        config.managedRuntime.runPromise(
          materializeCommandTx(instance.db, {
            row: command,
            aggregateRelease,
            key: instance.key,
            ...(mode === 'original'
              ? { mode }
              : { mode, retainedCommand: null }),
          }).pipe(Effect.provideService(System, localSystem), Effect.exit),
        ),
      );
      if (failure === 'refused' && mode === 'replay') {
        if (!Exit.isSuccess(exit) || exit.value === undefined) {
          expect.fail('Expected a retained release-local refusal');
        }
        expect(exit.value.outcome.result).toMatchObject({
          _tag: 'Failure',
          failure: { code: 'aggregate-contract-unsupported' },
        });
        expect(exit.value.operations).toEqual([]);
        expect(programExecutions).toBe(0);
        const next = await runInDurableObject(repo, instance =>
          config.managedRuntime.runPromise(
            materializeCommandTx(instance.db, {
              row: {
                ...command,
                id: 'cmd_after_refusal',
                contractVersion: 1,
                aggregateIndex: 2,
              },
              aggregateRelease,
              key: instance.key,
              mode: 'replay',
              retainedCommand: null,
            }).pipe(Effect.provideService(System, localSystem)),
          ),
        );
        expect(next?.outcome.result._tag).toBe('Success');
        expect(programExecutions).toBe(1);
        expect(
          await runInDurableObject(repo, ({ db, schema }) =>
            db.select().from(schema.materializationHead).all(),
          ),
        ).toMatchObject([{ aggregateIndex: 2 }]);
        return;
      }
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit) && failure === 'async') {
        expect(
          exit.cause.reasons.some(
            reason =>
              Cause.isDieReason(reason) &&
              Cause.isAsyncFiberError(reason.defect),
          ),
        ).toBe(true);
      }
      if (Exit.isFailure(exit) && failure !== 'async') {
        const reason = exit.cause.reasons[0];
        expect(
          reason !== undefined && Cause.isFailReason(reason)
            ? reason.error
            : undefined,
        ).toMatchObject({
          code:
            failure === 'refused'
              ? 'contract-down-adapter-refused'
              : failure === 'missing'
                ? 'contract-payload-adapter-missing'
                : failure === 'failed'
                  ? 'contract-payload-adapter-failed'
                  : 'contract-payload-adapter-output-invalid',
        });
      }
      expect(programExecutions).toBe(0);
      expect(
        await runInDurableObject(repo, ({ db, schema }) => ({
          head: db.select().from(schema.materializationHead).all(),
          outbox: db.select().from(schema.aggregateVersionChainOutbox).all(),
        })),
      ).toEqual({ head: [], outbox: [] });
    },
  );
}

const settleExternal = (
  db: Parameters<typeof recordExternalOutcomeAndAdmitCommandTx>[0],
  props: Omit<
    Parameters<typeof recordExternalOutcomeAndAdmitCommandTx>[1],
    'build'
  >,
) =>
  recordExternalOutcomeAndAdmitCommandTx(db, {
    ...props,
    build: (version, input) =>
      Effect.flatMap(System, runtime =>
        runExternalContinuation(
          runtime.aggregates[props.key.aggregateName]?.releases[version],
          input,
        ),
      ),
  });

describe('Aggregate external operation outbox', () => {
  let source: ReturnType<typeof env.AGGREGATE_CHAIN.getByName>;
  const original = Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
    id: 'cmd_aggregate_external_parent',
    commandName: 'dispatchWork',
    contractVersion: 1,
    payload: JSON.stringify({
      reservationId: 'rsv_parent',
      expiresAt: 60_000,
      aggregateId: 'acc_destination',
    }),
    aggregateName: 'account',
    aggregateId: 'acc_external',
    aggregateVersion: 1,
    kind: 'actor',
    actorName: 'viewer',
    actorVersion: 1,
    claims: { aggregateId: 'acc_external', viewerId: 'one' },
    nodeId: 'node_aggregate_external',
    sessionName: 'viewer',
    pushIndex: 1,
  });
  const success: IExternalOutcome = {
    _tag: 'Success',
    success: null,
    recordedAt: new Date('2026-10-23T12:00:01Z'),
  };
  const failure: IExternalOutcome = {
    _tag: 'Failure',
    failure: {
      _tag: 'ExternalRequestFailure',
      code: 'external-request-failed',
      message: 'Provider request failed',
    },
    recordedAt: new Date('2026-10-23T12:00:02Z'),
  };
  const prepareParent = () =>
    runInDurableObject(source, async ({ db, key }, { storage }) => {
      // This trusted internal admission proves retained input, not Actor authorization.
      const admitted = await config.managedRuntime.runPromise(
        makeTx('fixture.appendAggregateParent')(function* (
          tx: ITx<typeof aggregateChainDbConfig>,
        ) {
          return yield* appendAggregateCommand(tx, original);
        })(db),
      );
      const operations: Extract<
        IEvaluatedAggregateCommand['operations'][number],
        { operationName: 'external' }
      >[] = [];
      for (const operationIndex of [2, 7]) {
        const prepared = await config.managedRuntime.runPromise(
          aggregateExternalProbeDefinition1.externalOperation
            .make({
              payload: {
                reservationId: `rsv_aggregate_${operationIndex}`,
                finalizer: false,
              },
            })
            .pipe(
              Effect.flatMap(operation =>
                prepareAggregateExternalOperation({
                  aggregateRelease: system.aggregates.account.releases[1],
                  initiatingCommandId: admitted.id,
                  operationIndex,
                  operation,
                }),
              ),
            ),
        );
        operations.push({
          operationName: 'external',
          operationIndex,
          externalCommandId: prepared.externalCommandId,
          externalContractName: prepared.externalContractName,
          externalContractVersion: prepared.externalContractVersion,
          payload: prepared.payload,
        });
      }
      await storage.deleteAlarm();
      const outcome: IEvaluatedAggregateCommand['outcome'] = {
        result: { _tag: 'Success', success: null },
        finalizedAt: new Date('2026-10-23T12:00:00Z'),
      };
      const evaluated: IEvaluatedAggregateCommand = {
        ...admitted,
        outcome,
        operations,
        dispositionChainHash: advanceDispositionChainHash({
          previousDispositionChainHash: genesisDispositionChainHash(),
          aggregateIndex: admitted.aggregateIndex,
          commandId: admitted.id,
          outcome,
        }),
      };
      expect(key.aggregateId).toBe(original.aggregateId);
      return evaluated;
    });

  beforeEach(async () => {
    await reset();
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
        .result._tag,
    ).toBe('Success');
    expect((await systemRepo.initialize()).result._tag).toBe('Success');
    source = env.AGGREGATE_CHAIN.getByName(
      'ac_sys_servicePublication/acc_external/account',
    );
    expect((await source.executeCommandsThrough(0)).result._tag).toBe(
      'Success',
    );
    await runDurableObjectAlarm(source);
    await runInDurableObject(source, (_, { storage }) => storage.deleteAlarm());
  });

  it('retains frozen work and its observation atomically and preserves sparse evaluated history after settlement', async () => {
    const evaluated = await prepareParent();
    const [first, second] = evaluated.operations;
    if (
      first?.operationName !== 'external' ||
      second?.operationName !== 'external'
    ) {
      expect.fail('Expected two external operations');
    }
    await runInDurableObject(
      source,
      async ({ db, schema, key }, { storage }) => {
        const columns = storage.sql
          .exec<{ name: string; type: string; notnull: number; pk: number }>(
            'PRAGMA table_info(externalOperationOutbox)',
          )
          .toArray();
        expect(
          columns.map(column => ({
            name: column.name,
            type: column.type.toUpperCase(),
            required: column.notnull,
            pk: column.pk,
          })),
        ).toEqual([
          { name: 'externalContractName', type: 'TEXT', required: 1, pk: 0 },
          { name: 'continuationFailure', type: 'TEXT', required: 0, pk: 0 },
          {
            name: 'externalContractVersion',
            type: 'INTEGER',
            required: 1,
            pk: 0,
          },
          { name: 'payload', type: 'TEXT', required: 1, pk: 0 },
          { name: 'externalCommandId', type: 'TEXT', required: 1, pk: 0 },
          { name: 'originCommandId', type: 'TEXT', required: 1, pk: 0 },
          { name: 'aggregateVersion', type: 'INTEGER', required: 1, pk: 0 },
          { name: 'externalOutcome', type: 'TEXT', required: 0, pk: 0 },
        ]);
        const indexes = storage.sql
          .exec<{ name: string; unique: number }>(
            'PRAGMA index_list(externalOperationOutbox)',
          )
          .toArray();
        expect(indexes).toHaveLength(1);
        expect(indexes[0]?.unique).toBe(1);
        expect(
          storage.sql
            .exec<{ name: string }>(`PRAGMA index_info('${indexes[0]?.name}')`)
            .toArray()
            .map(column => column.name),
        ).toEqual(['externalCommandId']);
        expect(() =>
          recordOriginalCommandOutcomeTx(
            db,
            [1],
            [
              {
                ...evaluated,
                operations: [
                  first,
                  { ...second, externalCommandId: first.externalCommandId },
                ],
              },
            ],
            key,
          ),
        ).toThrow();
        expect(
          db
            .select({ outcome: schema.commands.outcome })
            .from(schema.commands)
            .all(),
        ).toEqual([{ outcome: null }]);
        expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
          [],
        );
        expect(db.select().from(schema.commandProgress).all()).toMatchObject([
          { singleton: 1, admittedThroughIndex: 1, finalizedThroughIndex: 0 },
        ]);
        if (original.kind !== 'actor') {
          expect.fail('Expected Actor original');
        }
        await config.managedRuntime.runPromise(
          makeTx('fixture.appendLaterAggregateCommand')(function* (
            tx: ITx<typeof aggregateChainDbConfig>,
          ) {
            return yield* appendAggregateCommand(tx, {
              ...original,
              id: makeNodeCommandId('node_aggregate_external', 2),
              pushIndex: 2,
            });
          })(db),
        );
        recordOriginalCommandOutcomeTx(db, [1], [evaluated], key);
        expect(db.select().from(schema.commandProgress).all()).toMatchObject([
          { singleton: 1, admittedThroughIndex: 2, finalizedThroughIndex: 1 },
        ]);
        expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
          evaluated.operations.map(operation => {
            if (operation.operationName !== 'external') {
              throw new Error('Expected an external operation');
            }
            return {
              continuationFailure: null,
              externalContractName: operation.externalContractName,
              externalContractVersion: 1,
              payload: JSON.stringify(operation.payload),
              externalCommandId: operation.externalCommandId,
              originCommandId: original.id,
              aggregateVersion: 1,
              externalOutcome: null,
            };
          }),
        );
        await config.managedRuntime.runPromise(
          settleExternal(db, {
            key,
            externalCommandId: first.externalCommandId,
            externalOutcome: success,
          }),
        );
        const remaining = db
          .select()
          .from(schema.externalOperationOutbox)
          .all();
        const progress = db.select().from(schema.commandProgress).all();
        expect(progress).toMatchObject([
          { singleton: 1, admittedThroughIndex: 3, finalizedThroughIndex: 1 },
        ]);
        recordOriginalCommandOutcomeTx(db, [1], [evaluated], key);
        expect(db.select().from(schema.commandProgress).all()).toEqual(
          progress,
        );
        expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
          remaining,
        );
        expect(() =>
          recordOriginalCommandOutcomeTx(
            db,
            [1],
            [{ ...evaluated, payload: '{}' }],
            key,
          ),
        ).toThrowError(
          expect.objectContaining({
            code: 'aggregate-original-receipt-identity-mismatch',
          }),
        );
        expect(() =>
          recordOriginalCommandOutcomeTx(
            db,
            [1],
            [
              {
                ...evaluated,
                outcome: {
                  ...evaluated.outcome,
                  finalizedAt: new Date(
                    evaluated.outcome.finalizedAt.getTime() + 1,
                  ),
                },
              },
            ],
            key,
          ),
        ).toThrowError(
          expect.objectContaining({
            code: 'aggregate-original-output-mismatch',
          }),
        );
        expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
          remaining,
        );
        expect(db.select().from(schema.commandProgress).all()).toEqual(
          progress,
        );
      },
    );
    const history = await Effect.runPromise(
      getAggregateVersionChain({
        key: {
          systemId: 'sys_servicePublication',
          aggregateId: 'acc_external',
          aggregateName: 'account',
          aggregateVersion: 1,
        },
      }),
    );
    expect(
      (await history.appendEvaluatedCommands({ commands: [evaluated] })).result
        ._tag,
    ).toBe('Success');
    expect(
      (await history.getEvaluatedCommand({ aggregateIndex: 1 })).result,
    ).toEqual({ _tag: 'Success', success: evaluated });
    expect(
      evaluated.operations.map(operation => operation.operationIndex),
    ).toEqual([2, 7]);
    expect(
      (await history.appendEvaluatedCommands({ commands: [evaluated] })).result
        ._tag,
    ).toBe('Success');
    expect(
      (
        await history.appendEvaluatedCommands({
          commands: [
            { ...evaluated, operations: [first, { ...second, payload: {} }] },
          ],
        })
      ).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-evaluated-command-mismatch' },
    });
    expect(
      (await history.getEvaluatedCommand({ aggregateIndex: 1 })).result,
    ).toEqual({ _tag: 'Success', success: evaluated });
  });

  it('retains observations across SQL faults and atomically admits completion with pending deletion', async () => {
    const evaluated = await prepareParent();
    await runInDurableObject(source, async ({ db, schema, key }) => {
      recordOriginalCommandOutcomeTx(db, [1], [evaluated], key);
      const pending = db.select().from(schema.externalOperationOutbox).all();
      const commands = db.select().from(schema.commands).all();
      const first = pending[0];
      if (first === undefined) {
        expect.fail('Expected pending work');
      }
      for (const trigger of [
        sql`CREATE TRIGGER fixture_external_settlement BEFORE INSERT ON commands BEGIN SELECT RAISE(ABORT, 'fixture-admission-failure'); END`,
        sql`CREATE TRIGGER fixture_external_settlement BEFORE DELETE ON externalOperationOutbox BEGIN SELECT RAISE(ABORT, 'fixture-deletion-failure'); END`,
      ]) {
        db.run(trigger);
        await expect(
          config.managedRuntime.runPromise(
            settleExternal(db, {
              key,
              externalCommandId: first.externalCommandId,
              externalOutcome: success,
            }),
          ),
        ).rejects.toThrow();
        expect(db.select().from(schema.commands).all()).toEqual(commands);
        expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
          pending.map(row =>
            row.externalCommandId === first.externalCommandId
              ? { ...row, externalOutcome: JSON.stringify(success) }
              : row,
          ),
        );
        db.run(sql`DROP TRIGGER fixture_external_settlement`);
      }
      for (const [index, externalOutcome] of [success, failure].entries()) {
        const row = pending[index];
        if (row === undefined) {
          expect.fail('Expected pending invocation');
        }
        const admitted = await config.managedRuntime.runPromise(
          settleExternal(db, {
            key,
            externalCommandId: row.externalCommandId,
            externalOutcome,
          }),
        );
        expect(admitted).toEqual({
          id: row.externalCommandId,
          commandName: 'recordAggregateProbe',
          contractVersion: 1,
          payload: JSON.stringify({
            reservationId: `rsv_aggregate_${index === 0 ? 2 : 7}`,
            observation:
              externalOutcome._tag === 'Success'
                ? 'completed'
                : externalOutcome.failure.code,
          }),
          aggregateVersion: 1,
          aggregateName: 'account',
          aggregateId: original.aggregateId,
          kind: 'system',
          aggregateIndex: index + 2,
        });
        const retained = db.select().from(schema.commands).all();
        const remaining = db
          .select()
          .from(schema.externalOperationOutbox)
          .all();
        expect(retained.at(-1)?.outcome).toBeNull();
        expect(
          await config.managedRuntime.runPromise(
            settleExternal(db, {
              key,
              externalCommandId: row.externalCommandId,
              externalOutcome:
                externalOutcome._tag === 'Success' ? failure : success,
            }),
          ),
        ).toBeUndefined();
        expect(db.select().from(schema.commands).all()).toEqual(retained);
        expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
          remaining,
        );
      }
    });
  });

  it('retains exact-release observations after settlement rollback and retries admission after restart', async () => {
    let firstActivation: object | undefined;
    const firstId = 'cmd_aggregate_queue_1';
    const secondId = 'cmd_aggregate_queue_2';
    const frozen = await runInDurableObject(source, ({ db, schema }) => {
      db.insert(schema.externalOperationOutbox)
        .values(
          [1, 2].map(
            (version): typeof schema.externalOperationOutbox.$inferInsert => ({
              externalCommandId: version === 1 ? firstId : secondId,
              externalContractName: 'probeAggregateReservationWork',
              externalContractVersion: version,
              aggregateVersion: version,
              originCommandId: 'cmd_external_parent',
              payload: JSON.stringify({
                reservationId: `rsv_aggregate_queue_${version}`,
                finalizer: version === 1,
              }),
            }),
          ),
        )
        .run();
      return db.select().from(schema.externalOperationOutbox).all();
    });
    await runInDurableObject(source, async (instance, state) => {
      firstActivation = instance;
      const { db, schema } = instance;
      const observed = createExecutionContext();
      const nativeWaitUntil = state.waitUntil;
      state.waitUntil = promise => {
        observed.waitUntil(promise);
        nativeWaitUntil.call(state, promise);
      };
      try {
        // The real empty original drain invokes its completion hook and starts external work.
        expect((await instance.executeCommandsThrough(0)).result._tag).toBe(
          'Success',
        );
        await expect
          .poll(
            async () =>
              (await readAggregateExternalAttempts()).find(
                attempt => attempt.contractVersion === 1,
              )?.finalizing,
          )
          .toBe(true);
        await expect
          .poll(
            async () =>
              (await instance.getAggregateCommand({ aggregateIndex: 1 }))
                .result,
          )
          .toMatchObject({
            _tag: 'Success',
            success: {
              id: secondId,
              aggregateVersion: 2,
              commandName: 'recordVersionedAggregateProbe',
              contractVersion: 1,
              payload: JSON.stringify({
                reservationId: 'rsv_aggregate_queue_2',
                observation: 'provider 2',
              }),
            },
          });
        expect(
          db
            .select()
            .from(schema.commands)
            .all()
            .some(row => row.id === firstId),
        ).toBe(false);
        await instance.onAlarm();
        expect(await readAggregateExternalAttempts()).toHaveLength(2);
        db.run(
          sql`CREATE TRIGGER fixture_queue_settlement BEFORE DELETE ON externalOperationOutbox BEGIN SELECT RAISE(ABORT, 'fixture-queue-settlement'); END`,
        );
        await releaseAggregateExternalProbeFinalizers();
        // Await the actual request, recording failure and reconciliation before inspecting rollback.
        await waitOnExecutionContext(observed);
        expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
          frozen
            .filter(row => row.externalCommandId === firstId)
            .map(row => ({ ...row, externalOutcome: expect.any(String) })),
        );
        expect(
          db
            .select()
            .from(schema.commands)
            .all()
            .some(row => row.id === firstId),
        ).toBe(false);
        expect(await state.storage.getAlarm()).not.toBeNull();
        db.run(sql`DROP TRIGGER fixture_queue_settlement`);
      } finally {
        state.waitUntil = nativeWaitUntil;
        await releaseAggregateExternalProbeFinalizers();
      }
    });
    await abortAllDurableObjects();
    source = env.AGGREGATE_CHAIN.getByName(
      'ac_sys_servicePublication/acc_external/account',
    );
    await runInDurableObject(source, async instance => {
      expect(instance).not.toBe(firstActivation);
      const { db, schema } = instance;
      expect(await readAggregateExternalAttempts()).toHaveLength(2);
      await instance.alarm();
      expect(await readAggregateExternalAttempts()).toHaveLength(2);
      await expect
        .poll(() => db.select().from(schema.externalOperationOutbox).all())
        .toEqual([]);
      expect(
        (await instance.getAggregateCommand({ aggregateIndex: 2 })).result,
      ).toMatchObject({
        _tag: 'Success',
        success: {
          id: firstId,
          aggregateName: 'account',
          aggregateId: original.aggregateId,
          aggregateVersion: 1,
          contractVersion: 1,
          kind: 'system',
          commandName: 'recordAggregateProbe',
          payload: JSON.stringify({
            reservationId: 'rsv_aggregate_queue_1',
            observation: 'completed',
          }),
        },
      });
    });
    const successor = await Effect.runPromise(
      getAggregateVersionChain({
        key: {
          systemId: 'sys_servicePublication',
          aggregateId: 'acc_external',
          aggregateName: 'account',
          aggregateVersion: 2,
        },
      }),
    );
    await expect
      .poll(
        async () =>
          (await successor.getEvaluatedCommand({ aggregateIndex: 2 })).result,
      )
      .toMatchObject({
        _tag: 'Success',
        success: {
          id: firstId,
          commandName: 'recordAggregateProbe',
          outcome: { result: { _tag: 'Success' } },
        },
      });
    expect(await readAggregateExternalAttempts()).toHaveLength(2);
  }, 20_000);

  it('retains unavailable exact Aggregate releases, contract versions and invalid payloads without calling another provider', async () => {
    await runInDurableObject(source, async (instance, state) => {
      const { db, schema } = instance;
      const originalRow = {
        continuationFailure: null,
        externalCommandId: 'cmd_aggregate_exact',
        externalContractName: 'probeAggregateReservationWork',
        externalContractVersion: 1,
        aggregateVersion: 1,
        originCommandId: 'cmd_external_parent',
        externalOutcome: null,
        payload: JSON.stringify({
          reservationId: 'rsv_aggregate_exact',
          finalizer: false,
        }),
      };
      const pending: (typeof schema.externalOperationOutbox.$inferInsert)[] = [
        {
          ...originalRow,
          externalCommandId: 'cmd_aggregate_missing_release',
          aggregateVersion: 3,
        },
        {
          ...originalRow,
          externalCommandId: 'cmd_aggregate_missing_contract',
          externalContractVersion: 2,
        },
        {
          ...originalRow,
          externalCommandId: 'cmd_aggregate_invalid_payload',
          payload: '{}',
        },
      ];
      db.insert(schema.externalOperationOutbox).values(pending).run();
      const observed = createExecutionContext();
      const nativeWaitUntil = state.waitUntil;
      state.waitUntil = promise => {
        observed.waitUntil(promise);
        nativeWaitUntil.call(state, promise);
      };
      try {
        await instance.onAlarm();
        await waitOnExecutionContext(observed);
      } finally {
        state.waitUntil = nativeWaitUntil;
      }
      expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
        pending,
      );
      expect(db.select().from(schema.commands).all()).toEqual([]);
      expect(await state.storage.getAlarm()).not.toBeNull();
      expect(await readAggregateExternalAttempts()).toEqual([]);
    });
  }, 20_000);
});
