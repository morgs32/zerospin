import { resolveAgentCommand } from '@zerospin/core/agent/makeAgentCommandRef';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { makeAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
import { AggregateSocketServerMessageSchema } from '@zerospin/core/aggregateSession/AggregateSocketProtocolSchema';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import {
  makeSystemAggregateCommandId,
  makeSystemServiceCommandId,
} from '@zerospin/core/contracts/commandIds';
import { makeServiceAgentSessionLock } from '@zerospin/core/serviceAgentSession/makeServiceAgentSessionLock';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { System } from '@zerospin/core/system/System';
import { makeZerospinError } from '@zerospin/error';
import {
  captureTelemetry,
  type ISpanLinkRecord,
  type ITelemetryBatch,
} from '@zerospin/logger';
import { authorizeAggregateSession } from '@zerospin/owner-release-worker/AggregateVersionRepo/authorizeAggregateSession/authorizeAggregateSession';
import { reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AggregateActorVersionChain } from '../../src/AggregateActorVersionChain/AggregateActorVersionChain.ts';
import { aggregateActorVersionChainNameUtils } from '../../src/AggregateActorVersionChain/aggregateActorVersionChainName.ts';
import { AggregateActorVersionRepo } from '../../src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts';
import { aggregateActorVersionRepoNameUtils } from '../../src/AggregateActorVersionRepo/aggregateActorVersionRepoName.ts';
import { AggregateAgentVersionChain } from '../../src/AggregateAgentVersionChain/AggregateAgentVersionChain.ts';
import { AggregateApi } from '../../src/AggregateApi/AggregateApi.ts';
import { GatewayApi } from '../../src/GatewayApi/GatewayApi.ts';
import { getNativeSystemApi } from '../../src/getNativeSystemApi/getNativeSystemApi.ts';
import { makeRpcApi, rpcMethod } from '../../src/makeRpcApi/makeRpcApi.ts';
import { WorkerTelemetryLive } from '../../src/repoServices/WorkerTelemetryLive.ts';
import { makeWorkerRpcEnvelope } from '../../src/runWorkerInvocation/runWorkerInvocation.ts';
import { ServiceActorVersionRepo } from '../../src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts';
import { ServiceAgentVersionChain } from '../../src/ServiceAgentVersionChain/ServiceAgentVersionChain.ts';
import { ServiceApi } from '../../src/ServiceApi/ServiceApi.ts';
import { SystemApi } from '../../src/SystemApi/SystemApi.ts';
import {
  SessionAdmissionSchema,
  type ISessionAdmission,
} from '../../src/SystemRepo/sessionWebSocketTickets/SessionAdmissionSchema.ts';
import type { SystemRepo } from '../../src/SystemRepo/SystemRepo.ts';
import { WorkerTelemetry } from '../../src/WorkerTelemetry/WorkerTelemetry.ts';
import { aggregateExpiryV1 as aggregateExpiry1 } from '../declarations/agents/aggregateExpiryV1.ts';
import { serviceExpiryV1 as serviceExpiry1 } from '../declarations/agents/serviceExpiryV1.ts';

import config, { system } from './system.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      NATIVE_TEST_SYSTEM_REPO: DurableObjectNamespace<SystemRepo>;
    }
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  // The RPC method is inherited; spy restoration must not leave a public subclass shadow.
  Reflect.deleteProperty(SystemApi.prototype, 'healthcheck');
  await reset();
});

it('reports escaping RPC encoding failures while ordinary refusals stay quiet', async () => {
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
  const refusal = makeZerospinError('diagnostic-test-refused');
  const envelope = await config.managedRuntime.runPromise(
    makeWorkerRpcEnvelope(Effect.fail(refusal)),
  );
  expect(envelope.result).toMatchObject({
    _tag: 'Failure',
    failure: { code: refusal.code },
  });
  expect(diagnostic).not.toHaveBeenCalled();

  const defect = { code: 'diagnostic-test-defect', detail: 'unhandled object' };
  await expect(
    config.managedRuntime.runPromise(makeWorkerRpcEnvelope(Effect.die(defect))),
  ).rejects.toBe(defect);
  expect(diagnostic).toHaveBeenCalledTimes(1);
  expect(diagnostic.mock.calls[0]?.[0]).toContain('makeWorkerRpcEnvelope');
  expect(diagnostic.mock.calls[0]?.[0]).toContain(defect.code);
  expect(diagnostic.mock.calls[0]?.[0]).toContain(defect.detail);

  const cause = Cause.combine(
    Cause.fail(refusal),
    Cause.die(new Error('diagnostic-test-composite-defect')),
  );
  await expect(
    config.managedRuntime.runPromise(
      makeWorkerRpcEnvelope(Effect.failCause(cause)),
    ),
  ).rejects.toBe(cause);
  expect(diagnostic).toHaveBeenCalledTimes(2);
  expect(diagnostic.mock.calls[1]?.[0]).toContain(refusal.code);
  expect(diagnostic.mock.calls[1]?.[0]).toContain(
    'diagnostic-test-composite-defect',
  );
});

it('reports a native API callback defect with its method name and original error', async () => {
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
  const callbackDefect = new Error('diagnostic-test-callback-defect');
  const Api = makeRpcApi('DiagnosticApi', {
    callback: rpcMethod({
      name: 'DiagnosticApi.callback',
      schema: Schema.Struct({}),
      parseError: {
        code: 'diagnostic-test-request-invalid',
        prefix: 'Invalid diagnostic request',
      },
    })(() => Effect.succeed('ready'), {
      onSuccess: () => {
        throw callbackDefect;
      },
      onFailure: failure => failure,
    }),
  });
  await expect(new Api().callback({})).rejects.toBe(callbackDefect);
  expect(diagnostic).toHaveBeenCalledTimes(1);
  expect(diagnostic.mock.calls[0]?.[0]).toContain('DiagnosticApi.callback');
  expect(diagnostic.mock.calls[0]?.[0]).toContain(callbackDefect.message);
});

describe('Native typed SystemApi', () => {
  it('allocates distinct Aggregate and Service commands on every execution', async () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const api = getNativeSystemApi('sys_servicePublication');
        yield* api.acceptSystemSpec();
        yield* api.initialize();
        const aggregate = system.aggregates.agentAccount.releases[1];
        const service = system.services.reservations.releases[1];
        const grant = aggregateExpiry1.contracts.expireAggregateReservation;
        const contract = aggregate.contracts.expireAggregateReservation;
        expect(grant).toEqual({
          commandName: contract.commandName,
          version: contract.version,
        });
        expect(resolveAgentCommand(grant, aggregate.contracts)).toBe(contract);
        expect(aggregate.system.expireAggregateReservation).toBe(contract);
        yield* api.executeAggregateCommand(aggregate, {
          aggregateId: 'acc_outcomes',
          contractName: 'changeAggregateReservation',
          payload: {
            reservationId: 'arv_outcome',
            expiresAt: 9_000,
            action: 'create',
          },
        });
        for (const { execution, result } of [
          {
            execution: api.executeAggregateCommand(aggregate, {
              aggregateId: 'acc_outcomes',
              contractName: 'changeAggregateReservation',
              payload: {
                reservationId: 'arv_outcome',
                expiresAt: 10_000,
                action: 'update',
              },
            }),
            result: { _tag: 'Success' },
          },
          {
            execution: api.executeAggregateCommand(aggregate, {
              aggregateId: 'acc_outcomes',
              contractName: 'expireAggregateReservation',
              payload: { reservationId: 'arv_missing' },
            }),
            result: {
              _tag: 'Failure',
              failure: { code: 'reservation-not-selected' },
            },
          },
          {
            execution: api.executeServiceCommand(service, {
              contractName: 'performReservationWork',
              payload: {
                reservationId: 'rsv_outcome',
                expiresAt: 10_000,
                mode: 'noop',
              },
            }),
            result: { _tag: 'Success' },
          },
          {
            execution: api.executeServiceCommand(service, {
              contractName: 'createReservation',
              payload: { reservationId: 'rsv_refused', expiresAt: -2 },
            }),
            result: {
              _tag: 'Failure',
              failure: { code: 'reservation-create-refused' },
            },
          },
        ]) {
          const outcome = yield* execution;
          expect(outcome).toMatchObject({
            result,
            finalizedAt: expect.any(Date),
          });
          expect(Object.keys(outcome).sort()).toEqual([
            'finalizedAt',
            'result',
          ]);
          yield* Effect.sleep('2 millis');
          const repeated = yield* execution;
          expect(repeated.result).toEqual(outcome.result);
          expect(repeated.finalizedAt.getTime()).toBeGreaterThan(
            outcome.finalizedAt.getTime(),
          );
        }
        // Discard a committed reply, then author one retry of the same Effect.
        let discardReply = true;
        yield* api
          .executeServiceCommand(service, {
            contractName: 'performReservationWork',
            payload: {
              reservationId: 'rsv_ambiguous',
              expiresAt: 10_000,
              mode: 'noop',
            },
          })
          .pipe(
            Effect.flatMap(outcome => {
              if (discardReply) {
                discardReply = false;
                return Effect.fail('simulated ambiguous timeout');
              }
              return Effect.succeed(outcome);
            }),
            Effect.retry({ times: 1 }),
          );
        const aggregateChain = env.AGGREGATE_CHAIN.getByName(
          'ac_sys_servicePublication/acc_outcomes/agentAccount',
        );
        const serviceChain = env.SERVICE_CHAIN.getByName(
          'sc_sys_servicePublication/reservations',
        );
        yield* Effect.promise(() =>
          runInDurableObject(aggregateChain, async instance => {
            const rows = [];
            for (const aggregateIndex of [1, 2, 3, 4, 5]) {
              const result = (
                await instance.getAggregateCommand({ aggregateIndex })
              ).result;
              if (result._tag !== 'Success' || result.success === null) {
                expect.fail('Expected retained Aggregate command');
              }
              rows.push(result.success);
            }
            expect(rows).toHaveLength(5);
            expect(rows.map(row => row.id)).toEqual(
              [1, 2, 3, 4, 5].map(index =>
                makeSystemAggregateCommandId(
                  'sys_servicePublication',
                  'agentAccount',
                  'acc_outcomes',
                  index,
                ),
              ),
            );
          }),
        );
        yield* Effect.promise(() =>
          runInDurableObject(serviceChain, async instance => {
            const { db, schema } = instance;
            const before = db.select().from(schema.admissionPosition).all();
            expect(
              (
                await instance.admitDirectSystemCommand({
                  command: {
                    serviceName: service.name,
                    serviceVersion: service.version,
                    commandName: 'createReservation',
                    contractVersion: 1,
                    payload: '{}',
                    kind: 'system',
                  },
                })
              ).result._tag,
            ).toBe('Failure');
            expect(db.select().from(schema.admissionPosition).all()).toEqual(
              before,
            );
            const rows = [];
            for (const serviceIndex of [1, 2, 3, 4, 5, 6]) {
              const result = (
                await instance.getServiceCommand({ serviceIndex })
              ).result;
              if (result._tag !== 'Success' || result.success === null) {
                expect.fail('Expected retained Service command');
              }
              rows.push(result.success);
            }
            expect(rows).toHaveLength(6);
            expect(rows.map(row => row.id)).toEqual(
              [1, 2, 3, 4, 5, 6].map(index =>
                makeSystemServiceCommandId(
                  'sys_servicePublication',
                  'reservations',
                  index,
                ),
              ),
            );
          }),
        );
      }),
    ));

  it('rejects Actor, Agent and External input at both administrative command boundaries', async () => {
    const api = new SystemApi('sys_servicePublication');
    for (const provenance of [
      { kind: 'system' },
      {
        kind: 'actor',
        actorName: 'viewer',
        actorVersion: 1,
        claims: {},
        nodeId: 'node_admin_rejection',
        sessionName: 'viewer',
        pushIndex: 1,
      },
      {
        kind: 'agent',
        agentName: 'expiry',
        agentVersion: 1,
      },
      {
        kind: 'external',
        originCommandId: 'cmd_parent',
        externalOutcome: {
          _tag: 'Success',
          success: null,
          recordedAt: new Date(),
        },
      },
    ]) {
      const common = {
        id: 'cmd_admin_rejection',
        commandName: 'unused',
        contractVersion: 1,
        payload: '{}',
        ...provenance,
      };
      const aggregate = {
        ...common,
        aggregateName: 'account',
        aggregateVersion: 1,
        aggregateId: 'acc_admin',
      };
      const service = {
        ...common,
        serviceName: 'reservations',
        serviceVersion: 1,
      };
      const aggregateResponse = await Reflect.apply(
        api.executeAggregateCommand,
        api,
        [
          {
            args: [{ command: aggregate }],
            traceContext: null,
          },
        ],
      );
      const serviceResponse = await Reflect.apply(
        api.executeServiceCommand,
        api,
        [
          {
            args: [{ command: service }],
            traceContext: null,
          },
        ],
      );
      for (const response of [aggregateResponse, serviceResponse]) {
        expect(response.result).toMatchObject({
          _tag: 'Failure',
          failure: { code: 'system-api-arguments-invalid' },
        });
      }
    }
  });

  it('retains linked telemetry and refuses unusable responses and mismatched Agent releases', async () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const api = getNativeSystemApi('sys_native');
        expect(
          yield* api
            .openAggregateAgentSession({
              aggregateName: 'agentAccount',
              aggregateVersion: 1,
              agentName: 'aggregateExpiry',
              agentVersion: 2,
              aggregateId: 'acc_agent',
              nodeId: 'node_observer',
            })
            .pipe(Effect.flip),
        ).toMatchObject({ code: 'agent-unavailable' });
        expect(
          yield* api
            .openServiceAgentSession({
              serviceName: 'agentReservations',
              serviceVersion: 1,
              agentName: 'serviceExpiry',
              agentVersion: 2,
              nodeId: 'node_observer',
            })
            .pipe(Effect.flip),
        ).toMatchObject({ code: 'agent-unavailable' });
        const inheritedHealthcheck = SystemApi.prototype.healthcheck;
        // Keep the inherited production method immutable and the temporary test shadow removable.
        Object.defineProperty(SystemApi.prototype, 'healthcheck', {
          value: inheritedHealthcheck,
          configurable: true,
          writable: true,
        });
        const healthcheck = vi.spyOn(SystemApi.prototype, 'healthcheck');
        try {
          const link: ISpanLinkRecord = {
            linkId: 'lnk_native',
            traceId: 'trc_11111111111111111111111111111111',
            spanId: 'spn_1111111111111111',
            priorTraceId: 'trc_22222222222222222222222222222222',
            priorSpanId: 'spn_2222222222222222',
            kind: 'causedBy',
          };
          healthcheck.mockResolvedValueOnce({
            result: { _tag: 'Success', success: 'native-ok' },
            link,
          });
          const captured = yield* captureTelemetry(
            api.healthcheck().pipe(Effect.withSpan('native-read')),
          );
          expect(captured.exit).toEqual(Exit.succeed('native-ok'));
          expect(captured.telemetry.links).toContainEqual(link);
          expect(healthcheck.mock.calls[0]?.[0].traceContext).toMatchObject({
            traceId: expect.stringMatching(/^trc_/),
            parentSpanId: expect.stringMatching(/^spn_/),
          });

          healthcheck.mockRejectedValueOnce(
            new Error('Native invocation lost'),
          );
          expect(yield* api.healthcheck().pipe(Effect.flip)).toMatchObject({
            code: 'rpc-invocation-failed',
          });
          healthcheck.mockResolvedValueOnce(
            JSON.parse(
              '{"result":{"_tag":"Success","success":"ignored"},"link":{"invalid":true}}',
            ),
          );
          expect(yield* api.healthcheck().pipe(Effect.flip)).toMatchObject({
            code: 'rpc-invalid-response',
          });
        } finally {
          healthcheck.mockRestore();
        }
      }),
    ));
});

it('forwards retained Aggregate and Agent admissions once with only their trusted headers', async () => {
  const systemRepo = env.NATIVE_TEST_SYSTEM_REPO.getByName(
    'sys_servicePublication',
  );
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const actor = system.aggregates.account.releases[1].actors.viewer;
  const actorLock = Schema.decodeUnknownSync(
    SessionAdmissionSchema.members[0].fields.aggregateSessionLock,
  )(
    makeAggregateSessionLock({
      aggregateName: 'account',
      aggregateVersion: 1,
      actorName: actor.name,
      actorVersion: actor.version,
      sessionName: 'reader',
      claimsSchema: actor.identity.claimsSchema,
      models: actor.exposedModels,
      modelNames: Object.keys(actor.exposedModels),
      contracts: actor.contracts,
    }),
    { onExcessProperty: 'error' },
  );
  const aggregateAgentLock = Schema.decodeUnknownSync(
    SessionAdmissionSchema.members[1].fields.aggregateSessionLock,
  )(makeAggregateSessionLock(aggregateExpiry1), {
    onExcessProperty: 'error',
  });
  const serviceAgentLock = makeServiceAgentSessionLock(serviceExpiry1);
  const actorClaims = { aggregateId: 'acc_forwarded', viewerId: 'viewer' };
  const cases: {
    admission: ISessionAdmission;
    path: string;
    key: object;
    headers: Record<string, string>;
  }[] = [
    {
      admission: {
        kind: 'aggregateActor',
        aggregateName: 'account',
        aggregateVersion: 1,
        aggregateId: 'acc_forwarded',
        actorPath: '/viewer',
        nodeId: null,
        claims: actorClaims,
        aggregateSessionLock: actorLock,
      },
      path: '/ws-aggregate-session-commands',
      key: {
        systemId: 'sys_servicePublication',
        aggregateName: 'account',
        aggregateVersion: 1,
        aggregateId: 'acc_forwarded',
        actorName: 'viewer',
        actorVersion: 1,
        actorPath: '/viewer',
      },
      headers: {
        'x-zerospin-claims': JSON.stringify(actorClaims),
        'x-zerospin-producer': 'null',
        'x-zerospin-aggregate-session-lock': JSON.stringify(actorLock),
      },
    },
    {
      admission: {
        kind: 'aggregateAgent',
        aggregateName: 'agentAccount',
        aggregateVersion: 1,
        aggregateId: 'acc_agent',
        nodeId: 'node_aggregate_observer',
        aggregateSessionLock: aggregateAgentLock,
      },
      path: '/ws-aggregate-session-commands',
      key: {
        systemId: 'sys_servicePublication',
        aggregateName: 'agentAccount',
        aggregateVersion: 1,
        aggregateId: 'acc_agent',
        agentName: 'aggregateExpiry',
        agentVersion: 1,
      },
      headers: {
        'x-zerospin-origin': JSON.stringify({
          kind: 'agent',
          agentName: 'aggregateExpiry',
          agentVersion: 1,
        }),
        'x-zerospin-producer': JSON.stringify('node_aggregate_observer'),
        'x-zerospin-aggregate-session-lock': JSON.stringify(aggregateAgentLock),
      },
    },
    {
      admission: {
        kind: 'serviceAgent',
        serviceName: 'agentReservations',
        serviceVersion: 1,
        nodeId: 'node_service_observer',
        serviceAgentSessionLock: serviceAgentLock,
      },
      path: '/ws-service-session-commands',
      key: {
        systemId: 'sys_servicePublication',
        serviceName: 'agentReservations',
        serviceVersion: 1,
        agentName: 'serviceExpiry',
        agentVersion: 1,
      },
      headers: {
        'x-zerospin-origin': JSON.stringify({
          kind: 'agent',
          agentName: 'serviceExpiry',
          agentVersion: 1,
        }),
        'x-zerospin-producer': JSON.stringify('node_service_observer'),
        'x-zerospin-service-name': 'agentReservations',
        'x-zerospin-service-version': '1',
        'x-zerospin-service-agent-session-lock':
          JSON.stringify(serviceAgentLock),
      },
    },
  ];
  const forwarded: { key: object; request: Request }[] = [];
  const ownsActor = env.AGGREGATE_VERSION_REPO !== undefined;
  if (ownsActor) {
    vi.spyOn(AggregateActorVersionChain.prototype, 'fetch').mockImplementation(
      async function (this: AggregateActorVersionChain, request: Request) {
        forwarded.push({ key: this.key, request });
        return new Response('Aggregate Actor forwarded', { status: 200 });
      },
    );
  } else {
    vi.spyOn(AggregateAgentVersionChain.prototype, 'fetch').mockImplementation(
      async function (this: AggregateAgentVersionChain, request: Request) {
        forwarded.push({ key: this.key, request });
        return new Response('Aggregate Agent forwarded', { status: 200 });
      },
    );
    vi.spyOn(ServiceAgentVersionChain.prototype, 'fetch').mockImplementation(
      async function (this: ServiceAgentVersionChain, request: Request) {
        forwarded.push({ key: this.key, request });
        return new Response('Service Agent forwarded', { status: 200 });
      },
    );
  }
  for (const scenario of cases.filter(
    ({ admission }) => (admission.kind === 'aggregateActor') === ownsActor,
  )) {
    let ticket: string;
    if (scenario.admission.kind === 'aggregateActor') {
      const api = new AggregateApi({
        systemName: system.name,
        aggregateName: 'account',
        aggregateVersion: 1,
        actorName: actor.name,
        actorVersion: actor.version,
      });
      const authenticatedActor = await api.authenticate({
        aggregateId: 'acc_forwarded',
        credentials: { viewerId: 'viewer' },
      });
      const session = await authenticatedActor.openSession({
        sessionName: actorLock.sessionName,
        aggregateSessionLock: actorLock,
      });
      expect(
        await session.getSnapshot({
          args: [{ nodeId: null }],
          traceContext: null,
        }),
      ).toMatchObject({ result: { _tag: 'Success' } });
      const issued = await session.createWebSocketTicket({
        args: [],
        traceContext: null,
      });
      if (issued.result._tag !== 'Success') {
        expect.fail('Expected an authenticated Aggregate Actor ticket');
      }
      ticket = issued.result.success.ticket;
    } else {
      const issued = await systemRepo.createSessionWebSocketTicket({
        admission: scenario.admission,
      });
      if (issued.result._tag !== 'Success') {
        expect.fail('Expected a valid session ticket');
      }
      ticket = issued.result.success;
    }
    const url = `https://tickets.example${scenario.path}?ticket=${ticket}`;
    const request = new Request(url, {
      headers: {
        Upgrade: 'websocket',
        'x-zerospin-origin': 'caller-origin',
        'x-zerospin-claims': 'caller-claims',
        'x-zerospin-producer': 'caller-node',
        'x-zerospin-unissued': 'caller-authority',
        'x-forward-test': 'retained',
      },
    });
    const before = forwarded.length;
    expect((await systemRepo.fetch(request)).status).toBe(200);
    expect(forwarded).toHaveLength(before + 1);
    const received = forwarded[before];
    if (received === undefined) {
      expect.fail('Expected the addressed Chain fetch');
    }
    expect(received.key).toEqual(scenario.key);
    const forwardedUrl = new URL(received.request.url);
    expect(forwardedUrl.pathname).toBe(scenario.path);
    expect(forwardedUrl.search).toBe('');
    expect(received.request.url).not.toContain(ticket);
    expect(received.request.headers.get('x-forward-test')).toBe('retained');
    expect(
      Object.fromEntries(
        Array.from(received.request.headers).filter(([name]) =>
          name.startsWith('x-zerospin-'),
        ),
      ),
    ).toEqual(scenario.headers);
    expect((await systemRepo.fetch(new Request(request))).status).toBe(401);
    expect(forwarded).toHaveLength(before + 1);
  }
});

it('preserves authenticated Aggregate identity and later authorization when diagnostic delivery fails', async () => {
  const spec = makeSystemSpec({ system });
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec })
    ).result._tag,
  ).toBe('Success');
  const batches: ITelemetryBatch[] = [];
  const telemetry = Effect.runSync(
    WorkerTelemetry.pipe(Effect.provide(WorkerTelemetryLive)),
  );
  vi.spyOn(telemetry, 'emit').mockImplementation(({ batch }) => {
    batches.push(batch);
    return Effect.die(new Error('Fixture diagnostic delivery unavailable'));
  });
  const actor = system.aggregates.account.releases[1].actors.viewer;
  const definition = {
    aggregateName: 'account',
    aggregateVersion: 1,
    actorName: 'viewer',
    actorVersion: 1,
    sessionName: 'reader',
    claimsSchema: actor.identity.claimsSchema,
    models: actor.exposedModels,
    modelNames: Object.keys(actor.exposedModels),
    contracts: actor.contracts,
  };
  const lock = makeAggregateSessionLock(definition);
  const api = new AggregateApi({
    systemName: system.name,
    aggregateName: 'account',
    aggregateVersion: 1,
    actorName: 'viewer',
    actorVersion: 1,
  });
  const originalSnapshot = AggregateActorVersionRepo.prototype.getSnapshot;
  const snapshotRead = vi
    .spyOn(AggregateActorVersionRepo.prototype, 'getSnapshot')
    .mockImplementation(function (this: AggregateActorVersionRepo, props) {
      expect(this.key).toEqual({
        systemId: 'sys_servicePublication',
        aggregateId: 'acc_admitted',
        aggregateName: 'account',
        aggregateVersion: 1,
        actorName: 'viewer',
        actorVersion: 1,
        actorPath: '/reader space',
      });
      return originalSnapshot.call(this, props);
    });
  for (const { credentials, code } of [
    {
      credentials: { viewerId: 'refused' },
      code: 'aggregate-authentication-failed',
    },
    {
      credentials: { viewerId: 'mismatched' },
      code: 'identity-aggregate-id-mismatch',
    },
    {
      credentials: { viewerId: 'reader', extra: true },
      code: 'authentication-credentials-invalid',
    },
    { credentials: { viewerId: '..' }, code: 'identity-selection-invalid' },
  ]) {
    const authenticatedActor = await api.authenticate({
      aggregateId: 'acc_admitted',
      credentials,
    });
    const refused = await authenticatedActor.openSession({
      sessionName: lock.sessionName,
      aggregateSessionLock: lock,
    });
    const snapshot = await refused.getSnapshot({
      args: [{ nodeId: null }],
      traceContext: null,
    });
    expect(snapshot).toMatchObject({
      result: { _tag: 'Failure', failure: { code } },
    });
    if (code === 'aggregate-authentication-failed') {
      const admissionSpan = batches
        .flatMap(batch => batch.spans)
        .find(
          span =>
            span.name === 'AggregateApi.authenticate' &&
            span.status === 'error',
        );
      expect(admissionSpan?.attributes?.['error.cause']).toContain(
        'fixture-aggregate-authentication-refused',
      );
      if (process.env['ZEROSPIN_PROFILE'] === '1') {
        expect(
          JSON.stringify(admissionSpan?.attributes?.['function.exit']),
        ).toContain('fixture-aggregate-authentication-refused');
      } else {
        expect(admissionSpan?.attributes?.['function.exit']).toBeUndefined();
      }
      expect(snapshot).not.toHaveProperty('result.failure.cause');
      expect(JSON.stringify(snapshot.result)).not.toContain(
        'Fixture diagnostic delivery unavailable',
      );
    }
  }
  expect(snapshotRead).not.toHaveBeenCalled();
  const authenticatedActor = await api.authenticate({
    aggregateId: 'acc_admitted',
    credentials: { viewerId: 'reader space' },
  });
  const session = await authenticatedActor.openSession({
    sessionName: lock.sessionName,
    aggregateSessionLock: lock,
  });
  expect(
    await session.getSnapshot({ args: [{ nodeId: null }], traceContext: null }),
  ).toMatchObject({
    result: {
      _tag: 'Success',
      success: {
        aggregateId: 'acc_admitted',
        aggregateName: 'account',
        aggregateVersion: 1,
        sessionName: 'reader',
        actorName: 'viewer',
        actorVersion: 1,
        claims: { aggregateId: 'acc_admitted', viewerId: 'reader space' },
        aggregateIndex: 0,
        resources: [],
      },
    },
  });
  const unavailable = await new GatewayApi().aggregate({
    publishableKey: 'pk_dev',
    systemName: system.name,
    name: 'account',
    version: 2,
    actorName: 'viewer',
    actorVersion: 1,
  });
  const unavailableAccess = await unavailable.authenticate({
    aggregateId: 'acc_admitted',
    credentials: { viewerId: 'reader space' },
  });
  const unavailableSession = await unavailableAccess.openSession({
    sessionName: lock.sessionName,
    aggregateSessionLock: lock,
  });
  expect(
    await unavailableSession.getSnapshot({
      args: [{ nodeId: null }],
      traceContext: null,
    }),
  ).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: {
        code: 'identity-aggregate-unavailable',
        message: expect.stringContaining(
          'Refresh the page to load the latest app.',
        ),
      },
    },
  });
  expect(
    await session.getBrowserCommands({
      args: [{ aggregateVersion: 2, afterAggregateIndex: 0 }],
      traceContext: null,
    }),
  ).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: {
        code: 'aggregate-version-unavailable',
        message:
          'The requested version is not available through this capability',
      },
    },
  });
  for (const { sessionName, aggregateSessionLock, code } of [
    {
      sessionName: 'reader',
      aggregateSessionLock: makeAggregateSessionLock({
        ...definition,
        actorName: 'auditor',
      }),
      code: 'actor-capability-mismatch',
    },
    {
      sessionName: 'refused',
      aggregateSessionLock: { ...lock, sessionName: 'refused' },
      code: 'aggregate-authorization-failed',
    },
  ]) {
    const refused = await authenticatedActor.openSession({
      sessionName,
      aggregateSessionLock,
    });
    expect(
      await refused.getSnapshot({
        args: [{ nodeId: null }],
        traceContext: null,
      }),
    ).toMatchObject({
      result: { _tag: 'Failure', failure: { code } },
    });
  }
  expect(snapshotRead).toHaveBeenCalledTimes(1);
  const projectionKey = {
    systemId: 'sys_servicePublication',
    aggregateId: 'acc_admitted',
    aggregateName: 'account',
    aggregateVersion: 1,
    actorName: 'viewer',
    actorVersion: 1,
    actorPath: '/reader space',
  };
  const claims = { aggregateId: 'acc_admitted', viewerId: 'reader space' };
  const request = {
    aggregateId: projectionKey.aggregateId,
    aggregateName: projectionKey.aggregateName,
    actorName: projectionKey.actorName,
    actorVersion: projectionKey.actorVersion,
    claims,
    sessionName: 'reader',
    nodeId: 'node_private',
  };
  const projection = env.AGGREGATE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(aggregateActorVersionRepoNameUtils.makeName(projectionKey)),
  );
  await runInDurableObject(projection, async instance => {
    expect(
      (await instance.getSnapshot({ ...request, actorVersion: 2 })).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'projection-state-owner-mismatch' },
    });
  });
  const history = env.AGGREGATE_ACTOR_VERSION_CHAIN.getByName(
    Effect.runSync(aggregateActorVersionChainNameUtils.makeName(projectionKey)),
  );
  expect(
    (
      await history.appendExposedCommands({
        sourceKey: projectionKey,
        commands: [
          {
            id: 'cmd_private_completion',
            commandName: 'changeAggregateReservation',
            aggregateIndex: 1,
            dispositionChainHash: '1'.repeat(64),
            delta: { upserted: [], deleted: [] },
            commandResolution: {
              nodeId: request.nodeId,
              pushIndex: 1,
              sessionName: request.sessionName,
              claims: { ...claims, department: 'finance' },
              failure: {
                _tag: 'ZerospinError',
                code: 'fixture-private-completion',
                message: 'Private completion',
                status: null,
                extra: null,
              },
            },
          },
        ],
      })
    ).result._tag,
  ).toBe('Success');
  const recovery = {
    nodeId: request.nodeId,
    actorName: request.actorName,
    actorVersion: request.actorVersion,
    claims: { ...claims, department: 'finance' },
    sessionName: request.sessionName,
    throughAggregateIndex: 1,
  };
  expect((await history.getResolvedThrough(recovery)).result).toEqual({
    _tag: 'Success',
    success: 1,
  });
  expect(
    (
      await history.getResolvedThrough({
        ...recovery,
        claims: { ...claims, department: 'support' },
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'node-recovery-caller-mismatch' },
  });
  const replay = {
    afterAggregateIndex: 0,
    afterPushIndex: 0,
    nodeId: request.nodeId,
    definition: {
      name: request.sessionName,
      actorName: recovery.actorName,
      actorVersion: recovery.actorVersion,
      claims: recovery.claims,
      modelNames: [],
    },
  };
  await runInDurableObject(history, async instance => {
    expect((await instance.getBrowserCommands(replay)).result).toMatchObject({
      _tag: 'Success',
      success: {
        commands: [{ failure: { code: 'fixture-private-completion' } }],
        pushThrough: 1,
      },
    });
    expect(
      (await instance.getBrowserCommands({ ...replay, nodeId: 'node_other' }))
        .result,
    ).toMatchObject({
      _tag: 'Success',
      success: { commands: [{ failure: null }], pushThrough: 0 },
    });
  });
  const socketResponse = await history.fetch(
    new Request('https://actor.example/observe', {
      headers: {
        Upgrade: 'websocket',
        'x-zerospin-claims': JSON.stringify(claims),
        'x-zerospin-producer': JSON.stringify('node_socket'),
        'x-zerospin-aggregate-session-lock': JSON.stringify(lock),
      },
    }),
  );
  expect(socketResponse.status).toBe(101);
  const socket = socketResponse.webSocket;
  if (socket === null) expect.fail('Expected an Actor WebSocket');
  const frames: (typeof AggregateSocketServerMessageSchema.Type)[] = [];
  socket.addEventListener('message', event => {
    frames.push(
      Schema.decodeUnknownSync(
        Schema.fromJsonString(AggregateSocketServerMessageSchema),
      )(event.data, { onExcessProperty: 'error' }),
    );
  });
  socket.accept();
  try {
    socket.send(
      JSON.stringify({
        type: 'resume',
        nodeId: 'node_socket',
        aggregateIndex: 1,
        dispositionChainHash: '1'.repeat(64),
        outcomeIndex: 0,
      }),
    );
    await expect.poll(() => frames.at(-1)?.type).toBe('replay-complete');
    socket.send(
      JSON.stringify({
        type: 'pushAggregateCommand',
        command: {
          id: 'cmd_forged_claims',
          commandName: 'changeAggregateReservation',
          contractVersion: 1,
          payload: '{}',
          aggregateId: projectionKey.aggregateId,
          aggregateName: projectionKey.aggregateName,
          aggregateVersion: projectionKey.aggregateVersion,
          kind: 'actor',
          actorName: projectionKey.actorName,
          actorVersion: projectionKey.actorVersion,
          claims: { ...claims, department: 'forged' },
          nodeId: 'node_socket',
          sessionName: request.sessionName,
          pushIndex: 1,
        },
      }),
    );
    await expect
      .poll(() => frames.at(-1))
      .toMatchObject({
        type: 'aggregateCommandAdmissionFailed',
        failure: { code: 'aggregate-session-command-identity-mismatch' },
      });
  } finally {
    socket.close(1000, 'Actor check complete');
  }
  const spans = batches.flatMap(batch => batch.spans);
  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'AggregateApi.authenticate',
        status: 'ok',
      }),
      expect.objectContaining({
        name: 'AggregateApi.authenticate',
        status: 'error',
      }),
      expect.objectContaining({
        name: 'AggregateApi.authenticateAggregateClaims',
      }),
      expect.objectContaining({ name: 'ActorAdmission.makeActorSelection' }),
      expect.objectContaining({
        name: 'AggregateVersionRepo.authorizeAggregateSession',
      }),
    ]),
  );
});

it('preserves Service authentication-none claims and owner authorization when diagnostic delivery fails', async () => {
  const spec = makeSystemSpec({ system });
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec })
    ).result._tag,
  ).toBe('Success');
  const batches: ITelemetryBatch[] = [];
  const telemetry = Effect.runSync(
    WorkerTelemetry.pipe(Effect.provide(WorkerTelemetryLive)),
  );
  vi.spyOn(telemetry, 'emit').mockImplementation(({ batch }) => {
    batches.push(batch);
    return Effect.die(new Error('Fixture diagnostic delivery unavailable'));
  });
  const actor = system.services.reservations.releases[1].actors.operator;
  const claims = { viewerId: 'service reader', department: 'finance' };
  const lock = makeServiceSessionLock({
    kind: 'service',
    serviceName: 'reservations',
    serviceVersion: 1,
    actorName: 'operator',
    actorVersion: 1,
    sessionName: 'operator',
    claimsSchema: actor.identity.claimsSchema,
    contracts: actor.contracts,
    models: actor.exposedModels,
    modelNames: Object.keys(actor.exposedModels),
  });
  const api = new ServiceApi({
    systemName: system.name,
    serviceName: 'reservations',
    serviceVersion: 1,
  });
  const originalSnapshot = ServiceActorVersionRepo.prototype.getSnapshot;
  const snapshotRead = vi
    .spyOn(ServiceActorVersionRepo.prototype, 'getSnapshot')
    .mockImplementation(function (this: ServiceActorVersionRepo, props) {
      expect(this.key).toEqual({
        systemId: 'sys_servicePublication',
        serviceName: 'reservations',
        serviceVersion: 1,
        actorName: 'operator',
        actorVersion: 1,
        actorPath: '/service reader',
      });
      return originalSnapshot.call(this, props);
    });
  for (const { request, code } of [
    { request: { credentials: {} }, code: 'admission-claims-required' },
    {
      request: { claims: { viewerId: claims.viewerId } },
      code: 'identity-result-invalid',
    },
  ]) {
    const access = await api.admit({
      actorName: 'operator',
      actorVersion: 1,
      ...request,
    });
    const refused = await access.authorize({
      sessionName: lock.sessionName,
      serviceSessionLock: lock,
    });
    expect(
      await refused.getSnapshot({
        args: [{ nodeId: null }],
        traceContext: null,
      }),
    ).toMatchObject({
      result: { _tag: 'Failure', failure: { code } },
    });
  }
  expect(snapshotRead).not.toHaveBeenCalled();
  const access = await api.admit({
    actorName: 'operator',
    actorVersion: 1,
    claims,
  });
  const session = await access.authorize({
    sessionName: lock.sessionName,
    serviceSessionLock: lock,
  });
  expect(
    await session.getSnapshot({ args: [{ nodeId: null }], traceContext: null }),
  ).toMatchObject({
    result: {
      _tag: 'Success',
      success: {
        serviceName: 'reservations',
        serviceVersion: 1,
        actorName: 'operator',
        actorVersion: 1,
        sessionName: 'operator',
        claims,
        serviceIndex: 0,
        resources: [],
      },
    },
  });
  for (const { sessionName, serviceSessionLock, code } of [
    {
      sessionName: 'operator',
      serviceSessionLock: { ...lock, actorName: 'auditor', contracts: {} },
      code: 'service-actor-target-mismatch',
    },
    {
      sessionName: 'refused',
      serviceSessionLock: { ...lock, sessionName: 'refused' },
      code: 'service-authorization-failed',
    },
  ]) {
    const refused = await access.authorize({ sessionName, serviceSessionLock });
    expect(
      await refused.getSnapshot({
        args: [{ nodeId: null }],
        traceContext: null,
      }),
    ).toMatchObject({
      result: { _tag: 'Failure', failure: { code } },
    });
  }
  expect(snapshotRead).toHaveBeenCalledTimes(1);
  const spans = batches.flatMap(batch => batch.spans);
  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'ServiceApi.admit', status: 'ok' }),
      expect.objectContaining({ name: 'ServiceApi.admit', status: 'error' }),
      expect.objectContaining({ name: 'ServiceApi.authenticateServiceClaims' }),
      expect.objectContaining({ name: 'ActorAdmission.makeActorSelection' }),
      expect.objectContaining({
        name: 'ServiceVersionRepo.authorizeServiceSession',
      }),
    ]),
  );
});

it('preserves actual authorization command backpressure while normalizing authored copies of its code', async () => {
  expect(
    (
      await env.SYSTEM_REPO.getByName(
        'sys_servicePublication',
      ).registerSystemSpec({ spec: makeSystemSpec({ system }) })
    ).result._tag,
  ).toBe('Success');
  const repo = env.AGGREGATE_VERSION_REPO.getByName(
    'avr_sys_servicePublication/acc_authorization_pressure/account/1',
  );
  const original = system.aggregates.account.releases[1];
  for (const mode of ['framework', 'forged', 'copied'] as const) {
    const viewer = makeAggregateActorRelease(
      { name: 'viewer' },
      {
        version: 1,
        db: original.actors.viewer.db,
        exposedModels: original.actors.viewer.exposedModels,
        identity: original.actors.viewer.identity,
        authentication: original.actors.viewer.authentication,
        selections: {},
        contracts: {},
        authorize: ({ executeCommand }) => {
          if (mode === 'forged') {
            return Effect.fail(
              makeZerospinError('aggregate-admission-backlog-full'),
            );
          }
          const execution = executeCommand({
            commandName: 'changeAggregateReservation',
            contractVersion: 1,
            payload: {
              reservationId: 'arv_authorization',
              expiresAt: 1_000,
              action: 'create',
            },
          });
          return (
            mode === 'copied'
              ? execution.pipe(
                  Effect.catch(() =>
                    Effect.fail(
                      makeZerospinError('aggregate-admission-backlog-full'),
                    ),
                  ),
                )
              : execution
          ).pipe(Effect.asVoid);
        },
      },
    );
    const release = makeAggregateRelease(original.definition, {
      version: 1,
      models: original.models,
      actors: { viewer },
      system: original.system,
      external: original.external,
    });
    const localSystem = makeSystem({
      name: system.name,
      aggregates: { account: { releases: { 1: release } } },
    });
    const lock = makeAggregateSessionLock({
      aggregateName: 'account',
      aggregateVersion: 1,
      actorName: 'viewer',
      actorVersion: 1,
      sessionName: 'reader',
      claimsSchema: viewer.identity.claimsSchema,
      models: viewer.exposedModels,
      modelNames: Object.keys(viewer.exposedModels),
      contracts: viewer.contracts,
    });
    const failure = await runInDurableObject(repo, async ({ db, key }) => {
      const backpressure = makeZerospinError({
        code: 'aggregate-admission-backlog-full',
        extra: { retryable: true },
      });
      const exit = await config.managedRuntime.runPromise(
        authorizeAggregateSession({
          ...key,
          db,
          sessionName: 'reader',
          claims: { aggregateId: key.aggregateId, viewerId: 'one' },
          aggregateSessionLock: lock,
          executeDirectSystemAggregateCommand: ({ command }) => {
            expect(command).not.toHaveProperty('id');
            return Effect.fail(backpressure);
          },
        }).pipe(Effect.provideService(System, localSystem), Effect.exit),
      );
      if (exit._tag !== 'Failure') {
        expect.fail('Expected authorization rejection');
      }
      const reason = exit.cause.reasons[0];
      if (reason === undefined || !Cause.isFailReason(reason)) {
        expect.fail('Expected one typed authorization failure');
      }
      const error = reason.error;
      return {
        code:
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : null,
        sameFailure: error === backpressure,
      };
    });
    expect(failure).toEqual({
      code:
        mode === 'framework'
          ? 'aggregate-admission-backlog-full'
          : 'aggregate-authorization-failed',
      sameFailure: mode === 'framework',
    });
  }
});
