import { Effect, Schema } from 'effect';

/**
 * Validate and destructure wire props in the receiving class before calling the
 * typed domain procedure. Shared concrete schemas may serve equivalent boundaries;
 * keep a one-off Struct inline. Keep claims, commands and owner keys intact.
 *
 * @bad Forward unknown wire props to a sibling procedure that repeats validation.
 * @bad Add schema factories or preparation wrappers around a one-off input.
 */
export class AdmissionReceiver {
  async enqueueSomeWorkflow(props: unknown) {
    return Effect.runPromise(
      Effect.gen(function* () {
        const { workflowId } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ workflowId: Schema.String }),
        )(props, { onExcessProperty: 'ignore' });
        return yield* createSomeWorkflow({ workflowId });
      }),
    );
  }
}

declare function createSomeWorkflow(props: {
  workflowId: string;
}): Effect.Effect<unknown>;
