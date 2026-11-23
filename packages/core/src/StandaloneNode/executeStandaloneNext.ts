import { isZerospinError, makeZerospinError } from '@zerospin/error';
import type { Cause } from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';

import type { AggregateNode } from '../AggregateNode/AggregateNode.ts';
import type { IAggregateNodeCommand } from '../AggregateNode/types.ts';
import type { IAggregateExposedCommand } from '../aggregateSession/types.ts';

const isExecutionStorageCode = Schema.is(
  Schema.Literals([
    'node-metadata-missing',
    'node-command-input-missing',
    'node-execution-checkpoint-invalid',
    'node-command-final-missing',
    'node-outcome-conflict',
    'node-index-invalid',
    'standalone-capability-stale',
    'node-closed',
  ]),
);

function executionStorageFailure(cause: unknown) {
  if (
    isZerospinError(cause) &&
    !('scope' in cause) &&
    isExecutionStorageCode(cause.code)
  ) {
    return makeZerospinError({
      code: cause.code,
      message: cause.message,
      status: cause.status,
      cause: cause.cause,
      extra: cause.extra,
    });
  }
  throw cause;
}

/** Keep the authored exit intact while the existing Node transaction rolls back and releases its gate. */
export const executeStandaloneNext = <E, R>(props: {
  node: AggregateNode;
  manual?: boolean;
  expectedNodeId?: string;
  execute(
    command: Extract<IAggregateNodeCommand, { nodeId: string }>,
    checkpoint: Awaited<ReturnType<AggregateNode['snapshot']>>['metadata'],
  ): Effect.Effect<IAggregateExposedCommand, E, R>;
}) => {
  const execute = props.execute.bind(props);
  const { node, manual, expectedNodeId } = props;
  return Effect.gen(function* () {
    const context = yield* Effect.context<R>();
    let executionFailure: Cause<E> | undefined;
    const settled = yield* Effect.exit(
      Effect.tryPromise({
        try: signal =>
          node.executeNext(
            async (command, checkpoint) => {
              const execution = await Effect.runPromiseExit(
                execute(command, checkpoint).pipe(Effect.provide(context)),
                { signal },
              );
              if (Exit.isFailure(execution)) {
                executionFailure = execution.cause;
                throw execution.cause;
              }
              return execution.value;
            },
            {
              ...(manual === undefined ? {} : { manual }),
              ...(expectedNodeId === undefined ? {} : { expectedNodeId }),
            },
          ),
        catch: executionStorageFailure,
      }),
    );
    if (executionFailure !== undefined) {
      return yield* Effect.failCause(executionFailure);
    }
    if (Exit.isFailure(settled)) {
      return yield* Effect.failCause(settled.cause);
    }
    return settled.value;
  });
};
