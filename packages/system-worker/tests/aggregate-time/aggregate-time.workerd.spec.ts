import type { EncodedSystemAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { initializeAggregatePredecessor } from '@zerospin/owner-release-worker/AggregateVersionRepo/initializeAggregatePredecessor';
import { AggregateVersionRepo } from '@zerospin/owner-release-worker/VersionRepos';
import { evictDurableObject, reset, runInDurableObject } from 'cloudflare:test';
import { env, type DurableObject } from 'cloudflare:workers';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Semaphore from 'effect/Semaphore';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { appendAggregateCommand } from '../../src/AggregateChain/admitAggregateCommands/appendAggregateCommand.ts';
import { AggregateChain } from '../../src/AggregateChain/AggregateChain.ts';
import { recordOriginalCommandOutcomeTx } from '../../src/AggregateChain/recordOriginalCommandOutcomeTx.ts';
import type { IAdmittedAggregateCommand } from '../../src/AggregateChain/types.ts';
import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../../src/aggregateDispositionChainHash/aggregateDispositionChainHash.ts';
import { decodeAggregateEvaluatedCommandRow } from '../../src/AggregateVersionChain/evaluatedAggregateCommand.ts';
import { aggregateVersionRepoDbConfig } from '../../src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts';
import { getAggregateVersionRepo } from '../../src/AggregateVersionRepo/getAggregateVersionRepo.ts';
import { materializeCommandTx } from '../../src/AggregateVersionRepo/materializeCommandTx.ts';
import { getAggregateVersionChain } from '../../src/ownerOperations/releaseRepoNamespaces.ts';
import { AggregateChains } from '../../src/repoServices/AggregateChains.ts';
import { AggregateVersionChains } from '../../src/repoServices/AggregateVersionChains.ts';
import {
  configureServingSystemSpec,
  listPinnedOwnerReleases,
} from '../../src/workerConfiguration/workerConfiguration.ts';

import {
  aggregateEvaluationTimes,
  resetEvaluationTimes,
} from './observeTimeV2.ts';
import config, { codecCounts, system } from './system.ts';

interface IAggregateTimeFixtureChain extends DurableObject {
  stageAggregateTimePrefix(
    command: typeof EncodedSystemAggregateCommandSchema.Type,
  ): Promise<void>;
  enrollAggregateTimeReleases(): Promise<void>;
}

declare global {
  namespace Cloudflare {
    interface Env {
      AGGREGATE_TIME_SYSTEM?: {
        selectAggregateTimeSpec(spec: ISystemSpec): Promise<void>;
      };
      AGGREGATE_TIME_CHAIN: DurableObjectNamespace<IAggregateTimeFixtureChain>;
    }
  }
}

const account = system.aggregates.account;
const accountReleases = account.releases;

function aggregateKey(aggregateId: string, aggregateVersion: number) {
  return {
    systemId: 'sys_servicePublication',
    aggregateId,
    aggregateName: 'account',
    aggregateVersion,
  };
}

const aggregateHistory = (aggregateId: string, aggregateVersion: number) =>
  Effect.runPromise(
    getAggregateVersionChain({
      key: aggregateKey(aggregateId, aggregateVersion),
    }),
  );

const aggregateRepo = (aggregateId: string, aggregateVersion: number) =>
  Effect.runPromise(
    getAggregateVersionRepo({
      key: aggregateKey(aggregateId, aggregateVersion),
    }),
  );

async function selectFixtureSpec(spec: ISystemSpec) {
  const remote = env.AGGREGATE_TIME_SYSTEM;
  if (remote !== undefined) {
    await remote.selectAggregateTimeSpec(spec);
    return;
  }
  env.ZEROSPIN_SYSTEM_SPEC_HASH = spec.hash;
  configureServingSystemSpec(
    JSON.stringify({ spec, ownerReleases: listPinnedOwnerReleases() }),
  );
}

async function acceptAccountReleases(
  ...versions: (keyof typeof accountReleases)[]
) {
  const spec = makeSystemSpec({
    system: {
      ...system,
      aggregates: {
        account: {
          ...account,
          releases: Object.fromEntries(
            versions.map(version => [version, accountReleases[version]]),
          ),
        },
      },
    },
  });
  await selectFixtureSpec(spec);
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  // Fixture owners serve the full immutable executable snapshot.
  // Retain it before opening a release, while the root serves the selected view.
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
    'Success',
  );
}

beforeEach(() => {
  resetEvaluationTimes();
});

afterEach(async () => {
  await reset();
  if (
    env.AGGREGATE_TIME_SYSTEM !== undefined ||
    !('ZEROSPIN_OWNER_RELEASE' in env)
  ) {
    await selectFixtureSpec(makeSystemSpec({ system }));
  }
});

it('pins simultaneous branches and rebuilds to the admitted head at enrollment', async () => {
  await acceptAccountReleases(1);
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_branch/account',
  );
  const predecessor = await aggregateHistory('acc_branch', 1);
  const childHistory = await aggregateHistory('acc_branch', 2);
  let previousDispositionChainHash = genesisDispositionChainHash();
  const commands = Array.from({ length: 12 }, (_, index) => {
    const aggregateIndex = index + 1;
    const input = {
      id: `cmd_branch_${aggregateIndex}` as const,
      commandName: 'observeTime',
      contractVersion: 1,
      payload: '{}',
      aggregateId: 'acc_branch',
      aggregateName: 'account',
      aggregateVersion: 1,
      kind: 'system' as const,
    };
    const outcome = {
      result: { _tag: 'Success' as const, success: aggregateIndex },
      finalizedAt: new Date(1_000 + aggregateIndex),
    };
    const dispositionChainHash = advanceDispositionChainHash({
      previousDispositionChainHash,
      aggregateIndex,
      commandId: input.id,
      outcome,
    });
    previousDispositionChainHash = dispositionChainHash;
    return {
      input,
      evaluated: {
        ...input,
        aggregateIndex,
        outcome,
        dispositionChainHash,
        operations: [],
      },
    };
  });
  const [publishedPrefix, pendingPrefix, suffix] = [
    commands.slice(0, 8),
    commands.slice(8, 10),
    commands.slice(10),
  ];
  // Stage the admitted head ahead of the finalized and published heads.
  await runInDurableObject(source, ({ db, key }) => {
    for (const { input } of [...publishedPrefix, ...pendingPrefix]) {
      db.transaction(tx =>
        config.managedRuntime.runSync(appendAggregateCommand(tx, input)),
      );
    }
    for (const { evaluated } of publishedPrefix) {
      recordOriginalCommandOutcomeTx(
        db,
        [evaluated.aggregateIndex],
        [evaluated],
        key,
      );
    }
  });
  expect(
    (
      await predecessor.appendEvaluatedCommands({
        commands: publishedPrefix.map(command => command.evaluated),
      })
    ).result._tag,
  ).toBe('Success');

  await acceptAccountReleases(1, 2, 3);
  await evictDurableObject(source);
  const expectWatermarks = async () => {
    const [branch, rebuild] = await Promise.all([
      source.prepareAggregatePredecessor({ aggregateVersion: 2 }),
      source.prepareAggregatePredecessor({ aggregateVersion: 3 }),
    ]);
    expect(branch.result).toEqual({
      _tag: 'Success',
      success: { aggregateVersion: 1, aggregateIndex: 10 },
    });
    expect(rebuild.result).toEqual({
      _tag: 'Success',
      success: { aggregateVersion: 2, aggregateIndex: 10 },
    });
  };
  await expectWatermarks();
  await runInDurableObject(source, ({ db, key }) => {
    for (const { evaluated } of pendingPrefix) {
      recordOriginalCommandOutcomeTx(
        db,
        [evaluated.aggregateIndex],
        [evaluated],
        key,
      );
    }
  });
  expect(
    (
      await predecessor.appendEvaluatedCommands({
        commands: pendingPrefix.map(command => command.evaluated),
      })
    ).result._tag,
  ).toBe('Success');
  await runInDurableObject(source, instance =>
    config.managedRuntime.runPromise(instance.replayCommandsFanout.drain()),
  );
  expect(
    await runInDurableObject(source, ({ db, schema }) =>
      db.select().from(schema.commands).all(),
    ),
  ).toEqual([]);
  expect(
    (await childHistory.getEvaluatedCommandPage({ afterIndex: 0 })).result,
  ).toEqual({ _tag: 'Success', success: { rows: [], lastIndex: 0 } });

  await runInDurableObject(source, ({ db, key }) => {
    for (const { input, evaluated } of suffix) {
      db.transaction(tx =>
        config.managedRuntime.runSync(appendAggregateCommand(tx, input)),
      );
      recordOriginalCommandOutcomeTx(
        db,
        [evaluated.aggregateIndex],
        [evaluated],
        key,
      );
    }
  });
  expect(
    (
      await predecessor.appendEvaluatedCommands({
        commands: suffix.map(command => command.evaluated),
      })
    ).result._tag,
  ).toBe('Success');
  await evictDurableObject(source);
  await expectWatermarks();
  // Starting V3 first must obtain the prefix from V2, even when V2 is cold.
  const rebuild = await aggregateRepo('acc_branch', 3);
  expect((await rebuild.awaitStartup()).result._tag).toBe('Success');
  expect(
    (await childHistory.getEvaluatedCommandPage({ afterIndex: 9 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: {
      lastIndex: 12,
      rows: [
        { aggregateIndex: 10, outcome: commands.at(9)?.evaluated.outcome },
        { aggregateIndex: 11, outcome: { result: { success: 1_011 } } },
        { aggregateIndex: 12, outcome: { result: { success: 1_012 } } },
      ],
    },
  });
  const rebuildHistory = await aggregateHistory('acc_branch', 3);
  expect(
    (await rebuildHistory.getEvaluatedCommand({ aggregateIndex: 10 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: {
      id: 'cmd_branch_10',
      outcome: {
        result: {
          _tag: 'Failure',
          failure: { code: 'aggregate-contract-unsupported' },
        },
        finalizedAt: new Date(1_010),
      },
    },
  });
});

it('recovers interrupted branch publication after finalizing the admitted prefix', async () => {
  await acceptAccountReleases(1);
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_pending/account',
  );
  const predecessor = await aggregateHistory('acc_pending', 1);
  const childHistory = env.AGGREGATE_VERSION_CHAIN.getByName(
    'avc_sys_servicePublication/acc_pending/account/2',
  );
  const child = env.AGGREGATE_VERSION_REPO.getByName(
    'avr_sys_servicePublication/acc_pending/account/2',
  );
  const input = {
    id: 'cmd_branch_pending' as const,
    commandName: 'observeTime',
    contractVersion: 1,
    payload: '{}',
    aggregateId: 'acc_pending',
    aggregateName: 'account',
    aggregateVersion: 1,
    kind: 'system' as const,
  };
  const fixtureChain = env.AGGREGATE_TIME_CHAIN.getByName(
    'ac_sys_servicePublication/acc_pending/account',
  );
  await fixtureChain.stageAggregateTimePrefix(input);
  await acceptAccountReleases(1, 2);
  await fixtureChain.enrollAggregateTimeReleases();
  expect(
    (await source.prepareAggregatePredecessor({ aggregateVersion: 2 })).result,
  ).toEqual({
    _tag: 'Success',
    success: { aggregateVersion: 1, aggregateIndex: 1 },
  });
  const initialize = (
    publishThrough: (index: number) => Effect.Effect<void, Error>,
  ) =>
    runInDurableObject(child, ({ db, key }) =>
      config.managedRuntime.runPromise(
        initializeAggregatePredecessor({
          db,
          key,
          aggregateRelease: system.aggregates.account.releases[2],
          execution: Semaphore.makeUnsafe(1),
          prepareReplayPayload: undefined,
          publishThrough,
        }).pipe(
          Effect.provideService(AggregateChains, {
            getRepo: acquisition => AggregateChain.getRepo(acquisition),
          }),
          Effect.provideService(AggregateVersionChains, {
            getRepo: getAggregateVersionChain,
          }),
        ),
      ),
    );
  const activation = vi
    .spyOn(AggregateVersionRepo.prototype, 'onRepoStartup')
    .mockReturnValueOnce(Effect.void);
  try {
    await expect(
      initialize(() => Effect.fail(new Error('Publication interrupted'))),
    ).rejects.toThrow('Publication interrupted');
    expect(
      await runInDurableObject(child, ({ db, schema }) =>
        db
          .select({
            aggregateIndex: schema.aggregateVersionChainOutbox.aggregateIndex,
          })
          .from(schema.aggregateVersionChainOutbox)
          .all(),
      ),
    ).toEqual([{ aggregateIndex: 1 }]);
    expect(
      (await childHistory.getEvaluatedCommandPage({ afterIndex: 0 })).result,
    ).toEqual({ _tag: 'Success', success: { rows: [], lastIndex: 0 } });
    const resumePublication = vi.fn((_index: number) => Effect.void);
    await initialize(resumePublication);
    expect(resumePublication).toHaveBeenCalledExactlyOnceWith(1);
  } finally {
    activation.mockRestore();
  }
  await evictDurableObject(child);
  expect((await child.awaitStartup()).result._tag).toBe('Success');
  const original = (
    await predecessor.getEvaluatedCommand({ aggregateIndex: 1 })
  ).result;
  expect(original).toMatchObject({
    _tag: 'Success',
    success: { id: input.id, outcome: { finalizedAt: expect.any(Date) } },
  });
  expect(
    (await childHistory.getEvaluatedCommand({ aggregateIndex: 1 })).result,
  ).toEqual(original);
  expect(
    (await source.getAggregateCommand({ aggregateIndex: 1 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { outcome: { finalizedAt: expect.any(Date) } },
  });
});

it('finishes an original addressed to a release waiting for its predecessor prefix', async () => {
  await acceptAccountReleases(1);
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_drain/account',
  );
  const child = await aggregateRepo('acc_drain', 2);
  const admit = (aggregateVersion: 1 | 2) =>
    runInDurableObject(source, async ({ db }, { storage }) => {
      db.transaction(tx =>
        config.managedRuntime.runSync(
          appendAggregateCommand(tx, {
            id: `cmd_drain_${aggregateVersion}`,
            commandName: 'observeTime',
            contractVersion: 1,
            payload: '{}',
            aggregateId: 'acc_drain',
            aggregateName: 'account',
            aggregateVersion,
            kind: 'system',
          }),
        ),
      );
      await storage.deleteAlarm();
    });
  await admit(1);
  await acceptAccountReleases(1, 2);
  await evictDurableObject(source);

  const pausePredecessor = 'aggregate-time/pause-predecessor';
  const predecessorEntered = 'aggregate-time/predecessor-entered';
  await env.BUCKET.put(pausePredecessor, '');
  let childRequestedPrefix = false;
  const catchup = AggregateChain.prototype.catchupAggregatePredecessor;
  const mark = vi
    .spyOn(AggregateChain.prototype, 'catchupAggregatePredecessor')
    .mockImplementation(function (this: AggregateChain, props) {
      const pending = catchup.call(this, props);
      childRequestedPrefix = true;
      return pending;
    });
  try {
    await admit(2);
    const drained = source.executeCommandsThrough();
    void drained.catch(() => undefined);
    await expect
      .poll(async () => (await env.BUCKET.head(predecessorEntered)) !== null)
      .toBe(true);
    const readyAndDrained = Promise.all([child.awaitStartup(), drained]);
    void readyAndDrained.catch(() => undefined);
    await expect.poll(() => childRequestedPrefix).toBe(true);
    await env.BUCKET.delete(pausePredecessor);

    const [ready, completed] = await readyAndDrained;
    expect(ready.result._tag).toBe('Success');
    expect(completed.result._tag).toBe('Success');
    expect(
      (await source.getAggregateCommand({ aggregateIndex: 2 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: {
        id: 'cmd_drain_2',
        outcome: { finalizedAt: expect.any(Date) },
      },
    });
  } finally {
    await env.BUCKET.delete(pausePredecessor);
    mark.mockRestore();
  }
});

it('applies a server extension after shared writes and rolls both back on refusal', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  const registration = await systemRepo.registerSystemSpec({
    spec: makeSystemSpec({ system }),
  });
  expect(registration.result._tag).toBe('Success');
  const repo = env.AGGREGATE_VERSION_REPO.getByName(
    'avr_sys_servicePublication/acc_extension/account/3',
  );
  const command: IAdmittedAggregateCommand = {
    id: 'cmd_extension_success',
    commandName: 'createCounter',
    contractVersion: 1,
    payload: JSON.stringify({ id: 'ctr_good', fail: false }),
    aggregateId: 'acc_extension',
    aggregateName: 'account',
    aggregateVersion: 3,
    aggregateIndex: 1,
    kind: 'system',
    outcome: null,
  };
  await runInDurableObject(repo, async (instance, { storage }) => {
    const retained = await config.managedRuntime.runPromise(
      materializeCommandTx(instance.db, {
        row: command,
        aggregateRelease: system.aggregates.account.releases[3],
        key: instance.key,
        mode: 'original',
      }),
    );
    expect(retained?.outcome.result._tag).toBe('Success');
    expect(storage.sql.exec('SELECT id, value FROM counter').toArray()).toEqual(
      [{ id: 'ctr_good', value: 2 }],
    );
  });
  await runInDurableObject(repo, async (instance, { storage }) => {
    const retained = await config.managedRuntime.runPromise(
      materializeCommandTx(instance.db, {
        row: {
          ...command,
          id: 'cmd_extension_failure',
          aggregateIndex: 2,
          payload: JSON.stringify({ id: 'ctr_bad', fail: true }),
        },
        aggregateRelease: system.aggregates.account.releases[3],
        key: instance.key,
        mode: 'original',
      }),
    );
    expect(retained?.outcome.result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'extension-refused' },
    });
    expect(storage.sql.exec('SELECT id, value FROM counter').toArray()).toEqual(
      [{ id: 'ctr_good', value: 2 }],
    );
  });
});

async function finalizeCounterInItsRelease(command: IAdmittedAggregateCommand) {
  const { payload } = command;
  if (payload === null) expect.fail('Expected a counter command payload');
  const aggregateId = command.aggregateId + '_original';
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/' + aggregateId + '/' + command.aggregateName,
  );
  const { result: admission } = await source.admitDirectSystemCommand({
    command: {
      aggregateId,
      aggregateName: command.aggregateName,
      aggregateVersion: command.aggregateVersion,
      commandName: command.commandName,
      contractVersion: command.contractVersion,
      payload,
      kind: 'system',
    },
  });
  if (admission._tag !== 'Success') expect.fail(JSON.stringify(admission));
  expect(admission.success.aggregateIndex).toBe(command.aggregateIndex);
  expect(
    (await source.executeCommandsThrough(command.aggregateIndex)).result._tag,
  ).toBe('Success');
  const { result } = await source.getAggregateCommand({
    aggregateIndex: command.aggregateIndex,
  });
  if (result._tag !== 'Success' || result.success?.outcome == null) {
    expect.fail(JSON.stringify(result));
  }
  return result.success.outcome;
}

it('replays an originating extension after its release commits', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const command: IAdmittedAggregateCommand = {
    id: 'cmd_extension_success',
    commandName: 'createCounter',
    contractVersion: 1,
    payload: JSON.stringify({ id: 'ctr_good', fail: false }),
    aggregateId: 'acc_extension_replay',
    aggregateName: 'account',
    aggregateVersion: 3,
    aggregateIndex: 1,
    kind: 'system',
    outcome: null,
  };
  const original = await finalizeCounterInItsRelease(command);
  expect(original.result._tag).toBe('Success');
  const replay = env.AGGREGATE_VERSION_REPO.getByName(
    'avr_sys_servicePublication/acc_extension_replay/account/4',
  );
  await runInDurableObject(replay, async (instance, { storage }) => {
    const retained = await config.managedRuntime.runPromise(
      materializeCommandTx(instance.db, {
        row: { ...command, outcome: original },
        aggregateRelease: system.aggregates.account.releases[4],
        key: instance.key,
        mode: 'replay',
        retainedCommand: null,
      }),
    );
    expect(retained?.outcome.result._tag).toBe('Success');
    expect(storage.sql.exec('SELECT id, value FROM counter').toArray()).toEqual(
      [{ id: 'ctr_good', value: 2 }],
    );
  });
});

it('replays only extensions declared by the originating release', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const command: IAdmittedAggregateCommand = {
    id: 'cmd_no_extension',
    commandName: 'createCounter',
    contractVersion: 1,
    payload: JSON.stringify({ id: 'ctr_without', fail: false }),
    aggregateId: 'acc_without',
    aggregateName: 'account',
    aggregateVersion: 5,
    aggregateIndex: 1,
    kind: 'system',
    outcome: null,
  };
  const original = await finalizeCounterInItsRelease(command);
  const replayRepo = env.AGGREGATE_VERSION_REPO.getByName(
    'avr_sys_servicePublication/acc_without/account/4',
  );
  await runInDurableObject(replayRepo, async (instance, { storage }) => {
    const replay = await config.managedRuntime.runPromise(
      materializeCommandTx(instance.db, {
        row: { ...command, outcome: original },
        aggregateRelease: system.aggregates.account.releases[4],
        key: instance.key,
        mode: 'replay',
        retainedCommand: null,
      }),
    );
    expect(replay?.outcome.result._tag).toBe('Success');
    expect(storage.sql.exec('SELECT id, value FROM counter').toArray()).toEqual(
      [{ id: 'ctr_without', value: 1 }],
    );
  });
});

it('allows replay to succeed without a target extension after an original extension refusal', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const command: IAdmittedAggregateCommand = {
    id: 'cmd_refused_extension',
    commandName: 'createCounter',
    contractVersion: 1,
    payload: JSON.stringify({ id: 'ctr_refused', fail: true }),
    aggregateId: 'acc_refused',
    aggregateName: 'account',
    aggregateVersion: 3,
    aggregateIndex: 1,
    kind: 'system',
    outcome: null,
  };
  const original = await finalizeCounterInItsRelease(command);
  expect(original.result._tag).toBe('Failure');
  const replayRepo = env.AGGREGATE_VERSION_REPO.getByName(
    'avr_sys_servicePublication/acc_refused/account/5',
  );
  await runInDurableObject(replayRepo, async (instance, { storage }) => {
    const replay = await config.managedRuntime.runPromise(
      materializeCommandTx(instance.db, {
        row: { ...command, outcome: original },
        aggregateRelease: system.aggregates.account.releases[5],
        key: instance.key,
        mode: 'replay',
        retainedCommand: null,
      }),
    );
    expect(replay?.outcome.result._tag).toBe('Success');
    expect(storage.sql.exec('SELECT id, value FROM counter').toArray()).toEqual(
      [{ id: 'ctr_refused', value: 1 }],
    );
  });
});

it.each([
  {
    fail: true,
    originalTag: 'Failure',
    replayTag: 'Success',
    expected: [{ id: 'ctr_independent', value: 11 }],
  },
  { fail: false, originalTag: 'Success', replayTag: 'Failure', expected: [] },
] as const)(
  'evaluates both declared extensions independently and suppresses replay work: $originalTag to $replayTag',
  async ({ fail, originalTag, replayTag, expected }) => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
        .result._tag,
    ).toBe('Success');
    const command: IAdmittedAggregateCommand = {
      id: 'cmd_independent',
      commandName: 'createCounter',
      contractVersion: 1,
      payload: JSON.stringify({ id: 'ctr_independent', fail }),
      aggregateId: 'acc_independent',
      aggregateName: 'account',
      aggregateVersion: 3,
      aggregateIndex: 1,
      kind: 'system',
      outcome: null,
    };
    const original = await finalizeCounterInItsRelease(command);
    expect(original.result._tag).toBe(originalTag);
    const replayRepo = env.AGGREGATE_VERSION_REPO.getByName(
      'avr_sys_servicePublication/acc_independent/account/6',
    );
    await runInDurableObject(replayRepo, async (instance, { storage }) => {
      const replay = await config.managedRuntime.runPromise(
        materializeCommandTx(instance.db, {
          row: { ...command, outcome: original },
          aggregateRelease: system.aggregates.account.releases[6],
          key: instance.key,
          mode: 'replay',
          retainedCommand: null,
        }),
      );
      expect(replay?.outcome.result._tag).toBe(replayTag);
      expect(
        storage.sql.exec('SELECT id, value FROM counter').toArray(),
      ).toEqual(expected);
      expect(
        replay?.operations.some(
          operation =>
            operation.operationName === 'external' ||
            operation.operationName === 'command',
        ),
      ).toBe(false);
    });
  },
);

it('decodes source JSON once during server materialization', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  codecCounts.encodes = 0;
  codecCounts.decodes = 0;
  const repo = env.AGGREGATE_VERSION_REPO.getByName(
    'avr_sys_servicePublication/acc_codec/account/6',
  );
  await runInDurableObject(repo, async instance => {
    const retained = await config.managedRuntime.runPromise(
      materializeCommandTx(instance.db, {
        row: {
          id: 'cmd_codec_server',
          commandName: 'observeCodec',
          contractVersion: 1,
          payload: JSON.stringify({ content: JSON.stringify('value') }),
          aggregateId: 'acc_codec',
          aggregateName: 'account',
          aggregateVersion: 6,
          aggregateIndex: 1,
          kind: 'system',
          outcome: null,
        },
        aggregateRelease: system.aggregates.account.releases[6],
        key: instance.key,
        mode: 'original',
      }),
    );
    expect(retained?.outcome.result._tag).toBe('Success');
  });
  expect(codecCounts).toEqual({ encodes: 0, decodes: 1 });
});

it.each(['original', 'replay'] as const)(
  'freezes Aggregate adapters, guards and programs at finalizedAt during %s evaluation',
  async mode => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
        .result._tag,
    ).toBe('Success');
    const repo = env.AGGREGATE_VERSION_REPO.getByName(
      'avr_sys_servicePublication/acc_time/account/2',
    );
    const command: IAdmittedAggregateCommand = {
      id: 'cmd_time',
      commandName: 'observeTime',
      contractVersion: 1,
      payload: '{}',
      aggregateId: 'acc_time',
      aggregateName: 'account',
      aggregateVersion: mode === 'original' ? 2 : 1,
      aggregateIndex: 1,
      kind: 'system',
      outcome:
        mode === 'replay'
          ? {
              finalizedAt: new Date(1_000),
              result: { _tag: 'Success', success: 1_000 },
            }
          : null,
    };
    const firstObservation = aggregateEvaluationTimes.length;
    let wallTime = mode === 'original' ? 1_000 : 90_000;
    const evaluated = await runInDurableObject(repo, instance =>
      config.managedRuntime.runPromise(
        Clock.clockWith(liveClock =>
          Effect.gen(function* () {
            const retained = yield* materializeCommandTx(instance.db, {
              row: command,
              aggregateRelease: system.aggregates.account.releases[2],
              key: instance.key,
              ...(mode === 'original'
                ? { mode }
                : { mode, retainedCommand: null }),
            });
            return {
              command: retained,
              liveTime: yield* Clock.currentTimeMillis,
            };
          }).pipe(
            Effect.provideService(Clock.Clock, {
              ...liveClock,
              currentTimeMillisUnsafe: () => wallTime,
              currentTimeMillis: Effect.sync(() => {
                const sampled = wallTime;
                wallTime = 90_000;
                return sampled;
              }),
              currentTimeNanosUnsafe: () => BigInt(wallTime) * 1_000_000n,
              currentTimeNanos: Effect.sync(
                () => BigInt(wallTime) * 1_000_000n,
              ),
            }),
          ),
        ),
      ),
    );
    expect(aggregateEvaluationTimes.slice(firstObservation)).toEqual([
      { phase: 'adapter', millis: 1_000 },
      { phase: 'guard', millis: 1_000 },
      { phase: 'program', millis: 1_000 },
    ]);
    expect(evaluated.command).toMatchObject({
      ...command,
      outcome: {
        result: { _tag: 'Success', success: 1_000 },
        finalizedAt: new Date(1_000),
      },
      operations: [],
    });
    expect(evaluated.liveTime).toBe(90_000);
    expect(
      await runInDurableObject(repo, ({ db, schema }) => ({
        head: db.select().from(schema.materializationHead).all(),
        outbox: db
          .select()
          .from(schema.aggregateVersionChainOutbox)
          .all()
          .map(row =>
            Effect.runSync(
              aggregateVersionRepoDbConfig.tables.aggregateVersionChainOutbox
                .decodeRow(row)
                .pipe(Effect.flatMap(decodeAggregateEvaluatedCommandRow)),
            ),
          ),
      })),
    ).toMatchObject({
      head: [
        {
          aggregateIndex: 1,
          dispositionChainHash: evaluated.command?.dispositionChainHash,
        },
      ],
      outbox: [evaluated.command],
    });
  },
);
