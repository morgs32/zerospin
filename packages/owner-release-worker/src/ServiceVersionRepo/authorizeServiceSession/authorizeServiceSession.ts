import type { IDb } from '@zerospin/core/drizzle/types';
import { provideReleaseLayer } from '@zerospin/core/execution/provideReleaseLayer';
import { runAuthoredCallback } from '@zerospin/core/execution/runAuthoredCallback';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { validateServiceSessionLock } from '@zerospin/system-worker/ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/validateServiceSessionLock';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type * as Semaphore from 'effect/Semaphore';

/** Validate the exact session lock, then authorize against the release's committed view. */
export const authorizeServiceSession = makeFn(
  'ServiceVersionRepo.authorizeServiceSession',
)(function* (props: {
  serviceName: string;
  serviceVersion: number;
  serviceSessionLock: IServiceSessionLock;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  db: IDb;
  execution: Semaphore.Semaphore;
}) {
  const {
    db,
    sessionName,
    serviceName,
    claims,
    serviceVersion,
    serviceSessionLock,
    execution,
  } = props;
  return yield* execution.withPermits(1)(
    Effect.gen(function* () {
      const selected = yield* validateServiceSessionLock({
        serviceName,
        serviceVersion,
        sessionName,
        serviceSessionLock,
      });
      const { actor, serviceRelease } = selected;
      const authorize = actor.authorize;
      if (typeof authorize !== 'function') {
        return selected.serviceSessionLock;
      }

      const query = Object.create(null);
      for (const modelName of Object.keys(serviceRelease.models)) {
        const modelQuery = Reflect.get(db.query, modelName);
        if (modelQuery === undefined) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'service-authorization-readable-query-required',
              message: `Service authorization cannot resolve model query "${modelName}"`,
            }),
          );
        }
        Reflect.set(query, modelName, modelQuery);
      }

      const context: Context.Context<unknown> =
        yield* Effect.context<unknown>();

      const decodedClaims = yield* Schema.decodeUnknownEffect(
        actor.identity.claimsSchema,
      )(claims, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'authorization-claims-invalid',
          prefix: 'Invalid actor claims',
        }),
      );

      yield* Effect.suspend(() =>
        authorize.call(actor, {
          sessionName,
          claims: decodedClaims,
          db: { query },
        }),
      ).pipe(
        Effect.provideContext(context),
        program => provideReleaseLayer(serviceRelease, program),
        program =>
          runAuthoredCallback({
            program,
            code: 'service-authorization-failed',
          }),
      );
      return selected.serviceSessionLock;
    }).pipe(Effect.scoped),
  );
});
