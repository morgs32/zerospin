import { CuidFactory } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { nanoid } from 'nanoid';

export const NanoIdFactory = Layer.effect(
  CuidFactory,
  Effect.sync(() => CuidFactory.of(() => Effect.sync(() => nanoid()))),
);
