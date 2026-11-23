import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { makeConnectedAggregateSession } from '@zerospin/browser/makeConnectedAggregateSession';
import { makeConnectedServiceSession } from '@zerospin/browser/makeConnectedServiceSession';
import { makeNodeAuthentication } from '@zerospin/browser/Node/makeNodeAuthentication';
import {
  NodeBackendTimeoutError,
  NodePreparationTimeoutError,
} from '@zerospin/browser/Node/NodeErrors';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import { vi } from 'vitest';

const revocations = vi.hoisted(() => ({
  aggregate: vi.fn(),
  service: vi.fn(),
}));
vi.mock('@zerospin/browser/AggregateNode/aggregateSessionDiscovery', () => ({
  aggregateSessionDiscovery: { update: revocations.aggregate },
}));
vi.mock('@zerospin/browser/ServiceNode/serviceSessionDiscovery', () => ({
  serviceSessionDiscovery: { update: revocations.service },
}));
vi.mock('@zerospin/browser/sessionReplica/openServiceSessionReplica', () => ({
  openServiceSessionReplica: () =>
    Effect.fail(
      makeZerospinError({
        code: 'service-replica-unavailable',
        message: 'Service replica unavailable',
      }),
    ),
}));

vi.mock('@zerospin/core/Node/sessionKey', () => ({
  sessionKey: async (identity: unknown) => JSON.stringify(identity),
}));

describe('connected facade authentication clearing', () => {
  it.effect(
    'revokes exact remembered identities after failure and disposal without reopening sessions',
    () =>
      Effect.promise(async () => {
        let hostAcquisitions = 0;
        const layer = Layer.mergeAll(
          Layer.succeed(PublishableKey, Redacted.make('pk_test')),
          Layer.sync(
            ZerospinApiUrl,
            () => `https://authentication-${++hostAcquisitions}.invalid`,
          ),
        );
        const aggregateDefinition = makeAggregateSessionDefinition({
          systemName: 'signout',
          sessionName: 'account',
          aggregateName: 'account',
          aggregateVersion: 1,
          actorName: 'web',
          actorVersion: 1,
          claimsSchema: Schema.Struct({
            aggregateId: Schema.String,
            clerkUserId: Schema.String,
          }),
          models: {},
          contracts: {},
        });
        const serviceDefinition = makeServiceSessionDefinition({
          systemName: 'signout',
          sessionName: 'verification',
          serviceName: 'verification',
          serviceVersion: 1,
          actorName: 'web',
          actorVersion: 1,
          claimsSchema: Schema.Struct({ clerkUserId: Schema.String }),
          models: {},
          contracts: {},
        });
        const getCredentials = vi.fn(() => Effect.succeed({ token: 'token' }));
        const aggregate = makeConnectedAggregateSession({
          definition: aggregateDefinition,
          layer,
          sharedWorkerUrl: '/account.worker.js',
          aggregateId: 'account-a',
          credentialsSchema: Schema.Struct({ token: Schema.String }),
          expectedClaims: { aggregateId: 'account-a', clerkUserId: 'owner-a' },
          getCredentials,
        });
        const service = makeConnectedServiceSession({
          definition: serviceDefinition,
          layer,
          sharedWorkerUrl: '/verification.worker.js',
          credentialsSchema: Schema.Struct({ token: Schema.String }),
          expectedClaims: { clerkUserId: 'owner-a' },
          getCredentials,
        });
        const failure = makeZerospinError({
          code: 'session-failed',
          message: 'Initialization failed',
        });
        aggregate.reportFailure({ origin: 'session', error: failure });
        await expect(service.initialize()).rejects.toMatchObject({
          code: 'service-replica-unavailable',
        });
        await aggregate.dispose();
        await service.dispose();
        revocations.aggregate.mockRejectedValueOnce(
          new Error('Discovery unavailable'),
        );
        await expect(aggregate.clearAuthentication()).rejects.toMatchObject({
          code: 'node-discovery-incomplete',
        });
        await aggregate.clearAuthentication();
        revocations.service.mockRejectedValueOnce(
          new Error('Discovery unavailable'),
        );
        await expect(service.clearAuthentication()).rejects.toMatchObject({
          code: 'node-discovery-incomplete',
        });
        await service.clearAuthentication();
        expect(revocations.aggregate).toHaveBeenCalledWith(
          expect.objectContaining({
            apiUrl: 'https://authentication-2.invalid',
            systemName: 'signout',
            aggregateName: 'account',
            sessionName: 'account',
          }),
          { aggregateId: 'account-a', clerkUserId: 'owner-a' },
          'account-a',
          0,
          false,
        );
        expect(revocations.service).toHaveBeenCalledWith(
          expect.objectContaining({
            apiUrl: 'https://authentication-1.invalid',
            systemName: 'signout',
            serviceName: 'verification',
            sessionName: 'verification',
          }),
          { clerkUserId: 'owner-a' },
          0,
          false,
        );
        expect(aggregate.store.getState().failure).toMatchObject({
          code: failure.code,
          message: failure.message,
        });
        expect(service.store.getState().failure).toMatchObject({
          code: 'service-replica-unavailable',
        });
        expect(hostAcquisitions).toBe(2);
        expect(getCredentials).not.toHaveBeenCalled();
      }),
  );
});

describe('Node authentication deadlines', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.effect('retires frozen credentials without duplicating pending work', () =>
    Effect.promise(async () => {
      const credentials = Promise.withResolvers<string>();
      const getAdmission = vi.fn(() => credentials.promise);
      const verify = vi.fn(async () => ({
        status: 'verified' as const,
        value: { identity: 'account' },
      }));
      const authentication = makeNodeAuthentication({
        identity: 'account',
        verify,
        bind: value => value,
      });
      authentication.register({}, getAdmission);
      const first = authentication.authenticate();
      expect(authentication.authenticate()).toBe(first);
      const failure = first.catch(error => error);
      await vi.advanceTimersByTimeAsync(5000);
      expect(await failure).toMatchObject({
        code: 'node-credentials-timeout',
        extra: { timeoutMs: 5000 },
      });
      await expect(authentication.authenticate()).rejects.toMatchObject({
        code: 'node-authentication-unavailable',
      });
      expect(getAdmission).toHaveBeenCalledTimes(1);

      credentials.resolve('credentials');
      await vi.advanceTimersByTimeAsync(0);
      expect(verify).not.toHaveBeenCalled();
      await expect(authentication.authenticate()).resolves.toEqual({
        identity: 'account',
      });
      expect(getAdmission).toHaveBeenCalledTimes(2);
      expect(verify).toHaveBeenCalledTimes(1);
    }),
  );

  it.effect('retains a backend timeout beyond another provider deadline', () =>
    Effect.promise(async () => {
      const failure = NodeBackendTimeoutError.make({
        extra: {
          endpoint: 'https://zerospin.example',
          operation: 'getSnapshot',
          timeoutMs: 10000,
        },
      });
      const authentication = makeNodeAuthentication({
        identity: 'account',
        verify: () =>
          new Promise<{ status: 'failed'; error: unknown }>(resolve => {
            setTimeout(
              () => resolve({ status: 'failed', error: failure }),
              10000,
            );
          }),
        bind: value => value,
      });
      authentication.register({}, () => new Promise<string>(() => undefined));
      authentication.register({}, async () => 'credentials');
      let settled = false;
      const result = authentication.authenticate().catch(error => {
        settled = true;
        return error;
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(5000);
      expect(await result).toBe(failure);
    }),
  );

  it.effect('allows a matching verification to win after five seconds', () =>
    Effect.promise(async () => {
      const authentication = makeNodeAuthentication({
        identity: 'account',
        verify: (admission: string, signal) =>
          new Promise<{
            status: 'verified';
            value: { identity: string; signal: AbortSignal };
          }>(resolve => {
            setTimeout(
              () =>
                resolve({
                  status: 'verified',
                  value: { identity: admission, signal },
                }),
              admission === 'account' ? 6000 : 0,
            );
          }),
        bind: value => value,
      });
      authentication.register({}, () => new Promise<string>(() => undefined));
      authentication.register({}, async () => 'wrong-account');
      authentication.register({}, async () => 'account');
      const result = authentication.authenticate();
      await vi.advanceTimersByTimeAsync(6000);
      const verified = await result;
      expect(verified.identity).toBe('account');
      expect(verified.signal.aborted).toBe(true);
    }),
  );

  it.effect(
    'preserves concrete failures, detachment, and sign-out fencing',
    () =>
      Effect.promise(async () => {
        const localFailure = NodePreparationTimeoutError.make({
          extra: { timeoutMs: 5000 },
        });
        const credentials = Promise.withResolvers<string>();
        const verify = vi.fn(async () => ({
          status: 'failed' as const,
          error: localFailure,
        }));
        const authentication = makeNodeAuthentication({
          identity: 'account',
          verify,
          bind: value => value,
        });
        const detach = authentication.register({}, () => credentials.promise);
        const detached = authentication.authenticate().catch(error => error);
        await vi.advanceTimersByTimeAsync(0);
        detach();
        credentials.resolve('credentials');
        expect(await detached).toMatchObject({
          code: 'node-authentication-unavailable',
        });
        const detachLocal = authentication.register(
          {},
          async () => 'credentials',
        );
        await expect(authentication.authenticate()).rejects.toBe(localFailure);
        detachLocal();

        const concrete = makeZerospinError('node-authentication-rejected');
        authentication.register({}, async () => {
          throw concrete;
        });
        authentication.register({}, () => new Promise<string>(() => undefined));
        const rejected = authentication.authenticate().catch(error => error);
        await vi.advanceTimersByTimeAsync(5000);
        expect(await rejected).toBe(concrete);

        const cancelled = authentication.authenticate().catch(error => error);
        authentication.clear();
        expect(await cancelled).toMatchObject({
          code: 'node-authentication-cancelled',
        });
        await expect(authentication.authenticate()).rejects.toMatchObject({
          code: 'node-signed-out',
        });
        await expect(authentication.resume('other')).rejects.toMatchObject({
          code: 'node-authentication-identity-mismatch',
        });
        await authentication.resume('account');
        await expect(authentication.authenticate()).rejects.toBe(concrete);
      }),
  );
});
