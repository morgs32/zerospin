/* oxlint-disable react-hooks/rules-of-hooks -- Effect Context service use is not a React hook. */
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeServiceExternalContractRelease } from '@zerospin/core/contracts/make/makeServiceExternalContractRelease';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import { ReceiptDelivery } from './ReceiptDelivery.ts';
import { receiptV1, sendExternalReceiptDefinitionV1 } from './receiptV1.ts';

export const recordReceiptDelivery = makeServiceContractRelease(
  defineServiceContract('recordReceiptDelivery'),
  {
    version: 1,
    payload: {
      ...sendExternalReceiptDefinitionV1.payload,
      providerReference: primitives.text({ nullable: true }),
      failureMessage: primitives.text({ nullable: true }),
    },
    models: {
      receipt: {
        model: receiptV1,
        fields: [
          'createdAt',
          'updatedAt',
          'recipient',
          'deliveryState',
          'providerReference',
          'failureMessage',
        ],
      },
    },
    operations: { updateReceipt: receiptV1.operations.update },
    failures: {
      staleReceipt: ContractError.schema({ code: 'receipt-not-pending' }),
    },
    program: Effect.fn('recordReceiptDelivery.program')(function* ({
      db,
      payload,
      operations,
      failures,
    }) {
      const receipt = yield* findFirst({
        db,
        model: db.models.receipt,
        where: { id: { eq: payload.receiptId } },
      });
      if (
        receipt === undefined ||
        receipt.recipient !== payload.recipient ||
        receipt.deliveryState !== 'pending'
      ) {
        return yield* failures.staleReceipt.make();
      }
      yield* operations.updateReceipt({
        resourceId: receipt.id,
        attributes: {
          deliveryState: payload.providerReference === null ? 'failed' : 'sent',
          providerReference: payload.providerReference,
          failureMessage: payload.failureMessage,
        },
      });
    }),
  },
);

export const sendExternalReceiptV1 = makeServiceExternalContractRelease(
  sendExternalReceiptDefinitionV1,
  {
    request: ({ payload }) => ReceiptDelivery.use(deliver => deliver(payload)),
    onSuccess: {
      contract: recordReceiptDelivery,
      payload: Effect.fn(function* ({ payload, response }) {
        return {
          ...payload,
          providerReference: response.reference,
          failureMessage: null,
        };
      }),
    },
    onFailure: {
      contract: recordReceiptDelivery,
      payload: Effect.fn(function* ({ payload, failure }) {
        return {
          ...payload,
          providerReference: null,
          failureMessage: failure.message,
        };
      }),
    },
  },
);
