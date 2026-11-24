import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import {
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
  EncodedSystemServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { decodeAndAdaptPayload } from '@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { upgradeAggregateContractRelease } from '@zerospin/core/contracts/make/upgradeAggregateContractRelease';
import { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { primitives } from '@zerospin/shapes';
import { reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { expect, it } from 'vitest';

import {
  validateNativeAggregateAdmission,
  validateNativeServiceAdmission,
} from '../../src/ownerOperations/validateReleaseAdmission.ts';
import { admitFromServiceChainTx } from '../../src/ServiceChain/admitRecordedServiceCommandTx.ts';
import { admitServiceCommands } from '../../src/ServiceChain/admitServiceCommands/admitServiceCommands.ts';

import config, { system } from './system.ts';

it('registers a Service Node before its first admitted command', async () => {
  await reset();
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const chain = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const binding = {
    nodeId: 'node_early_registration',
    serviceVersion: 1,
    sessionName: 'operator',
    actorName: 'operator',
    actorVersion: 1,
    claims: { viewerId: 'one', department: 'billing' },
  };
  expect(
    (await chain.registerNode({ ...binding, create: false })).result,
  ).toEqual({
    _tag: 'Success',
    success: false,
  });
  expect(
    (await chain.registerNode({ ...binding, create: true })).result,
  ).toEqual({
    _tag: 'Success',
    success: true,
  });
  expect(
    (await chain.registerNode({ ...binding, create: true })).result,
  ).toEqual({
    _tag: 'Success',
    success: true,
  });
  expect(
    (
      await chain.registerNode({
        ...binding,
        claims: { viewerId: 'two' },
        create: false,
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'node-admission-identity-mismatch' },
  });
  expect(
    await runInDurableObject(chain, ({ db, schema }) =>
      db.select().from(schema.nodeProducers).all(),
    ),
  ).toEqual([
    { ...binding, claims: JSON.stringify(binding.claims), lastPushIndex: 0 },
  ]);
  await runInDurableObject(chain, async ({ db, key }) => {
    const previous = env.ZEROSPIN_LOCAL_DEVELOPMENT;
    env.ZEROSPIN_LOCAL_DEVELOPMENT = 'true';
    try {
      const command = {
        id: makeNodeCommandId(binding.nodeId, 1),
        commandName: 'performReservationWork',
        contractVersion: 1,
        serviceName: 'reservations',
        serviceVersion: 1,
        payload: JSON.stringify({
          reservationId: 'rsv_parent',
          expiresAt: 60_000,
          mode: 'noop',
        }),
        kind: 'actor',
        actorName: binding.actorName,
        actorVersion: binding.actorVersion,
        claims: binding.claims,
        nodeId: binding.nodeId,
        sessionName: binding.sessionName,
        pushIndex: 1,
      };
      const stale = {
        ...command,
        nodeId: 'node_stale',
        id: makeNodeCommandId('node_stale', 1),
      };
      const missing = await config.managedRuntime.runPromise(
        admitServiceCommands({ db, key, commands: [stale] }).pipe(
          Effect.result,
        ),
      );
      expect(missing).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'node-producer-not-registered' },
      });
      const admitted = await config.managedRuntime.runPromise(
        admitServiceCommands({ db, key, commands: [command] }),
      );
      expect(admitted[0]).toMatchObject({
        nodeId: binding.nodeId,
        pushIndex: 1,
      });
    } finally {
      if (previous === undefined) delete env.ZEROSPIN_LOCAL_DEVELOPMENT;
      else env.ZEROSPIN_LOCAL_DEVELOPMENT = previous;
    }
  });
});

it('round-trips flat command variants and refuses contradictory envelopes', () => {
  const common = {
    id: 'cmd_shape',
    commandName: 'example',
    contractVersion: 1,
    payload: '{}',
  };
  const actor = {
    ...common,
    kind: 'actor',
    actorName: 'operator',
    actorVersion: 1,
    claims: { viewerId: 'one' },
    nodeId: 'node_shape',
    sessionName: 'operator',
    pushIndex: 1,
  };
  const directActor = {
    ...common,
    kind: 'actor',
    actorName: 'operator',
    actorVersion: 1,
    claims: { viewerId: 'one' },
  };
  const observation = {
    _tag: 'Success',
    success: null,
    recordedAt: new Date(1_000),
  };
  const externalCommand = {
    ...common,
    kind: 'external',
    originCommandId: 'cmd_parent',
    externalOutcome: observation,
  };
  for (const schema of [
    EncodedAggregateCommandSchema,
    EncodedServiceCommandSchema,
  ]) {
    const owner =
      schema === EncodedAggregateCommandSchema
        ? {
            aggregateId: 'acc_shape',
            aggregateName: 'account',
            aggregateVersion: 1,
          }
        : { serviceName: 'reservations', serviceVersion: 1 };
    const decode = Schema.decodeUnknownSync(Schema.toType(schema), {
      onExcessProperty: 'error',
    });
    const encode = Schema.encodeSync(schema);
    for (const variant of [
      actor,
      {
        ...common,
        kind: 'agent',
        agentName: 'expiry',
        agentVersion: 1,
      },
      { ...common, kind: 'system' },
    ]) {
      const command = decode({ ...variant, ...owner });
      expect(Schema.decodeUnknownSync(schema)(encode(command))).toEqual(
        command,
      );
    }
    for (const variant of [
      directActor,
      { ...directActor, nodeId: null, sessionName: null, pushIndex: null },
      { ...directActor, nodeId: 'node_partial' },
      { ...actor, nodeId: '' },
      { ...actor, sessionName: '' },
      { ...actor, pushIndex: 0 },
      { ...actor, pushIndex: Number.MAX_SAFE_INTEGER + 1 },
      { ...actor, externalOutcome: observation },
      { ...actor, origin: { kind: 'actor' } },
      { ...actor, agentName: 'expiry' },
      externalCommand,
    ]) {
      expect(() => decode({ ...variant, ...owner })).toThrow();
    }
  }
});

it('binds each Node push once while independent producers survive history pruning', async () => {
  await reset();
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );

  await runInDurableObject(source, async ({ db, schema, key }, { storage }) => {
    const inputs = [
      { nodeId: 'node_one', pushIndex: 1 },
      { nodeId: 'node_two', pushIndex: 1 },
      { nodeId: 'node_one', pushIndex: 2 },
    ].map((producer, index) => {
      const common = {
        id: `cmd_producer_${index}`,
        commandName: 'performReservationWork',
        contractVersion: 1,
        serviceName: 'reservations',
        serviceVersion: 1,
        payload: JSON.stringify({
          reservationId: 'rsv_parent',
          expiresAt: 60_000,
          mode: 'noop',
        }),
      };
      return producer.nodeId === null
        ? { ...common, kind: 'system' }
        : {
            ...common,
            kind: 'actor',
            id: makeNodeCommandId(producer.nodeId, producer.pushIndex),
            actorName: 'operator',
            actorVersion: 1,
            claims: { viewerId: 'one', department: 'billing' },
            nodeId: producer.nodeId,
            sessionName: 'operator',
            pushIndex: producer.pushIndex,
          };
    });
    const admitted = await config.managedRuntime.runPromise(
      admitServiceCommands({ db, key, commands: inputs }),
    );
    await storage.deleteAlarm();
    expect(admitted.map(command => command.serviceIndex)).toEqual([1, 2, 3]);
    const before = db
      .select()
      .from(schema.commands)
      .orderBy(schema.commands.serviceIndex)
      .all();
    expect(before[0]).toMatchObject({
      kind: 'actor',
      actorName: 'operator',
      nodeId: 'node_one',
      pushIndex: 1,
    });
    const actorInput = inputs[0];
    const systemInput = {
      id: 'cmd_system',
      commandName: 'performReservationWork',
      contractVersion: 1,
      serviceName: 'reservations',
      serviceVersion: 1,
      payload: '{}',
      kind: 'system',
    };
    if (actorInput === undefined || systemInput === undefined) {
      expect.fail('Expected Actor and System inputs');
    }
    for (const command of [
      { ...actorInput, id: 'cmd_missing_node', nodeId: null },
      { ...actorInput, id: 'cmd_missing_session', sessionName: null },
      { ...actorInput, id: 'cmd_missing_position', pushIndex: null },
      { ...systemInput, id: 'cmd_mixed_kind', actorName: 'operator' },
      {
        ...systemInput,
        id: 'cmd_forged_external',
        kind: 'external',
        originCommandId: 'cmd_producer_0',
        externalOutcome: {
          _tag: 'Success',
          success: null,
          recordedAt: new Date(),
        },
      },
    ]) {
      const rejected = await config.managedRuntime.runPromise(
        admitServiceCommands({ db, key, commands: [command] }).pipe(
          Effect.flip,
        ),
      );
      expect(rejected).toMatchObject({
        code: 'service-admission-encode-failed',
      });
    }
    expect(
      db
        .select()
        .from(schema.commands)
        .orderBy(schema.commands.serviceIndex)
        .all(),
    ).toEqual(before);
    const conflict = await config.managedRuntime.runPromise(
      admitServiceCommands({
        db,
        key,
        commands: [{ ...inputs[0], id: 'cmd_conflict' }],
      }).pipe(Effect.flip),
    );
    expect(conflict).toMatchObject({ code: 'node-command-identity-mismatch' });
    for (const changed of [
      { id: makeNodeCommandId('node_one', 3), pushIndex: 3, actorVersion: 2 },
      {
        id: makeNodeCommandId('node_one', 3),
        pushIndex: 3,
        claims: { changed: true },
      },
      { id: makeNodeCommandId('node_one', 4), pushIndex: 4 },
      { id: makeNodeCommandId('node_one', 2), pushIndex: 2 },
    ]) {
      const failure = await config.managedRuntime.runPromise(
        admitServiceCommands({
          db,
          key,
          commands: [{ ...actorInput, ...changed }],
        }).pipe(Effect.flip),
      );
      expect(failure).toMatchObject({
        code:
          changed.pushIndex === 3
            ? 'node-admission-identity-mismatch'
            : 'node-admission-index-mismatch',
      });
      expect(db.select().from(schema.admissionPosition).get()?.lastIndex).toBe(
        3,
      );
    }
    const first = before[0];
    if (first === undefined) expect.fail('Expected a retained Node command');
    expect(() =>
      db
        .insert(schema.commands)
        .values({ ...first, id: 'cmd_duplicate', serviceIndex: 6 })
        .run(),
    ).toThrow();
    expect(
      db
        .select()
        .from(schema.commands)
        .orderBy(schema.commands.serviceIndex)
        .all(),
    ).toEqual(before);
    const positions = db.select().from(schema.nodeProducers).all();
    const next = {
      ...actorInput,
      id: makeNodeCommandId('node_one', 3),
      pushIndex: 3,
    };
    const failed = await config.managedRuntime.runPromise(
      admitServiceCommands({
        db,
        key,
        commands: [
          next,
          { ...next, id: makeNodeCommandId('node_one', 5), pushIndex: 5 },
        ],
      }).pipe(Effect.flip),
    );
    expect(failed).toMatchObject({
      code: 'node-admission-index-mismatch',
      extra: { expectedPushIndex: 4 },
    });
    expect(db.select().from(schema.nodeProducers).all()).toEqual(positions);
    expect(db.select().from(schema.admissionPosition).get()?.lastIndex).toBe(3);
    expect(db.select().from(schema.commands).all()).toEqual(before);
    // Disposable history removal proves independent checkpoints, not Archive rollover.
    db.delete(schema.commands).run();
    const [continued] = await config.managedRuntime.runPromise(
      admitServiceCommands({ db, key, commands: [next] }),
    );
    expect(continued?.serviceIndex).toBe(4);
    await storage.deleteAlarm();
  });
});

it('admits out-of-order recorded commands once even after local history is removed', async () => {
  await reset();
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  await runInDurableObject(source, async ({ db, key, schema }, { storage }) => {
    const producer = { systemId: key.systemId, serviceName: 'origin' };
    const command = Schema.decodeUnknownSync(EncodedSystemServiceCommandSchema)(
      {
        id: 'cmd_recorded_1',
        commandName: 'performReservationWork',
        contractVersion: 1,
        serviceName: key.serviceName,
        serviceVersion: 1,
        payload: JSON.stringify({
          reservationId: 'rsv_parent',
          expiresAt: 60_000,
          mode: 'noop',
        }),
        kind: 'system',
      },
    );
    for (let index = 1; index <= 64; index += 1) {
      await config.managedRuntime.runPromise(
        admitFromServiceChainTx(db, {
          key,
          source: producer,
          position: { sourceIndex: (65 - index) * 3, operationIndex: 2 },
          command: { ...command, id: `cmd_recorded_${index}` },
        }),
      );
    }
    const admitted = db.select().from(schema.admissionPosition).get();
    const retained = db.select().from(schema.recordedCommandAdmissions).all();
    expect(retained).toHaveLength(64);
    expect(
      await config.managedRuntime.runPromise(
        admitFromServiceChainTx(db, {
          key,
          source: producer,
          position: { sourceIndex: 195, operationIndex: 0 },
          command: { ...command, id: 'cmd_recorded_65' },
        }).pipe(Effect.flip),
      ),
    ).toMatchObject({ code: 'service-admission-backlog-full' });
    expect(db.select().from(schema.admissionPosition).get()).toEqual(admitted);
    expect(db.select().from(schema.recordedCommandAdmissions).all()).toEqual(
      retained,
    );
    db.delete(schema.commands).run();
    expect(
      await config.managedRuntime.runPromise(
        admitFromServiceChainTx(db, {
          key,
          source: producer,
          position: { sourceIndex: 3, operationIndex: 2 },
          command: { ...command, id: 'cmd_recorded_64' },
        }),
      ),
    ).toEqual({
      acknowledgedSourceIndex: 3,
      acknowledgedOperationIndex: 2,
      destinationIndex: 64,
    });
    expect(
      await config.managedRuntime.runPromise(
        admitFromServiceChainTx(db, {
          key,
          source: producer,
          position: { sourceIndex: 3, operationIndex: 2 },
          command: { ...command, id: 'cmd_recorded_64', payload: '{changed}' },
        }).pipe(Effect.flip),
      ),
    ).toMatchObject({ code: 'service-recorded-command-conflict' });
    expect(db.select().from(schema.admissionPosition).get()).toEqual(admitted);
    await storage.deleteAlarm();
  });
});

it('requires exact fresh versions while replay adapts omitted historical versions for both owners', async () => {
  const aggregateV1 = makeAggregateContractRelease(
    defineAggregateContract('recordValue'),
    {
      version: 1,
      payload: { value: primitives.integer() },
    },
  );
  const aggregateV2 = upgradeAggregateContractRelease(aggregateV1, {
    version: 2,
    payload: { value: primitives.text() },
    up: props => {
      const { payload } = props;
      return Effect.succeed({ value: String(payload.value) });
    },
  });
  const aggregateV3 = upgradeAggregateContractRelease(aggregateV2, {
    version: 3,
  });
  const serviceV1 = makeServiceContractRelease(
    defineServiceContract('recordValue'),
    {
      version: 1,
      payload: { value: primitives.integer() },
    },
  );
  const serviceV2 = upgradeServiceContractRelease(serviceV1, {
    version: 2,
    payload: { value: primitives.text() },
    up: props => {
      const { payload } = props;
      return Effect.succeed({ value: String(payload.value) });
    },
  });
  const serviceV3 = upgradeServiceContractRelease(serviceV2, {
    version: 3,
    down: props => {
      const { payload } = props;
      return Effect.succeed(payload);
    },
  });
  const replaySystem = makeSystem({
    name: 'historicalAdmission',
    aggregates: {
      historicalAggregate: {
        releases: {
          2: makeAggregateRelease(
            { name: 'historicalAggregate' },
            {
              version: 2,
              models: {},
              actors: {},
              system: { recordValue: aggregateV3 },
              external: {},
            },
          ),
        },
      },
    },
    services: {
      historicalService: {
        releases: {
          2: makeServiceRelease(
            { name: 'historicalService' },
            {
              version: 2,
              models: {},
              actors: {},
              system: { recordValue: serviceV2 },
              external: {},
            },
          ),
        },
      },
    },
  });
  const spec = makeSystemSpec({ system: replaySystem });
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
    'Success',
  );
  const aggregateCommand = Schema.decodeUnknownSync(
    EncodedAggregateCommandSchema,
  )({
    id: 'cmd_historical_aggregate',
    commandName: 'recordValue',
    contractVersion: 1,
    kind: 'system',
    payload: JSON.stringify({ value: 7 }),
    aggregateId: 'hag_history',
    aggregateName: 'historicalAggregate',
    aggregateVersion: 2,
  });
  const serviceCommand = Schema.decodeUnknownSync(EncodedServiceCommandSchema)({
    id: 'cmd_historical_service',
    commandName: 'recordValue',
    contractVersion: 1,
    kind: 'system',
    payload: JSON.stringify({ value: 7 }),
    serviceName: 'historicalService',
    serviceVersion: 2,
  });
  expect(
    await Effect.runPromise(
      validateNativeAggregateAdmission(aggregateCommand, replaySystem).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ code: 'aggregate-chain-command-invalid' });
  expect(
    await Effect.runPromise(
      validateNativeServiceAdmission(serviceCommand, replaySystem).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ code: 'admission-contract-not-found' });
  await Effect.runPromise(
    validateNativeAggregateAdmission(
      {
        ...aggregateCommand,
        contractVersion: 3,
        payload: JSON.stringify({ value: 'fresh' }),
      },
      replaySystem,
    ),
  );
  await Effect.runPromise(
    validateNativeServiceAdmission(
      {
        ...serviceCommand,
        contractVersion: 2,
        payload: JSON.stringify({ value: 'fresh' }),
      },
      replaySystem,
    ),
  );
  expect(
    await Effect.runPromise(
      decodeAndAdaptPayload(aggregateV3, { command: aggregateCommand }),
    ),
  ).toEqual({ value: '7' });
  expect(
    await Effect.runPromise(
      decodeAndAdaptPayload(serviceV2, { command: serviceCommand }),
    ),
  ).toEqual({ value: '7' });
  const newerServiceCommand = {
    ...serviceCommand,
    contractVersion: serviceV3.version,
    payload: JSON.stringify({ value: 'future' }),
  };
  expect(
    await Effect.runPromise(
      validateNativeServiceAdmission(newerServiceCommand, replaySystem).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ code: 'admission-contract-not-found' });
  expect(
    await Effect.runPromise(
      decodeAndAdaptPayload(serviceV2, { command: newerServiceCommand }),
    ),
  ).toEqual({ value: 'future' });
  expect(
    Object.keys(
      spec.services.historicalService?.contractVersions.recordValue ?? {},
    ),
  ).toEqual(['1', '2', '3']);
});
