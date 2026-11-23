import { makeAggregateAgentRelease } from '@zerospin/browser';
import { makeAgentCommandRef, makeQueryDbVersion } from '@zerospin/sdk/browser';

import type { createTrackingLabelV1 } from '../aggregates/user/contracts/createTrackingLabelV1';
import type { updateTrackingInfoV1 } from '../aggregates/user/contracts/updateTrackingInfoV1';
import { purchaseV1 } from '../aggregates/user/models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../aggregates/user/models/purchaseItem/PurchaseItemV1';

const db = makeQueryDbVersion({
  models: { purchase: purchaseV1, purchaseItem: purchaseItemV1 },
});

export const purchasesAgentV1 = makeAggregateAgentRelease({
  aggregateName: 'user',
  aggregateVersion: 1,
  agentVersion: 1,
  agentName: 'purchases',
  sessionName: 'purchases',
  db,
  selections: {
    purchase: db.query.purchase.findMany({
      where: { paymentState: { eq: 'paid' } },
    }),
    purchaseItem: db.query.purchaseItem.findMany({ where: { purchase: true } }),
  },
  contracts: {
    createTrackingLabel: makeAgentCommandRef<typeof createTrackingLabelV1>(
      'createTrackingLabel',
      1,
    ),
    updateTrackingInfo: makeAgentCommandRef<typeof updateTrackingInfoV1>(
      'updateTrackingInfo',
      1,
    ),
  },
});
