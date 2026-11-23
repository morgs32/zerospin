import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { ServiceVersionChains } from '@zerospin/system-worker/repoServices/ServiceVersionChains';
import type { IServiceCommandOccurrence } from '@zerospin/system-worker/ServiceChain/types';
import {
  decodeServiceEvaluatedCommandRow,
  EvaluatedServiceCommandSchema,
} from '@zerospin/system-worker/ServiceVersionChain/evaluatedServiceCommand';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { serviceVersionRepoDbConfig } from './serviceVersionRepoDbConfig.js';
import { validateCommandIdentity } from './validateCommandIdentity.js';

/** Recover pending or historical output and prove its association with authoritative Chain input outside SQL and execution permits. */
export const findEvaluatedCommand = Effect.fn(
  'ServiceVersionRepo.findEvaluatedCommand',
)(function* (props: {
  serviceIndex: number;
  command?: IServiceCommandOccurrence;
  db: IDb;
  key: {
    systemId: string;
    serviceName: string;
    serviceVersion: number;
  };
}) {
  const { db, key, serviceIndex, command } = props;
  if (!Number.isSafeInteger(serviceIndex) || serviceIndex < 1) {
    return yield* makeZerospinError('service-execution-index-invalid');
  }
  const table = serviceVersionRepoDbConfig.schema.serviceVersionChainOutbox;
  const row = db
    .select()
    .from(table)
    .where(eq(table.serviceIndex, serviceIndex))
    .get();
  const retained = yield* row === undefined
    ? Effect.gen(function* () {
        const histories = yield* ServiceVersionChains;
        const history = yield* histories.getRepo({ key });
        return yield* Effect.promise(() =>
          history.getEvaluatedCommand({ serviceIndex }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
      })
    : serviceVersionRepoDbConfig.tables.serviceVersionChainOutbox
        .decodeRow(row)
        .pipe(
          Effect.flatMap(decodeServiceEvaluatedCommandRow),
          mapParseError({
            code: 'service-evaluated-command-invalid',
            prefix: 'Invalid retained evaluated Service command',
          }),
        );
  if (retained === null) {
    return null;
  }
  const evaluatedCommand = yield* Schema.decodeUnknownEffect(
    Schema.toType(EvaluatedServiceCommandSchema),
  )(retained).pipe(
    mapParseError({
      code: 'service-evaluated-command-invalid',
      prefix: 'Invalid retained evaluated Service command',
    }),
  );
  if (evaluatedCommand.serviceIndex !== serviceIndex) {
    return yield* makeZerospinError('service-command-identity-mismatch');
  }
  yield* validateCommandIdentity(command, evaluatedCommand, key);
  return evaluatedCommand;
});
