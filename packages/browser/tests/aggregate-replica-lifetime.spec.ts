import { describe, expect, it } from '@effect/vitest';
import { makeAggregatePendingReader } from '@zerospin/browser/sessionReplica/makeAggregatePendingReader';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import type { IAggregateNodeSnapshot } from '@zerospin/core/AggregateNode/AggregateNode';
import { SessionSubmissionSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import { stageAggregateSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { resolveSessionFailure } from '@zerospin/core/contracts/failureCodec';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeSqliteDrizzle } from '@zerospin/core/drizzle/make/makeSqliteDrizzle';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { sessionSubmissionKey } from '@zerospin/core/Node/sessionSubmissionKey';
import { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import type { ISessionFailureReport } from '@zerospin/core/sessionFailure/types';
import { encodeError, makeZerospinError } from '@zerospin/error';
import { makeTelemetryCollector, TelemetryCollector } from '@zerospin/logger';
import { CuidFactory, primitives } from '@zerospin/shapes';
import { sql } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';

import { openTestDb } from '../../../tests/support/openTestDb.ts';
import { makeSessionFailureObserver } from '../src/Node/makeSessionFailureObserver.ts';
import { makeAggregateReplicaReceiver } from '../src/sessionReplica/makeAggregateReplicaReceiver.ts';

const counterV1 = makeModelVersion(
  defineModel({ name: 'counter', abbreviation: 'cnt' }),
  {
    version: 1,
    attributes: { amount: primitives.integer() },
    indexes: [],
  },
);
const models = { counter: counterV1 };
const increment = makeAggregateContractRelease(
  defineAggregateContract('increment'),
  {
    version: 1,
    payload: {},
    result: Schema.Number,
    models: {
      counter: {
        model: models.counter,
        fields: ['createdAt', 'updatedAt', 'amount'],
      },
    },
    operations: { update: counterV1.operations.update },
    program: Effect.fn('aggregateReplicaIncrement.program')(function* ({
      db,
      operations,
    }) {
      const row = yield* findFirst({
        db,
        model: db.models.counter,
        where: { id: { eq: 'cnt_owned' } },
      });
      if (row === undefined) {
        throw new Error('Missing seeded counter');
      }
      yield* operations.update({
        resourceId: row.id,
        attributes: { amount: row.amount + 1 },
      });
      return row.amount + 1;
    }),
  },
);
const release = makeAggregateRelease(defineAggregate({ name: 'account' }), {
  version: 1,
  models,
  system: { increment },
  actors: {},
});
const definition = makeAggregateSessionDefinition({
  systemName: 'replica',
  aggregateName: release.name,
  aggregateVersion: release.version,
  actorName: 'member',
  actorVersion: 1,
  sessionName: 'member',
  claimsSchema: Schema.Struct({
    aggregateId: Schema.String,
    memberId: Schema.String,
    authorization: Schema.Struct({ role: Schema.String }),
  }),
  models: release.models,
  contracts: release.contracts,
});
const admittedClaims = {
  aggregateId: 'account',
  memberId: 'member',
  authorization: { role: 'reader' },
};
const baseline = {
  modelName: 'counter',
  version: 1,
  id: 'cnt_owned',
  createdAt: new Date('2026-10-26T00:00:00.000Z'),
  updatedAt: new Date('2026-10-26T00:00:00.000Z'),
  amount: 0,
};
const privateFailure = {
  _tag: 'ZerospinError' as const,
  code: 'aggregate-command-denied',
  message: 'The originating command failed',
  status: 403,
  extra: { reason: 'private' },
};
const sessionId = 'sesn_replica' as const;

function initialView(amount = 0): IAggregateNodeSnapshot {
  return {
    identity: {
      apiUrl: 'https://replica.example',
      publishableKey: 'pub_replica',
      systemName: definition.systemName,
      aggregateName: definition.aggregateName,
      aggregateVersion: definition.aggregateVersion,
      aggregateId: 'account',
      actorName: definition.actorName,
      actorVersion: definition.actorVersion,
      sessionName: definition.sessionName,
      claims: structuredClone(admittedClaims),
      definitionHash: 'replica',
    },
    state: {
      localAvailability: 'available',
      authentication: 'remembered',
      synchronization: 'online',
      blockedWork: false,
      admissionRejection: null,
      failure: null,
    },
    metadata: {
      nodeId: 'node_owned',
      aggregateId: 'account',
      sessionKey: 'replica',
      admittedThroughPushIndex: 0,
      aggregateIndex: 0,
      dispositionChainHash: '0'.repeat(64),
      pushPaused: false,
    },
    nodeIndex: 0,
    pushIndex: 0,
    outcomeIndex: 0,
    resources: [{ ...baseline, amount }],
    commandCoverage: [],
  };
}

/** Provision one actual replica/session; each scenario owns its callbacks and views. */
function openFixture() {
  return Effect.gen(function* () {
    const opened = yield* openTestDb(models);
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: aggregateSessionRepoDbConfig.tables,
    });
    const db = makeSqliteDrizzle(opened.db.$client, dbConfig);
    yield* provisionDb({ db, definition: dbConfig.definition });
    const context = Context.make(CuidFactory, () =>
      Effect.succeed('owned'),
    ).pipe(
      Context.add(MonotonicFactory, () => Effect.succeed('mono')),
      Context.add(TelemetryCollector, makeTelemetryCollector()),
    );
    const execution = {
      runSync: Effect.runSyncWith(context),
      runPromise: Effect.runPromiseWith(context),
    };
    const controller = new AbortController();
    const current = () => !controller.signal.aborted;
    const session = makeAggregateSession({
      sessionDefinition: definition,
      execution,
      onTerminalFailure: () => controller.abort(),
    });
    const replica = {
      definition,
      models,
      lock: makeAggregateSessionSpec(definition).aggregateSessionLock,
      dbConfig,
      db,
      readPending: makeAggregatePendingReader({ db }),
    };
    const originatingCommands = new Map<string, string>();
    const reports: ISessionFailureReport[] = [];
    let reportProbe: ((report: ISessionFailureReport) => void) | undefined;
    const reportFailure = (report: ISessionFailureReport) => {
      reportProbe?.(report);
      reports.push(report);
      session.reportFailure(report);
    };
    const observer = makeSessionFailureObserver({
      isCurrent: current,
      originatingCommands,
      reportFailure,
      recognizeFailure: (name, failure) =>
        execution.runSync(resolveSessionFailure(definition, name, failure)),
    });
    const outboxEvents: string[] = [];
    const stagedCommandOutbox = {
      pendingCount: () => replica.readPending(true).length,
      refresh: () => {
        outboxEvents.push('refresh');
      },
      wake: () => {
        outboxEvents.push('wake');
      },
      reset: () => {
        outboxEvents.push('reset');
      },
    };
    const authenticated: Readonly<Record<string, unknown>>[] = [];
    let claimsHook = (_claims: Readonly<Record<string, unknown>>) => undefined;
    const receiver = yield* makeAggregateReplicaReceiver({
      session,
      sessionId,
      replica,
      execution,
      stagedCommandOutbox,
      originatingCommands,
      observer,
      current,
      expectedClaims: admittedClaims,
      onAuthenticatedClaims: claims => {
        authenticated.push(structuredClone(claims));
        claimsHook(claims);
      },
    });
    const readStorage = () => [
      db.select().from(dbConfig.schema.commands).all(),
      db.select().from(dbConfig.schema.sessionMetadata).all(),
      db.select().from(counterV1.drizzleSchema).all(),
    ];
    return {
      session,
      replica,
      execution,
      controller,
      receiver,
      observer,
      originatingCommands,
      reports,
      authenticated,
      outboxEvents,
      readStorage,
      reportFailure,
      setClaimsHook: (
        hook: (claims: Readonly<Record<string, unknown>>) => undefined,
      ) => {
        claimsHook = hook;
      },
      setReportProbe: (probe: (report: ISessionFailureReport) => void) => {
        reportProbe = probe;
      },
    };
  });
}

describe('Aggregate browser replica claims, notifications and lifetimes', () => {
  it.effect('keeps the local view available on a pre-admission rejection', () =>
    Effect.gen(function* () {
      const fixture = yield* openFixture();
      const initial = initialView();
      yield* Effect.promise(() => fixture.receiver.view(initial));
      fixture.originatingCommands.set('cmd_rejected', 'increment');
      const failure = yield* encodeError(
        makeZerospinError('node-push-blocked'),
      );
      fixture.receiver.state({
        ...initial.state,
        synchronization: 'blocked',
        blockedWork: true,
        admissionRejection: {
          commandId: 'cmd_rejected',
          commandName: 'increment',
          failure,
        },
        failure,
      });
      expect(fixture.session.store.getState().status).toBe('ready');
      expect(fixture.session.store.getState().initialized).not.toBeNull();
      expect(fixture.controller.signal.aborted).toBe(false);
      expect(fixture.reports).toMatchObject([{ origin: 'command' }]);
    }),
  );
  it.effect(
    'preserves pending work through same-producer repair and reports possible loss without failing',
    () =>
      Effect.gen(function* () {
        const fixture = yield* openFixture();
        const { receiver, session, replica, execution } = fixture;
        const initial = initialView();
        yield* Effect.promise(() => receiver.view(initial));
        const initialized = session.store.getState().initialized;
        if (initialized === null) throw new Error('Expected ready replica');
        const staged = execution.runSync(
          stageAggregateSessionCommandTx(replica.db, {
            initialized,
            contractName: 'increment',
            contract: increment,
            payload: {},
          }),
        );
        fixture.originatingCommands.set(
          sessionSubmissionKey(staged),
          'increment',
        );
        const originals = replica.db
          .select()
          .from(replica.dbConfig.schema.commands)
          .all();
        yield* Effect.promise(() => receiver.reset({ preservePending: true }));
        expect(session.store.getState().initialized).toBeNull();
        yield* Effect.promise(() => receiver.view(initial));
        yield* Effect.promise(() => receiver.attachmentReady());
        expect(
          replica.db.select().from(replica.dbConfig.schema.commands).all(),
        ).toEqual(originals);
        expect(fixture.originatingCommands.size).toBe(1);
        expect(fixture.reports).toEqual([]);
        receiver.recoveryWarning({
          error: new Error('Unreadable local history'),
        });
        expect(session.store.getState()).toMatchObject({
          status: 'ready',
          failure: { code: 'node-recovery-work-unconfirmed' },
        });
        expect(fixture.reports).toMatchObject([{ origin: 'recovery' }]);
      }),
  );

  it.effect(
    'binds admitted claims before mutation and reports only originating failures after commit',
    () =>
      Effect.gen(function* () {
        const fixture = yield* openFixture();
        const { receiver, session, replica, execution, readStorage } = fixture;
        const initial = initialView();
        const beforeClaims = readStorage();
        const beforeStore = session.store.getState();
        const mismatch = yield* Effect.tryPromise({
          try: () =>
            receiver.view({
              ...initial,
              identity: {
                ...initial.identity,
                claims: {
                  ...admittedClaims,
                  authorization: { role: 'writer' },
                },
              },
              resources: [{ ...baseline, amount: 999 }],
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(mismatch)) {
          throw new Error('Expected admitted-claims mismatch');
        }
        expect(Cause.squash(mismatch.cause)).toMatchObject({
          code: 'session-claims-mismatch',
        });
        expect(readStorage()).toEqual(beforeClaims);
        expect(session.store.getState()).toBe(beforeStore);
        expect(fixture.authenticated).toEqual([]);
        expect(fixture.outboxEvents).toEqual([]);
        expect(fixture.reports).toEqual([]);

        // This notification may mutate its own payload; it cannot rewrite admitted authority.
        fixture.setClaimsHook(claims => {
          Object.assign(claims, { memberId: 'observer-mutation' });
          return undefined;
        });
        yield* Effect.promise(() => receiver.view(initial));
        expect(initial.identity.claims).toEqual(admittedClaims);
        expect(session.store.getState().initialized?.claims).toEqual(
          admittedClaims,
        );
        expect(receiver.getIdentity().claims).toEqual(admittedClaims);
        fixture.setClaimsHook(() => undefined);
        const beforeIdentity = readStorage();
        const boundStore = session.store.getState();
        const outboxBeforeIdentity = [...fixture.outboxEvents];
        const conflict = yield* Effect.tryPromise({
          try: () =>
            receiver.view({
              ...initial,
              identity: {
                ...initial.identity,
                definitionHash: 'another-definition',
              },
              resources: [{ ...baseline, amount: 999 }],
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(conflict)) {
          throw new Error('Expected immutable bound identity conflict');
        }
        expect(Cause.squash(conflict.cause)).toMatchObject({
          code: 'session-snapshot-identity-conflict',
        });
        expect(readStorage()).toEqual(beforeIdentity);
        expect(session.store.getState()).toBe(boundStore);
        expect(fixture.outboxEvents).toEqual(outboxBeforeIdentity);

        const initialized = session.store.getState().initialized;
        if (initialized === null) {
          throw new Error('Expected initialized Aggregate replica');
        }
        const staged = execution.runSync(
          stageAggregateSessionCommandTx(replica.db, {
            initialized,
            contractName: 'increment',
            contract: increment,
            payload: {},
          }),
        );
        const submission = Schema.encodeSync(SessionSubmissionSchema)(
          execution.runSync(
            encodeCommand({ contract: increment, command: staged }),
          ),
        );
        const commandId = makeNodeCommandId('node_owned', 1);
        fixture.originatingCommands.set(
          sessionSubmissionKey(submission),
          'increment',
        );
        yield* receiver.retainCoordinates([
          {
            sessionId: submission.sessionId,
            sessionIndex: submission.sessionIndex,
            nodeId: 'node_owned',
            nodeIndex: 1,
            pushIndex: 1,
          },
        ]);
        const original = replica.db
          .select()
          .from(replica.dbConfig.schema.commands)
          .get()!;
        const finalized: IAggregateNodeSnapshot = {
          ...initial,
          nodeIndex: 2,
          pushIndex: 1,
          outcomeIndex: 1,
          metadata: {
            ...initial.metadata,
            aggregateIndex: 1,
            dispositionChainHash: '1'.repeat(64),
            admittedThroughPushIndex: 1,
          },
          commandCoverage: [
            {
              sessionId: submission.sessionId,
              sessionIndex: submission.sessionIndex,
              commandName: 'increment',
              nodeId: 'node_owned',
              nodeIndex: 1,
              pushIndex: 1,
              resolution: {
                id: commandId,
                commandName: 'increment',
                aggregateIndex: 1,
                failure: privateFailure,
              },
            },
          ],
        };
        fixture.setReportProbe(report => {
          // A separate transaction starts only after installation has committed.
          replica.db.run(sql`BEGIN IMMEDIATE`);
          replica.db.run(sql`ROLLBACK`);
          expect(report.origin).toBe('command');
          expect(
            replica.db.select().from(replica.dbConfig.schema.commands).all(),
          ).toEqual([
            {
              ...original,
              aggregateIndex: 1,
              inverseOperations: null,
              failure: JSON.stringify(privateFailure),
            },
          ]);
          expect(
            replica.db
              .select()
              .from(replica.dbConfig.schema.sessionMetadata)
              .get(),
          ).toMatchObject({ aggregateIndex: 1, afterNodeIndex: 2 });
          expect(
            replica.db.select().from(counterV1.drizzleSchema).get(),
          ).toMatchObject({ amount: 0 });
          expect(session.store.getState()).toMatchObject({
            status: 'ready',
            aggregateIndex: 1,
            nodeState: { outcomeIndex: 1 },
          });
        });
        yield* Effect.promise(() => receiver.view(finalized));
        expect(fixture.reports).toHaveLength(1);
        expect(fixture.reports[0]).toMatchObject({
          origin: 'command',
          error: { code: privateFailure.code },
        });
        expect(fixture.originatingCommands.has(commandId)).toBe(false);
        expect(session.store.getState().status).toBe('ready');
        const settled = readStorage();
        yield* Effect.promise(() => receiver.view(finalized));
        expect(readStorage()).toEqual(settled);
        expect(fixture.reports).toHaveLength(1);
        yield* receiver.retainCoordinates([
          {
            sessionId: submission.sessionId,
            sessionIndex: submission.sessionIndex,
            nodeId: 'node_owned',
            nodeIndex: 1,
            pushIndex: 1,
          },
        ]);
        yield* Effect.promise(() => receiver.view(finalized));
        expect(fixture.originatingCommands.size).toBe(0);
        expect(fixture.reports).toHaveLength(1);

        // A retained local row inherited by this lifetime is not an originating command.
        const currentInitialized = session.store.getState().initialized;
        if (currentInitialized === null) {
          throw new Error('Expected usable Aggregate replica');
        }
        const inherited = execution.runSync(
          stageAggregateSessionCommandTx(replica.db, {
            initialized: currentInitialized,
            contractName: 'increment',
            contract: increment,
            payload: {},
          }),
        );
        const inheritedSubmission = Schema.encodeSync(SessionSubmissionSchema)(
          execution.runSync(
            encodeCommand({ contract: increment, command: inherited }),
          ),
        );
        yield* Effect.promise(() =>
          receiver.view({
            ...finalized,
            nodeIndex: 4,
            pushIndex: 2,
            outcomeIndex: 2,
            metadata: {
              ...finalized.metadata,
              aggregateIndex: 2,
              dispositionChainHash: '2'.repeat(64),
              admittedThroughPushIndex: 2,
            },
            commandCoverage: [
              {
                sessionId: inheritedSubmission.sessionId,
                sessionIndex: inheritedSubmission.sessionIndex,
                commandName: 'increment',
                nodeId: 'node_owned',
                nodeIndex: 3,
                pushIndex: 2,
                resolution: {
                  id: makeNodeCommandId('node_owned', 2),
                  commandName: 'increment',
                  aggregateIndex: 2,
                  failure: privateFailure,
                },
              },
            ],
          }),
        );
        expect(fixture.reports).toHaveLength(1);
        expect(
          replica.db.select().from(replica.dbConfig.schema.commands).all(),
        ).toHaveLength(2);
        expect(
          replica.db
            .select()
            .from(replica.dbConfig.schema.commands)
            .all()
            .find(row => row.sessionIndex === inherited.sessionIndex),
        ).toMatchObject({ aggregateIndex: 2, inverseOperations: null });

        yield* Effect.promise(() => receiver.reset());
        yield* Effect.promise(() =>
          receiver.view({
            ...initial,
            metadata: { ...initial.metadata, nodeId: 'node_replacement' },
            state: { ...initial.state, synchronization: 'offline' },
          }),
        );
        expect(session.store.getState().initialized).toBeNull();
        yield* Effect.promise(() => receiver.attachmentReady());
        expect(session.store.getState().initialized).not.toBeNull();
        expect(session.store.getState()).toMatchObject({
          status: 'ready',
          aggregateIndex: 0,
          nodeState: {
            nodeId: 'node_replacement',
            synchronization: 'offline',
          },
        });
        expect(readStorage()[0]).toEqual([]);
      }),
  );

  it.effect(
    'retires before installation when the claims callback closes the lifetime and fences old handlers',
    () =>
      Effect.gen(function* () {
        const fixture = yield* openFixture();
        const { receiver, session, replica, execution, readStorage } = fixture;
        const initial = initialView();
        yield* Effect.promise(() => receiver.view(initial));
        const initialized = session.store.getState().initialized;
        if (initialized === null) {
          throw new Error('Expected initialized Aggregate replica');
        }
        const staged = execution.runSync(
          stageAggregateSessionCommandTx(replica.db, {
            initialized,
            contractName: 'increment',
            contract: increment,
            payload: {},
          }),
        );
        const submission = Schema.encodeSync(SessionSubmissionSchema)(
          execution.runSync(
            encodeCommand({ contract: increment, command: staged }),
          ),
        );
        const commandId = makeNodeCommandId('node_owned', 1);
        fixture.originatingCommands.set(commandId, 'increment');
        fixture.setClaimsHook(() => {
          fixture.controller.abort();
          return undefined;
        });
        const beforeRetirement = readStorage();
        const beforeStore = session.store.getState();
        const beforeOutbox = [...fixture.outboxEvents];
        yield* Effect.promise(() =>
          receiver.view({
            ...initial,
            nodeIndex: 1,
            metadata: {
              ...initial.metadata,
              aggregateIndex: 1,
              dispositionChainHash: '1'.repeat(64),
            },
            resources: [{ ...baseline, amount: 5 }],
          }),
        );
        expect(fixture.controller.signal.aborted).toBe(true);
        expect(readStorage()).toEqual(beforeRetirement);
        expect(session.store.getState()).toBe(beforeStore);
        expect(fixture.outboxEvents).toEqual(beforeOutbox);
        expect(fixture.reports).toEqual([]);

        const replacementController = new AbortController();
        const replacementCommands = new Map<string, string>();
        const replacementEvents: string[] = [];
        const replacementObserver = makeSessionFailureObserver({
          isCurrent: () => !replacementController.signal.aborted,
          originatingCommands: replacementCommands,
          reportFailure: fixture.reportFailure,
          recognizeFailure: (name, failure) =>
            execution.runSync(resolveSessionFailure(definition, name, failure)),
        });
        const replacement = yield* makeAggregateReplicaReceiver({
          session,
          sessionId,
          replica,
          execution,
          stagedCommandOutbox: {
            pendingCount: () => replica.readPending(true).length,
            refresh: () => {
              replacementEvents.push('refresh');
            },
            wake: () => {
              replacementEvents.push('wake');
            },
            reset: () => {
              replacementEvents.push('reset');
            },
          },
          originatingCommands: replacementCommands,
          observer: replacementObserver,
          current: () => !replacementController.signal.aborted,
          expectedClaims: admittedClaims,
        });
        const replacementView: IAggregateNodeSnapshot = {
          ...initialView(7),
          identity: { ...initial.identity, definitionHash: 'replacement' },
          metadata: { ...initial.metadata, nodeId: 'node_replacement' },
        };
        yield* Effect.promise(() => replacement.view(replacementView));
        expect(
          replica.db.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 8 });
        const replacedStorage = readStorage();
        const replacedStore = session.store.getState();
        const authenticatedBeforeStale = [...fixture.authenticated];
        const newEventsBeforeStale = [...replacementEvents];
        yield* Effect.promise(() => receiver.reset());
        yield* Effect.promise(() =>
          receiver.view({
            ...initial,
            nodeIndex: 2,
            metadata: {
              ...initial.metadata,
              aggregateIndex: 2,
              dispositionChainHash: '2'.repeat(64),
            },
            resources: [{ ...baseline, amount: 999 }],
          }),
        );
        receiver.state({ ...initial.state, blockedWork: true });
        yield* receiver.retainCoordinates([
          {
            sessionId: submission.sessionId,
            sessionIndex: submission.sessionIndex,
            nodeId: 'node_owned',
            nodeIndex: 1,
            pushIndex: 1,
          },
        ]);
        yield* Effect.promise(() => receiver.attachmentReady());
        expect(readStorage()).toEqual(replacedStorage);
        expect(session.store.getState()).toBe(replacedStore);
        expect(fixture.authenticated).toEqual(authenticatedBeforeStale);
        expect(fixture.originatingCommands.get(commandId)).toBe('increment');
        expect(fixture.outboxEvents).toEqual(beforeOutbox);
        expect(replacementEvents).toEqual(newEventsBeforeStale);
        expect(fixture.reports).toEqual([]);
      }),
  );
});
