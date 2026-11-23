import { makeFn, makeRpcEnvelope } from '@zerospin/logger';
import { Effect } from 'effect';

/**
 * Use makeFn for named functions with Effect-owned spans and failure stacks.
 * Diagnostic tests (--mode profile) also snapshot bounded, redacted arguments
 * and exits inside the span. Production and ordinary tests select identity.
 * Put envelope collection in the outside transform so the collector receives
 * the completed span. makeTx uses the same tracing for synchronous transactions
 * and takes no annotation callback.
 *
 * @bad Attach annotateFunctionSpan explicitly or add a redundant outer named span.
 * @bad Mix layers, runners, or private diagnostic metadata into request arguments.
 */
export const double = makeFn('double')(
  function* (value: number) {
    return yield* Effect.succeed(value * 2);
  },
  effect => makeRpcEnvelope(effect),
);
