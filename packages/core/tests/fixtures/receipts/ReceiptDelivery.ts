import type { IAnyError } from '@zerospin/error';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

export class ReceiptDelivery extends Context.Service<
  ReceiptDelivery,
  (props: {
    receiptId: string;
    recipient: string;
  }) => Effect.Effect<{ reference: string }, IAnyError>
>()('ReceiptDelivery') {}
