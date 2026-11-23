import type { IFrameworkError } from '@zerospin/error';
import type * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import {
  FailuresSchema,
  type IFailures,
  type IFailureType,
} from '../../contracts/failures.ts';
import {
  scopeContractReadDb,
  type IContractReadDb,
} from '../../contracts/make/makeContractReadDb.ts';
import {
  assertReadProjection,
  captureReadProjections,
  makeProjectedReadModels,
  type IAssertReadProjections,
  type IProjectedReadModels,
  type IReadModels,
  type IReadProjectionRequirements,
  type IReadProjections,
} from '../../contracts/readProjection.ts';

/**
 * Infer a reusable check's query capability and decoded inputs from declarations.
 * Injects declared error constructors: callers supply the database and
 * already-decoded inputs. Owning guard declarations enforce failure scopes.
 */
export function makeGuard<
  const MODELS extends IReadProjections,
  PAYLOAD extends Schema.Top,
  CLAIMS extends Schema.Top,
  const FAILURES extends IFailures = Record<never, never>,
  ERROR extends IFrameworkError | NoInfer<IFailureType<FAILURES>> = never,
  REQUIREMENTS = never,
>(props: {
  models: MODELS & IAssertReadProjections<NoInfer<MODELS>>;
  failures?: FAILURES;
  payload: PAYLOAD;
  claims: CLAIMS;
  program: (props: {
    failures: NoInfer<FAILURES>;
    db: IContractReadDb<IProjectedReadModels<MODELS>>;
    payload: PAYLOAD['Type'];
    claims: CLAIMS['Type'];
  }) => Effect.Effect<void, ERROR, REQUIREMENTS>;
}): <ACTUAL extends IReadModels>(input: {
  db: IContractReadDb<ACTUAL> & {
    readonly models: IReadProjectionRequirements<MODELS>;
  };
  payload: PAYLOAD['Type'];
  claims: CLAIMS['Type'];
}) => Effect.Effect<void, ERROR, REQUIREMENTS>;
export function makeGuard(props: unknown): unknown {
  const definition = Schema.decodeUnknownSync(
    Schema.Struct({
      models: Schema.Unknown,
      payload: Schema.declare((value): value is Schema.Top =>
        Schema.isSchema(value),
      ),
      claims: Schema.declare((value): value is Schema.Top =>
        Schema.isSchema(value),
      ),
      failures: Schema.optionalKey(FailuresSchema),
      program: Schema.declare(
        (
          value: unknown,
        ): value is (input: {
          db: IContractReadDb;
          payload: unknown;
          claims: unknown;
          failures: IFailures;
        }) => Effect.Effect<void, unknown, unknown> =>
          typeof value === 'function',
      ),
    }),
    { onExcessProperty: 'error' },
  )(props);
  const failures = Object.freeze({ ...definition.failures });
  const models = captureReadProjections(definition.models);
  const projected = makeProjectedReadModels(models);
  const projectedModels = new Set(Object.keys(models));
  return (input: {
    db: IContractReadDb;
    payload: unknown;
    claims: unknown;
  }) => {
    mapValues(models, (projection, name) =>
      assertReadProjection({
        projection,
        projectedModels,
        model: input.db.models[name],
        context: 'Guard',
      }),
    );
    return definition.program({
      ...input,
      db: scopeContractReadDb(input.db, projected),
      failures,
    });
  };
}
