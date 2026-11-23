import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IAggregateNodeCommand } from '../AggregateNode/types.ts';
import type { ISqliteDrizzleDb } from '../drizzle/types.ts';
import type { IAggregateId } from '../models/types.ts';

import { aggregateSessionRepoDbConfig } from './aggregateSessionRepoDbConfig.ts';
import type { IAggregateSessionDefinition, ISessionId } from './types.ts';

export type IInferAggregateSessionClaims<D> = D extends {
  claimsSchema: Schema.Schema<infer C>;
}
  ? C
  : undefined;
/** Bound Actor admission controls execution identity and claims. */
export type IInitializedAggregateSession<
  DEFINITION extends IAggregateSessionDefinition = IAggregateSessionDefinition,
  DB extends ISqliteDrizzleDb = ISqliteDrizzleDb,
  CLAIMS = IInferAggregateSessionClaims<DEFINITION>,
> = Readonly<{
  sessionDefinition: DEFINITION;
  db: DB;
  sessionId: ISessionId;
  aggregateId: IAggregateId;
  onCommandStaged?: ((command: IAggregateNodeCommand) => void) | undefined;
  claims: CLAIMS;
  encodedClaims: CLAIMS extends undefined
    ? undefined
    : Readonly<Record<string, unknown>>;
}>;

export function makeInitializedAggregateSession<
  DEFINITION extends IAggregateSessionDefinition,
  DB extends ISqliteDrizzleDb,
>(props: {
  sessionDefinition: DEFINITION;
  db: DB;
  onCommandStaged?: ((command: IAggregateNodeCommand) => void) | undefined;
  admitted: Readonly<{
    sessionId: ISessionId;
    aggregateId: IAggregateId;
    actorName: string;
    actorVersion: number;
    claims: Readonly<Record<string, unknown>>;
  }>;
}) {
  return Effect.gen(function* () {
    const { sessionDefinition, db, admitted, onCommandStaged } = props;
    const metadata = db
      .select({
        sessionId:
          aggregateSessionRepoDbConfig.schema.sessionMetadata.sessionId,
      })
      .from(aggregateSessionRepoDbConfig.schema.sessionMetadata)
      .get();
    if (metadata === undefined) {
      return yield* makeZerospinError('session-metadata-missing');
    }
    if (metadata.sessionId !== admitted.sessionId) {
      return yield* makeZerospinError('session-snapshot-identity-conflict');
    }
    if (
      admitted.actorName !== sessionDefinition.actorName ||
      admitted.actorVersion !== sessionDefinition.actorVersion
    ) {
      return yield* makeZerospinError('session-actor-mismatch');
    }
    const claims = structuredClone(admitted.claims);
    const encodedClaims = yield* Schema.encodeEffect(
      sessionDefinition.claimsSchema,
    )(claims).pipe(
      mapParseError({
        code: 'command-claims-invalid',
        prefix: 'Failed to encode command claims',
      }),
    );
    const identity = {
      get claims() {
        return structuredClone(claims);
      },
      get encodedClaims() {
        return structuredClone(encodedClaims);
      },
    };
    const initialized = Object.freeze(
      Object.defineProperties(
        {
          sessionDefinition,
          db,
          sessionId: admitted.sessionId,
          aggregateId: admitted.aggregateId,
          onCommandStaged,
        },
        Object.getOwnPropertyDescriptors(identity),
      ),
    );
    return Schema.decodeUnknownSync(
      Schema.declare<IInitializedAggregateSession<DEFINITION, DB>>(
        (value): value is IInitializedAggregateSession<DEFINITION, DB> =>
          value === initialized,
      ),
    )(initialized);
  });
}
