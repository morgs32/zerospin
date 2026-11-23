import { runSynchronousExit } from '@zerospin/shapes';
import * as Cause from 'effect/Cause';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { z } from 'zod';

/** Validate decoded Type values without reconstructing their authored codec. */
export function makeDecodedZodValueSchema<A>(schema: Schema.Codec<A, unknown>) {
  return z.custom<A>().superRefine((value, context) => {
    const missingServices = new Set<string>();
    const services = new (class extends Map<string, unknown> {
      override get(key: string) {
        if (!this.has(key)) missingServices.add(key);
        return super.get(key);
      }
    })();
    const exit = runSynchronousExit(
      Schema.decodeUnknownEffect(Schema.toType(schema))(value),
      Effect.runSyncExitWith(Context.makeUnsafe(services)),
    );
    if (Exit.isSuccess(exit)) return;
    const reasons = exit.cause.reasons;
    if (
      reasons.every(
        reason =>
          Cause.isFailReason(reason) && Schema.isSchemaError(reason.error),
      )
    ) {
      for (const reason of reasons) {
        if (Cause.isFailReason(reason) && Schema.isSchemaError(reason.error)) {
          context.addIssue({ code: 'custom', message: reason.error.message });
        }
      }
      return;
    }
    if (reasons.length === 1) {
      const reason = reasons[0]!;
      if (Cause.isDieReason(reason) && Cause.isAsyncFiberError(reason.defect)) {
        context.addIssue({
          code: 'custom',
          message:
            'Unsupported asynchronous Type codec: decoded Zod validation must complete synchronously',
        });
        return;
      }
      if (
        Cause.isDieReason(reason) &&
        reason.defect instanceof Error &&
        reason.defect.message.startsWith('Service not found: ') &&
        missingServices.has(
          reason.defect.message.slice('Service not found: '.length),
        )
      ) {
        context.addIssue({
          code: 'custom',
          message: `Unsupported service-dependent Type codec: ${reason.defect.message}`,
        });
        return;
      }
    }
    // Defects, interruption, and mixed Causes retain their execution meaning.
    Effect.runSync(exit);
  });
}
