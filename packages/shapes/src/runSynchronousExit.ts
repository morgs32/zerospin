import * as Cause from 'effect/Cause';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type * as Fiber from 'effect/Fiber';

const SynchronousCancellation = Context.Service<symbol>(
  '@zerospin/shapes/runSynchronousExit/cancellation',
);

/** Context replacement can move queued synchronous work to another dispatcher. */
function flushSynchronousContinuations(fiber: Fiber.Fiber<unknown, unknown>) {
  let dispatcher = fiber.currentDispatcher;
  while (true) {
    dispatcher.flush();
    const nextDispatcher = fiber.currentDispatcher;
    if (nextDispatcher === dispatcher) return;
    dispatcher = nextDispatcher;
  }
}

/**
 * Finish queued synchronous work, then interrupt suspensions and collect synchronous cleanup failures.
 * Asynchronous finalizers and uninterruptible work can outlive this call.
 */
export function runSynchronousExit<A, E, R, RUN_ERROR>(
  program: Effect.Effect<A, E, R>,
  run: (program: Effect.Effect<A, E, R>) => Exit.Exit<A, RUN_ERROR>,
  beforeCancellation?: () => void,
): Exit.Exit<A, E | RUN_ERROR> {
  const completion: { exit?: Exit.Exit<A, E> } = {};
  const initial = run(
    program.pipe(
      Effect.onExit(exit =>
        Effect.sync(() => {
          completion.exit = exit;
        }),
      ),
    ),
  );
  // A completed nested boundary may return a suspension Cause from its own runner.
  if (Exit.isSuccess(initial) || Object.hasOwn(completion, 'exit')) {
    return initial;
  }
  let cause: Cause.Cause<E | RUN_ERROR> = initial.cause;
  for (const reason of initial.cause.reasons) {
    if (!Cause.isDieReason(reason) || !Cause.isAsyncFiberError(reason.defect)) {
      continue;
    }
    flushSynchronousContinuations(reason.defect.fiber);
    if (
      reason.defect.fiber.pollUnsafe() !== undefined &&
      completion.exit !== undefined
    ) {
      return completion.exit;
    }
    beforeCancellation?.();
    const marker = Symbol();
    reason.defect.fiber.interruptUnsafe(
      undefined,
      Context.make(SynchronousCancellation, marker),
    );
    flushSynchronousContinuations(reason.defect.fiber);
    const terminal = completion.exit;
    if (terminal !== undefined && Exit.isFailure(terminal)) {
      cause = Cause.combine(
        cause,
        Cause.fromReasons(
          terminal.cause.reasons.filter(
            completed =>
              !Cause.isInterruptReason(completed) ||
              completed.annotations.get(SynchronousCancellation.key) !== marker,
          ),
        ),
      );
    }
  }
  return Exit.failCause(cause);
}
