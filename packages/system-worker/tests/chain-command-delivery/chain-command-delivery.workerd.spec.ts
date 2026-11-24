import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { CommandOutcomeSchema } from '@zerospin/core/contracts/CommandOutcomeSchema';
import type {
  EncodedActorAggregateCommandSchema,
  EncodedAgentAggregateCommandSchema,
  EncodedSystemAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { RecordedCommandSchema } from '@zerospin/core/contracts/RecordedCommandSchema';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import type { ILogRecord } from '@zerospin/logger';
import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { asc, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { afterEach, expect, it, vi } from 'vitest';

import { admitAggregateCommandsTx } from '../../src/AggregateChain/admitAggregateCommands/admitAggregateCommandsTx.ts';
import { admitFromServiceChainTx } from '../../src/AggregateChain/admitRecordedAggregateCommandTx.ts';
import { AggregateChain } from '../../src/AggregateChain/AggregateChain.ts';
import {
  getAggregateVersionArchive,
  getAggregateVersionChain,
  getServiceVersionArchive,
  getServiceVersionChain,
} from '../../src/ownerOperations/releaseRepoNamespaces.ts';
import { WorkerTelemetryLive } from '../../src/repoServices/WorkerTelemetryLive.ts';
import { ServiceChain } from '../../src/ServiceChain/ServiceChain.ts';
import { WorkerTelemetry } from '../../src/WorkerTelemetry/WorkerTelemetry.ts';

import { dispatcherV1, offsetPayloadBuildPrefix } from './dispatcherV1.ts';
import config, { system } from './system.ts';

type ISourceChain = ServiceChain | AggregateChain;

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

async function readOffsetPayloadBuilds() {
  const records = await env.BUCKET.list({ prefix: offsetPayloadBuildPrefix });
  return Promise.all(
    records.objects.map(async ({ key }) => {
      const record = await env.BUCKET.get(key);
      if (record === null) {
        throw new Error('Missing dispatcher mapper observation');
      }
      return Number(await record.text());
    }),
  );
}

function captureAdmissionRefusals() {
  const refusals: ILogRecord[] = [];
  const telemetry = Effect.runSync(
    WorkerTelemetry.pipe(Effect.provide(WorkerTelemetryLive)),
  );
  vi.spyOn(telemetry, 'emit').mockImplementation(({ batch }) => {
    refusals.push(
      ...batch.logs.filter(
        log => log.message === 'command-operation-admission-refused',
      ),
    );
    return Effect.succeed(null);
  });
  return refusals;
}

it('registers an Aggregate Node before its first admitted command', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const chain = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_registered/account',
  );
  const binding = {
    nodeId: 'node_early_registration',
    aggregateVersion: 1,
    sessionName: 'reader',
    actorName: 'viewer',
    actorVersion: 1,
    claims: { aggregateId: 'acc_registered', viewerId: 'one' },
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
        actorName: 'other',
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
      const command: typeof EncodedActorAggregateCommandSchema.Type = {
        id: makeNodeCommandId(binding.nodeId, 1),
        commandName: 'receiveCommand',
        contractVersion: 1,
        payload: '{}',
        aggregateId: key.aggregateId,
        aggregateName: key.aggregateName,
        aggregateVersion: binding.aggregateVersion,
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
        admitAggregateCommandsTx(db, {
          commands: [stale],
          key,
        }).pipe(Effect.result),
      );
      expect(missing).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'node-producer-not-registered' },
      });
      const admitted = await config.managedRuntime.runPromise(
        admitAggregateCommandsTx(db, {
          commands: [command],
          key,
        }),
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

it('delivers a recorded command to another release of the same Aggregate', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const chain = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_self/account',
  );
  expect(
    (
      await chain.admitDirectSystemCommand({
        command: {
          commandName: 'dispatchWork',
          contractVersion: 1,
          payload: JSON.stringify({
            reservationId: 'rsv_self',
            expiresAt: 60000,
            aggregateId: 'acc_self',
          }),
          kind: 'system',
          aggregateName: 'account',
          aggregateId: 'acc_self',
          aggregateVersion: 1,
        },
      })
    ).result._tag,
  ).toBe('Success');
  expect((await chain.executeCommandsThrough(1)).result._tag).toBe('Success');
  await expect
    .poll(() =>
      runInDurableObject(
        chain,
        ({ db, schema }) =>
          db.select().from(schema.commandProgress).get()
            ?.admittedThroughIndex ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  expect((await chain.executeCommandsThrough(2)).result._tag).toBe('Success');
  expect(
    (await chain.getAggregateCommand({ aggregateIndex: 2 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: {
      commandName: 'receiveCommand',
      aggregateVersion: 2,
      outcome: { result: { _tag: 'Success' } },
    },
  });
}, 20_000);

it.each([
  {
    scenario: 'destination Success',
    expiresAt: 60000,
    expected: 'Success',
    commandName: 'completeReservation',
    fields: { confirmation: 60001 },
  },
  {
    scenario: 'destination Failure',
    expiresAt: -2,
    expected: 'Failure',
    commandName: 'recordReservationRefusal',
    fields: { failureCode: 'reservation-confirm-refused' },
  },
  {
    scenario: 'a schema-invalid mapper result',
    expiresAt: 60_001,
    expected: 'Success',
    commandName: 'completeReservation',
    mapperFailureCode: 'encode-command-payload-failed',
  },
])(
  'admits one Service continuation after $scenario',
  async ({ expiresAt, expected, commandName, fields, mapperFailureCode }) => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (
        await systemRepo.registerSystemSpec({
          spec: makeSystemSpec({ system }),
        })
      ).result._tag,
    ).toBe('Success');
    expect((await systemRepo.initialize()).result._tag).toBe('Success');
    const source = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/dispatcher',
    );
    const destination = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/reservations',
    );
    await env.BUCKET.put('chain-delivery/destination-outcome', 'blocked');
    const reservationId = 'rsv_continuation';
    const submission = await source.admitDirectSystemCommand({
      command: {
        commandName: 'dispatchWithContinuation',
        contractVersion: 1,
        payload: JSON.stringify({ reservationId, expiresAt }),
        kind: 'system',
        serviceName: 'dispatcher',
        serviceVersion: 1,
      },
    });
    expect(submission.result._tag).toBe('Success');
    expect((await source.executeCommandsThrough(1)).result._tag).toBe(
      'Success',
    );
    await expect
      .poll(() =>
        runInDurableObject(
          destination,
          ({ db, schema }) =>
            db.select().from(schema.admissionPosition).get()?.lastIndex,
        ),
      )
      .toBe(1);
    await expect
      .poll(async () => {
        await runDurableObjectAlarm(source);
        return runInDurableObject(
          source,
          ({ db, schema }) =>
            db.select().from(schema.admissionPosition).get()?.lastIndex,
        );
      })
      .toBe(1);

    // Fail after child insertion to verify that the entire admission rolls back.
    await runInDurableObject(source, ({ db }) => {
      db.run(
        sql`CREATE TRIGGER fixture_command_continuation BEFORE DELETE ON commandOperationOutbox BEGIN SELECT RAISE(ABORT, 'fixture-command-continuation'); END`,
      );
    });
    await env.BUCKET.put('chain-delivery/destination-outcome', 'observe');
    await runDurableObjectAlarm(source);
    expect((await destination.executeCommandsThrough(1)).result._tag).toBe(
      'Success',
    );
    await expect
      .poll(() =>
        runInDurableObject(
          source,
          ({ db, schema }) =>
            db.select().from(schema.commandOperationOutbox).get()
              ?.destinationOutcome,
        ),
      )
      .toEqual(expect.any(String));
    const retained = await runInDurableObject(source, ({ db, schema }) => ({
      row: db.select().from(schema.commandOperationOutbox).get(),
      admittedThrough: db.select().from(schema.admissionPosition).get()
        ?.lastIndex,
    }));
    if (retained.row?.destinationOutcome == null) {
      expect.fail('Pending operation has no destination outcome');
    }
    const recorded = Schema.decodeUnknownSync(
      Schema.fromJsonString(CommandOutcomeSchema),
    )(retained.row.destinationOutcome);
    const destinationHistory = await Effect.runPromise(
      getServiceVersionChain({
        key: {
          systemId: 'sys_servicePublication',
          serviceName: 'reservations',
          serviceVersion: 2,
        },
      }),
    );
    expect(recorded.result._tag).toBe(expected);
    await expect
      .poll(
        async () =>
          (await destinationHistory.getEvaluatedCommand({ serviceIndex: 1 }))
            .result,
      )
      .toMatchObject({ _tag: 'Success', success: { outcome: recorded } });
    expect(retained.admittedThrough).toBe(1);
    const frozen = Schema.decodeUnknownSync(
      Schema.fromJsonString(RecordedCommandSchema),
    )(retained.row.command);
    const childId = frozen.continuation?.id;
    expect(childId).toEqual(expect.any(String));
    if (mapperFailureCode !== undefined) {
      await expect
        .poll(() =>
          runInDurableObject(source, ({ db, schema }) => {
            const pending = db
              .select()
              .from(schema.commandOperationOutbox)
              .get();
            return JSON.parse(pending?.continuationFailure ?? 'null');
          }),
        )
        .toMatchObject({
          commandName,
          contractVersion: 1,
          payload: null,
          failure: { code: mapperFailureCode },
        });
      expect(await readOffsetPayloadBuilds()).toEqual([expiresAt]);
    }
    await runInDurableObject(source, ({ db }) => {
      db.run(sql`DROP TRIGGER fixture_command_continuation`);
    });
    await evictDurableObject(source);
    await runDurableObjectAlarm(source);
    await expect
      .poll(() =>
        runInDurableObject(
          source,
          ({ db, schema }) =>
            db.select().from(schema.admissionPosition).get()?.lastIndex,
        ),
      )
      .toBe(2);
    expect((await source.executeCommandsThrough(2)).result._tag).toBe(
      'Success',
    );
    const continuation = (await source.getServiceCommand({ serviceIndex: 2 }))
      .result;
    expect(continuation).toMatchObject({
      _tag: 'Success',
      success: {
        id: childId,
        commandName,
        contractVersion: 1,
        serviceVersion: 1,
        outcome: {
          result:
            mapperFailureCode === undefined
              ? { _tag: 'Success' }
              : { _tag: 'Failure', failure: { code: mapperFailureCode } },
          finalizedAt: expect.any(Date),
        },
      },
    });
    if (continuation._tag !== 'Success' || continuation.success === null) {
      throw new Error('Admitted continuation missing');
    }
    if (mapperFailureCode === undefined) {
      if (continuation.success.payload === null) {
        expect.fail('Expected an encoded continuation payload');
      }
      expect(JSON.parse(continuation.success.payload)).toEqual({
        reservationId,
        expiresAt,
        ...fields,
      });
    } else {
      expect(continuation.success.payload).toBeNull();
      const archive = await Effect.runPromise(
        getServiceVersionArchive({
          key: {
            systemId: 'sys_servicePublication',
            serviceName: 'dispatcher',
            serviceVersion: 1,
            firstServiceIndex: 1,
          },
        }),
      );
      await expect
        .poll(() => archive.getRepoTableRows({ tableName: 'commands' }))
        .toMatchObject({
          result: {
            _tag: 'Success',
            success: {
              rows: expect.arrayContaining([
                expect.objectContaining({
                  serviceIndex: 2,
                  id: childId,
                  payload: null,
                  operations: '[]',
                }),
              ]),
            },
          },
        });
    }
    expect(
      (await destination.getServiceCommand({ serviceIndex: 1 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: { id: frozen.command.id },
    });
    await runInDurableObject(source, instance => instance.onAlarm());
    expect(
      (
        await env.BUCKET.list({
          prefix: 'chain-delivery/destination-observation/',
        })
      ).objects,
    ).toHaveLength(1);
    if (mapperFailureCode !== undefined) {
      expect(await readOffsetPayloadBuilds()).toEqual([expiresAt]);
    }
    expect(
      await runInDurableObject(source, ({ db, schema }) => ({
        admittedThrough: db.select().from(schema.admissionPosition).get()
          ?.lastIndex,
        pending: db.select().from(schema.commandOperationOutbox).all().length,
      })),
    ).toEqual({ admittedThrough: 2, pending: 0 });
    expect(
      await runInDurableObject(
        destination,
        ({ db, schema }) =>
          db.select().from(schema.admissionPosition).get()?.lastIndex,
      ),
    ).toBe(1);
    const forbidden = await source.admitDirectSystemCommand({
      command: {
        commandName,
        contractVersion: 1,
        payload: '{}',
        kind: 'system',
        serviceName: 'dispatcher',
        serviceVersion: 1,
      },
    });
    expect(forbidden.result._tag).toBe('Failure');
  },
  20_000,
);

it('rejects a caller-supplied continuation payload', async () => {
  const operation =
    dispatcherV1.system.dispatchWithContinuation.operations.reserve;
  const invalid = Reflect.apply(operation.make, undefined, [
    {
      payload: { reservationId: 'rsv_missing', expiresAt: 1 },
      continuationPayload: {},
    },
  ]);
  expect(Exit.isFailure(await Effect.runPromise(Effect.exit(invalid)))).toBe(
    true,
  );
});

it.each([
  {
    scenario: 'program refusal with its valid payload',
    reservationId: 'rsv_aggregate_failure',
    failureCode: 'aggregate-continuation-refused',
  },
  {
    scenario: 'mapper failure with SQL NULL',
    reservationId: 'rsv_throw_in_mapper',
    failureCode: 'command-continuation-payload-builder-failed',
  },
])(
  'retains Aggregate continuation $scenario',
  async ({ reservationId, failureCode }) => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (
        await systemRepo.registerSystemSpec({
          spec: makeSystemSpec({ system }),
        })
      ).result._tag,
    ).toBe('Success');
    expect((await systemRepo.initialize()).result._tag).toBe('Success');
    const source = env.AGGREGATE_CHAIN.getByName(
      'ac_sys_servicePublication/acc_failure/account',
    );
    const destination = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/reservations',
    );
    expect(
      (
        await source.admitDirectSystemCommand({
          command: {
            commandName: 'dispatchWithContinuation',
            contractVersion: 1,
            payload: JSON.stringify({ reservationId }),
            kind: 'system',
            aggregateName: 'account',
            aggregateId: 'acc_failure',
            aggregateVersion: 1,
          },
        })
      ).result._tag,
    ).toBe('Success');
    expect((await source.executeCommandsThrough(1)).result._tag).toBe(
      'Success',
    );
    await expect
      .poll(() =>
        runInDurableObject(
          destination,
          ({ db, schema }) =>
            db.select().from(schema.admissionPosition).get()?.lastIndex,
        ),
      )
      .toBe(1);
    expect((await destination.executeCommandsThrough(1)).result._tag).toBe(
      'Success',
    );
    await expect
      .poll(() =>
        runInDurableObject(
          source,
          ({ db, schema }) =>
            db.select().from(schema.commandProgress).get()
              ?.admittedThroughIndex,
        ),
      )
      .toBe(2);
    expect((await source.executeCommandsThrough(2)).result._tag).toBe(
      'Success',
    );
    const key = {
      systemId: 'sys_servicePublication',
      aggregateId: 'acc_failure',
      aggregateName: 'account',
      aggregateVersion: 1,
    };
    const history = await Effect.runPromise(getAggregateVersionChain({ key }));
    await expect
      .poll(
        async () =>
          (await history.getEvaluatedCommand({ aggregateIndex: 1 })).result,
      )
      .toMatchObject({
        _tag: 'Success',
        success: { operations: [{ operationName: 'command' }] },
      });
    const original = (await history.getEvaluatedCommand({ aggregateIndex: 1 }))
      .result;
    if (original._tag !== 'Success' || original.success === null) {
      expect.fail('Expected the published original Aggregate command');
    }
    const operation = original.success.operations[0];
    if (operation?.operationName !== 'command') {
      expect.fail('Expected the recorded command operation');
    }
    const childId = operation.command.continuation?.id;
    expect(childId).toEqual(expect.any(String));
    expect(
      (await destination.getServiceCommand({ serviceIndex: 1 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: {
        id: operation.command.command.id,
        outcome: { result: { _tag: 'Success' } },
      },
    });
    const payload =
      failureCode === 'aggregate-continuation-refused'
        ? JSON.stringify({ reservationId })
        : null;
    expect(
      (await source.getAggregateCommand({ aggregateIndex: 2 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: {
        id: childId,
        commandName: 'completeAggregateReservation',
        contractVersion: 1,
        aggregateVersion: 1,
        payload,
        outcome: {
          result: {
            _tag: 'Failure',
            failure: { code: failureCode },
          },
          finalizedAt: expect.any(Date),
        },
      },
    });
    const archive = await Effect.runPromise(
      getAggregateVersionArchive({ key: { ...key, firstAggregateIndex: 1 } }),
    );
    await expect
      .poll(() => archive.getRepoTableRows({ tableName: 'commands' }))
      .toMatchObject({
        result: {
          _tag: 'Success',
          success: {
            rows: expect.arrayContaining([
              expect.objectContaining({
                aggregateIndex: 2,
                id: childId,
                payload,
                operations: '[]',
              }),
            ]),
          },
        },
      });
    await runDurableObjectAlarm(source);
    expect(
      await runInDurableObject(source, ({ db, schema }) => ({
        admittedThrough: db.select().from(schema.commandProgress).get()
          ?.admittedThroughIndex,
        pending: db.select().from(schema.commandOperationOutbox).all(),
      })),
    ).toEqual({ admittedThrough: 2, pending: [] });
    expect(
      await runInDurableObject(
        destination,
        ({ db, schema }) =>
          db.select().from(schema.admissionPosition).get()?.lastIndex,
      ),
    ).toBe(1);
  },
  20_000,
);

it('retains a declared Actor failure and leaves an execution defect pending', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_actor_failure/account',
  );
  const actorCommand = {
    id: makeNodeCommandId('node_failure', 1),
    commandName: 'failActorCommand',
    contractVersion: 1,
    payload: JSON.stringify({ note: 'aggregate failure' }),
    aggregateName: 'account',
    aggregateId: 'acc_actor_failure',
    aggregateVersion: 1,
    kind: 'actor' as const,
    actorName: 'failure',
    actorVersion: 1,
    claims: { aggregateId: 'acc_actor_failure', viewerId: 'one' },
    nodeId: 'node_failure',
    sessionName: 'viewer',
    pushIndex: 1,
  };
  const invalid = {
    ...actorCommand,
    id: makeNodeCommandId(actorCommand.nodeId, 2),
    pushIndex: 2,
    payload: '{"note":42}',
  };
  expect(
    (await source.admitAggregateCommands({ commands: [actorCommand, invalid] }))
      .result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-chain-command-invalid' },
  });
  expect(
    (await source.getAggregateCommand({ aggregateIndex: 1 })).result,
  ).toEqual({ _tag: 'Success', success: null });
  expect(
    (await source.admitAggregateCommands({ commands: [actorCommand] })).result
      ._tag,
  ).toBe('Success');
  expect((await source.executeCommandsThrough(1)).result._tag).toBe('Success');
  expect(
    (await source.getAggregateCommand({ aggregateIndex: 1 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: {
      outcome: {
        result: { _tag: 'Failure', failure: { code: 'actor-command-refused' } },
      },
    },
  });
  expect(
    (await source.getAggregateCommand({ aggregateIndex: 2 })).result,
  ).toEqual({ _tag: 'Success', success: null });

  const defect = {
    ...actorCommand,
    id: makeNodeCommandId('node_failure', 2),
    payload: JSON.stringify({ note: 'throw' }),
    pushIndex: 2,
  };
  expect(
    (await source.admitAggregateCommands({ commands: [defect] })).result._tag,
  ).toBe('Success');
  expect((await source.executeCommandsThrough(2)).result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-original-execution-defect' },
  });
  expect(
    (await source.getAggregateCommand({ aggregateIndex: 2 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { id: defect.id, outcome: null },
  });
}, 20_000);

it('logs and consumes a final Aggregate admission refusal without admitting a continuation', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_admission_handler/account',
  );
  const refusals = captureAdmissionRefusals();
  const admit = ServiceChain.prototype.admitFromAggregateChain;
  vi.spyOn(
    ServiceChain.prototype,
    'admitFromAggregateChain',
  ).mockImplementation(async function (this: ServiceChain, props) {
    return admit.call(this, {
      ...props,
      command: { ...props.command, serviceName: 'wrong-service' },
    });
  });
  expect(
    (
      await source.admitDirectSystemCommand({
        command: {
          commandName: 'dispatchWithContinuation',
          contractVersion: 1,
          payload: JSON.stringify({ reservationId: 'rsv_admission_handler' }),
          kind: 'system',
          aggregateName: 'account',
          aggregateId: 'acc_admission_handler',
          aggregateVersion: 1,
        },
      })
    ).result._tag,
  ).toBe('Success');
  expect((await source.executeCommandsThrough(1)).result._tag).toBe('Success');
  await expect
    .poll(() => refusals)
    .toMatchObject([
      {
        level: 'error',
        payload: {
          source: {
            systemId: 'sys_servicePublication',
            aggregateName: 'account',
            aggregateId: 'acc_admission_handler',
          },
          sourceIndex: 1,
          operationIndex: 0,
          destination: { serviceName: 'reservations', serviceVersion: 2 },
          destinationCommandId: expect.stringMatching(/^cmd_/),
          destinationCommandName: 'createReservation',
          destinationContractVersion: 1,
          refusalCode: 'service-command-scope-mismatch',
        },
      },
    ]);
  expect(
    await runInDurableObject(source, ({ db, schema }) => ({
      pending: db.select().from(schema.commandOperationOutbox).all(),
      admittedThroughIndex: db.select().from(schema.commandProgress).get()
        ?.admittedThroughIndex,
    })),
  ).toEqual({ pending: [], admittedThroughIndex: 1 });
  expect(
    (await source.getAggregateCommand({ aggregateIndex: 2 })).result,
  ).toEqual({ _tag: 'Success', success: null });
}, 20_000);

it('logs and consumes a final Service admission refusal without running the continuation', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/dispatcher',
  );
  const refusals = captureAdmissionRefusals();
  const admit = ServiceChain.prototype.admitFromServiceChain;
  let attempts = 0;
  vi.spyOn(ServiceChain.prototype, 'admitFromServiceChain').mockImplementation(
    async function (this: ServiceChain, props) {
      if (this.key.serviceName !== 'reservations') {
        return admit.call(this, props);
      }
      attempts += 1;
      return admit.call(this, {
        ...props,
        command: { ...props.command, serviceName: 'wrong-service' },
      });
    },
  );
  expect(
    (
      await source.admitDirectSystemCommand({
        command: {
          commandName: 'dispatchWithContinuation',
          contractVersion: 1,
          payload: JSON.stringify({
            reservationId: 'rsv_refused',
            expiresAt: 60000,
          }),
          kind: 'system',
          serviceName: 'dispatcher',
          serviceVersion: 1,
        },
      })
    ).result._tag,
  ).toBe('Success');
  expect((await source.executeCommandsThrough(1)).result._tag).toBe('Success');
  await expect
    .poll(() => refusals)
    .toMatchObject([
      {
        level: 'error',
        payload: {
          source: {
            systemId: 'sys_servicePublication',
            serviceName: 'dispatcher',
          },
          sourceIndex: 1,
          operationIndex: 0,
          destination: { serviceName: 'reservations', serviceVersion: 2 },
          destinationCommandId: expect.stringMatching(/^cmd_/),
          destinationCommandName: 'confirmReservation',
          destinationContractVersion: 1,
          refusalCode: 'service-command-scope-mismatch',
        },
      },
    ]);
  expect(
    await runInDurableObject(source, ({ db, schema }) =>
      db.select().from(schema.commandOperationOutbox).all(),
    ),
  ).toEqual([]);
  expect((await source.getServiceCommand({ serviceIndex: 2 })).result).toEqual({
    _tag: 'Success',
    success: null,
  });
  await runDurableObjectAlarm(source);
  expect(attempts).toBe(1);
  expect(refusals).toHaveLength(1);
}, 20_000);

it('logs independent admission refusals from an Aggregate source', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_source/account',
  );
  const refusals = captureAdmissionRefusals();
  const admitService = ServiceChain.prototype.admitFromAggregateChain;
  vi.spyOn(
    ServiceChain.prototype,
    'admitFromAggregateChain',
  ).mockImplementation(async function (this: ServiceChain, props) {
    return admitService.call(this, {
      ...props,
      command: { ...props.command, serviceName: 'wrong-service' },
    });
  });
  const admitAggregate = AggregateChain.prototype.admitFromAggregateChain;
  vi.spyOn(
    AggregateChain.prototype,
    'admitFromAggregateChain',
  ).mockImplementation(async function (this: AggregateChain, props) {
    return admitAggregate.call(this, {
      ...props,
      command: { ...props.command, aggregateId: 'wrong-owner' },
    });
  });
  expect(
    (
      await source.admitDirectSystemCommand({
        command: {
          commandName: 'dispatchWork',
          contractVersion: 1,
          payload: JSON.stringify({
            reservationId: 'rsv_refused_aggregate',
            expiresAt: 60000,
            aggregateId: 'acc_destination',
          }),
          kind: 'system',
          aggregateName: 'account',
          aggregateId: 'acc_source',
          aggregateVersion: 1,
        },
      })
    ).result._tag,
  ).toBe('Success');
  expect((await source.executeCommandsThrough(1)).result._tag).toBe('Success');
  await expect
    .poll(() => refusals)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'error',
          payload: expect.objectContaining({
            sourceIndex: 1,
            operationIndex: 0,
            destination: { serviceName: 'reservations', serviceVersion: 2 },
            refusalCode: 'service-command-scope-mismatch',
          }),
        }),
        expect.objectContaining({
          level: 'error',
          payload: expect.objectContaining({
            sourceIndex: 1,
            operationIndex: 1,
            destination: {
              aggregateName: 'account',
              aggregateId: 'acc_destination',
              aggregateVersion: 2,
            },
            refusalCode: 'aggregate-command-owner-mismatch',
          }),
        }),
      ]),
    );
  expect(refusals).toHaveLength(2);
  expect(
    await runInDurableObject(source, ({ db, schema }) =>
      db.select().from(schema.commandOperationOutbox).all(),
    ),
  ).toEqual([]);
}, 20_000);

it.each(['ServiceChain', 'AggregateChain'] as const)(
  '%s retries frozen deliveries using producer coverage after receiver pruning and eviction',
  async sourceName => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (
        await systemRepo.registerSystemSpec({
          spec: makeSystemSpec({ system }),
        })
      ).result._tag,
    ).toBe('Success');
    expect((await systemRepo.initialize()).result._tag).toBe('Success');
    const serviceSource = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/dispatcher',
    );
    const aggregateSource = env.AGGREGATE_CHAIN.getByName(
      'ac_sys_servicePublication/acc_source/account',
    );
    const source =
      sourceName === 'ServiceChain' ? serviceSource : aggregateSource;
    const service = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/reservations',
    );
    const aggregate = env.AGGREGATE_CHAIN.getByName(
      'ac_sys_servicePublication/acc_destination/account',
    );
    let loseServiceReply = true;
    let loseAggregateReply = true;
    const serviceAttempts: unknown[] = [];
    const aggregateAttempts: unknown[] = [];
    if (sourceName === 'ServiceChain') {
      const serviceAdmission = ServiceChain.prototype.admitFromServiceChain;
      vi.spyOn(
        ServiceChain.prototype,
        'admitFromServiceChain',
      ).mockImplementation(async function (this: ServiceChain, props) {
        const reply = await serviceAdmission.call(this, props);
        if (
          this.key.serviceName === 'reservations' &&
          reply.result._tag === 'Success'
        ) {
          serviceAttempts.push(props.command);
          if (loseServiceReply) {
            throw new Error('Lost Service admission reply after commit');
          }
        }
        return reply;
      });
      const aggregateAdmission = AggregateChain.prototype.admitFromServiceChain;
      vi.spyOn(
        AggregateChain.prototype,
        'admitFromServiceChain',
      ).mockImplementation(async function (this: AggregateChain, props) {
        const reply = await aggregateAdmission.call(this, props);
        if (
          this.key.aggregateId === 'acc_destination' &&
          reply.result._tag === 'Success'
        ) {
          aggregateAttempts.push(props.command);
          if (loseAggregateReply) {
            throw new Error('Lost Aggregate admission reply after commit');
          }
        }
        return reply;
      });
    } else {
      const serviceAdmission = ServiceChain.prototype.admitFromAggregateChain;
      vi.spyOn(
        ServiceChain.prototype,
        'admitFromAggregateChain',
      ).mockImplementation(async function (this: ServiceChain, props) {
        const reply = await serviceAdmission.call(this, props);
        if (
          this.key.serviceName === 'reservations' &&
          reply.result._tag === 'Success'
        ) {
          serviceAttempts.push(props.command);
          if (loseServiceReply) {
            throw new Error('Lost Service admission reply after commit');
          }
        }
        return reply;
      });
      const aggregateAdmission =
        AggregateChain.prototype.admitFromAggregateChain;
      vi.spyOn(
        AggregateChain.prototype,
        'admitFromAggregateChain',
      ).mockImplementation(async function (this: AggregateChain, props) {
        const reply = await aggregateAdmission.call(this, props);
        if (
          this.key.aggregateId === 'acc_destination' &&
          reply.result._tag === 'Success'
        ) {
          aggregateAttempts.push(props.command);
          if (loseAggregateReply) {
            throw new Error('Lost Aggregate admission reply after commit');
          }
        }
        return reply;
      });
    }
    const parent = {
      commandName: 'dispatchWork',
      contractVersion: 1,
      payload: JSON.stringify({
        reservationId: 'rsv_delivery',
        expiresAt: 60_000,
        aggregateId: 'acc_destination',
      }),
      kind: 'system' as const,
    };
    const admission =
      sourceName === 'ServiceChain'
        ? await serviceSource.admitDirectSystemCommand({
            command: {
              ...parent,
              serviceName: 'dispatcher',
              serviceVersion: 1,
            },
          })
        : await aggregateSource.admitDirectSystemCommand({
            command: {
              ...parent,
              aggregateName: 'account',
              aggregateId: 'acc_source',
              aggregateVersion: 1,
            },
          });
    expect(admission.result._tag).toBe('Success');
    expect((await source.executeCommandsThrough(1)).result._tag).toBe(
      'Success',
    );
    await expect.poll(() => serviceAttempts.length).toBeGreaterThan(0);
    // The second destination is contacted even while the first acknowledgement is lost.
    await expect.poll(() => aggregateAttempts.length).toBeGreaterThan(0);
    const frozen = await runInDurableObject(source, (instance: ISourceChain) =>
      instance.db
        .select()
        .from(instance.schema.commandOperationOutbox)
        .orderBy(asc(instance.schema.commandOperationOutbox.operationIndex))
        .all(),
    );
    expect(frozen.map(row => row.operationIndex)).toEqual([0, 1]);
    const [first, second] = frozen.map(row =>
      Schema.decodeUnknownSync(Schema.fromJsonString(RecordedCommandSchema))(
        row.command,
      ),
    );
    if (first === undefined || second === undefined) {
      throw new Error('Frozen deliveries missing');
    }
    expect(first).toMatchObject({
      type: 'service',
      command: { commandName: 'createReservation', serviceVersion: 2 },
    });
    expect(second).toMatchObject({
      type: 'aggregate',
      command: { commandName: 'receiveCommand', aggregateVersion: 2 },
    });
    expect((await service.executeCommandsThrough(1)).result._tag).toBe(
      'Success',
    );
    await runDurableObjectAlarm(service);
    await expect
      .poll(() =>
        runInDurableObject(
          service,
          ({ db, schema }) => db.select().from(schema.commands).all().length,
        ),
      )
      .toBe(0);
    await evictDurableObject(service);
    await evictDurableObject(source);
    expect((await source.awaitStartup()).result._tag).toBe('Success');
    loseServiceReply = false;
    await runInDurableObject(source, (instance: ISourceChain) =>
      instance.onAlarm(),
    );
    await expect
      .poll(() =>
        runInDurableObject(source, (instance: ISourceChain) =>
          instance.db
            .select()
            .from(instance.schema.commandOperationOutbox)
            .all(),
        ),
      )
      .toEqual([frozen[1]]);
    expect((await aggregate.executeCommandsThrough(1)).result._tag).toBe(
      'Success',
    );
    await runDurableObjectAlarm(aggregate);
    await expect
      .poll(() =>
        runInDurableObject(
          aggregate,
          ({ db, schema }) => db.select().from(schema.commands).all().length,
        ),
      )
      .toBe(0);
    await evictDurableObject(aggregate);
    loseAggregateReply = false;
    await runDurableObjectAlarm(source);
    await expect
      .poll(() =>
        runInDurableObject(source, (instance: ISourceChain) =>
          instance.db
            .select()
            .from(instance.schema.commandOperationOutbox)
            .all(),
        ),
      )
      .toEqual([]);
    expect(serviceAttempts).toEqual(serviceAttempts.map(() => first.command));
    expect(aggregateAttempts).toEqual(
      aggregateAttempts.map(() => second.command),
    );
    expect(
      await runInDurableObject(
        service,
        ({ db, schema }) =>
          db.select().from(schema.admissionPosition).get()?.lastIndex,
      ),
    ).toBe(1);
    expect(
      await runInDurableObject(
        aggregate,
        ({ db, schema }) =>
          db.select().from(schema.commandProgress).get()?.admittedThroughIndex,
      ),
    ).toBe(1);
    const attempts = [serviceAttempts.length, aggregateAttempts.length];
    expect((await source.executeCommandsThrough(1)).result._tag).toBe(
      'Success',
    );
    await runDurableObjectAlarm(source);
    expect([serviceAttempts.length, aggregateAttempts.length]).toEqual(
      attempts,
    );
  },
  20_000,
);

it.each(['ServiceChain', 'AggregateChain'] as const)(
  '%s retains no child after source failure and keeps source success after destination refusal',
  async sourceName => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (
        await systemRepo.registerSystemSpec({
          spec: makeSystemSpec({ system }),
        })
      ).result._tag,
    ).toBe('Success');
    expect((await systemRepo.initialize()).result._tag).toBe('Success');
    const serviceSource = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/dispatcher',
    );
    const aggregateSource = env.AGGREGATE_CHAIN.getByName(
      'ac_sys_servicePublication/acc_source/account',
    );
    const source =
      sourceName === 'ServiceChain' ? serviceSource : aggregateSource;
    const destination = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/reservations',
    );
    for (const [index, expiresAt] of [-1, -2].entries()) {
      const parent = {
        commandName: 'dispatchWork',
        contractVersion: 1,
        payload: JSON.stringify({
          reservationId: `rsv_refusal_${index}`,
          expiresAt,
          aggregateId: 'acc_destination',
        }),
        kind: 'system',
      } as const;
      const admission =
        sourceName === 'ServiceChain'
          ? await serviceSource.admitDirectSystemCommand({
              command: {
                ...parent,
                serviceName: 'dispatcher',
                serviceVersion: 1,
              },
            })
          : await aggregateSource.admitDirectSystemCommand({
              command: {
                ...parent,
                aggregateName: 'account',
                aggregateId: 'acc_source',
                aggregateVersion: 1,
              },
            });
      expect(admission.result._tag).toBe('Success');
      expect((await source.executeCommandsThrough(index + 1)).result._tag).toBe(
        'Success',
      );
      const retained =
        sourceName === 'ServiceChain'
          ? await serviceSource.getServiceCommand({ serviceIndex: index + 1 })
          : await aggregateSource.getAggregateCommand({
              aggregateIndex: index + 1,
            });
      expect(retained.result).toMatchObject({
        _tag: 'Success',
        success: {
          outcome: { result: { _tag: index === 0 ? 'Failure' : 'Success' } },
        },
      });
      if (index === 0) {
        expect(
          await runInDurableObject(source, (instance: ISourceChain) =>
            instance.db
              .select()
              .from(instance.schema.commandOperationOutbox)
              .all(),
          ),
        ).toEqual([]);
        expect(
          await runInDurableObject(destination, ({ db, schema }) =>
            db.select().from(schema.commands).all(),
          ),
        ).toEqual([]);
      }
    }
    await expect
      .poll(() =>
        runInDurableObject(
          destination,
          ({ db, schema }) =>
            db.select().from(schema.admissionPosition).get()?.lastIndex,
        ),
      )
      .toBe(1);
    expect((await destination.executeCommandsThrough(1)).result._tag).toBe(
      'Success',
    );
    expect(
      (await destination.getServiceCommand({ serviceIndex: 1 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: {
        outcome: {
          result: {
            _tag: 'Failure',
            failure: { code: 'reservation-create-refused' },
          },
        },
      },
    });
    await expect
      .poll(() =>
        runInDurableObject(source, (instance: ISourceChain) =>
          instance.db
            .select()
            .from(instance.schema.commandOperationOutbox)
            .all(),
        ),
      )
      .toEqual([]);
    const retained =
      sourceName === 'ServiceChain'
        ? await serviceSource.getServiceCommand({ serviceIndex: 2 })
        : await aggregateSource.getAggregateCommand({ aggregateIndex: 2 });
    expect(retained.result).toMatchObject({
      _tag: 'Success',
      success: { outcome: { result: { _tag: 'Success' } } },
    });
    const child =
      sourceName === 'ServiceChain'
        ? await serviceSource.getServiceCommand({ serviceIndex: 3 })
        : await aggregateSource.getAggregateCommand({ aggregateIndex: 3 });
    expect(child.result).toEqual({ _tag: 'Success', success: null });
  },
  20_000,
);

it('separates Node and recorded Aggregate admissions and rejects malformed RPC input before retention', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_admission/account',
  );
  const systemCommand: typeof EncodedSystemAggregateCommandSchema.Type = {
    id: 'cmd_admission_system',
    commandName: 'receiveCommand',
    contractVersion: 1,
    payload: '{}',
    aggregateId: 'acc_admission',
    aggregateName: 'account',
    aggregateVersion: 1,
    kind: 'system',
  };
  const actorCommand: typeof EncodedActorAggregateCommandSchema.Type = {
    ...systemCommand,
    id: makeNodeCommandId('node_admission', 1),
    kind: 'actor',
    actorName: 'reader',
    actorVersion: 1,
    claims: { userId: 'one' },
    nodeId: 'node_admission',
    sessionName: 'reader',
    pushIndex: 1,
  };
  const agentCommand: typeof EncodedAgentAggregateCommandSchema.Type = {
    ...systemCommand,
    id: 'cmd_admission_agent',
    kind: 'agent',
    agentName: 'background',
    agentVersion: 1,
  };
  expect((await source.awaitStartup()).result._tag).toBe('Success');
  const before = await runInDurableObject(
    source,
    async ({ db, schema }, { storage }) => {
      await storage.deleteAlarm();
      return db
        .select()
        .from(schema.commands)
        .orderBy(schema.commands.aggregateIndex)
        .all();
    },
  );
  const { pushIndex: _pushIndex, ...missingPosition } = actorCommand;
  const observation = {
    _tag: 'Success',
    success: null,
    recordedAt: new Date(1_000).toISOString(),
  };
  for (const command of [
    { ...missingPosition, id: 'cmd_missing_position' },
    { ...actorCommand, id: 'cmd_null_node', nodeId: null },
    { ...actorCommand, id: 'cmd_null_session', sessionName: null },
    { ...systemCommand, id: 'cmd_null_producer', nodeId: null },
    { ...actorCommand, id: 'cmd_mixed_fields', agentName: 'background' },
    {
      ...systemCommand,
      id: 'cmd_forged_external',
      kind: 'external',
      originCommandId: actorCommand.id,
      externalOutcome: observation,
    },
    {
      ...systemCommand,
      id: 'cmd_ordinary_observation',
      externalOutcome: observation,
    },
    { ...systemCommand, id: 'cmd_wrong_instance', aggregateId: 'acc_other' },
    { ...systemCommand, id: 'cmd_wrong_aggregate', aggregateName: 'other' },
  ]) {
    // Exercise the public RPC decoder with unknown wire input, without casting it into internal admitted props.
    const rejected = await Reflect.apply(
      source.admitAggregateCommands,
      source,
      [{ commands: [command] }],
    );
    expect(rejected.result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-chain-command-invalid' },
    });
  }
  expect(
    await runInDurableObject(source, ({ db, schema }) =>
      db
        .select()
        .from(schema.commands)
        .orderBy(schema.commands.aggregateIndex)
        .all(),
    ),
  ).toEqual(before);
  expect(
    (await source.admitAggregateCommands({ commands: [actorCommand] })).result
      ._tag,
  ).toBe('Failure');
  expect(
    (
      await source.transitionAgentNodeProducer({
        agentName: 'background',
        generation: 1,
        active: true,
      })
    ).result._tag,
  ).toBe('Success');
  expect(
    (
      await source.admitFromAggregateAgentNode({
        source: {
          systemId: 'sys_servicePublication',
          aggregateName: 'account',
          aggregateId: 'acc_admission',
          agentName: 'background',
        },
        generation: 1,
        producerIndex: 1,
        command: agentCommand,
      })
    ).result._tag,
  ).toBe('Failure');
  expect(
    (
      await source.admitFromServiceChain({
        source: {
          systemId: 'sys_servicePublication',
          serviceName: 'dispatcher',
        },
        position: { sourceIndex: 8, operationIndex: 3 },
        command: systemCommand,
      })
    ).result,
  ).toEqual({
    _tag: 'Success',
    success: {
      acknowledgedSourceIndex: 8,
      acknowledgedOperationIndex: 3,
      destinationIndex: 1,
    },
  });
});

it('retains Aggregate producer checkpoints independently and rolls back ordered admission', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_retry/account',
  );
  expect((await source.awaitStartup()).result._tag).toBe('Success');
  await runInDurableObject(source, async ({ db, schema, key }, { storage }) => {
    expect(db.select().from(schema.commandProgress).all()).toMatchObject([
      { singleton: 1, admittedThroughIndex: 0, finalizedThroughIndex: 0 },
    ]);
    const command: typeof EncodedActorAggregateCommandSchema.Type = {
      id: makeNodeCommandId('node_retry', 1),
      commandName: 'receiveCommand',
      contractVersion: 1,
      payload: '{}',
      aggregateId: key.aggregateId,
      aggregateName: key.aggregateName,
      aggregateVersion: 1,
      kind: 'actor',
      actorName: 'viewer',
      actorVersion: 1,
      claims: { aggregateId: key.aggregateId, viewerId: 'one' },
      nodeId: 'node_retry',
      sessionName: 'reader',
      pushIndex: 1,
    };
    const submit = (commands: readonly (typeof command)[]) =>
      config.managedRuntime.runPromise(
        admitAggregateCommandsTx(db, { commands, key }),
      );
    expect((await submit([command]))[0]?.aggregateIndex).toBe(1);
    const before = db.select().from(schema.commands).all();
    const progress = db.select().from(schema.commandProgress).all();
    expect(progress).toMatchObject([
      { singleton: 1, admittedThroughIndex: 1, finalizedThroughIndex: 0 },
    ]);
    const producers = db.select().from(schema.nodeProducers).all();
    const next = {
      ...command,
      id: makeNodeCommandId(command.nodeId, 2),
      pushIndex: 2,
    };
    for (const [changed, code] of [
      [command, 'node-admission-index-mismatch'],
      [
        { ...next, id: 'cmd_forged' as const },
        'node-command-identity-mismatch',
      ],
      [{ ...next, actorVersion: 2 }, 'node-admission-identity-mismatch'],
      [
        { ...next, claims: { ...command.claims, extra: true } },
        'node-admission-identity-mismatch',
      ],
      [
        { ...next, id: makeNodeCommandId(command.nodeId, 3), pushIndex: 3 },
        'node-admission-index-mismatch',
      ],
    ] as const) {
      const failed = await config.managedRuntime.runPromise(
        admitAggregateCommandsTx(db, { commands: [changed], key }).pipe(
          Effect.flip,
        ),
      );
      expect(failed).toMatchObject({ code });
    }
    for (const later of [
      {
        ...command,
        id: makeNodeCommandId(command.nodeId, 3),
        pushIndex: 3,
        commandName: 'unregistered',
      },
      { ...command, id: makeNodeCommandId(command.nodeId, 4), pushIndex: 4 },
    ]) {
      await expect(submit([next, later])).rejects.toBeDefined();
      expect(db.select().from(schema.commands).all()).toEqual(before);
      expect(db.select().from(schema.commandProgress).all()).toEqual(progress);
      expect(db.select().from(schema.nodeProducers).all()).toEqual(producers);
    }
    const {
      nodeId: _nodeId,
      sessionName: _sessionName,
      pushIndex: _pushIndex,
      actorName: _actorName,
      actorVersion: _actorVersion,
      claims: _claims,
      ...ordinary
    } = command;
    const systemCommand = {
      ...ordinary,
      id: 'cmd_interleaved' as const,
      kind: 'system' as const,
    };
    expect(
      await config.managedRuntime.runPromise(
        admitFromServiceChainTx(db, {
          key,
          source: { systemId: key.systemId, serviceName: 'dispatcher' },
          position: { sourceIndex: 1, operationIndex: 0 },
          command: systemCommand,
        }),
      ),
    ).toEqual({
      acknowledgedSourceIndex: 1,
      acknowledgedOperationIndex: 0,
      destinationIndex: 2,
    });
    expect(
      db.select().from(schema.commandProgress).get()?.admittedThroughIndex,
    ).toBe(2);
    db.delete(schema.commands).run();
    expect((await submit([next]))[0]?.aggregateIndex).toBe(3);
    await storage.deleteAlarm();
  });
});

it('admits out-of-order recorded Aggregate commands once at capacity', async () => {
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result._tag,
  ).toBe('Success');
  const source = env.AGGREGATE_CHAIN.getByName(
    'ac_sys_servicePublication/acc_capacity/account',
  );
  await runInDurableObject(source, async ({ db, schema, key }, { storage }) => {
    const command = {
      id: 'cmd_capacity' as const,
      aggregateName: key.aggregateName,
      aggregateId: key.aggregateId,
      aggregateVersion: 1,
      commandName: 'receiveCommand',
      contractVersion: 1,
      payload: '{}',
      kind: 'system' as const,
    };
    const producer = { systemId: key.systemId, serviceName: 'dispatcher' };
    for (let index = 1; index <= 64; index += 1) {
      await config.managedRuntime.runPromise(
        admitFromServiceChainTx(db, {
          key,
          source: producer,
          position: { sourceIndex: (65 - index) * 2, operationIndex: 3 },
          command: { ...command, id: `cmd_capacity_${index}` },
        }),
      );
    }
    const before = db.select().from(schema.recordedCommandAdmissions).all();
    expect(before).toHaveLength(64);
    expect(
      await config.managedRuntime.runPromise(
        admitFromServiceChainTx(db, {
          key,
          source: producer,
          position: { sourceIndex: 2, operationIndex: 3 },
          command: { ...command, id: 'cmd_capacity_64' },
        }),
      ),
    ).toEqual({
      acknowledgedSourceIndex: 2,
      acknowledgedOperationIndex: 3,
      destinationIndex: 64,
    });
    await expect(
      config.managedRuntime.runPromise(
        admitFromServiceChainTx(db, {
          key,
          source: producer,
          position: { sourceIndex: 2, operationIndex: 3 },
          command: {
            ...command,
            id: 'cmd_capacity_64',
            payload: '{"changed":true}',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'aggregate-recorded-command-conflict' });
    await expect(
      config.managedRuntime.runPromise(
        admitFromServiceChainTx(db, {
          key,
          source: producer,
          position: { sourceIndex: 130, operationIndex: 3 },
          command,
        }),
      ),
    ).rejects.toMatchObject({ code: 'aggregate-admission-backlog-full' });
    expect(db.select().from(schema.recordedCommandAdmissions).all()).toEqual(
      before,
    );
    expect(
      db.select().from(schema.commandProgress).get()?.admittedThroughIndex,
    ).toBe(64);
    await storage.deleteAlarm();
  });
});
