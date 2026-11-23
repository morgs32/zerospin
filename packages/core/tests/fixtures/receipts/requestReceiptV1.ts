import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import { receiptV1, sendExternalReceiptDefinitionV1 } from './receiptV1.ts';

export const requestReceiptV1 = makeServiceContractRelease(
  defineServiceContract('requestReceipt'),
  {
    version: 1,
    operations: {
      createReceipt: receiptV1.operations.create,
      sendReceipt: sendExternalReceiptDefinitionV1.externalOperation,
    },
    payload: {
      receiptId: primitives.id({ abbreviation: 'rcp' }),
      recipient: primitives.text(),
    },
    program: Effect.fn('requestReceiptV1.program')(function* ({
      payload,
      operations,
    }) {
      yield* operations.createReceipt({
        resourceId: payload.receiptId,
        attributes: {
          recipient: payload.recipient,
          deliveryState: 'pending',
          providerReference: null,
          failureMessage: null,
        },
      });
      yield* operations.sendReceipt({ payload });
    }),
  },
);
