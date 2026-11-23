import { isNonFailureCause } from '@zerospin/core/execution/runAuthoredCallback';
import {
  encodeError,
  makeZerospinError,
  type IAnyError,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  type TelemetryCollector,
} from '@zerospin/logger';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';

import { BrowserRpc } from './BrowserRpc.ts';
import {
  NodeBackendTimeoutError,
  NodeBackendUnreachableError,
  NodeFailureSchema,
} from './NodeErrors.ts';

/** Settle this network boundary's expected failure while keeping the original nonfailure Cause. */
export function nodeNetworkProgram<A, E extends IAnyError | IZerospinErrorJson>(
  program: Effect.Effect<A, E, TelemetryCollector>,
  props: {
    endpoint: string;
    operation: 'getSnapshot' | 'createWebSocketTicket' | 'registerNode';
  },
): Effect.Effect<
  A,
  | typeof NodeFailureSchema.Type
  | IZerospinError<E['code'] | 'error-serialization-failed'>,
  never
> {
  const { endpoint: apiUrl, operation } = props;
  const url = new URL(apiUrl);
  const endpoint = url.origin + (url.pathname === '/' ? '' : url.pathname);
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(
      program.pipe(
        Effect.provide(makeTelemetryLayer(makeTelemetryCollector())),
        Effect.timeout('10 seconds'),
        Effect.catchTag('TimeoutError', () =>
          Effect.fail(
            NodeBackendTimeoutError.make({
              extra: { endpoint, operation, timeoutMs: 10_000 },
            }),
          ),
        ),
      ),
    );
    if (Exit.isSuccess(exit)) return exit.value;
    if (isNonFailureCause(exit.cause)) {
      return yield* Effect.failCause(exit.cause);
    }
    const reason = exit.cause.reasons[0];
    if (
      exit.cause.reasons.length !== 1 ||
      reason === undefined ||
      !Cause.isFailReason(reason)
    ) {
      return yield* Effect.die(exit.cause);
    }
    const error = reason.error;
    if (
      error.code === 'rpc-invocation-failed' &&
      !('scope' in error) &&
      typeof error.extra === 'object' &&
      error.extra !== null &&
      'networkUnavailable' in error.extra &&
      error.extra.networkUnavailable === true
    ) {
      return yield* NodeBackendUnreachableError.make({
        extra: { endpoint, operation },
      });
    }
    const failure = yield* encodeError(error);
    const known = Schema.decodeUnknownOption(NodeFailureSchema, {
      onExcessProperty: 'error',
    })(failure);
    if (known._tag === 'Some') return yield* known.value;
    return yield* makeZerospinError<E['code'] | 'error-serialization-failed'>(
      failure,
    );
  });
}

export function runNodeNetwork<A, E extends IAnyError | IZerospinErrorJson>(
  program: Effect.Effect<A, E, TelemetryCollector>,
  props: {
    endpoint: string;
    operation: 'getSnapshot' | 'createWebSocketTicket' | 'registerNode';
  },
): Promise<A> {
  const { endpoint, operation } = props;
  return BrowserRpc.run(nodeNetworkProgram(program, { endpoint, operation }));
}
