import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { ReceiptDelivery } from './ReceiptDelivery.ts';
import { receiptsService, receiptV1 } from './receiptV1.ts';
import { requestReceiptV1 } from './requestReceiptV1.ts';
import {
  recordReceiptDelivery,
  sendExternalReceiptV1,
} from './sendExternalReceiptV1.ts';

export const receiptsServiceReleaseV1 = makeServiceRelease(receiptsService, {
  version: 1,
  layer: Layer.succeed(ReceiptDelivery, ({ receiptId }) =>
    Effect.succeed({ reference: `mail:${receiptId}` }),
  ),
  models: { receipt: receiptV1 },
  system: { requestReceipt: requestReceiptV1 },
  contracts: { recordReceiptDelivery },
  external: { sendExternalReceipt: sendExternalReceiptV1 },
});
