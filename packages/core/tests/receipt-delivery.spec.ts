import { describe, expect, it } from '@effect/vitest';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import * as operationApplication from '@zerospin/core/contracts/applyOperationTx';
import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineAggregateExternalContract } from '@zerospin/core/contracts/defineAggregateExternalContract';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { defineServiceExternalContract } from '@zerospin/core/contracts/defineServiceExternalContract';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { buildExternalContinuation } from '@zerospin/core/contracts/externalExecution/buildExternalContinuation';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeContractReadDb } from '@zerospin/core/contracts/make/makeContractReadDb';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeServiceExternalContractRelease } from '@zerospin/core/contracts/make/makeServiceExternalContractRelease';
import { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';
import { makeCommandOperation } from '@zerospin/core/contracts/makeCommandOperation';
import { assembleOwnerContracts } from '@zerospin/core/declaration/assembleOwnerContracts';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { makeOwnerReleaseLayerProvider } from '@zerospin/core/execution/provideReleaseLayer';
import { applyInverseOperationTx } from '@zerospin/core/models/applyInverseOperationTx';
import { defineService } from '@zerospin/core/service/defineService';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { evaluateServiceSessionCommandTx } from '@zerospin/core/serviceSession/evaluateServiceSessionCommandTx';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import { replayAggregateCommandTx } from '@zerospin/core/sessionExecution/replayAggregateCommandTx';
import { replayServiceCommandTx } from '@zerospin/core/sessionExecution/replayServiceCommandTx';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { makeHarnessExecutor } from '@zerospin/core/testing/systemHarness/makeHarnessExecutor';
import { makeHarnessStores } from '@zerospin/core/testing/systemHarness/makeHarnessStores';
import { makeHarnessAgents } from '@zerospin/core/testing/systemHarness/reconcileHarnessAgents';
import { runHarnessExternal } from '@zerospin/core/testing/systemHarness/runHarnessExternal';
import { makeZerospinError } from '@zerospin/error';
import { CuidFactory, primitives } from '@zerospin/shapes';
import * as Cause from 'effect/Cause';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { vi } from 'vitest';

import { openTestDb } from '../../../tests/support/openTestDb.ts';

import { ReceiptDelivery } from './fixtures/receipts/ReceiptDelivery.ts';
import { receiptsServiceReleaseV1 } from './fixtures/receipts/receiptsServiceReleaseV1.ts';
import {
  receiptsService,
  receiptV1,
  sendExternalReceiptDefinitionV1,
} from './fixtures/receipts/receiptV1.ts';
import { requestReceiptV1 } from './fixtures/receipts/requestReceiptV1.ts';
import {
  recordReceiptDelivery,
  sendExternalReceiptV1,
} from './fixtures/receipts/sendExternalReceiptV1.ts';

describe('Receipt delivery', () => {
  it.effect('defers portable schema compilation until makeSystemSpec', () =>
    Effect.gen(function* () {
      let projections = 0;
      const nativeResult = Schema.Struct({
        value: Schema.declare(
          (value: unknown): value is string => value === 'native',
        ),
        kind: Schema.String.check(
          Schema.makeFilter(() => true, {
            toJsonSchema: () => {
              projections += 1;
              return {};
            },
          }),
        ),
      });
      const contract = makeServiceContractRelease(
        defineServiceContract('readNative'),
        {
          version: 1,
          payload: {},
          result: nativeResult,
          program: () => Effect.succeed({ value: 'native', kind: 'native' }),
        },
      );
      const release = makeServiceRelease(
        defineService({ name: 'nativeCodecs' }),
        {
          version: 1,
          models: {},
          system: { readNative: contract },
        },
      );
      const system = makeSystem({
        name: 'nativeCodecs',
        aggregates: {},
        services: { nativeCodecs: { releases: { 1: release }, canonical: 1 } },
      });
      const { readDb } = yield* openTestDb({});
      expect(
        (yield* contract.evaluate({
          command: {
            id: 'cmd_test',
            kind: 'system',
            commandName: contract.commandName,
            contractVersion: contract.version,
            payload: {},
            serviceName: 'nativeCodecs',
            serviceVersion: 1,
          },
          claims: null,
          db: readDb,
        })).result,
      ).toEqual({ value: 'native', kind: 'native' });
      for (const declaration of [contract, release, system]) {
        expect(declaration).not.toHaveProperty('spec');
        expect(Object.isFrozen(declaration)).toBe(false);
      }
      expect(projections).toBe(0);
      makeSystemSpec({ system });
      expect(projections).toBeGreaterThan(0);
      expect(
        Schema.is(nativeResult)({ value: 'different', kind: 'native' }),
      ).toBe(false);
    }),
  );

  it.effect(
    'passes the decoded original command and adapts its payload once',
    () =>
      Effect.gen(function* () {
        let adaptations = 0;
        let observed: unknown;
        const original = makeServiceContractRelease(
          defineServiceContract('versionedCommand'),
          {
            version: 1,
            payload: { name: primitives.text() },
          },
        );
        const upgraded = upgradeServiceContractRelease(original, {
          version: 2,
          payload: { suffix: primitives.text() },
          up: ({ payload }) =>
            Effect.sync(() => {
              adaptations += 1;
              return { ...payload, suffix: 'new' };
            }),
          guard: ({ command, payload }) =>
            Effect.sync(() => {
              observed = { command, payload };
            }),
        });
        const command = {
          id: 'cmd_test' as const,
          kind: 'system' as const,
          commandName: original.commandName,
          contractVersion: original.version,
          serviceName: 'test',
          serviceVersion: 1,
          payload: { name: 'original' },
        };
        const { readDb } = yield* openTestDb({});
        yield* upgraded.evaluate({ command, claims: null, db: readDb });
        expect(adaptations).toBe(1);
        expect(observed).toEqual({
          command,
          payload: { name: 'original', suffix: 'new' },
        });
        expect(Schema.is(upgraded.knownCommandSchema)(command)).toBe(true);
        expect(
          Schema.is(original.knownCommandSchema)({
            ...command,
            contractVersion: 2,
            payload: { name: 'original', suffix: 'new' },
          }),
        ).toBe(false);
        const invalid = yield* upgraded
          .evaluate({
            command: { ...command, payload: {} },
            claims: null,
            db: readDb,
          })
          .pipe(Effect.flip);
        expect(invalid).toMatchObject({
          code: 'validate-command-payload-failed',
        });
      }),
  );

  it.effect('records the delivery provider reference', () =>
    Effect.gen(function* () {
      const { db, readDb } = yield* openTestDb(receiptsServiceReleaseV1.models);
      const recordedAt = new Date('2026-10-17T12:00:00Z');
      const payload = {
        receiptId: 'rcp_one' as const,
        recipient: 'reader@example.com',
      };
      const requested = yield* requestReceiptV1.evaluate({
        command: {
          id: 'cmd_test',
          kind: 'system',
          commandName: requestReceiptV1.commandName,
          contractVersion: requestReceiptV1.version,
          payload,
          serviceName: 'receipts',
          serviceVersion: 1,
        },
        claims: null,
        db: readDb,
      });
      expect(receiptsServiceReleaseV1.contracts.requestReceipt).toBe(
        requestReceiptV1,
      );
      expect(receiptsServiceReleaseV1.contracts.sendExternalReceipt).toBe(
        sendExternalReceiptV1,
      );
      expect(receiptsServiceReleaseV1.system).toEqual({
        requestReceipt: requestReceiptV1,
      });
      expect(receiptsServiceReleaseV1.external).toEqual({
        sendExternalReceipt: sendExternalReceiptV1,
      });
      const spec = makeSystemSpec({
        system: makeSystem({
          name: 'receiptGrants',
          aggregates: {},
          services: {
            receipts: {
              releases: { 1: receiptsServiceReleaseV1 },
              canonical: 1,
            },
          },
        }),
      });
      const portableRelease = spec.services.receipts?.releases[1];
      expect(portableRelease).toMatchObject({
        system: { requestReceipt: 1 },
        external: { sendExternalReceipt: 1 },
      });
      const wrongGrant = structuredClone(spec);
      const wrongRelease = wrongGrant.services.receipts?.releases[1];
      if (wrongRelease === undefined) expect.fail('Missing receipt release');
      Reflect.set(wrongRelease.system, 'sendExternalReceipt', 1);
      expect(Schema.is(SystemSpecSchema)(wrongGrant)).toBe(false);
      Reflect.deleteProperty(wrongRelease, 'system');
      expect(Schema.is(SystemSpecSchema)(wrongGrant)).toBe(false);
      expect(
        requested.operations.map(operation => operation.operationName),
      ).toEqual(['create', 'external']);
      const [create, send] = requested.operations;
      if (
        create?.operationName !== 'create' ||
        send?.operationName !== 'external'
      ) {
        expect.fail('Expected receipt creation followed by external delivery');
      }
      expect(send.contract).toBe(sendExternalReceiptDefinitionV1);
      expect(send.payload).toEqual(payload);
      yield* makeTx('receipts.create')(function* (tx) {
        yield* applyOperationTx({
          tx,
          operation: create,
          appliedAt: recordedAt,
        });
      })(db);

      const requestDelivery: (
        props: Parameters<typeof sendExternalReceiptV1.external.request>[0],
      ) => ReturnType<typeof sendExternalReceiptV1.external.request> =
        sendExternalReceiptV1.external.request;
      const externalOutcome = yield* requestDelivery({
        payload: send.payload,
      }).pipe(
        Effect.provideService(ReceiptDelivery, input => {
          expect(input).toEqual(payload);
          return Effect.succeed({ reference: 'mail_one' });
        }),
        Effect.match({
          onSuccess: success => ({
            _tag: 'Success' as const,
            success,
            recordedAt,
          }),
          onFailure: failure => ({
            _tag: 'Failure' as const,
            failure: {
              _tag: 'ExternalRequestFailure' as const,
              code: 'external-request-failed' as const,
              message: failure.message,
            },
            recordedAt,
          }),
        }),
      );
      const continuation = yield* buildExternalContinuation(
        receiptsServiceReleaseV1,
        {
          externalContractName: sendExternalReceiptV1.commandName,
          externalContractVersion: sendExternalReceiptV1.version,
          payload: send.payload,
          externalOutcome,
        },
      );
      const { payload: mappedPayload, failure, ...selected } = continuation;
      expect(selected.commandName).toBe('recordReceiptDelivery');
      expect(failure).toBeNull();
      if (mappedPayload === null)
        expect.fail('Expected an encoded continuation payload');
      const evaluated = yield* recordReceiptDelivery.evaluate({
        command: {
          ...selected,
          id: 'cmd_external',
          kind: 'system',
          payload: JSON.parse(mappedPayload),
          serviceName: 'receipts',
          serviceVersion: 1,
        },
        claims: null,
        db: readDb,
      });
      expect(evaluated.result).toBeUndefined();
      expect(evaluated.operations).toHaveLength(1);
      const operation = evaluated.operations[0]!;
      expect(operation.model).toBe(receiptsServiceReleaseV1.models.receipt);
      expect(operation.resourceId).toBe(payload.receiptId);
      expect(operation.body.attributes).toEqual({
        deliveryState: 'sent',
        providerReference: 'mail_one',
        failureMessage: null,
      });
    }),
  );

  it.effect('records an external delivery failure', () =>
    Effect.gen(function* () {
      const { db, readDb } = yield* openTestDb(receiptsServiceReleaseV1.models);
      const recordedAt = new Date('2026-10-17T12:00:00Z');
      const payload = {
        receiptId: 'rcp_one' as const,
        recipient: 'reader@example.com',
      };
      const requested = yield* requestReceiptV1.evaluate({
        command: {
          id: 'cmd_test',
          kind: 'system',
          commandName: requestReceiptV1.commandName,
          contractVersion: requestReceiptV1.version,
          payload,
          serviceName: 'receipts',
          serviceVersion: 1,
        },
        claims: null,
        db: readDb,
      });
      expect(receiptsServiceReleaseV1.contracts.requestReceipt).toBe(
        requestReceiptV1,
      );
      expect(receiptsServiceReleaseV1.contracts.sendExternalReceipt).toBe(
        sendExternalReceiptV1,
      );
      expect(receiptsServiceReleaseV1.system).toEqual({
        requestReceipt: requestReceiptV1,
      });
      expect(receiptsServiceReleaseV1.external).toEqual({
        sendExternalReceipt: sendExternalReceiptV1,
      });
      const spec = makeSystemSpec({
        system: makeSystem({
          name: 'receiptGrants',
          aggregates: {},
          services: {
            receipts: {
              releases: { 1: receiptsServiceReleaseV1 },
              canonical: 1,
            },
          },
        }),
      });
      const portableRelease = spec.services.receipts?.releases[1];
      expect(portableRelease).toMatchObject({
        system: { requestReceipt: 1 },
        external: { sendExternalReceipt: 1 },
      });
      const wrongGrant = structuredClone(spec);
      const wrongRelease = wrongGrant.services.receipts?.releases[1];
      if (wrongRelease === undefined) expect.fail('Missing receipt release');
      Reflect.set(wrongRelease.system, 'sendExternalReceipt', 1);
      expect(Schema.is(SystemSpecSchema)(wrongGrant)).toBe(false);
      Reflect.deleteProperty(wrongRelease, 'system');
      expect(Schema.is(SystemSpecSchema)(wrongGrant)).toBe(false);
      expect(
        requested.operations.map(operation => operation.operationName),
      ).toEqual(['create', 'external']);
      const [create, send] = requested.operations;
      if (
        create?.operationName !== 'create' ||
        send?.operationName !== 'external'
      ) {
        expect.fail('Expected receipt creation followed by external delivery');
      }
      expect(send.contract).toBe(sendExternalReceiptDefinitionV1);
      expect(send.payload).toEqual(payload);
      yield* makeTx('receipts.create')(function* (tx) {
        yield* applyOperationTx({
          tx,
          operation: create,
          appliedAt: recordedAt,
        });
      })(db);

      const requestDelivery: (
        props: Parameters<typeof sendExternalReceiptV1.external.request>[0],
      ) => ReturnType<typeof sendExternalReceiptV1.external.request> =
        sendExternalReceiptV1.external.request;
      const externalOutcome = yield* requestDelivery({
        payload: send.payload,
      }).pipe(
        Effect.provideService(ReceiptDelivery, input => {
          expect(input).toEqual(payload);
          return Effect.fail(
            makeZerospinError({
              code: 'receipt-delivery-unavailable',
              message: 'Mail provider unavailable',
            }),
          );
        }),
        Effect.match({
          onSuccess: success => ({
            _tag: 'Success' as const,
            success,
            recordedAt,
          }),
          onFailure: failure => ({
            _tag: 'Failure' as const,
            failure: {
              _tag: 'ExternalRequestFailure' as const,
              code: 'external-request-failed' as const,
              message: failure.message,
            },
            recordedAt,
          }),
        }),
      );
      const continuation = yield* buildExternalContinuation(
        receiptsServiceReleaseV1,
        {
          externalContractName: sendExternalReceiptV1.commandName,
          externalContractVersion: sendExternalReceiptV1.version,
          payload: send.payload,
          externalOutcome,
        },
      );
      const { payload: mappedPayload, failure, ...selected } = continuation;
      expect(selected.commandName).toBe('recordReceiptDelivery');
      expect(failure).toBeNull();
      if (mappedPayload === null)
        expect.fail('Expected an encoded continuation payload');
      const evaluated = yield* recordReceiptDelivery.evaluate({
        command: {
          ...selected,
          id: 'cmd_external',
          kind: 'system',
          payload: JSON.parse(mappedPayload),
          serviceName: 'receipts',
          serviceVersion: 1,
        },
        claims: null,
        db: readDb,
      });
      expect(evaluated.result).toBeUndefined();
      expect(evaluated.operations).toHaveLength(1);
      const operation = evaluated.operations[0]!;
      expect(operation.model).toBe(receiptsServiceReleaseV1.models.receipt);
      expect(operation.resourceId).toBe(payload.receiptId);
      expect(operation.body.attributes).toEqual({
        deliveryState: 'failed',
        providerReference: null,
        failureMessage: 'Mail provider unavailable',
      });
    }),
  );
});

describe('Shared ordinary program optimism', () => {
  for (const family of ['aggregate', 'service'] as const) {
    it.effect(
      `${family} replay applies sparse model operations and retains reversible state without outbound work`,
      () =>
        Effect.gen(function* () {
          const { db } = yield* openTestDb({ receipt: receiptV1 });
          const destination = makeServiceContractRelease(
            defineServiceContract('receiptChild'),
            {
              version: 1,
              payload: { receiptId: primitives.id({ abbreviation: 'rcp' }) },
            },
          );
          const child = makeCommandOperation({
            destination: { service: receiptsService, version: 1 },
            contract: destination,
          });
          const external = defineAggregateExternalContract({
            name: 'aggregateReceipt',
            version: 1,
            payload: {
              receiptId: primitives.id({ abbreviation: 'rcp' }),
              recipient: primitives.text(),
            },
            response: Schema.Struct({ reference: Schema.String }),
          });
          let evaluations = 0;
          const props = {
            version: 1,
            payload: { receiptId: primitives.id({ abbreviation: 'rcp' }) },
            result: Schema.String,
            operations: {
              create: receiptV1.operations.create,
              child,
              update: receiptV1.operations.update,
            },
          };
          const aggregateContract = makeAggregateContractRelease(
            defineAggregateContract('mixedReceipt'),
            {
              ...props,
              operations: {
                ...props.operations,
                send: external.externalOperation,
              },
              program: Effect.fn('aggregateMixed.program')(function* ({
                payload,
                operations,
              }) {
                evaluations++;
                yield* operations.create({
                  resourceId: payload.receiptId,
                  attributes: {
                    recipient: 'reader@example.com',
                    deliveryState: 'pending',
                    providerReference: null,
                    failureMessage: null,
                  },
                });
                yield* operations.child({ payload });
                yield* operations.send({
                  payload: { ...payload, recipient: 'reader@example.com' },
                });
                yield* operations.update({
                  resourceId: payload.receiptId,
                  attributes: { recipient: 'changed@example.com' },
                });
                return payload.receiptId;
              }),
            },
          );
          const serviceContract = makeServiceContractRelease(
            defineServiceContract('mixedReceipt'),
            {
              ...props,
              operations: {
                ...props.operations,
                send: sendExternalReceiptDefinitionV1.externalOperation,
              },
              program: Effect.fn('serviceMixed.program')(function* ({
                payload,
                operations,
              }) {
                evaluations++;
                yield* operations.create({
                  resourceId: payload.receiptId,
                  attributes: {
                    recipient: 'reader@example.com',
                    deliveryState: 'pending',
                    providerReference: null,
                    failureMessage: null,
                  },
                });
                yield* operations.child({ payload });
                yield* operations.send({
                  payload: { ...payload, recipient: 'reader@example.com' },
                });
                yield* operations.update({
                  resourceId: payload.receiptId,
                  attributes: { recipient: 'changed@example.com' },
                });
                return payload.receiptId;
              }),
            },
          );
          const models = { receipt: receiptV1 };
          const claimsSchema = Schema.Struct({ aggregateId: Schema.String });
          const aggregateDefinition = makeAggregateSessionDefinition({
            systemName: 'receipt',
            aggregateName: 'receipt',
            aggregateVersion: 1,
            actorName: 'reader',
            actorVersion: 1,
            sessionName: 'receipt',
            claimsSchema,
            models,
            contracts: { mixedReceipt: aggregateContract },
          });
          const serviceDefinition = makeServiceSessionDefinition({
            systemName: 'receipt',
            serviceName: 'receipts',
            serviceVersion: 1,
            actorName: 'reader',
            actorVersion: 1,
            sessionName: 'receipt',
            claimsSchema,
            models,
            contracts: { mixedReceipt: serviceContract },
          });
          expect(makeAggregateSessionLock(aggregateDefinition)).toEqual({
            sessionName: 'receipt',
            origin: { kind: 'actor', actorName: 'reader', actorVersion: 1 },
            models: { receipt: { modelName: 'receipt', version: 1 } },
            contracts: {
              mixedReceipt: { commandName: 'mixedReceipt', version: 1 },
            },
          });
          expect(makeServiceSessionLock(serviceDefinition)).toEqual({
            sessionName: 'receipt',
            actorName: 'reader',
            actorVersion: 1,
            models: { receipt: { modelName: 'receipt', version: 1 } },
            contracts: {
              mixedReceipt: { commandName: 'mixedReceipt', version: 1 },
            },
          });
          const contract =
            family === 'aggregate' ? aggregateContract : serviceContract;
          const payload = { receiptId: 'rcp_mixed' as const };
          const command = {
            commandName: contract.commandName,
            contractVersion: 1,
            payload: yield* encodePayload(contract, { version: 1, payload }),
          };
          const stagedAt = new Date('2026-10-23T12:00:00Z');
          const applied = vi.spyOn(operationApplication, 'applyOperationTx');
          let allocations = 0;
          let requests = 0;
          const inverses = yield* makeTx('receiptReplay')(function* (tx) {
            return family === 'aggregate'
              ? yield* replayAggregateCommandTx({
                  tx,
                  definition: aggregateDefinition,
                  command: {
                    ...command,
                    aggregateId: 'receipt_one',
                    aggregateName: 'receipt',
                    aggregateVersion: 1,
                    kind: 'actor',
                    actorName: 'reader',
                    actorVersion: 1,
                    claims: { aggregateId: 'receipt_one' },
                    sessionName: 'receipt',
                    sessionId: 'sesn_receipt',
                  },
                  aggregateId: 'receipt_one',
                  claims: { aggregateId: 'receipt_one' },
                  stagedAt,
                })
              : yield* replayServiceCommandTx({
                  tx,
                  definition: serviceDefinition,
                  command: {
                    ...command,
                    serviceName: 'receipts',
                    kind: 'actor',
                    actorName: 'reader',
                    actorVersion: 1,
                    claims: { aggregateId: 'receipt_one' },
                    sessionName: 'receipt',
                  },
                  claims: { aggregateId: 'receipt_one' },
                  stagedAt,
                });
          })(db).pipe(
            Effect.provideService(CuidFactory, () =>
              Effect.sync(() => {
                allocations++;
                return 'unexpected';
              }),
            ),
            Effect.provideService(ReceiptDelivery, () =>
              Effect.sync(() => {
                requests++;
                return { reference: 'unexpected' };
              }),
            ),
          );
          expect(evaluations).toBe(1);
          expect(allocations).toBe(0);
          expect(requests).toBe(0);
          expect(
            applied.mock.calls.map(([input]) => input.operation.operationName),
          ).toEqual(['create', 'update']);
          applied.mockRestore();
          expect(inverses?.map(inverse => inverse.operationName)).toEqual([
            'create',
            'update',
          ]);
          expect(inverses?.some(inverse => 'operationIndex' in inverse)).toBe(
            false,
          );
          expect(
            (yield* findFirst({
              db: makeContractReadDb({ db, models }),
              model: receiptV1,
              where: { id: { eq: payload.receiptId } },
            }))?.recipient,
          ).toBe('changed@example.com');
          yield* makeTx('undoReceiptReplay')(function* (tx) {
            for (const inverse of [...(inverses ?? [])].reverse()) {
              yield* applyInverseOperationTx({
                tx,
                model: receiptV1,
                operation: inverse,
              });
            }
          })(db);
          expect(db.select().from(receiptV1.drizzleSchema).all()).toEqual([]);
        }),
    );
  }

  it.effect(
    'service staging allocates only its initiating command and malformed async payloads leave no local writes',
    () =>
      Effect.gen(function* () {
        const { db } = yield* openTestDb({ receipt: receiptV1 });
        const definition = makeServiceSessionDefinition({
          systemName: 'receipt',
          serviceName: 'receipts',
          serviceVersion: 1,
          actorName: 'reader',
          actorVersion: 1,
          sessionName: 'receipt',
          claimsSchema: Schema.Struct({}),
          models: { receipt: receiptV1 },
          contracts: { requestReceipt: requestReceiptV1 },
        });
        let allocations = 0;
        const stage = yield* makeTx('stageReceipt')(function* (tx) {
          return yield* evaluateServiceSessionCommandTx({
            tx,
            definition,
            contract: requestReceiptV1,
            payload: {
              receiptId: 'rcp_stage',
              recipient: 'reader@example.com',
            },
            claims: {},
          });
        })(db).pipe(
          Effect.provideService(CuidFactory, () =>
            Effect.sync(() => {
              allocations++;
              return 'stage';
            }),
          ),
        );
        expect(stage.command).not.toHaveProperty('id');
        expect(allocations).toBe(0);
        const invalid = makeServiceContractRelease(
          defineServiceContract('invalidReceipt'),
          {
            version: 1,
            payload: {},
            operations: {
              create: receiptV1.operations.create,
              send: sendExternalReceiptDefinitionV1.externalOperation,
            },
            program: Effect.fn('invalidReceipt.program')(function* ({
              operations,
            }) {
              yield* operations.create({
                resourceId: 'rcp_invalid',
                attributes: {
                  recipient: 'reader@example.com',
                  deliveryState: 'pending',
                  providerReference: null,
                  failureMessage: null,
                },
              });
              yield* operations.send({
                payload: JSON.parse(
                  '{"receiptId":"rcp_invalid","recipient":7}',
                ),
              });
            }),
          },
        );
        const rejected = yield* makeTx('invalidReceipt')(function* (tx) {
          return yield* evaluateServiceSessionCommandTx({
            tx,
            definition,
            contract: invalid,
            payload: {},
            claims: {},
          });
        })(db).pipe(
          Effect.provideService(CuidFactory, () => Effect.succeed('invalid')),
          Effect.exit,
        );
        if (Exit.isSuccess(rejected)) {
          expect.fail('Malformed external payload must fail staging');
        }
        expect(Cause.squash(rejected.cause)).toMatchObject({
          code: 'contract-program-failed',
        });
        expect(
          db
            .select()
            .from(receiptV1.drizzleSchema)
            .all()
            .map(row => row.id),
        ).toEqual(['rcp_stage']);
        const suspended = makeServiceContractRelease(
          defineServiceContract('suspendedReceipt'),
          {
            version: 1,
            payload: {},
            program: () => Effect.promise(() => Promise.resolve()),
          },
        );
        const asynchronous = yield* makeTx('suspendedReceipt')(function* (tx) {
          return yield* evaluateServiceSessionCommandTx({
            tx,
            definition,
            contract: suspended,
            payload: {},
            claims: {},
          });
        })(db).pipe(
          Effect.provideService(CuidFactory, () => Effect.succeed('suspended')),
          Effect.exit,
        );
        if (Exit.isSuccess(asynchronous)) {
          expect.fail('Suspending programs must fail staging');
        }
        expect(Cause.squash(asynchronous.cause)).toMatchObject({
          code: 'program-must-be-synchronous',
        });
      }),
  );
});

describe('Exact command destination registration', () => {
  it('binds same-owner commands and refuses lookalike owners, contracts, and absent versions', () => {
    const owner = defineService({ name: 'receiptBindings' });
    const child = makeServiceContractRelease(defineServiceContract('child'), {
      version: 1,
      payload: {},
    });
    const operation = makeCommandOperation({
      destination: { service: owner, version: 1 },
      contract: child,
    });
    const source = makeServiceContractRelease(defineServiceContract('source'), {
      version: 1,
      payload: {},
      operations: { child: operation },
    });
    const contracts = { child, source };
    const coalesced = assembleOwnerContracts({
      actors: { selected: { contracts } },
      declaredContracts: contracts,
      system: contracts,
      external: {},
    });
    expect(Object.keys(coalesced)).toEqual(['child', 'source']);
    expect(coalesced.child).toBe(child);
    expect(coalesced.source).toBe(source);
    const release = makeServiceRelease(owner, {
      version: 1,
      models: {},
      system: contracts,
    });
    expect(() =>
      makeSystem({
        name: 'receipts',
        aggregates: {},
        services: {
          receiptBindings: { releases: { 1: release }, canonical: 1 },
        },
      }),
    ).not.toThrow();
    const lookalikeOwner = makeServiceRelease(
      defineService({ name: 'receiptBindings' }),
      { version: 1, models: {}, system: contracts },
    );
    expect(() =>
      makeSystem({
        name: 'receipts',
        aggregates: {},
        services: {
          receiptBindings: { releases: { 1: lookalikeOwner }, canonical: 1 },
        },
      }),
    ).toThrow(/exact claims-free ordinary contract/i);
    const otherChild = makeServiceContractRelease(
      defineServiceContract('child'),
      { version: 1, payload: {} },
    );
    const conflictingGrant = makeServiceRelease(owner, {
      version: 1,
      models: {},
      system: contracts,
    });
    Reflect.set(conflictingGrant.system, 'child', otherChild);
    expect(() =>
      makeSystem({
        name: 'receipts',
        aggregates: {},
        services: {
          receiptBindings: { releases: { 1: conflictingGrant }, canonical: 1 },
        },
      }),
    ).toThrow(/conflicting canonical contract child/i);
    const lookalikeContract = makeServiceRelease(owner, {
      version: 1,
      models: {},
      system: { ...contracts, child: otherChild },
    });
    expect(() =>
      makeSystem({
        name: 'receipts',
        aggregates: {},
        services: {
          receiptBindings: { releases: { 1: lookalikeContract }, canonical: 1 },
        },
      }),
    ).toThrow(/exact claims-free ordinary contract/i);
    const wrongVersion = makeServiceRelease(owner, {
      version: 2,
      models: {},
      system: contracts,
    });
    expect(() =>
      makeSystem({
        name: 'receipts',
        aggregates: {},
        services: {
          receiptBindings: { releases: { 2: wrongVersion }, canonical: 2 },
        },
      }),
    ).toThrow();
  });
});

describe('Ordinary continuation payloads', () => {
  it.effect(
    'builds a continuation from the decoded outgoing payload and provider response',
    () =>
      Effect.gen(function* () {
        const continuation = makeServiceContractRelease(
          defineServiceContract('recordExternalResponse'),
          {
            version: 1,
            payload: {
              observedAt: primitives.text(),
              count: primitives.integer(),
            },
          },
        );
        const source = makeServiceExternalContractRelease(
          defineServiceExternalContract({
            name: 'loadExternalCount',
            version: 1,
            payload: { requestedAt: primitives.date() },
            response: Schema.NumberFromString,
          }),
          {
            request: () => Effect.succeed(12),
            onSuccess: {
              contract: continuation,
              payload: Effect.fn(function* ({ payload, response }) {
                return {
                  observedAt: payload.requestedAt.toISOString(),
                  count: response,
                };
              }),
            },
            onFailure: {
              contract: continuation,
              payload: Effect.fn(function* ({ payload }) {
                return {
                  observedAt: payload.requestedAt.toISOString(),
                  count: 0,
                };
              }),
            },
          },
        );
        const observedAt = '2026-11-01T12:00:00.000Z';
        const ordinary = yield* buildExternalContinuation(
          {
            external: { loadExternalCount: source },
            contracts: { recordExternalResponse: continuation },
          },
          {
            externalContractName: 'loadExternalCount',
            externalContractVersion: 1,
            payload: { requestedAt: observedAt },
            externalOutcome: {
              _tag: 'Success',
              success: '12',
              recordedAt: new Date(),
            },
          },
        );
        expect(ordinary).toEqual({
          commandName: 'recordExternalResponse',
          contractVersion: 1,
          failure: null,
          payload: JSON.stringify({ observedAt, count: 12 }),
        });
      }),
  );

  it.effect(
    'retains the failed harness continuation under its reserved command ID',
    () =>
      Effect.gen(function* () {
        const failMapping = () =>
          Effect.fail(makeZerospinError('mapper-refused'));
        const request = makeServiceExternalContractRelease(
          sendExternalReceiptDefinitionV1,
          {
            request: () => Effect.succeed({ reference: 'delivered' }),
            onSuccess: {
              contract: recordReceiptDelivery,
              payload: failMapping,
            },
            onFailure: {
              contract: recordReceiptDelivery,
              payload: failMapping,
            },
          },
        );
        const release = makeServiceRelease(receiptsService, {
          version: 1,
          models: { receipt: receiptV1 },
          contracts: { recordReceiptDelivery },
          external: { sendExternalReceipt: request },
        });
        const system = makeSystem({
          name: 'receipts',
          aggregates: {},
          services: { receipts: { releases: { 1: release }, canonical: 1 } },
        });
        const stores = yield* makeHarnessStores(system);
        const store = yield* stores.get({ release });
        const invocations: string[] = [];
        const countExecution = (name: string) =>
          Effect.sync(() => {
            invocations.push(name);
          });
        const provideReleaseLayer = makeOwnerReleaseLayerProvider(
          yield* Effect.scope,
        );
        const agents = yield* makeHarnessAgents(system, provideReleaseLayer);
        const executor = makeHarnessExecutor({
          system,
          stores,
          agents,
          queue: [],
          countExecution,
          provideReleaseLayer,
        });
        const id = 'cmd_receipt_delivery';
        const result = yield* runHarnessExternal({
          executor,
          countExecution,
          provideReleaseLayer,
          work: {
            kind: 'external',
            id,
            store,
            contract: request,
            payload: {
              receiptId: 'rcp_one',
              recipient: 'recipient@example.com',
            },
          },
        });
        expect(result.command).toMatchObject({
          id,
          serviceVersion: 1,
          commandName: 'recordReceiptDelivery',
          contractVersion: 1,
          payload: null,
        });
        expect(result.outcome).toMatchObject({
          finalizedAt: expect.any(Date),
          result: {
            _tag: 'Failure',
            failure: { code: 'external-continuation-payload-failed' },
          },
        });
        if (result.outcome.result._tag !== 'Failure')
          expect.fail('The mapper did not fail');
        expect(
          yield* executor.executeContinuation(store, {
            id,
            commandName: 'recordReceiptDelivery',
            contractVersion: 1,
            payload: null,
            failure: result.outcome.result.failure,
          }),
        ).toBe(result);
        expect(invocations).toEqual([
          'sendExternalReceipt',
          'recordReceiptDelivery',
        ]);
      }).pipe(
        Effect.scoped,
        Effect.provideContext(Context.makeUnsafe<unknown>(new Map())),
      ),
  );
});
