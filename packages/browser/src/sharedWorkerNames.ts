import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import { makeZerospinError } from '@zerospin/error';

import { sharedWorkerVersion } from './sharedWorkerVersion.ts';
export const aggregateSharedWorkerPattern = RoutePattern.parse(
  '/zerospin/aggregate/:sharedWorkerVersion/:routingKey',
);
export const serviceSharedWorkerPattern = RoutePattern.parse(
  '/zerospin/service/:sharedWorkerVersion/:routingKey',
);
export const standaloneSharedWorkerPattern = RoutePattern.parse(
  '/zerospin/standalone/:sharedWorkerVersion/:sessionKey',
);
export const makeStandaloneSharedWorkerName = (sessionKey: string) =>
  createHref(standaloneSharedWorkerPattern, {
    sharedWorkerVersion,
    sessionKey,
  });
const standaloneMatcher = createMatcher(standaloneSharedWorkerPattern);
const aggregateMatcher = createMatcher(aggregateSharedWorkerPattern);
const serviceMatcher = createMatcher(serviceSharedWorkerPattern);
export const makeAggregateSharedWorkerName = (routingKey: string) =>
  createHref(aggregateSharedWorkerPattern, { sharedWorkerVersion, routingKey });
export const makeServiceSharedWorkerName = (routingKey: string) =>
  createHref(serviceSharedWorkerPattern, { sharedWorkerVersion, routingKey });
export function parseSharedWorkerName(name: string) {
  const url = new URL('http://worker.invalid' + name);
  const aggregate = aggregateMatcher.match(url);
  const service = serviceMatcher.match(url);
  const standalone = standaloneMatcher.match(url);
  const match = aggregate ?? service ?? standalone;
  const key =
    aggregate?.params.routingKey ??
    service?.params.routingKey ??
    standalone?.params.sessionKey;
  if (
    match === null ||
    match === undefined ||
    match.params.sharedWorkerVersion !== sharedWorkerVersion ||
    key === undefined ||
    !/^[a-f0-9]{64}$/u.test(key) ||
    url.pathname !== name ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw makeZerospinError({ code: 'node-worker-name-invalid' });
  }
  if (standalone !== null && standalone !== undefined) {
    return { kind: 'standalone' as const, sessionKey: key };
  }
  return aggregate !== null && aggregate !== undefined
    ? { kind: 'aggregate' as const, routingKey: key }
    : { kind: 'service' as const, routingKey: key };
}
