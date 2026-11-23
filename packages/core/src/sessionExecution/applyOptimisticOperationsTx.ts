import { mapParseError } from '@zerospin/error';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { applyOperationTx } from '../contracts/applyOperationTx.ts';
import type {
  IContractOutput,
  IOperationArraySchema,
} from '../contracts/types.ts';
import type { ITx } from '../drizzle/types.ts';
import { encodeInverseOperation } from '../models/encodeInverseOperation.ts';
import type { IInverseOperation } from '../models/InverseOperationSchema.ts';

/** Apply model entries from the checked complete batch, preserving sparse indexes and undo order. */
export const applyOptimisticOperationsTx = Effect.fn(
  'applyOptimisticOperationsTx',
)(function* (props: {
  tx: ITx;
  operations: readonly IContractOutput[];
  operationsSchema: IOperationArraySchema;
  appliedAt: Date;
}) {
  const { tx, operations, operationsSchema, appliedAt } = props;
  const batch = yield* Schema.decodeUnknownEffect(
    Schema.toType(operationsSchema),
  )(operations, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'contract-program-operation-invalid',
      prefix: 'Invalid complete optimistic operation batch',
    }),
    Effect.updateContext<never, never>(() => Context.empty()),
  );
  const inverses: IInverseOperation[] = [];
  for (const operation of batch) {
    if (
      operation.operationName === 'external' ||
      operation.operationName === 'command'
    ) {
      continue;
    }
    const applied = yield* applyOperationTx({
      tx,
      operation,
      appliedAt,
    });
    inverses.push(yield* encodeInverseOperation({ operation: applied }));
  }
  return inverses;
});
