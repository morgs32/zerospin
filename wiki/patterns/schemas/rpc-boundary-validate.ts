import { Effect, Schema } from 'effect';

import { mapParseError } from '../_stubs/schema';

/**
 * Independent transport receivers validate their own envelope before side effects.
 * Ignore unrelated fields unless the interface requires strict rejection (browser
 * attachment, subscription, pause and outbox inputs do). Generated public APIs
 * retain strict argument schemas and do not repeat that decode in keyed Repos.
 *
 * @bad Decode the same wire schema again inside a typed owner procedure.
 */
export const validateRpcProps = Effect.fn('validateRpcProps')(function* (
  props: unknown,
) {
  const { systemId } = yield* Schema.decodeUnknownEffect(
    Schema.Struct({ systemId: Schema.String }),
  )(props, { onExcessProperty: 'ignore' });

  return { systemId };
});

/**
 * Inline one-off RPC props Schema.Struct in the Api method — no file-level schema const.
 *
 * @bad Top-level `enqueueSomeWorkflowPropsSchema` used by only one method.
 */
export const enqueueSomeWorkflow = Effect.fn('enqueueSomeWorkflow')(function* (
  props: unknown,
) {
  const { zerospinApiKey, workflowId } = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      zerospinApiKey: Schema.String,
      workflowId: Schema.String,
    }),
  )(props, { onExcessProperty: 'ignore' }).pipe(
    mapParseError({
      code: 'failed-to-decode-enqueue-workflow-props',
      prefix: 'Failed to decode enqueueSomeWorkflow props',
    }),
  );

  return spawnWorkflow({ zerospinApiKey, workflowId });
});

declare function spawnWorkflow(
  props: unknown,
): Effect.Effect<unknown, unknown, unknown>;
