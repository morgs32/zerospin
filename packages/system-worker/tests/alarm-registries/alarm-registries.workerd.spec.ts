import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeRecoveryRegistry } from '../../src/makeRecoveryRegistry/makeRecoveryRegistry.ts';
import { makeWakeRegistry } from '../../src/makeWakeRegistry/makeWakeRegistry.ts';

import { system } from './system.ts';

beforeEach(async () => {
  await reset();
  const repo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await repo.registerSystemSpec({ spec: makeSystemSpec({ system }) })).result
      ._tag,
  ).toBe('Success');
});
afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

describe('Repo alarm registries', () => {
  it('replaces the executing-pass watchdog with the durable deadline', async () => {
    const repo = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/dispatcher',
    );
    await runInDurableObject(repo, async (_, { storage }) => {
      await storage.deleteAlarm();
      const start = Date.now() + 86_400_000;
      let now = start;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      let deadline: number | null = now + 600_000;
      const registry = makeWakeRegistry({ storage });
      registry.register('expiry', {
        readNextWakeAt: () => deadline,
        run: Effect.gen(function* () {
          expect(yield* Effect.promise(() => storage.getAlarm())).toBe(
            now + 1_000,
          );
          deadline = now + 600_000;
        }),
      });
      expect(await storage.getAlarm()).toBeNull();
      await Effect.runPromise(registry.reconcile());
      expect(await storage.getAlarm()).toBe(start + 600_000);
      now = start + 10_000;
      deadline = now + 600_000;
      await Effect.runPromise(registry.reconcile());
      expect(await storage.getAlarm()).toBe(start + 600_000);

      now = start + 600_000;
      await storage.deleteAlarm();
      await Effect.runPromise(registry.run());
      expect(await storage.getAlarm()).toBe(start + 1_200_000);
      deadline = null;
      await Effect.runPromise(registry.reconcile());
      expect(await storage.getAlarm()).toBeNull();
    });
  });

  it('retries pending delivery without spinning on an overdue deadline', async () => {
    const repo = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/dispatcher',
    );
    await runInDurableObject(repo, async (_, { storage }) => {
      await storage.deleteAlarm();
      const start = Date.now() + 86_400_000;
      let now = start;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      let attempts = 0;
      let pending = true;
      const registry = makeWakeRegistry({ storage });
      registry.register('delivery', {
        readNextWakeAt: () => (pending ? now + 1_000 : null),
        run: Effect.gen(function* () {
          expect(yield* Effect.promise(() => storage.getAlarm())).toBe(
            now + 1_000,
          );
          attempts += 1;
          if (attempts === 1) return yield* Effect.fail('reply-lost');
          pending = false;
        }),
      });
      registry.register('overdue', {
        readNextWakeAt: () => (pending ? start - 1 : null),
        run: Effect.void,
      });
      expect(
        Exit.isFailure(await Effect.runPromise(Effect.exit(registry.run()))),
      ).toBe(true);
      expect(await storage.getAlarm()).toBe(start + 1_000);
      await Effect.runPromise(registry.reconcile());
      expect(await storage.getAlarm()).toBe(start + 1_000);
      now += 1_000;
      await storage.deleteAlarm();
      await Effect.runPromise(registry.run());
      expect(attempts).toBe(2);
      expect(await storage.getAlarm()).toBeNull();
    });
  });

  it('retains a retry alarm when reading the deadline fails', async () => {
    const repo = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/dispatcher',
    );
    await runInDurableObject(repo, async (_, { storage }) => {
      await storage.deleteAlarm();
      const start = Date.now() + 86_400_000;
      let now = start;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      let failRead = true;
      const registry = makeWakeRegistry({ storage });
      registry.register('expiry', {
        readNextWakeAt: () => {
          if (failRead) throw new Error('Cannot derive the current deadline');
          return now + 600_000;
        },
        run: Effect.void,
      });
      expect(
        Exit.isFailure(
          await Effect.runPromise(Effect.exit(registry.reconcile())),
        ),
      ).toBe(true);
      expect(await storage.getAlarm()).toBe(start + 1_000);
      await storage.setAlarm(start - 1);
      expect(
        Exit.isFailure(
          await Effect.runPromise(Effect.exit(registry.reconcile())),
        ),
      ).toBe(true);
      expect(await storage.getAlarm()).toBe(start + 1_000);
      failRead = false;
      await Effect.runPromise(registry.reconcile());
      expect(await storage.getAlarm()).toBe(start + 1_000);

      now += 1_000;
      await storage.deleteAlarm();
      failRead = true;
      expect(
        Exit.isFailure(await Effect.runPromise(Effect.exit(registry.run()))),
      ).toBe(true);
      expect(await storage.getAlarm()).toBe(start + 2_000);
      now += 1_000;
      await storage.deleteAlarm();
      failRead = false;
      await Effect.runPromise(registry.run());
      expect(await storage.getAlarm()).toBe(now + 600_000);
      await storage.deleteAlarm();
    });
  });

  it('keeps recovery holds on their shared one-second alarm', async () => {
    const repo = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/dispatcher',
    );
    await runInDurableObject(repo, async (_, { storage }) => {
      await storage.deleteAlarm();
      const start = Date.now() + 86_400_000;
      let now = start;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      let recoveries = 0;
      const registry = makeRecoveryRegistry({ storage });
      registry.register(
        'delivery',
        Effect.sync(() => {
          recoveries += 1;
        }),
      );
      await Effect.runPromise(registry.hold('delivery'));
      expect(await storage.getAlarm()).toBe(start + 1_000);
      now += 500;
      await Effect.runPromise(registry.hold('publication'));
      await Effect.runPromise(registry.hold('delivery'));
      expect(await storage.getAlarm()).toBe(start + 1_000);
      await Effect.runPromise(registry.release('delivery'));
      expect(await storage.getAlarm()).toBe(start + 1_000);
      await Effect.runPromise(registry.release('publication'));
      expect(await storage.getAlarm()).toBeNull();
      await Effect.runPromise(registry.run());
      expect(recoveries).toBe(1);
      expect(await storage.getAlarm()).toBeNull();
    });
  });
});
