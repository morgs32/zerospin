import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

export interface IOutboxQueue<
  NAME extends string,
  ROW,
  RECEIPT,
  E = never,
  R = never,
> {
  readonly name: NAME;
  readonly _outboxTypes?: { row: ROW; receipt: RECEIPT };
  readonly drain: (throughIndex?: number) => Effect.Effect<void, E, R>;
  readonly hasPending: () => Effect.Effect<boolean, IAnyError>;
}
