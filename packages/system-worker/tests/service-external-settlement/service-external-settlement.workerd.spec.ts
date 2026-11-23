import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IExternalOutcome } from '@zerospin/core/contracts/ExternalOutcomeSchema';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import {
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { beforeEach, expect, it } from 'vitest';

import { prepareServiceExternalOperation } from '../../src/externalOperations/prepareExternalOperation.ts';
import { ExternalContinuationResponseSchema } from '../../src/ownerOperations/ownerOperationSchema.ts';
import { getServiceVersionChain } from '../../src/ownerOperations/releaseRepoNamespaces.ts';
import { runOwnerOperation } from '../../src/ownerOperations/runOwnerOperation.ts';
import { admitServiceCommands } from '../../src/ServiceChain/admitServiceCommands/admitServiceCommands.ts';
import { adoptCanonicalServiceHistory } from '../../src/ServiceChain/adoptCanonicalServiceHistory.ts';
import { readServiceCommandOccurrence } from '../../src/ServiceChain/readServiceCommandOccurrence.ts';
import { recordExternalOutcomeAndAdmitCommandTx } from '../../src/ServiceChain/recordExternalOutcomeAndAdmitCommandTx.ts';
import { recordOriginalCommandOutcomeTx } from '../../src/ServiceChain/recordOriginalCommandOutcomeTx.ts';
import { serviceChainDbConfig } from '../../src/ServiceChain/serviceChainDbConfig.ts';
import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../../src/serviceDispositionChainHash/serviceDispositionChainHash.ts';
import type { IEvaluatedServiceCommand } from '../../src/ServiceVersionChain/evaluatedServiceCommand.ts';
import { recordReservationWorkDefinitionV1 as recordReservationWorkDefinition } from '../declarations/contracts/recordReservationWorkDefinitionV1.ts';
import { recordReservationWorkV1 as recordReservationWork } from '../declarations/contracts/recordReservationWorkV1.ts';

import config, { system } from './system.ts';

const settleExternal = (
  db: Parameters<typeof recordExternalOutcomeAndAdmitCommandTx>[0],
  props: Omit<
    Parameters<typeof recordExternalOutcomeAndAdmitCommandTx>[1],
    'build'
  >,
) =>
  recordExternalOutcomeAndAdmitCommandTx(db, {
    ...props,
    build: (serviceVersion, request) =>
      runOwnerOperation({
        env,
        release: { serviceName: props.key.serviceName, serviceVersion },
        request,
        local: Effect.die(new Error('Expected a ServiceReleaseWorker binding')),
        response: ExternalContinuationResponseSchema,
      }),
  });

let source: ReturnType<typeof env.SERVICE_CHAIN.getByName>;
const original = Schema.decodeUnknownSync(EncodedServiceCommandSchema)({
  id: makeNodeCommandId('node_external', 1),
  commandName: 'performReservationWork',
  contractVersion: 1,
  payload: JSON.stringify({
    reservationId: 'rsv_parent',
    expiresAt: 60_000,
    mode: 'noop',
  }),
  serviceName: 'reservations',
  serviceVersion: 1,
  kind: 'actor',
  actorName: 'operator',
  actorVersion: 1,
  claims: { viewerId: 'one', department: 'billing' },
  nodeId: 'node_external',
  sessionName: 'operator',
  pushIndex: 1,
});
const finalizedAt = new Date('2026-10-22T12:00:00Z');
const success: IExternalOutcome = {
  _tag: 'Success',
  success: null,
  recordedAt: new Date('2026-10-22T12:00:01Z'),
};
const failure: IExternalOutcome = {
  _tag: 'Failure',
  failure: {
    _tag: 'ExternalRequestFailure',
    code: 'external-request-failed',
    message: 'Provider request failed',
  },
  recordedAt: new Date('2026-10-22T12:00:02Z'),
};
let evaluatedCommand: IEvaluatedServiceCommand;
let operations: Extract<
  IEvaluatedServiceCommand['operations'][number],
  { operationName: 'external' }
>[];

beforeEach(async () => {
  await reset();
  source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  expect((await source.executeCommandsThrough(0)).result._tag).toBe('Success');
  await runDurableObjectAlarm(source);

  ({ evaluatedCommand, operations } = await runInDurableObject(
    source,
    async ({ db, key }, { storage }) => {
      const [admitted] = await config.managedRuntime.runPromise(
        admitServiceCommands({ db, key, commands: [original] }),
      );
      if (admitted === undefined) expect.fail('Expected an admitted command');
      const operations: Extract<
        IEvaluatedServiceCommand['operations'][number],
        { operationName: 'external' }
      >[] = [];
      for (const operationIndex of [2, 7]) {
        const prepared = await config.managedRuntime.runPromise(
          recordReservationWorkDefinition.externalOperation
            .make({
              payload: { reservationId: `rsv_external_${operationIndex}` },
            })
            .pipe(
              Effect.flatMap(operation =>
                prepareServiceExternalOperation({
                  serviceRelease: system.services.reservations.releases[1],
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
      const outcome: IEvaluatedServiceCommand['outcome'] = {
        result: { _tag: 'Success', success: null },
        finalizedAt,
      };
      return {
        operations,
        evaluatedCommand: {
          ...admitted,
          outcome,
          dispositionChainHash: advanceDispositionChainHash({
            previousDispositionChainHash: genesisDispositionChainHash(),
            serviceIndex: admitted.serviceIndex,
            commandId: admitted.id,
            outcome,
          }),
          operations,
        },
      };
    },
  ));
});

it('retains complete pending requests with the original outcome and does not recreate settled work on retry', async () => {
  const [first, second] = operations;
  if (first === undefined || second === undefined) {
    expect.fail('Expected two prepared invocations');
  }
  await runInDurableObject(source, async ({ db, schema, key }) => {
    expect(() =>
      recordOriginalCommandOutcomeTx(
        db,
        [1],
        [
          {
            ...evaluatedCommand,
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
    expect(db.select().from(schema.externalOperationOutbox).all()).toEqual([]);
    expect(() =>
      recordOriginalCommandOutcomeTx(
        db,
        [1],
        [{ ...evaluatedCommand, payload: '{"mismatch":true}' }],
        key,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'service-original-receipt-identity-mismatch',
      }),
    );

    recordOriginalCommandOutcomeTx(db, [1], [evaluatedCommand], key);
    expect(
      db
        .select()
        .from(schema.externalOperationOutbox)
        .orderBy(schema.externalOperationOutbox.externalCommandId)
        .all(),
    ).toEqual(
      operations
        .toSorted((left, right) =>
          left.externalCommandId < right.externalCommandId ? -1 : 1,
        )
        .map(operation => ({
          externalContractName: recordReservationWork.commandName,
          externalContractVersion: recordReservationWork.version,
          payload: JSON.stringify(operation.payload),
          externalCommandId: operation.externalCommandId,
          originCommandId: original.id,
          serviceVersion: original.serviceVersion,
          externalOutcome: null,
          continuationFailure: null,
        })),
    );
    expect(operations.map(operation => operation.operationIndex)).toEqual([
      2, 7,
    ]);
    expect(first.externalCommandId).not.toBe(second.externalCommandId);

    await config.managedRuntime.runPromise(
      settleExternal(db, {
        key,
        externalCommandId: first.externalCommandId,
        externalOutcome: success,
      }),
    );
    const remaining = db.select().from(schema.externalOperationOutbox).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.externalCommandId).toBe(second.externalCommandId);
    recordOriginalCommandOutcomeTx(db, [1], [evaluatedCommand], key);
    expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
      remaining,
    );
    expect(() =>
      recordOriginalCommandOutcomeTx(
        db,
        [1],
        [
          {
            ...evaluatedCommand,
            outcome: {
              ...evaluatedCommand.outcome,
              finalizedAt: new Date(finalizedAt.getTime() + 1),
            },
          },
        ],
        key,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'service-original-output-mismatch' }),
    );
    expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
      remaining,
    );
  });
});

it('admits each observation and deletes pending work atomically, with late callbacks as no-ops', async () => {
  const first = operations[0];
  if (first === undefined) expect.fail('Expected a prepared invocation');
  await runInDurableObject(source, async ({ db, schema, key }) => {
    recordOriginalCommandOutcomeTx(db, [1], [evaluatedCommand], key);
    const beforeCommands = db.select().from(schema.commands).all();
    const beforePending = db
      .select()
      .from(schema.externalOperationOutbox)
      .all();
    for (const statement of [
      sql`CREATE TRIGGER reject_settlement BEFORE INSERT ON commands BEGIN SELECT RAISE(ABORT, 'observation-admission-unavailable'); END`,
      sql`CREATE TRIGGER reject_settlement BEFORE DELETE ON externalOperationOutbox BEGIN SELECT RAISE(ABORT, 'pending-deletion-unavailable'); END`,
    ]) {
      db.run(statement);
      await expect(
        config.managedRuntime.runPromise(
          settleExternal(db, {
            key,
            externalCommandId: first.externalCommandId,
            externalOutcome: success,
          }),
        ),
      ).rejects.toThrow();
      expect(db.select().from(schema.commands).all()).toEqual(beforeCommands);
      const pending = db.select().from(schema.externalOperationOutbox).all();
      expect(pending).toEqual(
        beforePending.map(row =>
          row.externalCommandId === first.externalCommandId
            ? { ...row, externalOutcome: expect.any(String) }
            : row,
        ),
      );
      const retained = pending.find(
        row => row.externalCommandId === first.externalCommandId,
      );
      expect(
        retained?.externalOutcome === null
          ? null
          : JSON.parse(retained?.externalOutcome ?? 'null'),
      ).toEqual({ ...success, recordedAt: success.recordedAt.toISOString() });
      db.run(sql`DROP TRIGGER reject_settlement`);
    }
    for (const [index, externalOutcome] of [success, failure].entries()) {
      const operation = operations[index];
      if (operation === undefined) {
        expect.fail('Expected a prepared invocation');
      }
      const admitted = await config.managedRuntime.runPromise(
        settleExternal(db, {
          key,
          externalCommandId: operation.externalCommandId,
          externalOutcome,
        }),
      );
      expect(admitted).toEqual({
        id: operation.externalCommandId,
        commandName: 'recordReservationObservation',
        contractVersion: 1,
        payload: JSON.stringify({
          reservationId: `rsv_external_${operation.operationIndex}`,
          observation: externalOutcome._tag,
        }),
        serviceVersion: original.serviceVersion,
        serviceName: original.serviceName,
        kind: 'system',
        serviceIndex: index + 2,
      });
      const commands = db.select().from(schema.commands).all();
      const pending = db.select().from(schema.externalOperationOutbox).all();
      expect(commands.at(-1)?.outcome).toBeNull();
      expect(
        await config.managedRuntime.runPromise(
          settleExternal(db, {
            key,
            externalCommandId: operation.externalCommandId,
            externalOutcome:
              externalOutcome._tag === 'Success' ? failure : success,
          }),
        ),
      ).toBeUndefined();
      expect(db.select().from(schema.commands).all()).toEqual(commands);
      expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
        pending,
      );
    }
    expect(db.select().from(schema.externalOperationOutbox).all()).toEqual([]);
    expect(db.select().from(schema.commands).all()).toHaveLength(3);

    // B emits C: the durable parent points to B, rather than the original Actor A.
    const parentRow = db.select().from(schema.commands).all()[1];
    if (parentRow === undefined) {
      expect.fail('Expected the first external command');
    }
    const parent = readServiceCommandOccurrence(parentRow, key);
    const prepared = await config.managedRuntime.runPromise(
      recordReservationWorkDefinition.externalOperation
        .make({
          payload: { reservationId: 'rsv_grandchild' },
        })
        .pipe(
          Effect.flatMap(operation =>
            prepareServiceExternalOperation({
              serviceRelease: system.services.reservations.releases[1],
              initiatingCommandId: parent.id,
              operationIndex: 2,
              operation,
            }),
          ),
        ),
    );
    expect(prepared.externalCommandId).not.toBe(first.externalCommandId);
    const outcome = {
      ...evaluatedCommand.outcome,
      finalizedAt: new Date(finalizedAt.getTime() + 1),
    };
    recordOriginalCommandOutcomeTx(
      db,
      [parent.serviceIndex],
      [
        {
          ...parent,
          outcome,
          dispositionChainHash: advanceDispositionChainHash({
            previousDispositionChainHash: evaluatedCommand.dispositionChainHash,
            serviceIndex: parent.serviceIndex,
            commandId: parent.id,
            outcome,
          }),
          operations: [
            {
              operationName: 'external',
              operationIndex: prepared.operationIndex,
              externalCommandId: prepared.externalCommandId,
              externalContractName: prepared.externalContractName,
              externalContractVersion: prepared.externalContractVersion,
              payload: prepared.payload,
            },
          ],
        },
      ],
      key,
    );
    expect(
      db.select().from(schema.externalOperationOutbox).all(),
    ).toMatchObject([
      {
        externalCommandId: prepared.externalCommandId,
        originCommandId: parent.id,
      },
    ]);
    const child = await config.managedRuntime.runPromise(
      settleExternal(db, {
        key,
        externalCommandId: prepared.externalCommandId,
        externalOutcome: success,
      }),
    );
    expect(child).toMatchObject({
      id: prepared.externalCommandId,
      kind: 'system',
      serviceIndex: 4,
    });
    for (const field of [
      'claims',
      'actorName',
      'actorVersion',
      'nodeId',
      'sessionName',
      'pushIndex',
    ]) {
      expect(child).not.toHaveProperty(field);
    }
    expect(db.select().from(schema.externalOperationOutbox).all()).toEqual([]);

    if (child === undefined || child.kind !== 'system') {
      expect.fail('Expected a retained external command');
    }
    const immutableRows = db.select().from(schema.commands).all();
    expect(
      await config.managedRuntime.runPromise(
        settleExternal(db, {
          key,
          externalCommandId: prepared.externalCommandId,
          externalOutcome: failure,
        }),
      ),
    ).toBeUndefined();
    expect(db.select().from(schema.commands).all()).toEqual(immutableRows);
    expect(db.select().from(schema.externalOperationOutbox).all()).toEqual([]);
  });
});

it('retains the first external observation while admission is full and consumes it after handoff', async () => {
  const first = operations[0];
  if (first === undefined) expect.fail('Expected a prepared invocation');
  await runInDurableObject(source, async ({ db, schema, key }, { storage }) => {
    recordOriginalCommandOutcomeTx(db, [1], [evaluatedCommand], key);
    await config.managedRuntime.runPromise(
      admitServiceCommands({
        db,
        key,
        commands: Array.from({ length: 63 }, (_, index) => ({
          ...original,
          id: makeNodeCommandId('node_external', index + 2),
          pushIndex: index + 2,
        })),
      }),
    );
    for (const externalOutcome of [success, failure]) {
      expect(
        await config.managedRuntime.runPromise(
          settleExternal(db, {
            key,
            externalCommandId: first.externalCommandId,
            externalOutcome,
          }).pipe(Effect.flip),
        ),
      ).toMatchObject({ code: 'service-admission-backlog-full' });
    }
    const retainedRow = db
      .select()
      .from(schema.externalOperationOutbox)
      .all()
      .find(row => row.externalCommandId === first.externalCommandId);
    if (retainedRow === undefined) {
      expect.fail('Expected retained external observation');
    }
    const retained = await config.managedRuntime.runPromise(
      serviceChainDbConfig.tables.externalOperationOutbox.decodeRow(
        retainedRow,
      ),
    );
    expect(retained.externalOutcome).toEqual(success);
    const history = await Effect.runPromise(
      getServiceVersionChain({ key: { ...key, serviceVersion: 1 } }),
    );
    expect(
      (await history.appendEvaluatedCommands({ commands: [evaluatedCommand] }))
        .result._tag,
    ).toBe('Success');
    db.transaction(tx =>
      adoptCanonicalServiceHistory(tx, {
        serviceVersion: 1,
        publishedThrough: 1,
      }),
    );
    expect(
      await config.managedRuntime.runPromise(
        settleExternal(db, {
          key,
          externalCommandId: first.externalCommandId,
          externalOutcome: failure,
        }),
      ),
    ).toMatchObject({
      serviceIndex: 65,
      commandName: 'recordReservationObservation',
      payload: expect.stringContaining('"observation":"Success"'),
    });
    expect(db.select().from(schema.externalOperationOutbox).all()).toHaveLength(
      1,
    );
    await storage.deleteAlarm();
  });
});
