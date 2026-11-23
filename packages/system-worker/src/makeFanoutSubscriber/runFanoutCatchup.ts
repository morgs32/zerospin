import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { ensureZerospinError, makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IFanoutSubscriberOptions } from './fanoutSubscriberOptions.js';

/** Pull through a fixed admission destination and re-read the durable cursor after each page. */
export const runFanoutCatchup = <
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
) =>
  Effect.gen(function* () {
    const { name, sourceKey, getRepo, getCurrentIndex, receive } = props;
    const currentIndex = Effect.try({
      try: getCurrentIndex,
      catch: error =>
        ensureZerospinError({
          code: 'fanout-subscriber-cursor-failed',
          error,
        }),
    });
    let cursor = yield* currentIndex;
    if (index !== undefined && cursor >= index) return;
    const openReplayPage = props.openReplayPage;
    const source =
      openReplayPage === undefined
        ? getRepo({ key: sourceKey }).pipe(
            Effect.flatMap(repo => Effect.promise(() => repo[name])),
          )
        : Effect.promise(openReplayPage);
    return yield* Effect.acquireUseRelease(
      source,
      queue =>
        Effect.gen(function* () {
          let destination = index;
          for (;;) {
            const requestedCursor = cursor;
            const delivery = yield* Effect.promise(() =>
              queue.getPage({
                afterIndex: cursor,
                ...(destination === undefined ? {} : { maxIndex: destination }),
              }),
            ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
            if (
              !Number.isSafeInteger(delivery.lastIndex) ||
              delivery.lastIndex < 0
            ) {
              return yield* Effect.fail(
                makeZerospinError({
                  code: 'fanout-catchup-tip-invalid',
                  message: 'The source returned an invalid deliverable tip',
                }),
              );
            }
            destination ??= delivery.lastIndex;
            // A concurrent push can commit while the source page is in flight.
            cursor = yield* currentIndex;
            if (cursor >= destination) return;
            if (delivery.rows.length === 0) {
              return yield* Effect.fail(
                makeZerospinError({
                  code: 'fanout-catchup-history-missing',
                  message: `Fanout history is unavailable after ${cursor} through ${destination}`,
                }),
              );
            }

            // 3 — the owner serializes and durably commits both pulled and pushed rows
            yield* receive(delivery, 'pull');
            const committed = yield* currentIndex;
            if (committed >= destination) return;
            if (committed <= requestedCursor) {
              return yield* Effect.fail(
                makeZerospinError({
                  code: 'fanout-catchup-no-progress',
                  message: `Fanout receipt did not advance the committed cursor after ${cursor}`,
                }),
              );
            }
            cursor = committed;
          }
        }),
      queue => Effect.sync(() => queue[Symbol.dispose]()),
    );
  });
