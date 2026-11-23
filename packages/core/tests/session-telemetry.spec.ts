import { expect, it } from '@effect/vitest';
import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { makeServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import {
  captureTelemetry,
  makeFn,
  makeRpcEnvelope,
  makeTelemetryCollector,
  TelemetryCollector,
  type ILogRecord,
} from '@zerospin/logger';
import { CuidFactory } from '@zerospin/shapes';
import * as Cause from 'effect/Cause';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';

import { openTestDb } from '../../../tests/support/openTestDb.ts';

it.effect(
  'collects completed function spans with value snapshots only in profile mode',
  () =>
    Effect.gen(function* () {
      const payload = { secret: 'do-not-record', note: 'x'.repeat(3_000) };
      const multiply = makeFn('multiply')(
        function (
          this: { factor: number },
          value: number,
          details: { secret: string; note: string },
        ) {
          return Effect.succeed({ value: this.factor * value, details }).pipe(
            Effect.withSpan('multiply.child'),
          );
        },
        effect => makeRpcEnvelope(effect),
      );
      expect(multiply.length).toBe(2);
      const envelope = yield* multiply.call({ factor: 3 }, 2, payload);
      expect(envelope.result).toEqual({
        _tag: 'Success',
        success: { value: 6, details: payload },
      });
      const span = envelope.telemetry.spans.find(
        item => item.name === 'multiply',
      );
      expect(span).toMatchObject({ status: 'ok', parentSpanId: null });
      expect(
        envelope.telemetry.spans.find(item => item.name === 'multiply.child'),
      ).toMatchObject({ parentSpanId: span?.spanId });
      expect(span?.attributes?.['function.definition']).toBeUndefined();
      expect(span?.attributes?.['function.invocation']).toBeUndefined();
      if (process.env['ZEROSPIN_PROFILE'] === '1') {
        expect(span?.attributes?.['function.arguments']).toMatchObject([
          2,
          { secret: '[Redacted]' },
        ]);
        expect(span?.attributes?.['function.result']).toMatchObject({
          value: 6,
          details: { secret: '[Redacted]' },
        });
        expect(span?.attributes?.['function.exit']).toEqual({
          _tag: 'Success',
        });
        const recorded = JSON.stringify(span?.attributes);
        expect(recorded).toContain('[truncated]');
        expect(recorded).not.toContain(payload.secret);
        expect(recorded).not.toContain(payload.note);
      } else {
        for (const key of [
          'function.arguments',
          'function.result',
          'function.exit',
        ]) {
          expect(span?.attributes?.[key]).toBeUndefined();
        }
      }
    }),
);

it.effect('retains the original failure and native Effect function trace', () =>
  Effect.gen(function* () {
    const failure = { code: 'make-fn-refused' };
    const reject = makeFn('reject')({ self: { failure } }, function* () {
      return yield* Effect.fail(this.failure);
    });
    const captured = yield* captureTelemetry(reject());
    expect(Exit.isFailure(captured.exit)).toBe(true);
    if (Exit.isFailure(captured.exit)) {
      expect(Cause.squash(captured.exit.cause)).toBe(failure);
    }
    const span = captured.telemetry.spans.find(item => item.name === 'reject');
    expect(span).toMatchObject({ status: 'error', parentSpanId: null });
    expect(span?.attributes?.['error.cause']).toContain('make-fn-refused');
    expect(span?.attributes?.['error.cause']).toContain('reject');
    if (process.env['ZEROSPIN_PROFILE'] === '1') {
      expect(span?.attributes?.['function.exit']).toMatchObject({
        _tag: 'Failure',
        reasons: [{ _tag: 'Fail', error: failure }],
      });
    } else {
      expect(span?.attributes?.['function.exit']).toBeUndefined();
    }
  }),
);

it.effect(
  'publishes session telemetry after SQL and drains buffers synchronously without resurrecting flushed logs',
  () =>
    Effect.gen(function* () {
      const { db } = yield* openTestDb({});
      const context = Context.make(CuidFactory, () =>
        Effect.succeed('telemetry'),
      ).pipe(
        Context.add(MonotonicFactory, () => Effect.succeed('mono')),
        Context.add(TelemetryCollector, makeTelemetryCollector()),
      );
      const execution = {
        runSync: Effect.runSyncWith(context),
        runPromise: Effect.runPromiseWith(context),
      };
      const aggregate = makeAggregateSession({
        sessionDefinition: makeAggregateSessionDefinition({
          systemName: 'telemetry',
          aggregateName: 'account',
          aggregateVersion: 1,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'member',
          claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
          models: {},
          contracts: {},
        }),
        execution,
        onTerminalFailure: () => {},
      });
      const service = makeServiceSession({
        sessionDefinition: makeServiceSessionDefinition({
          systemName: 'telemetry',
          serviceName: 'catalog',
          serviceVersion: 1,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'member',
          claimsSchema: Schema.Struct({}),
          models: {},
          contracts: {},
        }),
        models: {},
        execution,
        onTerminalFailure: () => {},
      });
      const log = {
        logId: 'lgr_transaction',
        createdAt: 0,
        level: 'info',
        message: 'evaluating',
        source: 'test',
        payload: null,
        traceId: null,
        spanId: null,
      } satisfies ILogRecord;
      for (const session of [aggregate, service]) {
        const collector = session.store.getState().telemetryCollector;
        const publications: { evaluating: boolean; sqlSettled: boolean }[] = [];
        let evaluating = true;
        let disposing = false;
        const unsubscribe = session.store.subscribe((state, previous) => {
          if (state.telemetry === previous.telemetry) return;
          let sqlSettled = false;
          try {
            db.$client.sqlite3.exec(
              db.$client.db,
              'BEGIN IMMEDIATE; ROLLBACK;',
            );
            sqlSettled = true;
          } catch {}
          publications.push({ evaluating, sqlSettled });
          if (!disposing) {
            disposing = true;
            session.release();
          }
        });
        yield* makeTx('collectTelemetryInsideSql')(function* () {
          collector.addLog(log);
        })(db);
        evaluating = false;
        expect(publications).toEqual([]);
        yield* Effect.promise(() => Promise.resolve());
        expect(publications).toEqual([{ evaluating: false, sqlSettled: true }]);
        expect(session.store.getState().status).toBe('disposed');
        expect(collector.flushOwn().logs).toEqual([log]);
        expect(collector.flush().logs).toEqual([log]);

        const own = { ...log, logId: 'lgr_own' } satisfies ILogRecord;
        const remote = { ...log, logId: 'lgr_remote' } satisfies ILogRecord;
        const afterFlush = {
          ...log,
          logId: 'lgr_after_flush',
        } satisfies ILogRecord;
        collector.addLog(own);
        collector.merge({ spans: [], logs: [remote], links: [] });
        expect(collector.flushOwn().logs).toEqual([own]);
        expect(collector.flush().logs).toEqual([own, remote]);
        collector.addLog(afterFlush);
        expect(publications).toHaveLength(1);
        yield* Effect.promise(() => Promise.resolve());
        expect(session.store.getState().telemetry.logs).toEqual([afterFlush]);
        expect(publications).toHaveLength(2);
        expect(collector.flushOwn().logs).toEqual([afterFlush]);
        expect(collector.flush().logs).toEqual([afterFlush]);
        yield* Effect.promise(() => Promise.resolve());
        expect(session.store.getState().telemetry.logs).toEqual([]);
        unsubscribe();
      }
    }),
);
