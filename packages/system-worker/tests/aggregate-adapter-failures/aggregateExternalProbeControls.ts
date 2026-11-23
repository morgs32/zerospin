import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

type IAggregateExternalProbePayload = {
  reservationId: `rsv_${string}`;
  finalizer: boolean;
};

const attemptSchema = Schema.Struct({
  contractVersion: Schema.Number,
  finalizing: Schema.Boolean,
});
const attemptsPrefix = 'aggregate-external-attempt/';
const releaseFinalizer = 'aggregate-external-release-finalizer';

export async function readAggregateExternalAttempts() {
  const { objects } = await env.BUCKET.list({ prefix: attemptsPrefix });
  return Promise.all(
    objects.map(async ({ key }) => {
      const entry = await env.BUCKET.get(key);
      if (entry === null) {
        throw new Error('Missing the Aggregate provider attempt');
      }
      return Schema.decodeUnknownSync(attemptSchema)(await entry.json());
    }),
  );
}

export async function releaseAggregateExternalProbeFinalizers() {
  await env.BUCKET.put(releaseFinalizer, '');
}

export const requestAggregateExternalProbe = (
  contractVersion: number,
  payload: IAggregateExternalProbePayload,
) =>
  Effect.suspend(() => {
    const key = attemptsPrefix + crypto.randomUUID();
    const recordAttempt = (finalizing: boolean) =>
      Effect.promise(() =>
        env.BUCKET.put(
          key,
          JSON.stringify({
            contractVersion,
            payload,
            finalizing,
          }),
        ),
      );
    return recordAttempt(false).pipe(
      Effect.andThen(
        Effect.succeed(
          contractVersion === 1
            ? null
            : {
                providerVersion: contractVersion,
                reservationId: payload.reservationId,
              },
        ),
      ),
      Effect.ensuring(
        Effect.gen(function* () {
          yield* recordAttempt(true);
          if (payload.finalizer) {
            while (
              !(yield* Effect.promise(() => env.BUCKET.head(releaseFinalizer)))
            ) {
              yield* Effect.sleep('10 millis');
            }
          }
        }),
      ),
    );
  });
