import type { IAnyError } from '@zerospin/error';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { runAuthoredCallback } from '../../execution/runAuthoredCallback.ts';

/** Bound supplied layer failures without changing defects, interruption, or finalizers. */
export const normalizeSystemAppLayer = <A, E extends IAnyError, R>(
  layer: Layer.Layer<A, E, R>,
) =>
  layer.pipe(
    Layer.catchCause(cause => {
      const failure: Effect.Effect<Context.Context<A>, E> = Effect.failCause(
        cause,
      );
      return Layer.effectContext(
        runAuthoredCallback({
          program: failure,
          code: 'system-app-layer-failed',
        }),
      );
    }),
  );

export type ISystemAppLayerError = Layer.Error<
  ReturnType<typeof normalizeSystemAppLayer>
>;
