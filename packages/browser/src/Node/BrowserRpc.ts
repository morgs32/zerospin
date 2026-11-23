import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

/** Preserve typed RPC rejections while defects and interruption stay outside the public error channel. */
export class BrowserRpc {
  static async run<A, E>(program: Effect.Effect<A, E, never>): Promise<A> {
    const settled = await Effect.runPromiseExit(program);
    if (Exit.isFailure(settled)) {
      const reason = settled.cause.reasons[0];
      if (
        settled.cause.reasons.length === 1 &&
        reason !== undefined &&
        Cause.isFailReason(reason)
      ) {
        throw reason.error;
      }
      throw settled.cause;
    }
    return settled.value;
  }
}
