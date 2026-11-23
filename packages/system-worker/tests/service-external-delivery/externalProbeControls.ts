import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

type IExternalProbePayload = {
  reservationId: `rsv_${string}`;
  mode: 'success' | 'failure' | 'invalid-response' | 'timeout';
  finalizer: boolean;
};
type IExternalProbeControl = {
  attempt: {
    contractVersion: number;
    payload: IExternalProbePayload;
    finalizing: boolean;
    finished: boolean;
  };
  finalizerReleased: boolean;
};

export class ExternalProbe extends Context.Service<
  ExternalProbe,
  { readonly version: number }
>()('ExternalProbe') {}

let probeDeadlinesHeld = false;

export const holdExternalProbeDeadlines = () => {
  probeDeadlinesHeld = true;
};

const externalProbeClock = Layer.effect(
  Clock.Clock,
  Effect.map(Clock.Clock, clock => ({
    ...clock,
    currentTimeMillisUnsafe: () => clock.currentTimeMillisUnsafe(),
    currentTimeNanosUnsafe: () => clock.currentTimeNanosUnsafe(),
    monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
    sleep: duration =>
      probeDeadlinesHeld ? Effect.never : clock.sleep(duration),
  })),
);

export const externalProbeLayer = (version: number) =>
  Layer.merge(Layer.succeed(ExternalProbe, { version }), externalProbeClock);

export const externalProbeControls: IExternalProbeControl[] = [];
export const externalProbePayloadBuilds: string[] = [];

export const releaseExternalProbeFinalizers = () => {
  for (const control of externalProbeControls) control.finalizerReleased = true;
};

export const resetExternalProbeControls = () => {
  releaseExternalProbeFinalizers();
  externalProbeControls.length = 0;
  externalProbePayloadBuilds.length = 0;
  probeDeadlinesHeld = false;
};

export const requestExternalProbe = (
  contractVersion: number,
  payload: IExternalProbePayload,
) =>
  Effect.suspend(() => {
    const control: IExternalProbeControl = {
      attempt: { contractVersion, payload, finalizing: false, finished: false },
      finalizerReleased: false,
    };
    externalProbeControls.push(control);
    return Effect.gen(function* () {
      if ('ZEROSPIN_OWNER_RELEASE' in env) {
        const key = `provider/${payload.reservationId}/${contractVersion}/${crypto.randomUUID()}`;
        yield* Effect.promise(() => env.PINNED_PROVIDER.put(key, ''));
      }
      if (payload.mode === 'timeout') yield* Effect.never;
      if (payload.mode === 'failure') {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'external-request-failed',
            message: 'Provider request failed',
          }),
        );
      }
      if (payload.mode === 'invalid-response') return undefined;
      return contractVersion === 1
        ? null
        : {
            providerVersion: contractVersion,
            reservationId: payload.reservationId,
          };
    }).pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          control.attempt.finalizing = true;
          if (payload.finalizer) {
            // Wait in the provider request so Workerd can keep its RPC alive.
            yield* Effect.promise(async () => {
              while (!control.finalizerReleased) await scheduler.wait(5);
            });
          }
          control.attempt.finished = true;
        }),
      ),
    );
  });
