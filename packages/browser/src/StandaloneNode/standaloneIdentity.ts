import { type RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { makeZerospinError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

const StandalonePathParameterTokenSchema = Schema.Struct({
  type: Schema.Literals([':', '*']),
});
const StandalonePathParameterValueSchema = Schema.Union([
  Schema.String,
  Schema.Number,
]);

export function standalonePath(
  pattern: RoutePattern,
  claims: Readonly<Record<string, unknown>>,
): string {
  if (
    pattern.protocol !== null ||
    pattern.hostname !== null ||
    !pattern.source.startsWith('/')
  ) {
    throw makeZerospinError('standalone-backup-path-invalid');
  }
  const parameters: Record<string, string | number> = {};
  for (const token of pattern.pathname.tokens) {
    if (!Schema.is(StandalonePathParameterTokenSchema)(token)) continue;
    const value = claims[token.name];
    if (!Schema.is(StandalonePathParameterValueSchema)(value)) {
      throw makeZerospinError('standalone-backup-parameter-invalid');
    }
    parameters[token.name] = value;
  }
  return createHref(pattern, parameters);
}

/** Path, authored scope, and the complete session lock own storage; claims and builds do not. */
export function standaloneStorageKey(
  definition: IAggregateSessionDefinition,
  path: string,
) {
  const { aggregateSessionLock } = makeAggregateSessionSpec(definition);
  return sessionKey({
    kind: 'standalone',
    aggregateName: definition.aggregateName,
    aggregateVersion: definition.aggregateVersion,
    actorName: definition.actorName,
    actorVersion: definition.actorVersion,
    sessionName: definition.sessionName,
    path,
    lock: aggregateSessionLock,
  });
}

export function encodeStandaloneClaims(
  definition: IAggregateSessionDefinition,
  claims: unknown,
) {
  const decodedClaims = Schema.decodeUnknownSync(
    Schema.toType(definition.claimsSchema),
  )(claims, { onExcessProperty: 'error' });
  const encoded = Schema.encodeSync(definition.claimsSchema)(decodedClaims);
  const aggregateId = Schema.decodeUnknownSync(Schema.String)(
    encoded.aggregateId,
  );
  return { claims: decodedClaims, encoded, aggregateId };
}
