import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import type { IAdmittedAggregateCommand } from '@zerospin/system-worker/AggregateChain/types';
import {
  decodeAggregateEvaluatedCommandRow,
  EvaluatedAggregateCommandSchema,
} from '@zerospin/system-worker/AggregateVersionChain/evaluatedAggregateCommand';
import { aggregateVersionRepoDbConfig } from '@zerospin/system-worker/AggregateVersionRepo/aggregateVersionRepoDbConfig';
import { AggregateVersionChains } from '@zerospin/system-worker/repoServices/AggregateVersionChains';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { validateCommandIdentity } from '../validateCommandIdentity.js';

/** Recover pending or historical output and prove its association with authoritative Chain input outside SQL and execution permits. */
export const findEvaluatedCommand = Effect.fn(
  'AggregateVersionRepo.findEvaluatedCommand',
)(function* (props: {
  aggregateIndex: number;
  command?: IAdmittedAggregateCommand;
  db: IDb;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: number;
  };
}) {
  const { db, key, aggregateIndex, command } = props;
  if (!Number.isSafeInteger(aggregateIndex) || aggregateIndex < 1) {
    return yield* makeZerospinError('aggregate-execution-index-invalid');
  }
  const table = aggregateVersionRepoDbConfig.schema.aggregateVersionChainOutbox;
  const row = db
    .select()
    .from(table)
    .where(eq(table.aggregateIndex, aggregateIndex))
    .get();
  const retained = yield* row === undefined
    ? Effect.gen(function* () {
        const histories = yield* AggregateVersionChains;
        const history = yield* histories.getRepo({ key });
        return yield* Effect.promise(() =>
          history.getEvaluatedCommand({ aggregateIndex }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
      })
    : aggregateVersionRepoDbConfig.tables.aggregateVersionChainOutbox
        .decodeRow(row)
        .pipe(
          Effect.flatMap(decodeAggregateEvaluatedCommandRow),
          mapParseError({
            code: 'aggregate-evaluated-command-invalid',
            prefix: 'Invalid retained evaluated command',
          }),
        );
  if (retained === null) {
    return null;
  }
  const evaluatedCommand = yield* Schema.decodeUnknownEffect(
    Schema.toType(EvaluatedAggregateCommandSchema),
  )(retained).pipe(
    mapParseError({
      code: 'aggregate-evaluated-command-invalid',
      prefix: 'Invalid retained evaluated command',
    }),
  );
  if (evaluatedCommand.aggregateIndex !== aggregateIndex) {
    return yield* makeZerospinError('aggregate-command-identity-mismatch');
  }
  yield* validateCommandIdentity(command, evaluatedCommand, key);
  return evaluatedCommand;
});
