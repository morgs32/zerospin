import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { ensureZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IFanoutSubscriberOptions } from './fanoutSubscriberOptions.js';
import { runFanoutCatchup } from './runFanoutCatchup.js';

export const subscribeFanout = <
  NAME extends string,
  SOURCE_KEY extends Readonly<Record<string, string | number | undefined>>,
  KEY extends Readonly<Record<string, string | number | undefined>>,
  ROW,
  PAGE_ERROR,
  SUBSCRIBE_ERROR,
  RECEIVE_ERROR,
  REPO_ERROR,
  R,
>(
  props: IFanoutSubscriberOptions<
    NAME,
    SOURCE_KEY,
    KEY,
    ROW,
    PAGE_ERROR,
    SUBSCRIBE_ERROR,
    RECEIVE_ERROR,
    REPO_ERROR,
    R
  >,
  index?: number,
) => {
  return Effect.gen(function* () {
    yield* runFanoutCatchup(props, index);
    const { name, sourceKey, key, getRepo, getCurrentIndex } = props;
    const cursor = yield* Effect.try({
      try: getCurrentIndex,
      catch: error =>
        ensureZerospinError({
          code: 'fanout-subscriber-cursor-failed',
          error,
        }),
    });
    const repo = yield* getRepo({ key: sourceKey });
    yield* Effect.acquireUseRelease(
      Effect.promise(() => repo[name]),
      queue =>
        Effect.promise(() =>
          queue.subscribe({
            ...key,
            currentIndex: cursor,
          }),
        ).pipe(Effect.flatMap(readRpcEnvelope)),
      queue => Effect.sync(() => queue[Symbol.dispose]()),
    );
  });
};
