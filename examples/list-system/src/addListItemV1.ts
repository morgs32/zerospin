import * as sdk from '@zerospin/sdk/browser';

import { listItemModel } from './listItemModel';
import { listItemV1 } from './listItemV1';

export const addListItemV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('addListItem'),
  {
    version: 1,
    payload: {
      id: sdk.modelId({ model: listItemModel }),
      text: sdk.primitives.text(),
    },
    models: {
      listItem: {
        model: listItemV1,
        fields: ['createdAt', 'updatedAt', 'text'],
      },
    },
    operations: { addListItem: listItemV1.operations.create },
    program: ({ payload, operations }) =>
      operations.addListItem({
        resourceId: payload.id,
        attributes: { text: payload.text },
      }),
  },
);
