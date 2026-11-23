import {
  AggregateNativeConfigurationSchema,
  makeNativeSession,
  type IAggregateNativeConfiguration,
} from '@zerospin/native';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import { gameSessionDefinition } from './gameSessionDefinition';

declare const __zerospinPublish: (value: string) => void;
const sessionDefinition = gameSessionDefinition;
const sessions = new Map<
  string,
  {
    configuration: IAggregateNativeConfiguration;
    session: Awaited<ReturnType<typeof makeNativeSession>>;
  }
>();
let current: Awaited<ReturnType<typeof makeNativeSession>> | undefined;
const opening = new Map<
  string,
  {
    configuration: IAggregateNativeConfiguration;
    controller: AbortController;
    promise: Promise<Awaited<ReturnType<typeof makeNativeSession>>>;
  }
>();
let generation = 0;
let disposed = false;
let disposal: Promise<void> | undefined;
let retirement: Promise<void> | undefined;
const publish = () => {
  if (current) __zerospinPublish(JSON.stringify(current.snapshot()));
};
export async function initialize(input: unknown) {
  await retirement;
  if (disposed) throw new Error('Native application is disposed');
  const configuration = Schema.decodeUnknownSync(
    AggregateNativeConfigurationSchema,
  )(structuredClone(input), { onExcessProperty: 'error' });
  const epoch = generation;
  const loaded = sessions.get(configuration.aggregateId);
  if (loaded !== undefined && !isEqual(loaded.configuration, configuration)) {
    throw new Error(
      'Native session configuration differs from its active binding',
    );
  }
  let session = loaded?.session;
  if (session === undefined) {
    let entry = opening.get(configuration.aggregateId);
    if (entry !== undefined && !isEqual(entry.configuration, configuration)) {
      throw new Error(
        'Native session configuration differs from its opening binding',
      );
    }
    if (entry === undefined) {
      const controller = new AbortController();
      const promise = makeNativeSession({
        sessionDefinition,
        configuration,
        changed: publish,
        signal: controller.signal,
      });
      entry = { configuration, controller, promise };
      opening.set(configuration.aggregateId, entry);
    }
    try {
      session = await entry.promise;
      if (disposed || generation !== epoch || entry.controller.signal.aborted) {
        await session.dispose();
        throw new Error('Native initialization canceled');
      }
      sessions.set(configuration.aggregateId, { configuration, session });
    } finally {
      if (opening.get(configuration.aggregateId) === entry) {
        opening.delete(configuration.aggregateId);
      }
    }
  }
  if (disposed || generation !== epoch) {
    throw new Error('Native initialization canceled');
  }
  current = session;
  publish();
}
export function stage(contractName: string, payload: unknown) {
  if (!current) throw new Error('Session is not initialized');
  return current.stage(contractName, payload);
}
export async function resume() {
  await Promise.all(
    [...sessions.values()].map(({ session }) => session.resume()),
  );
}
export async function suspend() {
  await Promise.all(
    [...sessions.values()].map(({ session }) => session.suspend()),
  );
}
export function pushNow() {
  if (!current) throw new Error('Session is not initialized');
  return current.pushNow();
}
function closeLoadedSessions(clearAuthentication: boolean): Promise<void> {
  if (retirement !== undefined) return retirement;
  ++generation;
  const acquiring = [...opening.values()];
  const loaded = [...sessions.values()];
  opening.clear();
  sessions.clear();
  current = undefined;
  // Install the owner before publication or cancellation can reenter initialization.
  const closing = Promise.resolve().then(async () => {
    const results = await Promise.allSettled([
      ...acquiring.map(entry =>
        entry.promise.then(
          session => session.dispose(),
          () => undefined,
        ),
      ),
      ...loaded.map(async ({ session }) => {
        try {
          if (clearAuthentication) await session.clearAuthentication();
        } finally {
          await session.dispose();
        }
      }),
    ]);
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  });
  retirement = closing;
  for (const entry of acquiring) entry.controller.abort();
  try {
    __zerospinPublish('null');
  } catch (error) {
    console.error('Cannot withdraw native session publication', error);
  }
  void closing
    .finally(() => {
      if (retirement === closing) retirement = undefined;
    })
    .catch(() => undefined);
  return closing;
}
export async function clearAuthentication() {
  if (disposed) throw new Error('Native application is disposed');
  await closeLoadedSessions(true);
}
export function dispose(): Promise<void> {
  if (disposal !== undefined) return disposal;
  disposed = true;
  disposal = closeLoadedSessions(false);
  return disposal;
}
export function snapshot() {
  return current?.snapshot() ?? null;
}
