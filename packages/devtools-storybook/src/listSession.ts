import { makeAggregateSessionDefinition } from '@zerospin/browser';
import * as sdk from '@zerospin/sdk/browser';
import * as Schema from 'effect/Schema';

const listItem = sdk.defineModel({ name: 'listItem', abbreviation: 'lit' });
const listItemV1 = sdk.makeModelVersion(listItem, {
  version: 1,
  attributes: { text: sdk.primitives.text() },
  indexes: [],
});

const addListItem = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('addListItem'),
  {
    version: 1,
    payload: {
      id: sdk.modelId({ model: listItem }),
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

export const listSession = makeAggregateSessionDefinition({
  systemName: 'standalone',
  aggregateName: 'list',
  aggregateVersion: 1,
  actorName: 'storybook',
  actorVersion: 1,
  sessionName: 'listSession',
  claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
  models: { listItem: listItemV1 },
  contracts: { addListItem },
});
