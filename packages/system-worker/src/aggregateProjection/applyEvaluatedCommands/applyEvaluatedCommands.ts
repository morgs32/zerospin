import type { IDb } from '@zerospin/core/drizzle/types';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import * as Effect from 'effect/Effect';

import type { IEvaluatedAggregateCommand } from '../../AggregateVersionChain/evaluatedAggregateCommand.js';
import type { IAggregateProjectionKey } from '../resolveAggregateProjectionView.js';

import { applyEvaluatedCommandsTx } from './applyEvaluatedCommandsTx.js';

/** Resolve the aggregate release, then replay delivered rows in one projection transaction. */
export const applyEvaluatedCommands = Effect.fn(
  'AggregateProjection.applyEvaluatedCommands',
)(function* (props: {
  rows: readonly IEvaluatedAggregateCommand[];
  db: IDb;
  key: IAggregateProjectionKey;
}) {
  const { key, db, rows } = props;

  const system = yield* System;
  const aggregateRegistry = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: key.aggregateName,
    recordKind: 'aggregates',
  });
  const aggregateRelease = yield* getByKeyOrThrow({
    record: aggregateRegistry.releases,
    key: key.aggregateVersion,
    recordKind: 'listed versions',
  });
  return yield* applyEvaluatedCommandsTx(db, {
    rows,
    aggregateRelease,
    key,
  });
});
