import type { IDb } from '@zerospin/core/drizzle/types';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import * as Effect from 'effect/Effect';

import type { IEvaluatedServiceCommand } from '../ServiceVersionChain/evaluatedServiceCommand.js';

import { applyEvaluatedCommandsTx } from './applyEvaluatedCommandsTx.js';
import type { IServiceProjectionKey } from './resolveServiceActorView.js';

/** Resolve the receiving release before one synchronous projection page commit. */
export const applyEvaluatedCommands = Effect.fn(
  'ServiceProjection.applyEvaluatedCommands',
)(function* (props: {
  rows: readonly IEvaluatedServiceCommand[];
  db: IDb;
  key: IServiceProjectionKey;
}) {
  const { key, db, rows } = props;
  const system = yield* System;
  const serviceRelease = yield* getByKeyOrThrow({
    record: system.services[key.serviceName]?.releases ?? {},
    key: key.serviceVersion,
    recordKind: 'service versions',
  });
  yield* applyEvaluatedCommandsTx(db, {
    rows,
    key,
    serviceRelease,
  });
});
