import type { IRpcEnvelope } from '@zerospin/logger';

export type IOutboxSubscriber<
  QUEUE extends {
    readonly name: string;
    readonly _outboxTypes?: { row: unknown; receipt: unknown };
  },
  RECEIVE_ERROR = never,
> = {
  receive(
    rows: readonly NonNullable<QUEUE['_outboxTypes']>['row'][],
  ): PromiseLike<
    IRpcEnvelope<NonNullable<QUEUE['_outboxTypes']>['receipt'], RECEIVE_ERROR>
  >;
};
