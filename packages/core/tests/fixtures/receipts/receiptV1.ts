import { defineServiceExternalContract } from '@zerospin/core/contracts/defineServiceExternalContract';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { defineService } from '@zerospin/core/service/defineService';
import { primitives } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

export const receiptV1 = makeModelVersion(
  defineModel({ name: 'receipt', abbreviation: 'rcp' }),
  {
    version: 1,
    attributes: {
      recipient: primitives.text(),
      deliveryState: primitives.enum({ values: ['pending', 'sent', 'failed'] }),
      providerReference: primitives.text({ nullable: true }),
      failureMessage: primitives.text({ nullable: true }),
    },
    indexes: [],
  },
);

export const receiptsService = defineService({ name: 'receipts' });

export const sendExternalReceiptDefinitionV1 = defineServiceExternalContract({
  name: 'sendExternalReceipt',
  version: 1,
  payload: {
    receiptId: primitives.id({ abbreviation: 'rcp' }),
    recipient: primitives.text(),
  },
  response: Schema.Struct({ reference: Schema.String }),
});
