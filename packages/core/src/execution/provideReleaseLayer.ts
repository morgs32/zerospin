import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Scope from 'effect/Scope';

import { normalizeSystemAppLayer } from '../system/make/normalizeSystemAppLayer.ts';

import type { IOwnerReleaseLayer } from './ownerReleaseLayer.ts';

type ILayeredRelease = Readonly<{ layer?: IOwnerReleaseLayer }>;

function acquireLayer(layer: IOwnerReleaseLayer, scope: Scope.Scope) {
  return Effect.runSync(
    Effect.cached(
      Effect.suspend(() =>
        Layer.buildWithMemoMap(
          normalizeSystemAppLayer(layer),
          Layer.makeMemoMapUnsafe(),
          scope,
        ),
      ),
    ),
  );
}

/** Acquire one Layer per addressed release before running its authored code. */
export function makeOwnerReleaseLayerProvider(scope: Scope.Scope) {
  const contexts = new WeakMap<
    ILayeredRelease,
    ReturnType<typeof acquireLayer>
  >();
  return <A, E, R>(
    release: ILayeredRelease,
    program: Effect.Effect<A, E, R>,
  ) => {
    if (release.layer === undefined) return program;
    let acquire = contexts.get(release);
    if (acquire === undefined) {
      acquire = acquireLayer(release.layer, scope);
      contexts.set(release, acquire);
    }
    return Effect.flatMap(acquire, app =>
      Effect.updateContext(program, host => Context.merge(app, host)),
    );
  };
}

export const provideReleaseLayer = makeOwnerReleaseLayerProvider(
  Scope.makeUnsafe(),
);
