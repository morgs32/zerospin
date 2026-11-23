import { AggregateSocketServerMessageSchema } from '@zerospin/core/aggregateSession/AggregateSocketProtocolSchema';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { System } from '@zerospin/core/system/System';
import type { IRepoTableData } from '@zerospin/core/system/types';
import type { IRpcEnvelope } from '@zerospin/logger';
import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { afterEach, expect, it, vi } from 'vitest';

import { AggregateActorVersionArchive } from '../../src/AggregateActorVersionArchive/AggregateActorVersionArchive.ts';
import { aggregateActorVersionArchiveNameUtils } from '../../src/AggregateActorVersionArchive/aggregateActorVersionArchiveName.ts';
import { AggregateActorVersionChain } from '../../src/AggregateActorVersionChain/AggregateActorVersionChain.ts';
import { aggregateActorVersionChainNameUtils } from '../../src/AggregateActorVersionChain/aggregateActorVersionChainName.ts';
import { aggregateActorVersionRepoNameUtils } from '../../src/AggregateActorVersionRepo/aggregateActorVersionRepoName.ts';
import type { IAdmittedAggregateCommand } from '../../src/AggregateChain/types.ts';
import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../../src/aggregateDispositionChainHash/aggregateDispositionChainHash.ts';
import { aggregateProjectionDbConfig } from '../../src/aggregateProjection/aggregateProjectionDbConfig.ts';
import { AggregateExposedPublicationSchema } from '../../src/aggregateSessionChain/aggregateExposedPublication.ts';
import { AggregateSessionChain } from '../../src/aggregateSessionChain/AggregateSessionChain.ts';
import { AggregateVersionArchive } from '../../src/AggregateVersionArchive/AggregateVersionArchive.ts';
import { AggregateVersionChain } from '../../src/AggregateVersionChain/AggregateVersionChain.ts';
import { EvaluatedAggregateCommandSchema } from '../../src/AggregateVersionChain/evaluatedAggregateCommand.ts';
import { requireAuthoredWorkerConfig } from '../../src/workerConfiguration/workerConfiguration.ts';

import { system } from './system.ts';

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

it('rejects a missing local Aggregate Node at socket resume before replay', async () => {
  const previous = env.ZEROSPIN_LOCAL_DEVELOPMENT;
  env.ZEROSPIN_LOCAL_DEVELOPMENT = 'true';
  let socket: WebSocket | null = null;
  try {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (
        await systemRepo.registerSystemSpec({
          spec: makeSystemSpec({ system }),
        })
      ).result._tag,
    ).toBe('Success');
    expect((await systemRepo.initialize()).result._tag).toBe('Success');
    const key = {
      systemId: 'sys_servicePublication',
      aggregateId: 'acc_reset',
      aggregateName: 'account',
      aggregateVersion: 1,
      actorName: 'viewer',
      actorVersion: 1,
      actorPath: '/one',
    };
    const claims = { aggregateId: key.aggregateId, viewerId: 'one' };
    const history = env.AGGREGATE_ACTOR_VERSION_CHAIN.getByName(
      Effect.runSync(aggregateActorVersionChainNameUtils.makeName(key)),
    );
    const actor = system.aggregates.account.releases[1].actors.viewer;
    const response = await history.fetch(
      new Request('https://actor.example/connect', {
        headers: {
          Upgrade: 'websocket',
          'x-zerospin-producer': JSON.stringify('node_reset'),
          'x-zerospin-claims': JSON.stringify(claims),
          'x-zerospin-aggregate-session-lock': JSON.stringify(
            makeAggregateSessionLock({
              aggregateName: 'account',
              aggregateVersion: 1,
              actorName: 'viewer',
              actorVersion: 1,
              sessionName: 'viewer',
              claimsSchema: actor.identity.claimsSchema,
              contracts: actor.contracts,
              models: actor.exposedModels,
              modelNames: [],
            }),
          ),
        },
      }),
    );
    socket = response.webSocket;
    if (socket === null) expect.fail('Expected an Actor WebSocket');
    const frames: (typeof AggregateSocketServerMessageSchema.Type)[] = [];
    socket.addEventListener('message', event => {
      frames.push(
        Schema.decodeUnknownSync(
          Schema.fromJsonString(AggregateSocketServerMessageSchema),
        )(event.data),
      );
    });
    socket.accept();
    socket.send(
      JSON.stringify({
        type: 'resume',
        nodeId: 'node_reset',
        outcomeIndex: 0,
        aggregateIndex: 0,
        dispositionChainHash: genesisDispositionChainHash(),
      }),
    );
    await expect
      .poll(() => frames.at(-1))
      .toEqual({
        type: 'state-required',
        reason: 'node-producer-not-registered',
      });
  } finally {
    if (socket?.readyState === WebSocket.OPEN) socket.close();
    if (previous === undefined) delete env.ZEROSPIN_LOCAL_DEVELOPMENT;
    else env.ZEROSPIN_LOCAL_DEVELOPMENT = previous;
  }
});

it('initializes AggregateChain with one progress table and no legacy history tables', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_handoff/account',
  );
  expect((await source.awaitStartup()).result._tag).toBe('Success');
  await runInDurableObject(source, ({ db, schema }, { storage }) => {
    expect(db.select().from(schema.commandProgress).all()).toEqual([
      {
        singleton: 1,
        admittedThroughIndex: 0,
        finalizedThroughIndex: 0,
        compactedThroughIndex: 0,
      },
    ]);
    expect(
      storage.sql
        .exec<{ name: string }>('PRAGMA table_info(commandProgress)')
        .toArray()
        .map(column => column.name),
    ).toEqual([
      'singleton',
      'admittedThroughIndex',
      'finalizedThroughIndex',
      'compactedThroughIndex',
    ]);
    expect(
      storage.sql
        .exec<{
          name: string;
        }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('admissionPosition', 'finalizedPosition', 'canonicalHistory')",
        )
        .toArray(),
    ).toEqual([]);
  });
});

it('recovers a delivered Aggregate original after a lost acknowledgement without reading it from AggregateChain', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const repo = env.AGGREGATE_VERSION_REPO.getByName(
    'avr_sys_servicePublication/acc_retry/account/1',
  );
  using subscriber = await repo.finalizeCommandSubscriber;
  // This subscriber receives the full pending input even if AggregateChain cannot supply it again.
  const command: IAdmittedAggregateCommand = {
    id: 'cmd_retry',
    aggregateName: 'account',
    aggregateId: 'acc_retry',
    aggregateVersion: 1,
    aggregateIndex: 1,
    commandName: 'receiveCommand',
    contractVersion: 1,
    kind: 'system',
    payload: '{}',
    outcome: null,
  };
  expect(
    (
      await subscriber.receive([
        { ...command, aggregateIndex: 2, contractVersion: 0 },
      ])
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-original-delivery-invalid' },
  });
  const { result } = await subscriber.receive([command]);
  if (result._tag !== 'Success') expect.fail(JSON.stringify(result));
  const [evaluated] = result.success;
  if (!evaluated) expect.fail('Expected the evaluated Aggregate command');
  expect(evaluated.outcome.result._tag).toBe('Success');
  expect((await subscriber.receive([command])).result).toEqual(result);
  expect(
    (await subscriber.receive([{ ...command, payload: '{"changed":true}' }]))
      .result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-command-identity-mismatch' },
  });
  expect((await subscriber.receive([evaluated])).result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-original-delivery-invalid' },
  });
});

it('compacts Aggregate commands only after acknowledged VersionChain publication', async () => {
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result._tag,
  ).toBe('Success');
  const archive = env.AGGREGATE_VERSION_ARCHIVE.getByName(
    'ava_sys_servicePublication/acc_handoff/account/1/1',
  );
  const history = env.AGGREGATE_VERSION_CHAIN.getByName(
    'avc_sys_servicePublication/acc_handoff/account/1',
  );
  const avr = env.AGGREGATE_VERSION_REPO.getByName(
    'avr_sys_servicePublication/acc_handoff/account/1',
  );
  expect((await archive.awaitStartup()).result._tag).toBe('Success');
  await runInDurableObject(archive, instance => {
    vi.spyOn(instance.db, 'transaction').mockImplementation(() => {
      throw new Error('Archive unavailable');
    });
  });
  const append = AggregateVersionChain.prototype.appendEvaluatedCommands;
  const dropAvcReply = vi
    .spyOn(AggregateVersionChain.prototype, 'appendEvaluatedCommands')
    .mockImplementation(async function (this: AggregateVersionChain, props) {
      const reply = await append.call(this, props);
      if (
        this.key.aggregateId === 'acc_handoff' &&
        reply.result._tag === 'Success'
      ) {
        throw new Error('Lost AVC reply after the published head committed');
      }
      return reply;
    });
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_handoff/account',
  );
  expect((await source.awaitStartup()).result._tag).toBe('Success');
  const rows = async (tableName: string) => {
    const { result }: IRpcEnvelope<IRepoTableData> =
      await source.getRepoTableRows({ tableName });
    if (result._tag !== 'Success') expect.fail(JSON.stringify(result));
    return result.success.rows;
  };
  const delivery = {
    source: { systemId: 'sys_servicePublication', serviceName: 'dispatcher' },
    position: { sourceIndex: 9, operationIndex: 4 },
    command: {
      id: 'cmd_handoff' as const,
      aggregateName: 'account',
      aggregateId: 'acc_handoff',
      aggregateVersion: 1,
      commandName: 'receiveCommand',
      contractVersion: 1,
      payload: '{}',
      kind: 'system' as const,
    },
  };
  expect((await source.admitFromServiceChain(delivery)).result).toEqual({
    _tag: 'Success',
    success: {
      acknowledgedSourceIndex: 9,
      acknowledgedOperationIndex: 4,
      destinationIndex: 1,
    },
  });
  expect((await source.executeCommandsThrough(1)).result._tag).toBe('Success');
  expect(
    (await history.getEvaluatedCommandPage({ afterIndex: 0 })).result,
  ).toEqual({ _tag: 'Success', success: { rows: [], lastIndex: 0 } });
  expect(
    await runInDurableObject(avr, ({ db, schema }) =>
      db
        .select()
        .from(schema.aggregateVersionChainOutbox)
        .all()
        .map(row => row.aggregateIndex),
    ),
  ).toEqual([1]);
  expect((await rows('commandProgress'))[0]).toMatchObject({
    finalizedThroughIndex: 1,
    compactedThroughIndex: 0,
  });
  await runInDurableObject(archive, instance => {
    vi.mocked(instance.db.transaction).mockRestore();
  });
  await runDurableObjectAlarm(avr).catch(() => undefined);
  await expect
    .poll(
      async () =>
        (await history.getEvaluatedCommandPage({ afterIndex: 0 })).result,
    )
    .toMatchObject({ _tag: 'Success', success: { lastIndex: 1 } });
  expect(
    await runInDurableObject(avr, ({ db, schema }) =>
      db
        .select()
        .from(schema.aggregateVersionChainOutbox)
        .all()
        .map(row => row.aggregateIndex),
    ),
  ).toEqual([1]);
  expect((await rows('replaySubscribers'))[0]).toMatchObject({
    aggregateVersion: 1,
    acknowledgedAggregateIndex: 0,
  });
  dropAvcReply.mockRestore();
  await evictDurableObject(history);
  await runDurableObjectAlarm(avr);
  await source.onAlarm();
  await expect
    .poll(async () => ({
      replay: (await rows('replaySubscribers'))[0],
      progress: await rows('commandProgress'),
      local: await rows('commands'),
    }))
    .toEqual({
      replay: {
        aggregateVersion: 1,
        initializationThroughIndex: 0,
        acknowledgedAggregateIndex: 1,
      },
      progress: [
        {
          singleton: 1,
          admittedThroughIndex: 1,
          finalizedThroughIndex: 1,
          compactedThroughIndex: 1,
        },
      ],
      local: [],
    });
  expect(
    await runInDurableObject(avr, ({ db, schema }) =>
      db.select().from(schema.aggregateVersionChainOutbox).all(),
    ),
  ).toEqual([]);
  expect(
    (await archive.getEvaluatedCommand({ aggregateIndex: 1 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { id: 'cmd_handoff', aggregateIndex: 1 },
  });
  await evictDurableObject(source);
  const retained = (await source.getAggregateCommand({ aggregateIndex: 1 }))
    .result;
  expect(retained).toMatchObject({
    _tag: 'Success',
    success: {
      id: 'cmd_handoff' as const,
      aggregateIndex: 1,
      outcome: { finalizedAt: expect.any(Date) },
    },
  });
  expect(
    (
      await source.admitFromServiceChain({
        ...delivery,
        command: { ...delivery.command, payload: '{"changed":true}' },
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-recorded-command-conflict' },
  });
  expect(await rows('commandProgress')).toEqual([
    {
      singleton: 1,
      admittedThroughIndex: 1,
      finalizedThroughIndex: 1,
      compactedThroughIndex: 1,
    },
  ]);
  expect(
    (await history.getEvaluatedCommandPage({ afterIndex: 0, maxIndex: 1 }))
      .result,
  ).toMatchObject({
    _tag: 'Success',
    success: { lastIndex: 1, rows: [{ id: 'cmd_handoff' }] },
  });

  await runInDurableObject(archive, instance => {
    vi.spyOn(instance.db, 'transaction').mockImplementation(() => {
      throw new Error('Archive unavailable');
    });
  });
  const second = 'cmd_handoff_suffix';
  expect(
    (
      await source.admitFromServiceChain({
        ...delivery,
        position: { sourceIndex: 10, operationIndex: 4 },
        command: { ...delivery.command, id: second },
      })
    ).result._tag,
  ).toBe('Success');
  expect((await source.executeCommandsThrough(2)).result._tag).toBe('Success');
  using fanout = await source.replayCommandsFanout;
  expect(
    (await fanout.getPage({ afterIndex: 0, maxIndex: 2 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { lastIndex: 2, rows: [{ aggregateIndex: 1, id: 'cmd_handoff' }] },
  });
  expect(
    (await fanout.getPage({ afterIndex: 1, maxIndex: 2 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { lastIndex: 2, rows: [{ aggregateIndex: 2, id: second }] },
  });
});

it('rolls Aggregate Archives over without losing retries, checkpoints, or archived pages after eviction', async () => {
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result._tag,
  ).toBe('Success');
  const history = env.AGGREGATE_VERSION_CHAIN.getByName(
    'avc_sys_servicePublication/acc_archive/account/1',
  );
  const firstArchive = env.AGGREGATE_VERSION_ARCHIVE.getByName(
    'ava_sys_servicePublication/acc_archive/account/1/1',
  );
  let previousDispositionChainHash = genesisDispositionChainHash();
  const commands = [1, 2, 3].map(aggregateIndex => {
    const id = `cmd_archive_${aggregateIndex}`;
    const outcome = {
      result: { _tag: 'Success' as const, success: null },
      finalizedAt: new Date(2_000 + aggregateIndex),
    };
    const dispositionChainHash = advanceDispositionChainHash({
      previousDispositionChainHash,
      aggregateIndex,
      commandId: id,
      outcome,
    });
    previousDispositionChainHash = dispositionChainHash;
    return Schema.decodeUnknownSync(
      Schema.toType(EvaluatedAggregateCommandSchema),
    )({
      aggregateId: 'acc_archive',
      aggregateName: 'account',
      aggregateVersion: 1,
      id,
      aggregateIndex,
      commandName: 'receiveCommand',
      contractVersion: 1,
      payload: '{}',
      kind: 'system',
      outcome,
      dispositionChainHash,
      operations: [],
    });
  });
  // The first Archive committed index 1, but AVC has not received that acknowledgement.
  expect(
    (await firstArchive.appendEvaluatedCommands({ commands: [commands[0]!] }))
      .result._tag,
  ).toBe('Success');
  await runInDurableObject(firstArchive, instance => {
    vi.spyOn(instance.db, 'transaction').mockImplementationOnce(() => {
      throw new Error('Failed query: insert into commands', {
        cause: new Error('database or disk is full: SQLITE_FULL'),
      });
    });
  });
  const secondArchive = env.AGGREGATE_VERSION_ARCHIVE.getByName(
    'ava_sys_servicePublication/acc_archive/account/1/2',
  );
  expect((await secondArchive.awaitStartup()).result._tag).toBe('Success');
  await runInDurableObject(secondArchive, instance => {
    vi.spyOn(instance.db, 'transaction').mockImplementationOnce(() => {
      throw new Error('Successor Archive unavailable');
    });
  });
  expect(
    (await history.appendEvaluatedCommands({ commands })).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-version-archive-append-failed' },
  });
  expect(
    (await history.getEvaluatedCommandPage({ afterIndex: 0 })).result,
  ).toEqual({ _tag: 'Success', success: { rows: [], lastIndex: 0 } });
  const unpublished = await runInDurableObject(history, instance =>
    instance.actorVersionChainFanout.getPage({ afterIndex: 0 }),
  );
  expect(unpublished.result).toEqual({
    _tag: 'Success',
    success: { rows: [], lastIndex: 0 },
  });
  const appendArchive =
    AggregateVersionArchive.prototype.appendEvaluatedCommands;
  const dropAvaReply = vi
    .spyOn(AggregateVersionArchive.prototype, 'appendEvaluatedCommands')
    .mockImplementation(async function (this: AggregateVersionArchive, props) {
      const reply = await appendArchive.call(this, props);
      if (
        this.key.firstAggregateIndex === 2 &&
        reply.result._tag === 'Success'
      ) {
        throw new Error('Lost AVA reply after the successor committed');
      }
      return reply;
    });
  expect(
    (await history.appendEvaluatedCommands({ commands })).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-archive-transport-failed' },
  });
  expect(
    (await secondArchive.getEvaluatedCommand({ aggregateIndex: 3 })).result,
  ).toMatchObject({ _tag: 'Success', success: { aggregateIndex: 3 } });
  expect(
    (await history.getEvaluatedCommand({ aggregateIndex: 3 })).result,
  ).toEqual({ _tag: 'Success', success: null });
  dropAvaReply.mockRestore();
  await evictDurableObject(history);
  expect(
    (await history.appendEvaluatedCommands({ commands })).result._tag,
  ).toBe('Success');
  expect(
    await runInDurableObject(history, instance =>
      instance.db.select().from(instance.schema.archives).all(),
    ),
  ).toEqual([{ firstAggregateIndex: 1 }, { firstAggregateIndex: 2 }]);
  await evictDurableObject(history);
  expect(
    (await history.getEvaluatedCommand({ aggregateIndex: 2 })).result,
  ).toEqual({ _tag: 'Success', success: commands[1] });
  const page = await runInDurableObject(history, instance =>
    instance.actorVersionChainFanout.getPage({ afterIndex: 1, maxIndex: 3 }),
  );
  expect(page.result).toEqual({
    _tag: 'Success',
    success: { rows: commands.slice(1), lastIndex: 3 },
  });
  expect(
    (await history.appendEvaluatedCommands({ commands })).result._tag,
  ).toBe('Success');
  expect(
    (
      await history.appendEvaluatedCommands({
        commands: [{ ...commands[0]!, payload: '{"changed":true}' }],
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-evaluated-command-mismatch' },
  });
  expect(
    (await history.getEvaluatedCommand({ aggregateIndex: 4 })).result,
  ).toEqual({ _tag: 'Success', success: null });
  expect(
    (
      await history.appendEvaluatedCommands({
        commands: [{ ...commands[2]!, aggregateIndex: 5 }],
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-commands-gap' },
  });
});

it('retains independent Aggregate actor cursors and never regresses them on enrollment after eviction', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const history = env.AGGREGATE_VERSION_CHAIN.getByName(
    'avc_sys_servicePublication/acc_source/account/1',
  );
  const owner = {
    systemId: 'sys_servicePublication',
    aggregateId: 'acc_source',
    aggregateName: 'account',
    aggregateVersion: 1,
  };
  let previousDispositionChainHash = genesisDispositionChainHash();
  const commands = [1, 2, 3].map(aggregateIndex => {
    const id = `cmd_history_${aggregateIndex}`;
    const outcome = {
      result: { _tag: 'Success' as const, success: null },
      finalizedAt: new Date(1_000 + aggregateIndex),
    };
    const dispositionChainHash = advanceDispositionChainHash({
      previousDispositionChainHash,
      aggregateIndex,
      commandId: id,
      outcome,
    });
    previousDispositionChainHash = dispositionChainHash;
    return Schema.decodeUnknownSync(
      Schema.toType(EvaluatedAggregateCommandSchema),
    )({
      aggregateId: owner.aggregateId,
      aggregateName: owner.aggregateName,
      aggregateVersion: owner.aggregateVersion,
      id,
      aggregateIndex,
      commandName: 'receiveCommand',
      contractVersion: 1,
      payload: '{}',
      kind: 'system',
      outcome,
      dispositionChainHash,
      operations: [],
    });
  });
  const enrolled = await runInDurableObject(
    history,
    async (instance, { storage }) => {
      // Enrollment reports receiver progress; pause pushes to keep this check focused on retained cursors.
      vi.spyOn(instance.actorVersionChainFanout, 'wake').mockReturnValue(
        Effect.void,
      );
      expect(
        (await instance.appendEvaluatedCommands({ commands })).result._tag,
      ).toBe('Success');
      for (const [actorName, actorPath] of [
        ['viewer', '/one'],
        ['viewer', '/two'],
        ['auditor', '/one'],
      ] as const) {
        expect(
          (
            await instance.actorVersionChainFanout.subscribe({
              ...owner,
              actorName,
              actorPath,
              actorVersion: 1,
              currentIndex: 0,
            })
          ).result._tag,
        ).toBe('Success');
      }
      expect(
        (
          await instance.actorVersionChainFanout.subscribe({
            ...owner,
            actorName: 'viewer',
            actorPath: '/one',
            actorVersion: 1,
            currentIndex: 2,
          })
        ).result._tag,
      ).toBe('Success');
      await storage.deleteAlarm();
      return instance.db
        .select()
        .from(instance.schema.actorVersionChainFanoutSubscribers)
        .orderBy(
          instance.schema.actorVersionChainFanoutSubscribers.actorName,
          instance.schema.actorVersionChainFanoutSubscribers.actorPath,
        )
        .all();
    },
  );
  expect(enrolled).toEqual([
    { actorName: 'auditor', actorPath: '/one', acknowledgedAggregateIndex: 0 },
    { actorName: 'viewer', actorPath: '/one', acknowledgedAggregateIndex: 2 },
    { actorName: 'viewer', actorPath: '/two', acknowledgedAggregateIndex: 0 },
  ]);

  await evictDurableObject(history);
  const reconstructed = await runInDurableObject(
    history,
    async (instance, { storage }) => {
      vi.spyOn(instance.actorVersionChainFanout, 'wake').mockReturnValue(
        Effect.void,
      );
      const before = instance.db
        .select()
        .from(instance.schema.actorVersionChainFanoutSubscribers)
        .orderBy(
          instance.schema.actorVersionChainFanoutSubscribers.actorName,
          instance.schema.actorVersionChainFanoutSubscribers.actorPath,
        )
        .all();
      for (const currentIndex of [0, 1]) {
        expect(
          (
            await instance.actorVersionChainFanout.subscribe({
              ...owner,
              actorName: 'viewer',
              actorPath: '/one',
              actorVersion: 1,
              currentIndex,
            })
          ).result._tag,
        ).toBe('Success');
      }
      expect(
        (
          await instance.actorVersionChainFanout.subscribe({
            ...owner,
            actorName: 'auditor',
            actorPath: '/one',
            actorVersion: 1,
            currentIndex: 3,
          })
        ).result._tag,
      ).toBe('Success');
      await storage.deleteAlarm();
      return {
        before,
        after: instance.db
          .select()
          .from(instance.schema.actorVersionChainFanoutSubscribers)
          .orderBy(
            instance.schema.actorVersionChainFanoutSubscribers.actorName,
            instance.schema.actorVersionChainFanoutSubscribers.actorPath,
          )
          .all(),
      };
    },
  );
  expect(reconstructed.before).toEqual(enrolled);
  expect(reconstructed.after).toEqual([
    { actorName: 'auditor', actorPath: '/one', acknowledgedAggregateIndex: 3 },
    { actorName: 'viewer', actorPath: '/one', acknowledgedAggregateIndex: 2 },
    { actorName: 'viewer', actorPath: '/two', acknowledgedAggregateIndex: 0 },
  ]);
});

it('archives Aggregate Actor public/private pairs and recovers both cursors after rollover and eviction', async () => {
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result._tag,
  ).toBe('Success');
  const sourceKey = {
    systemId: 'sys_servicePublication',
    aggregateId: 'acc_actorArchive',
    aggregateName: 'account',
    aggregateVersion: 1,
    actorName: 'viewer',
    actorVersion: 1,
    actorPath: '/one',
  };
  const history = env.AGGREGATE_ACTOR_VERSION_CHAIN.getByName(
    Effect.runSync(aggregateActorVersionChainNameUtils.makeName(sourceKey)),
  );
  const archive = env.AGGREGATE_ACTOR_VERSION_ARCHIVE.getByName(
    Effect.runSync(
      aggregateActorVersionArchiveNameUtils.makeName({
        ...sourceKey,
        firstAggregateIndex: 1,
      }),
    ),
  );
  const claims = {
    aggregateId: sourceKey.aggregateId,
    viewerId: 'one',
    authorization: { role: 'reader' },
  };
  const commands = [1, 2, 3].map(aggregateIndex =>
    Schema.decodeUnknownSync(Schema.toType(AggregateExposedPublicationSchema))({
      aggregateIndex,
      dispositionChainHash: String(aggregateIndex).repeat(64),
      id: `cmd_actorArchive_${aggregateIndex}`,
      commandName: 'receiveCommand',
      delta: { upserted: [], deleted: [] },
      commandResolution: {
        nodeId: aggregateIndex === 2 ? 'node_foreign' : 'node_actorArchive',
        pushIndex: aggregateIndex === 3 ? 2 : 1,
        sessionName: 'viewer',
        claims,
        failure:
          aggregateIndex !== 3
            ? {
                _tag: 'ZerospinError',
                code: 'denied',
                message: 'Denied',
                status: null,
                extra: null,
              }
            : null,
      },
    }),
  );
  // Invalid public fields cannot enter an Archive through a table codec alone.
  expect(
    (
      await archive.appendExposedCommands({
        sourceKey,
        commands: [{ ...commands[0]!, dispositionChainHash: 'bad' }],
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'exposed-command-invalid' },
  });
  expect(
    (
      await archive.appendExposedCommands({
        sourceKey,
        commands: [commands[0]!],
      })
    ).result._tag,
  ).toBe('Success');
  await runInDurableObject(archive, instance => {
    vi.spyOn(instance.db, 'transaction').mockImplementationOnce(() => {
      throw new Error('Failed query: insert into exposedCommands', {
        cause: new Error('database or disk is full: SQLITE_FULL'),
      });
    });
  });
  expect(
    (await history.appendExposedCommands({ sourceKey, commands })).result._tag,
  ).toBe('Success');
  await runDurableObjectAlarm(history);
  await expect
    .poll(() =>
      runInDurableObject(history, instance => ({
        archived: instance.db
          .select()
          .from(instance.schema.archiveFanoutSubscribers)
          .get()?.acknowledgedAggregateIndex,
        public: instance.db.select().from(instance.schema.exposedCommands).all()
          .length,
        private: instance.db
          .select()
          .from(instance.schema.commandResolutions)
          .all().length,
      })),
    )
    .toEqual({ archived: 3, public: 0, private: 0 });
  expect(
    await runInDurableObject(history, instance =>
      instance.db.select().from(instance.schema.archives).all(),
    ),
  ).toEqual([{ firstAggregateIndex: 1 }, { firstAggregateIndex: 2 }]);
  await evictDurableObject(history);
  expect((await history.getCheckpoint({ aggregateIndex: 1 })).result).toEqual({
    _tag: 'Success',
    success: {
      aggregateIndex: 1,
      dispositionChainHash: commands[0]!.dispositionChainHash,
    },
  });
  const recovery = {
    nodeId: 'node_actorArchive',
    sessionName: 'viewer',
    actorName: 'viewer',
    actorVersion: 1,
    claims,
    throughAggregateIndex: 3,
  };
  expect(
    (
      await Reflect.apply(archive.getResolutionSummary, archive, [
        {
          nodeId: 7,
          sessionName: recovery.sessionName,
          claims,
          throughAggregateIndex: 1,
        },
      ])
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'node-recovery-checkpoint-invalid' },
  });
  expect(
    (
      await Reflect.apply(archive.getPage, archive, [
        { throughAggregateIndex: 1, nodeId: 7 },
      ])
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'session-replay-cursor-invalid' },
  });

  expect((await history.getResolvedThrough(recovery)).result).toEqual({
    _tag: 'Success',
    success: 2,
  });
  for (const changedOwner of [
    { ...recovery, claims: { ...claims, authorization: { role: 'writer' } } },
    { ...recovery, sessionName: 'anotherSession' },
  ]) {
    expect(
      (await history.getResolvedThrough(changedOwner)).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'node-recovery-caller-mismatch' },
    });
  }
  const browserHistory: Pick<AggregateActorVersionChain, 'getBrowserCommands'> =
    history;
  const definition = {
    name: 'viewer',
    modelNames: [],
    actorName: 'viewer',
    actorVersion: 1,
    claims,
  };
  expect(
    (await browserHistory.getBrowserCommands({ afterAggregateIndex: 0 }))
      .result,
  ).toMatchObject({
    _tag: 'Success',
    success: {
      commands: commands.map(command => ({ id: command.id, failure: null })),
    },
  });
  expect(
    (
      await browserHistory.getBrowserCommands({
        afterAggregateIndex: 0,
        nodeId: recovery.nodeId,
        afterPushIndex: 0,
        definition,
      })
    ).result,
  ).toMatchObject({
    _tag: 'Success',
    success: {
      commands: [
        { id: commands[0]!.id, failure: { code: 'denied' } },
        { id: commands[1]!.id, failure: null },
        { id: commands[2]!.id, failure: null },
      ],
    },
  });
  const page = await browserHistory.getBrowserCommands({
    afterAggregateIndex: 3,
    nodeId: recovery.nodeId,
    afterPushIndex: 0,
    definition,
  });
  expect(page.result).toMatchObject({
    _tag: 'Success',
    success: {
      pushThrough: 2,
      tip: 3,
      commands: [
        { id: commands[0]!.id, failure: { code: 'denied' } },
        { id: commands[2]!.id, failure: null },
      ],
    },
  });
  const retainedArchive: Pick<AggregateActorVersionArchive, 'getPage'> =
    archive;
  expect(
    (
      await retainedArchive.getPage({
        afterAggregateIndex: 0,
        throughAggregateIndex: 1,
      })
    ).result,
  ).toEqual({
    _tag: 'Success',
    success: { commands: commands.slice(0, 1), scannedThrough: 1 },
  });
  const successor = env.AGGREGATE_ACTOR_VERSION_ARCHIVE.getByName(
    Effect.runSync(
      aggregateActorVersionArchiveNameUtils.makeName({
        ...sourceKey,
        firstAggregateIndex: 2,
      }),
    ),
  );
  const retainedSuccessor: Pick<AggregateActorVersionArchive, 'getPage'> =
    successor;
  expect(
    (
      await retainedSuccessor.getPage({
        afterAggregateIndex: 1,
        throughAggregateIndex: 3,
      })
    ).result,
  ).toEqual({
    _tag: 'Success',
    success: { commands: commands.slice(1), scannedThrough: 3 },
  });
  expect(
    (
      await archive.appendExposedCommands({
        sourceKey,
        commands: [{ ...commands[0]!, commandResolution: null }],
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'exposed-command-conflict' },
  });
  const readArchive = vi
    .spyOn(AggregateActorVersionArchive.prototype, 'getExposedCommand')
    .mockRejectedValue(new Error('Old Archive unavailable'));
  const broadcasts = vi.spyOn(AggregateSessionChain.prototype, 'broadcast');
  try {
    expect(
      (await history.appendExposedCommands({ sourceKey, commands })).result
        ._tag,
    ).toBe('Success');
    expect(
      (
        await history.appendExposedCommands({
          sourceKey,
          commands: [
            {
              ...commands[0]!,
              id: 'cmd_changedCovered',
              commandResolution: null,
            },
          ],
        })
      ).result._tag,
    ).toBe('Success');
    expect(readArchive).not.toHaveBeenCalled();
    expect(broadcasts.mock.calls.every(([rows]) => rows.length === 0)).toBe(
      true,
    );
    expect(
      (
        await history.appendExposedCommands({
          sourceKey: { ...sourceKey, actorVersion: 2 },
          commands: [commands[0]!],
        })
      ).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'projection-history-source-mismatch' },
    });
    expect(
      (
        await history.appendExposedCommands({
          sourceKey,
          commands: [{ ...commands[2]!, aggregateIndex: 5 }],
        })
      ).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'exposed-command-index-gap' },
    });
    expect(
      (
        await history.appendExposedCommands({
          sourceKey,
          commands: [{ ...commands[0]!, dispositionChainHash: 'bad' }],
        })
      ).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'exposed-command-invalid' },
    });
    expect(
      (
        await history.appendExposedCommands({
          sourceKey,
          commands: [
            { ...commands[0]!, commandResolution: null },
            {
              ...commands[2]!,
              aggregateIndex: 4,
              id: 'cmd_actorArchive_4',
              commandResolution: null,
            },
          ],
        })
      ).result._tag,
    ).toBe('Success');
    expect(readArchive).not.toHaveBeenCalled();
    expect(
      broadcasts.mock.calls
        .filter(([rows]) => rows.length > 0)
        .map(([rows]) => rows.map(row => row.output.aggregateIndex)),
    ).toEqual([[4]]);
  } finally {
    readArchive.mockRestore();
    broadcasts.mockRestore();
  }
  const archivePoint: Pick<AggregateActorVersionArchive, 'getExposedCommand'> =
    archive;
  expect(
    (await archivePoint.getExposedCommand({ aggregateIndex: 1 })).result,
  ).toEqual({ _tag: 'Success', success: commands[0] });
});

it('bounds Aggregate Actor unarchived backlog while accepting exact retries at capacity', async () => {
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result._tag,
  ).toBe('Success');
  const sourceKey = {
    systemId: 'sys_servicePublication',
    aggregateId: 'acc_actorBacklog',
    aggregateName: 'account',
    aggregateVersion: 1,
    actorName: 'viewer',
    actorVersion: 1,
    actorPath: '/one',
  };
  const history = env.AGGREGATE_ACTOR_VERSION_CHAIN.getByName(
    Effect.runSync(aggregateActorVersionChainNameUtils.makeName(sourceKey)),
  );
  await runInDurableObject(history, instance => {
    vi.spyOn(instance.archiveFanout, 'wake').mockReturnValue(Effect.void);
  });
  const commands = Array.from({ length: 65 }, (_, offset) =>
    Schema.decodeUnknownSync(Schema.toType(AggregateExposedPublicationSchema))({
      aggregateIndex: offset + 1,
      dispositionChainHash: 'a'.repeat(64),
      id: `cmd_actorBacklog_${offset + 1}`,
      commandName: 'receiveCommand',
      delta: { upserted: [], deleted: [] },
      commandResolution: null,
    }),
  );
  expect(
    (await history.appendExposedCommands({ sourceKey, commands })).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'exposed-command-batch-too-large' },
  });
  expect(
    (
      await history.appendExposedCommands({
        sourceKey,
        commands: commands.slice(0, 64),
      })
    ).result._tag,
  ).toBe('Success');
  expect(
    (
      await history.appendExposedCommands({
        sourceKey,
        commands: commands.slice(0, 64),
      })
    ).result._tag,
  ).toBe('Success');
  expect(
    (
      await history.appendExposedCommands({
        sourceKey,
        commands: commands.slice(64),
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'exposed-command-archive-backlog-full' },
  });
  expect(
    (await history.getCheckpoint({ aggregateIndex: 64 })).result._tag,
  ).toBe('Success');
  await runInDurableObject(history, ({ db, schema }) =>
    db
      .delete(schema.exposedCommands)
      .where(eq(schema.exposedCommands.aggregateIndex, 64))
      .run(),
  );
  const browserHistory: Pick<AggregateActorVersionChain, 'getBrowserCommands'> =
    history;
  expect(
    (await browserHistory.getBrowserCommands({ afterAggregateIndex: 63 }))
      .result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'projection-history-command-missing' },
  });
  expect(
    (
      await browserHistory.getBrowserCommands({
        afterAggregateIndex: 64,
        nodeId: 'node_unknown',
        afterPushIndex: 0,
        definition: {
          name: 'viewer',
          modelNames: [],
          actorName: 'viewer',
          actorVersion: 1,
          claims: { aggregateId: sourceKey.aggregateId, viewerId: 'one' },
        },
      })
    ).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { commands: [], pushThrough: 0, tip: 64 },
  });
});

it('withholds Aggregate private replay when retained capabilities disappear during an Archive read', async () => {
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result._tag,
  ).toBe('Success');
  const sourceKey = {
    systemId: 'sys_servicePublication',
    aggregateId: 'acc_actorPrivacy',
    aggregateName: 'account',
    aggregateVersion: 1,
    actorName: 'viewer',
    actorVersion: 1,
    actorPath: '/one',
  };
  const claims = { aggregateId: sourceKey.aggregateId, viewerId: 'one' };
  const history = env.AGGREGATE_ACTOR_VERSION_CHAIN.getByName(
    Effect.runSync(aggregateActorVersionChainNameUtils.makeName(sourceKey)),
  );
  expect(
    (
      await history.appendExposedCommands({
        sourceKey,
        commands: [
          {
            aggregateIndex: 1,
            dispositionChainHash: 'a'.repeat(64),
            id: 'cmd_actorPrivacy',
            commandName: 'receiveCommand',
            delta: { upserted: [], deleted: [] },
            commandResolution: {
              nodeId: 'node_actorPrivacy',
              pushIndex: 1,
              sessionName: 'viewer',
              claims,
              failure: {
                _tag: 'ZerospinError',
                code: 'private-failure',
                message: 'Private failure',
                status: null,
                extra: null,
              },
            },
          },
        ],
      })
    ).result._tag,
  ).toBe('Success');
  await runDurableObjectAlarm(history);
  await expect
    .poll(() =>
      runInDurableObject(
        history,
        instance =>
          instance.db.select().from(instance.schema.exposedCommands).all()
            .length,
      ),
    )
    .toBe(0);
  const actor = system.aggregates.account.releases[1].actors.viewer;
  const response = await history.fetch(
    new Request('https://actor.example/connect', {
      headers: {
        Upgrade: 'websocket',
        'x-zerospin-producer': JSON.stringify('node_actorPrivacy'),
        'x-zerospin-claims': JSON.stringify(claims),
        'x-zerospin-aggregate-session-lock': JSON.stringify(
          makeAggregateSessionLock({
            aggregateName: 'account',
            aggregateVersion: 1,
            actorName: 'viewer',
            actorVersion: 1,
            sessionName: 'viewer',
            claimsSchema: actor.identity.claimsSchema,
            contracts: actor.contracts,
            models: actor.exposedModels,
            modelNames: [],
          }),
        ),
      },
    }),
  );
  const observer = response.webSocket;
  if (observer === null) expect.fail('Expected an admitted Actor socket');
  const frames: (typeof AggregateSocketServerMessageSchema.Type)[] = [];
  observer.addEventListener('message', event =>
    frames.push(
      Schema.decodeUnknownSync(
        Schema.fromJsonString(AggregateSocketServerMessageSchema),
      )(event.data),
    ),
  );
  observer.accept();
  let entered = false;
  const release = Promise.withResolvers<void>();
  let completed = false;
  const readPage = AggregateActorVersionArchive.prototype.getPage;
  vi.spyOn(
    AggregateActorVersionArchive.prototype,
    'getPage',
  ).mockImplementation(
    async function (this: AggregateActorVersionArchive, props) {
      entered = true;
      await release.promise;
      return readPage.call(this, props);
    },
  );
  const onMessage = AggregateActorVersionChain.prototype.onMessage;
  vi.spyOn(
    AggregateActorVersionChain.prototype,
    'onMessage',
  ).mockImplementation(async function (
    this: AggregateActorVersionChain,
    ...args
  ) {
    try {
      return await onMessage.call(this, ...args);
    } finally {
      completed = true;
    }
  });
  try {
    observer.send(
      JSON.stringify({
        type: 'resume',
        nodeId: 'node_actorPrivacy',
        outcomeIndex: 0,
        aggregateIndex: 0,
        dispositionChainHash: genesisDispositionChainHash(),
      }),
    );
    await expect.poll(() => entered).toBe(true);
    await runInDurableObject(history, instance => {
      const connection = [...instance.getConnections()][0];
      if (connection === undefined) {
        expect.fail('Expected the replaying Actor connection');
      }
      // Keep the socket and attachment live: SQL authority must independently gate disclosure.
      instance.db.delete(instance.schema.connectionLocks).run();
      expect(
        instance.db.select().from(instance.schema.connectionLocks).all(),
      ).toEqual([]);
    });
    release.resolve();
    await expect.poll(() => completed).toBe(true);
    expect(frames).toEqual([]);
  } finally {
    release.resolve();
    observer.close();
    await expect
      .poll(() =>
        runInDurableObject(
          history,
          instance => [...instance.getConnections()].length,
        ),
      )
      .toBe(0);
  }
});

it('bounds real Actor projection publications, including empty deltas, and drains a full queue before cold catch-up', async () => {
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result._tag,
  ).toBe('Success');
  const key = {
    systemId: 'sys_servicePublication',
    aggregateId: 'acc_actorPending',
    aggregateName: 'account',
    aggregateVersion: 1,
    actorName: 'viewer',
    actorVersion: 1,
    actorPath: '/one',
  };
  const source = env.AGGREGATE_VERSION_CHAIN.getByName(
    'avc_sys_servicePublication/acc_actorPending/account/1',
  );
  const repo = env.AGGREGATE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(aggregateActorVersionRepoNameUtils.makeName(key)),
  );
  expect((await repo.awaitStartup()).result._tag).toBe('Success');
  let previousDispositionChainHash = genesisDispositionChainHash();
  const commands = Array.from({ length: 65 }, (_, offset) => {
    const aggregateIndex = offset + 1;
    const id = `cmd_actorPending_${aggregateIndex}`;
    const outcome: (typeof EvaluatedAggregateCommandSchema.Type)['outcome'] = {
      result: { _tag: 'Success', success: null },
      finalizedAt: new Date(1_000 + aggregateIndex),
    };
    const dispositionChainHash = advanceDispositionChainHash({
      previousDispositionChainHash,
      aggregateIndex,
      commandId: id,
      outcome,
    });
    previousDispositionChainHash = dispositionChainHash;
    return Schema.decodeUnknownSync(
      Schema.toType(EvaluatedAggregateCommandSchema),
    )({
      aggregateId: key.aggregateId,
      aggregateName: key.aggregateName,
      aggregateVersion: 1,
      aggregateIndex,
      id,
      commandName: 'receiveCommand',
      contractVersion: 1,
      payload: '{}',
      kind: 'system',
      outcome,
      dispositionChainHash,
      operations: [],
    });
  });
  const snapshotRequest = {
    aggregateId: key.aggregateId,
    aggregateName: key.aggregateName,
    actorName: key.actorName,
    actorVersion: key.actorVersion,
    claims: { aggregateId: key.aggregateId, viewerId: 'one' },
    sessionName: 'viewer',
    nodeId: null,
  };
  const appendExposedCommands =
    AggregateActorVersionChain.prototype.appendExposedCommands;
  const publication = vi
    .spyOn(AggregateActorVersionChain.prototype, 'appendExposedCommands')
    .mockImplementation(function (this: AggregateActorVersionChain, props) {
      return appendExposedCommands.call(this, {
        ...props,
        sourceKey: { ...props.sourceKey, aggregateVersion: 2 },
      });
    });
  const subscriber = await repo.actorVersionChainFanoutSubscriber(key);
  expect(
    await subscriber.receive({ rows: commands, lastIndex: 65 }),
  ).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'projection-publication-batch-too-large' },
    },
  });
  expect(
    (await source.appendEvaluatedCommands({ commands: commands.slice(0, 64) }))
      .result._tag,
  ).toBe('Success');
  const { materializationHead, exposedCommandOutbox } =
    aggregateProjectionDbConfig.schema;
  await expect
    .poll(() =>
      runInDurableObject(repo, ({ db }) => ({
        head: db.select().from(materializationHead).get()?.aggregateIndex,
        pending: db.select().from(exposedCommandOutbox).all().length,
      })),
    )
    .toEqual({ head: 64, pending: 64 });
  expect(await repo.getSnapshot(snapshotRequest)).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'projection-history-publication-failed' },
    },
  });
  expect(
    await runInDurableObject(repo, ({ db }) =>
      db
        .select()
        .from(exposedCommandOutbox)
        .all()
        .every(row => {
          const { delta } = Effect.runSync(
            aggregateProjectionDbConfig.tables.exposedCommandOutbox.decodeRow(
              row,
            ),
          );
          return delta.upserted.length === 0 && delta.deleted.length === 0;
        }),
    ),
  ).toBe(true);
  expect(
    await subscriber.receive({ rows: commands.slice(64), lastIndex: 65 }),
  ).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'projection-publication-backlog-full' },
    },
  });
  expect(
    await subscriber.receive({ rows: commands.slice(0, 64), lastIndex: 64 }),
  ).toMatchObject({ result: { _tag: 'Success' } });
  expect(
    await runInDurableObject(repo, ({ db }) => ({
      head: db.select().from(materializationHead).get()?.aggregateIndex,
      pending: db.select().from(exposedCommandOutbox).all().length,
    })),
  ).toEqual({ head: 64, pending: 64 });
  subscriber[Symbol.dispose]();
  await runDurableObjectAlarm(source);
  expect(
    (await source.appendEvaluatedCommands({ commands: commands.slice(64) }))
      .result._tag,
  ).toBe('Success');
  await evictDurableObject(repo);
  publication.mockRestore();
  expect((await repo.awaitStartup()).result._tag).toBe('Success');
  await expect
    .poll(() =>
      runInDurableObject(repo, ({ db }) => ({
        head: db.select().from(materializationHead).get()?.aggregateIndex,
        pending: db.select().from(exposedCommandOutbox).all().length,
      })),
    )
    .toEqual({ head: 65, pending: 0 });
  expect(await repo.getSnapshot(snapshotRequest)).toMatchObject({
    result: {
      _tag: 'Success',
      success: {
        aggregateIndex: 65,
        dispositionChainHash: previousDispositionChainHash,
        resources: [],
        resolvedThrough: 0,
      },
    },
  });
});

it('keeps cold Actor history available under the actual retired System while refusing retained and new socket disclosure', async () => {
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result._tag,
  ).toBe('Success');
  const key = {
    systemId: 'sys_servicePublication',
    aggregateId: 'acc_actorRetired',
    aggregateName: 'account',
    aggregateVersion: 1,
    actorName: 'viewer',
    actorVersion: 1,
    actorPath: '/one',
  };
  const history = env.AGGREGATE_ACTOR_VERSION_CHAIN.getByName(
    Effect.runSync(aggregateActorVersionChainNameUtils.makeName(key)),
  );
  const claims = { aggregateId: key.aggregateId, viewerId: 'one' };
  const publication = Schema.decodeUnknownSync(
    Schema.toType(AggregateExposedPublicationSchema),
  )({
    aggregateIndex: 1,
    dispositionChainHash: 'a'.repeat(64),
    id: 'cmd_actorRetired',
    commandName: 'receiveCommand',
    delta: { upserted: [], deleted: [] },
    commandResolution: {
      nodeId: 'node_actorRetired',
      pushIndex: 1,
      sessionName: 'viewer',
      claims,
      failure: null,
    },
  });
  const archive = vi
    .spyOn(AggregateActorVersionArchive.prototype, 'appendExposedCommands')
    .mockRejectedValue(new Error('Archive temporarily unavailable'));
  expect(
    (
      await history.appendExposedCommands({
        sourceKey: key,
        commands: [publication],
      })
    ).result._tag,
  ).toBe('Success');
  const actor = system.aggregates.account.releases[1].actors.viewer;
  const headers = {
    Upgrade: 'websocket',
    'x-zerospin-producer': JSON.stringify('node_actorRetired'),
    'x-zerospin-claims': JSON.stringify(claims),
    'x-zerospin-aggregate-session-lock': JSON.stringify(
      makeAggregateSessionLock({
        aggregateName: 'account',
        aggregateVersion: 1,
        actorName: 'viewer',
        actorVersion: 1,
        sessionName: 'viewer',
        claimsSchema: actor.identity.claimsSchema,
        contracts: actor.contracts,
        models: actor.exposedModels,
        modelNames: [],
      }),
    ),
  };
  const response = await history.fetch(
    new Request('https://actor.example/connect?_pk=retired_hibernated', {
      headers,
    }),
  );
  const retainedSocket = response.webSocket;
  if (retainedSocket === null) {
    expect.fail('Expected the retained Actor socket');
  }
  const frames: (typeof AggregateSocketServerMessageSchema.Type)[] = [];
  let retainedClose: number | undefined;
  retainedSocket.addEventListener('message', event => {
    frames.push(
      Schema.decodeUnknownSync(
        Schema.fromJsonString(AggregateSocketServerMessageSchema),
      )(event.data),
    );
  });
  retainedSocket.addEventListener('close', event => {
    retainedClose = event.code;
  });
  retainedSocket.accept();
  const retiredSystem = makeSystem({
    name: system.name,
    aggregates: {},
    services: {},
  });
  const systemRepo = env.SYSTEM_REPO.getByName(key.systemId);
  expect(
    (
      await systemRepo.registerSystemSpec({
        spec: makeSystemSpec({ system: retiredSystem }),
      })
    ).result._tag,
  ).toBe('Success');
  const config = requireAuthoredWorkerConfig();
  const descriptor = Object.getOwnPropertyDescriptor(config, 'system');
  if (descriptor === undefined) expect.fail('Expected the configured System');
  const runSyncExit = config.managedRuntime.runSyncExit.bind(
    config.managedRuntime,
  );
  const runPromise = config.managedRuntime.runPromise.bind(
    config.managedRuntime,
  );
  const synchronous = vi
    .spyOn(config.managedRuntime, 'runSyncExit')
    .mockImplementation(program =>
      runSyncExit(program.pipe(Effect.provideService(System, retiredSystem))),
    );
  const asynchronous = vi
    .spyOn(config.managedRuntime, 'runPromise')
    .mockImplementation((program, options) =>
      runPromise(
        program.pipe(Effect.provideService(System, retiredSystem)),
        options,
      ),
    );
  Object.defineProperty(config, 'system', {
    configurable: true,
    value: retiredSystem,
  });
  archive.mockRestore();
  try {
    await evictDurableObject(history);
    expect(
      (await history.getCheckpoint({ aggregateIndex: 1 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: {
        aggregateIndex: 1,
        dispositionChainHash: publication.dispositionChainHash,
      },
    });
    await expect
      .poll(() =>
        runInDurableObject(
          history,
          ({ db, schema }) =>
            db.select().from(schema.archiveFanoutSubscribers).get()
              ?.acknowledgedAggregateIndex,
        ),
      )
      .toBe(1);
    const browserHistory: Pick<
      AggregateActorVersionChain,
      'getBrowserCommands'
    > = history;
    expect(
      (await browserHistory.getBrowserCommands({ afterAggregateIndex: 0 }))
        .result,
    ).toMatchObject({
      _tag: 'Success',
      success: { commands: [{ id: publication.id }] },
    });
    expect(
      (
        await history.getResolvedThrough({
          nodeId: 'node_actorRetired',
          actorName: 'viewer',
          actorVersion: 1,
          sessionName: 'viewer',
          claims,
          throughAggregateIndex: 1,
        })
      ).result,
    ).toEqual({ _tag: 'Success', success: 1 });
    const resume = {
      type: 'resume',
      nodeId: 'node_actorRetired',
      aggregateIndex: 0,
      outcomeIndex: 0,
      dispositionChainHash: genesisDispositionChainHash(),
    };
    retainedSocket.send(JSON.stringify(resume));
    await expect.poll(() => retainedClose).toBe(4003);
    const refused = await history.fetch(
      new Request('https://actor.example/connect?_pk=retired_new', { headers }),
    );
    const newSocket = refused.webSocket;
    if (newSocket === null) expect.fail('Expected the new Actor socket');
    let newClose: number | undefined;
    newSocket.addEventListener('message', event => {
      frames.push(
        Schema.decodeUnknownSync(
          Schema.fromJsonString(AggregateSocketServerMessageSchema),
        )(event.data),
      );
    });
    newSocket.addEventListener('close', event => {
      newClose = event.code;
    });
    newSocket.accept();
    newSocket.send(JSON.stringify(resume));
    await expect.poll(() => newClose).toBe(4003);
    expect(frames.filter(frame => frame.type === 'commands')).toEqual([]);
    newSocket.close();
  } finally {
    asynchronous.mockRestore();
    synchronous.mockRestore();
    Object.defineProperty(config, 'system', descriptor);
    retainedSocket.close();
  }
});
