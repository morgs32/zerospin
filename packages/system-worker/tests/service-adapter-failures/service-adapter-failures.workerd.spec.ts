import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { DownAdapterRefused } from '@zerospin/core/contracts/DownAdapterRefused';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { makeServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { System } from '@zerospin/core/system/System';
import { ContractError, makeZerospinError } from '@zerospin/error';
import { materializeCommandTx } from '@zerospin/owner-release-worker/ServiceVersionRepo/materializeCommandTx';
import { primitives } from '@zerospin/shapes';
import { reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { afterEach, expect, it } from 'vitest';

import type { IServiceCommandOccurrence } from '../../src/ServiceChain/types.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import config, { system } from './system.ts';

afterEach(() => reset());

it.each([
  'missing',
  'actor',
  'lineage',
  'source',
  'payload',
  'claims',
  'provenance',
] as const)(
  'retains Service support refusals and preserves unresolved replay failures: %s',
  async scenario => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
        .result._tag,
    ).toBe('Success');
    const repo = env.SERVICE_VERSION_REPO.getByName(
      'svr_sys_servicePublication/reservations/2',
    );
    const actorCommand =
      scenario === 'actor' ||
      scenario === 'claims' ||
      scenario === 'provenance';
    const missingCommand =
      scenario === 'missing' || scenario === 'source' || scenario === 'payload';
    let programExecutions = 0;
    const ordinarySource = makeServiceContractRelease(
      defineServiceContract('replayCommand'),
      {
        version: scenario === 'lineage' ? 2 : 1,
        payload: {},
        program: () =>
          Effect.sync(() => {
            programExecutions += 1;
          }),
      },
    );
    const afterRefusal = makeServiceContractRelease(
      defineServiceContract('afterRefusal'),
      {
        version: 1,
        payload: {},
        program: () => Effect.void,
      },
    );
    const localContract = actorCommand
      ? ordinarySource
      : makeServiceContractRelease(defineServiceContract('replayCommand'), {
          version: 1,
          payload: {},
          program: () =>
            Effect.sync(() => {
              programExecutions += 1;
            }),
        });
    const declaredActor =
      system.services.reservations.releases[1].actors.operator;
    const actorProps = {
      db: declaredActor.db,
      identity: declaredActor.identity,
      authentication: 'none',
      exposedModels: {},
      selections: {},
    } as const;
    const sourceActor = makeServiceActorRelease(
      { name: 'operator' },
      {
        ...actorProps,
        version: 1,
        contracts: { replayCommand: ordinarySource },
      },
    );
    const localActor = makeServiceActorRelease(
      { name: 'operator' },
      {
        ...actorProps,
        version: 2,
        contracts: {},
      },
    );
    const sourceRelease = makeServiceRelease(
      { name: 'reservations' },
      {
        version: 1,
        models: { reservation },
        actors: actorCommand ? { operator: sourceActor } : {},
        system:
          scenario === 'source'
            ? { afterRefusal }
            : { replayCommand: ordinarySource, afterRefusal },
      },
    );
    const serviceRelease = makeServiceRelease(
      { name: 'reservations' },
      {
        version: 2,
        models: { reservation },
        actors: actorCommand ? { operator: localActor } : {},
        system: missingCommand
          ? { afterRefusal }
          : { replayCommand: localContract, afterRefusal },
      },
    );
    const localSystem = makeSystem({
      name: 'replayResolution',
      aggregates: {},
      services: {
        reservations: {
          releases: { 1: sourceRelease, 2: serviceRelease },
          canonical: 1,
        },
      },
    });
    const command: IServiceCommandOccurrence = {
      id: 'cmd_replay',
      commandName: 'replayCommand',
      contractVersion: ordinarySource.version,
      payload: scenario === 'payload' ? '{"unexpected":' : '{}',
      serviceName: 'reservations',
      serviceVersion: 1,
      serviceIndex: 1,
      ...(actorCommand
        ? {
            kind: 'actor',
            actorName: 'operator',
            actorVersion: scenario === 'provenance' ? 99 : 1,
            claims: {
              viewerId: scenario === 'claims' ? 42 : 'one',
              department: 'billing',
            },
            nodeId: 'node_replay',
            sessionName: 'operator',
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
          serviceRelease,
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
              code: 'service-contract-unsupported',
            },
          },
        },
      });
      await runInDurableObject(repo, async instance => {
        expect(
          instance.db.select().from(instance.schema.materializationHead).all(),
        ).toMatchObject([
          {
            serviceIndex: 1,
            dispositionChainHash: refused.dispositionChainHash,
          },
        ]);
        expect(
          instance.db
            .select()
            .from(instance.schema.serviceVersionChainOutbox)
            .all(),
        ).toHaveLength(1);
        const next: IServiceCommandOccurrence = {
          id: 'cmd_after_refusal',
          commandName: 'afterRefusal',
          contractVersion: 1,
          payload: '{}',
          serviceName: 'reservations',
          serviceVersion: 1,

          serviceIndex: 2,
          kind: 'system',
          outcome: {
            result: { _tag: 'Success', success: null },
            finalizedAt: new Date(2_000),
          },
        };
        const evaluated = await config.managedRuntime.runPromise(
          materializeCommandTx(instance.db, {
            row: next,
            serviceRelease,
            key: instance.key,
            mode: 'replay',
            retainedCommand: null,
          }).pipe(Effect.provideService(System, localSystem)),
        );
        expect(evaluated?.outcome.result._tag).toBe('Success');
        expect(
          instance.db.select().from(instance.schema.materializationHead).all(),
        ).toMatchObject([{ serviceIndex: 2 }]);
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
            ? 'service-contract-version-unsupported'
            : scenario === 'payload'
              ? 'decode-command-payload-failed'
              : scenario === 'claims'
                ? 'service-command-claims-invalid'
                : 'actor-version-unsupported',
      });
    }
    expect(
      await runInDurableObject(repo, ({ db, schema }) => ({
        resources: db.all(sql`SELECT * FROM reservation`),
        head: db.select().from(schema.materializationHead).all(),
        outbox: db.select().from(schema.serviceVersionChainOutbox).all(),
      })),
    ).toEqual({ resources: [], head: [], outbox: [] });
  },
);

it.each(['guard', 'program'] as const)(
  'retains an evaluated Service %s refusal and advances replay',
  async phase => {
    const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
    expect(
      (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
        .result._tag,
    ).toBe('Success');
    const repo = env.SERVICE_VERSION_REPO.getByName(
      'svr_sys_servicePublication/reservations/2',
    );
    const sourceContract = makeServiceContractRelease(
      defineServiceContract('refuseReplay'),
      {
        version: 1,
        payload: {},
        failures: { refused: ContractError.schema({ code: 'replay-refused' }) },
        program: () => Effect.void,
      },
    );
    const localContract = upgradeServiceContractRelease(sourceContract, {
      version: 2,
      guard: ({ failures }) =>
        phase === 'guard'
          ? failures.refused.make({ message: 'Guard refused replay' })
          : Effect.void,
      program: ({ failures }) =>
        failures.refused.make({ message: 'Program refused replay' }),
    });
    const sourceRelease = makeServiceRelease(
      { name: 'reservations' },
      {
        version: 1,
        models: { reservation },
        actors: {},
        system: { refuseReplay: sourceContract },
        external: {},
      },
    );
    const serviceRelease = makeServiceRelease(
      { name: 'reservations' },
      {
        version: 2,
        models: { reservation },
        actors: {},
        system: { refuseReplay: localContract },
        external: {},
      },
    );
    const localSystem = makeSystem({
      name: 'replayRefusals',
      aggregates: {},
      services: {
        reservations: {
          releases: { 1: sourceRelease, 2: serviceRelease },
          canonical: 1,
        },
      },
    });
    const command: IServiceCommandOccurrence = {
      id: 'cmd_refused',
      commandName: 'refuseReplay',
      contractVersion: 1,
      payload: '{}',
      serviceName: 'reservations',
      serviceVersion: 1,
      serviceIndex: 1,
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
          serviceRelease,
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
      resources: db.all(sql`SELECT * FROM reservation`),
      head: db.select().from(schema.materializationHead).all(),
      outbox: db.select().from(schema.serviceVersionChainOutbox).all(),
    }));
    expect(state.resources).toEqual([]);
    expect(state.head).toMatchObject([{ serviceIndex: 1 }]);
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
    `handles Service ${failure} payload adaptation during %s execution`,
    async mode => {
      const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
      expect(
        (
          await systemRepo.registerSystemSpec({
            spec: makeSystemSpec({ system }),
          })
        ).result._tag,
      ).toBe('Success');
      const repo = env.SERVICE_VERSION_REPO.getByName(
        'svr_sys_servicePublication/reservations/1',
      );
      let programExecutions = 0;
      const contract = makeServiceContractRelease(
        defineServiceContract('adaptPayload'),
        {
          version: 1,
          payload: { value: primitives.integer() },
          program: () =>
            Effect.sync(() => {
              programExecutions += 1;
            }),
        },
      );
      upgradeServiceContractRelease(contract, {
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
      const serviceRelease = makeServiceRelease(
        { name: 'reservations' },
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
        aggregates: {},
        services: {
          reservations: { releases: { 1: serviceRelease }, canonical: 1 },
        },
      });
      const command: IServiceCommandOccurrence = {
        id: 'cmd_adapter',
        commandName: 'adaptPayload',
        contractVersion: 2,
        payload: '{"value":0}',
        serviceName: 'reservations',
        serviceVersion: mode === 'replay' ? 2 : 1,
        serviceIndex: 1,
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
            serviceRelease,
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
          failure: { code: 'service-contract-unsupported' },
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
                serviceIndex: 2,
              },
              serviceRelease,
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
        ).toMatchObject([{ serviceIndex: 2 }]);
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
          outbox: db.select().from(schema.serviceVersionChainOutbox).all(),
        })),
      ).toEqual({ head: [], outbox: [] });
    },
  );
}
