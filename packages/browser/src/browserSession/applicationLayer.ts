import type { IAnyError } from '@zerospin/error';
import * as Layer from 'effect/Layer';

/** Validate the executable layer at the boundary where authored wiring becomes a live owner. */
export function applicationLayer<SERVICES>(
  layer: Layer.Layer<SERVICES, IAnyError, never> | undefined,
): Layer.Layer<unknown, IAnyError, never> | undefined {
  if (layer === undefined) return undefined;
  if (!Layer.isLayer(layer)) {
    throw new Error('Session application wiring must be an Effect Layer');
  }
  return layer;
}
