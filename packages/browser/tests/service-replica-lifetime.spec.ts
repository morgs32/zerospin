import { describe, expect, it } from '@effect/vitest';
import { makeSessionLifecycle } from '@zerospin/browser/makeSessionLifecycle';
import { makeSessionFailureObserver } from '@zerospin/browser/Node/makeSessionFailureObserver';
import { makeServiceReplicaReceiver } from '@zerospin/browser/sessionReplica/makeServiceReplicaReceiver';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeSqliteDrizzle } from '@zerospin/core/drizzle/make/makeSqliteDrizzle';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { sessionSubmissionKey } from '@zerospin/core/Node/sessionSubmissionKey';
import { defineService } from '@zerospin/core/service/defineService';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import type { IServiceNodeSnapshot } from '@zerospin/core/ServiceNode/ServiceNode';
import { makeServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeServiceSessionLockKey } from '@zerospin/core/serviceSession/make/makeServiceSessionLockKey';
import { makeServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import { serviceSessionRepoTables } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import { stageServiceSessionCommandTx } from '@zerospin/core/serviceSession/stageServiceSessionCommandTx';
import type { ISessionFailureReport } from '@zerospin/core/sessionFailure/types';
import { recognizeZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { sql } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';

import { openTestDb } from '../../../tests/support/openTestDb.ts';

const counter = makeModelVersion(
  defineModel({ name: 'counter', abbreviation: 'cnt' }),
  {
    version: 1,
    attributes: { amount: primitives.integer() },
    indexes: [],
  },
);
const models = { counter };
const increment = makeServiceContractRelease(
  defineServiceContract('increment'),
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
    operations: { update: counter.operations.update },
    program: Effect.fn('increment.program')(function* ({ db, operations }) {
      const row = yield* findFirst({
        db,
        model: db.models.counter,
        where: { id: { eq: 'cnt_shared' } },
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
const release = makeServiceRelease(defineService({ name: 'replica' }), {
  version: 1,
  models,
  system: { increment },
});
const definition = makeServiceSessionDefinition({
  systemName: 'replica',
  serviceName: release.name,
  serviceVersion: release.version,
  actorName: 'member',
  actorVersion: 1,
  sessionName: 'member',
  claimsSchema: Schema.Struct({
    memberId: Schema.String,
    authorization: Schema.Struct({ role: Schema.String }),
  }),
  models: release.models,
  contracts: release.contracts,
});
const claims = { memberId: 'member', authorization: { role: 'reader' } };
const first = {
  modelName: 'counter',
  version: 1,
  id: 'cnt_shared',
  amount: 0,
  createdAt: new Date('2026-10-26T00:00:00.000Z'),
  updatedAt: new Date('2026-10-26T00:00:00.000Z'),
};
const initial: IServiceNodeSnapshot = {
  identity: {
    apiUrl: 'https://replica.example',
    publishableKey: 'pub_replica',
    systemName: 'replica',
    serviceName: 'replica',
    serviceVersion: 1,
    actorName: 'member',
    actorVersion: 1,
    sessionName: 'member',
    claims,
    definitionHash: 'replica',
  },
  state: {
    localAvailability: 'available',
    authentication: 'verified',
    synchronization: 'online',
    blockedWork: false,
    admissionRejection: null,
    failure: null,
  },
  metadata: {
    nodeId: 'node_replica',
    sessionKey: 'replica',
    admittedThroughPushIndex: 0,
    serviceIndex: 0,
    dispositionChainHash: '0'.repeat(64),
    pushPaused: false,
  },
  nodeIndex: 0,
  pushIndex: 0,
  outcomeIndex: 0,
  resources: [first],
  commandCoverage: [],
};
const failure = {
  _tag: 'ZerospinError' as const,
  code: 'private-command-denied',
  message: 'Only this originating command reports this failure',
  status: 403,
  extra: { reason: 'private' },
};

/** Provision the same table declaration used by openServiceReplica, on scoped test SQLite. */
function openReplica() {
  return Effect.gen(function* () {
    const opened = yield* openTestDb(models);
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: serviceSessionRepoTables,
    });
    const db = makeSqliteDrizzle(opened.db.$client, dbConfig);
    yield* provisionDb({ db, definition: dbConfig.definition });
    const lock = makeServiceSessionSpec(definition).serviceSessionLock;
    const serviceSessionLockKey = yield* makeServiceSessionLockKey(lock);
    return {
      definition,
      models,
      lock,
      dbConfig,
      db,
      serviceSessionLockKey,
      readPending: () => db.select().from(dbConfig.schema.commands).all(),
    };
  });
}

type IReplica = Effect.Success<ReturnType<typeof openReplica>>;

/** Use the real session store/reporter and native lifetime execution; only handoff transport is observed. */
function openReceiver(
  replica: IReplica,
  current: () => boolean,
  onAuthenticatedClaims: (
    admittedClaims: Readonly<Record<string, unknown>>,
  ) => void,
) {
  return Effect.gen(function* () {
    let lifecycle: ReturnType<typeof makeSessionLifecycle<unknown, never>>;
    const session = makeServiceSession<
      typeof definition,
      typeof models,
      unknown
    >({
      sessionDefinition: definition,
      models,
      onTerminalFailure: () => lifecycle.retire(),
      execution: {
        runSync: program => lifecycle.runSync(program),
        runPromise: (program, options) =>
          lifecycle.runPromise(program, options),
      },
    });
    lifecycle = makeSessionLifecycle<unknown, never>({
      layer: undefined,
      infrastructure: Layer.empty,
      store: session.store,
      reportFailure: session.reportFailure,
      telemetryCollector: session.store.getState().telemetryCollector,
      onDispose: () => session.release(),
    });
    yield* Effect.addFinalizer(() => Effect.promise(() => lifecycle.dispose()));
    const originatingCommands = new Map<string, string>();
    const reports: ISessionFailureReport[] = [];
    const committedAtReport: unknown[] = [];
    const outbox = { refresh: 0, wake: 0, reset: 0 };
    const observer = makeSessionFailureObserver({
      isCurrent: current,
      originatingCommands,
      recognizeFailure: (_commandName, retainedFailure) =>
        recognizeZerospinError(Schema.Never, retainedFailure),
      reportFailure: report => {
        // A separate transaction starts only after installation has committed.
        replica.db.run(sql`BEGIN IMMEDIATE`);
        replica.db.run(sql`ROLLBACK`);
        committedAtReport.push({
          commands: replica.db
            .select()
            .from(replica.dbConfig.schema.commands)
            .all(),
          resources: replica.db.select().from(counter.drizzleSchema).all(),
          serviceIndex: session.store.getState().initialized?.serviceIndex,
        });
        reports.push(report);
        session.reportFailure(report);
      },
    });
    const receiver = yield* makeServiceReplicaReceiver<typeof definition>({
      session,
      sessionId: 'sesn_replica',
      replica,
      execution: lifecycle,
      stagedCommandOutbox: {
        pendingCount: () => 0,
        refresh: () => {
          outbox.refresh += 1;
        },
        wake: () => {
          outbox.wake += 1;
        },
        reset: () => {
          outbox.reset += 1;
        },
      },
      originatingCommands,
      observer,
      current,
      expectedClaims: claims,
      onAuthenticatedClaims,
    });
    const readStorage = () => ({
      commands: replica.db
        .select()
        .from(replica.dbConfig.schema.commands)
        .all(),
      metadata: replica.db
        .select()
        .from(replica.dbConfig.schema.serviceSessionMetadata)
        .all(),
      resources: replica.db.select().from(counter.drizzleSchema).all(),
    });
    const readDomainState = () => {
      const state = session.store.getState();
      return {
        status: state.status,
        initialized: state.initialized,
        nodeState: state.nodeState,
        failure: state.failure,
      };
    };
    return {
      receiver,
      session,
      lifecycle,
      originatingCommands,
      reports,
      committedAtReport,
      outbox,
      readStorage,
      readDomainState,
    };
  });
}

describe('Service browser admitted claims, notifications and replica lifetime', () => {
  it.effect(
    'preserves pending work through same-producer repair and keeps recovery notices nonterminal',
    () =>
      Effect.gen(function* () {
        const replica = yield* openReplica();
        const owned = yield* openReceiver(
          replica,
          () => true,
          () => {},
        );
        yield* Effect.promise(() => owned.receiver.view(initial));
        const staged = owned.lifecycle.runSync(
          stageServiceSessionCommandTx({
            sessionId: 'sesn_replica',
            db: replica.db,
            definition,
            contract: increment,
            payload: {},
            claims,
          }),
        );
        owned.originatingCommands.set(
          sessionSubmissionKey(staged.command),
          'increment',
        );
        const originals = replica.db
          .select()
          .from(replica.dbConfig.schema.commands)
          .all();
        yield* Effect.promise(() =>
          owned.receiver.reset({ preservePending: true }),
        );
        expect(owned.session.store.getState().initialized).toBeNull();
        yield* Effect.promise(() => owned.receiver.view(initial));
        yield* Effect.promise(() => owned.receiver.attachmentReady());
        expect(
          replica.db.select().from(replica.dbConfig.schema.commands).all(),
        ).toEqual(originals);
        expect(owned.originatingCommands.size).toBe(1);
        expect(owned.reports).toEqual([]);
        owned.receiver.recoveryWarning({
          error: new Error('Unreadable local history'),
        });
        expect(owned.session.store.getState()).toMatchObject({
          status: 'ready',
          failure: { code: 'node-recovery-work-unconfirmed' },
        });
        expect(owned.reports).toMatchObject([{ origin: 'recovery' }]);
      }),
  );

  it.effect(
    'validates admitted identity, commits before own notification and fences a replaced replica',
    () =>
      Effect.gen(function* () {
        const replica = yield* openReplica();
        let active = true;
        const authenticated: Readonly<Record<string, unknown>>[] = [];
        const owned = yield* openReceiver(
          replica,
          () => active,
          admittedClaims => {
            authenticated.push(structuredClone(admittedClaims));
            Object.assign(admittedClaims, { memberId: 'callback-only' });
          },
        );
        const beforeClaims = owned.readStorage();
        const beforeState = owned.readDomainState();
        const mismatch = yield* Effect.tryPromise({
          try: () =>
            owned.receiver.view({
              ...initial,
              identity: {
                ...initial.identity,
                claims: { ...claims, authorization: { role: 'writer' } },
              },
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(mismatch)) {
          throw new Error('Expected admitted claim mismatch to refuse');
        }
        expect(Cause.squash(mismatch.cause)).toMatchObject({
          code: 'session-claims-mismatch',
        });
        expect(owned.readStorage()).toEqual(beforeClaims);
        expect(owned.readDomainState()).toEqual(beforeState);
        expect(owned.outbox).toEqual({ refresh: 0, wake: 0, reset: 0 });
        expect(authenticated).toEqual([]);
        expect(owned.reports).toEqual([]);

        yield* Effect.promise(() => owned.receiver.view(initial));
        expect(owned.session.store.getState()).toMatchObject({
          status: 'ready',
          initialized: { claims, encodedClaims: claims, serviceIndex: 0 },
        });
        expect(authenticated).toEqual([claims]);
        expect(owned.receiver.getEncodedClaims()).toEqual(claims);
        const beforeIdentity = owned.readStorage();
        const identityState = owned.readDomainState();
        const changedIdentity = yield* Effect.tryPromise({
          try: () =>
            owned.receiver.view({
              ...initial,
              identity: {
                ...initial.identity,
                definitionHash: 'different-definition',
              },
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(changedIdentity)) {
          throw new Error('Expected bound identity replacement to refuse');
        }
        expect(Cause.squash(changedIdentity.cause)).toMatchObject({
          code: 'session-snapshot-identity-conflict',
        });
        expect(owned.readStorage()).toEqual(beforeIdentity);
        expect(owned.readDomainState()).toEqual(identityState);
        expect(authenticated).toEqual([claims]);

        const staged = yield* stageServiceSessionCommandTx({
          sessionId: 'sesn_replica',
          db: replica.db,
          definition,
          contract: increment,
          payload: {},
          claims,
        });
        owned.originatingCommands.set(
          sessionSubmissionKey(staged.command),
          staged.command.commandName,
        );
        const original = replica.db
          .select()
          .from(replica.dbConfig.schema.commands)
          .get()!;
        const state = initial.state;
        owned.receiver.state({
          ...state,
          blockedWork: true,
          admissionRejection: {
            commandId: makeNodeCommandId('node_foreign', 1),
            commandName: 'increment',
            failure,
          },
        });
        expect(owned.reports).toEqual([]);
        const final: IServiceNodeSnapshot = {
          ...initial,
          metadata: {
            ...initial.metadata,
            serviceIndex: 1,
            dispositionChainHash: '1'.repeat(64),
            admittedThroughPushIndex: 1,
          },
          nodeIndex: 2,
          pushIndex: 1,
          outcomeIndex: 1,
          commandCoverage: [
            {
              sessionId: staged.command.sessionId,
              sessionIndex: staged.command.sessionIndex,
              commandName: 'increment',
              nodeId: 'node_replica',
              nodeIndex: 1,
              pushIndex: 1,
              resolution: {
                id: makeNodeCommandId('node_replica', 1),
                commandName: 'increment',
                serviceIndex: 1,
                failure,
              },
            },
          ],
        };
        yield* Effect.promise(() => owned.receiver.view(final));
        const settled = replica.db
          .select()
          .from(replica.dbConfig.schema.commands)
          .all();
        expect(settled).toEqual([
          {
            ...original,
            nodeId: 'node_replica',
            nodeIndex: 1,
            pushIndex: 1,
            serviceIndex: 1,
            failure: JSON.stringify(failure),
            inverseOperations: null,
          },
        ]);
        expect(owned.reports).toHaveLength(1);
        expect(owned.reports[0]).toMatchObject({
          origin: 'command',
          error: { code: failure.code },
        });
        expect(owned.committedAtReport).toEqual([
          {
            commands: settled,
            resources: replica.db.select().from(counter.drizzleSchema).all(),
            serviceIndex: 1,
          },
        ]);
        expect(owned.session.store.getState()).toMatchObject({
          status: 'ready',
          initialized: { serviceIndex: 1 },
        });
        expect(owned.originatingCommands.size).toBe(0);
        yield* Effect.promise(() => owned.receiver.view(final));
        expect(owned.reports).toHaveLength(1);
        yield* owned.receiver.retainCoordinates([
          {
            sessionId: staged.command.sessionId,
            sessionIndex: staged.command.sessionIndex,
            nodeId: 'node_replica',
            nodeIndex: 1,
            pushIndex: 1,
          },
        ]);
        yield* Effect.promise(() => owned.receiver.view(final));
        expect(owned.originatingCommands.size).toBe(0);
        expect(owned.reports).toHaveLength(1);
        const pending = yield* stageServiceSessionCommandTx({
          sessionId: 'sesn_replica',
          db: replica.db,
          definition,
          contract: increment,
          payload: {},
          claims,
        });
        owned.originatingCommands.set(
          makeNodeCommandId('node_replica', 2),
          pending.command.commandName,
        );

        active = false;
        yield* Effect.promise(() => owned.lifecycle.dispose());
        const replacement = yield* openReceiver(
          replica,
          () => true,
          () => {},
        );
        yield* Effect.promise(() => replacement.receiver.view(final));
        const replacementStorage = replacement.readStorage();
        const replacementState = replacement.readDomainState();
        const oldOutbox = { ...owned.outbox };
        const oldMap = [...owned.originatingCommands];
        yield* Effect.promise(() =>
          owned.receiver.view({
            ...final,
            metadata: {
              ...final.metadata,
              serviceIndex: 2,
              dispositionChainHash: '2'.repeat(64),
            },
            nodeIndex: 3,
            resources: [{ ...first, amount: 999 }],
          }),
        );
        owned.receiver.state({
          ...state,
          authentication: 'signed-out',
          blockedWork: true,
        });
        yield* Effect.promise(() => owned.receiver.reset());
        yield* owned.receiver.retainCoordinates([
          {
            sessionId: pending.command.sessionId,
            sessionIndex: pending.command.sessionIndex,
            nodeId: 'node_replica',
            nodeIndex: 3,
            pushIndex: 2,
          },
        ]);
        yield* Effect.promise(() => owned.receiver.attachmentReady());
        expect(replacement.readStorage()).toEqual(replacementStorage);
        expect(replacement.readDomainState()).toEqual(replacementState);
        expect(owned.outbox).toEqual(oldOutbox);
        expect([...owned.originatingCommands]).toEqual(oldMap);
        expect(owned.reports).toHaveLength(1);
        expect(replacement.reports).toEqual([]);
      }),
  );

  it.effect(
    'stops installation when the admitted-claims callback retires the lifetime',
    () =>
      Effect.gen(function* () {
        const replica = yield* openReplica();
        let active = true;
        const observed: Readonly<Record<string, unknown>>[] = [];
        const owned = yield* openReceiver(
          replica,
          () => active,
          admittedClaims => {
            observed.push(structuredClone(admittedClaims));
            active = false;
          },
        );
        const before = owned.readStorage();
        const state = owned.readDomainState();
        yield* Effect.promise(() => owned.receiver.view(initial));
        expect(observed).toEqual([claims]);
        expect(owned.readStorage()).toEqual(before);
        expect(owned.readDomainState()).toEqual(state);
        expect(owned.outbox).toEqual({ refresh: 0, wake: 0, reset: 0 });
        expect(owned.reports).toEqual([]);
      }),
  );
});
