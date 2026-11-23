import type { IZerospinError } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import type { Effect } from 'effect';

import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';

import type { runFanoutCatchup } from './runFanoutCatchup.js';

export type ICatchupBoundaryError =
  | IZerospinError<'fanout-catchup-index-invalid'>
  | Effect.Error<
      ReturnType<
        typeof runFanoutCatchup<
          string,
          Readonly<Record<string, string | number | undefined>>,
          Readonly<Record<string, string | number | undefined>>,
          unknown,
          never,
          never,
          never,
          never,
          never
        >
      >
    >;
export type IFanoutSubscriberOptions<
  NAME extends string,
  SOURCE_KEY extends Readonly<Record<string, string | number | undefined>>,
  KEY extends Readonly<Record<string, string | number | undefined>>,
  ROW,
  PAGE_ERROR,
  SUBSCRIBE_ERROR,
  RECEIVE_ERROR,
  REPO_ERROR,
  R,
> = {
  name: NAME;
  sourceKey: SOURCE_KEY;
  key: KEY;
  getRepo: (props: { key: SOURCE_KEY }) => Effect.Effect<
    {
      readonly [K in NAME]: PromiseLike<
        Disposable & {
          getPage(props: {
            afterIndex: number;
            maxIndex?: number;
          }): PromiseLike<IRpcEnvelope<IFanoutDelivery<ROW>, PAGE_ERROR>>;
          subscribe(
            props: KEY & { currentIndex: number },
          ): PromiseLike<IRpcEnvelope<void, SUBSCRIBE_ERROR>>;
        }
      >;
    },
    REPO_ERROR,
    R
  >;
  openReplayPage?: () => PromiseLike<
    Disposable & {
      getPage(props: {
        afterIndex: number;
        maxIndex?: number;
      }): PromiseLike<IRpcEnvelope<IFanoutDelivery<ROW>, PAGE_ERROR>>;
    }
  >;
  getCurrentIndex: () => number;
  receive: (
    delivery: IFanoutDelivery<ROW>,
    source: 'pull' | 'push',
  ) => Effect.Effect<void, RECEIVE_ERROR, R>;
};
