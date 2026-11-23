import {
  makeAgentCommandRef,
  makeAggregateAgentRelease,
  makeAggregateAgentSession,
  type IAgentSessionFactories,
} from '@zerospin/browser';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { modelId } from '@zerospin/core/models/modelId';
import { modelRef } from '@zerospin/core/models/modelRef';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

const flagModel = defineModel({ name: 'flag', abbreviation: 'flg' });
const itemModel = defineModel({ name: 'item', abbreviation: 'itm' });
const flag = makeModelVersion(flagModel, {
  version: 1,
  attributes: { visible: primitives.boolean() },
  indexes: [],
});
const metadataSchema = Schema.Struct({ marker: Schema.String });
const item = makeModelVersion(itemModel, {
  version: 1,
  attributes: {
    amount: primitives.integer(),
    labelStatus: primitives.text(),
    trackingStatus: primitives.text(),
    flagId: modelRef({
      model: flagModel,
      relation: 'flag',
      inverse: 'items',
    }),
    capturedAt: primitives.date(),
    metadata: primitives.json({ schema: metadataSchema }),
    note: primitives.text(),
  },
  indexes: [],
});
const createTrackingLabel = makeAggregateContractRelease(
  defineAggregateContract('createTrackingLabel'),
  {
    version: 1,
    models: {
      item: {
        model: item,
        fields: [
          'createdAt',
          'updatedAt',
          'amount',
          'labelStatus',
          'trackingStatus',
          'flagId',
          'capturedAt',
          'metadata',
          'note',
        ],
      },
      flag: { model: flag, fields: ['createdAt', 'updatedAt', 'visible'] },
    },
    payload: { itemId: modelId({ model: itemModel }) },
    failures: {
      ineligible: ContractError.schema({ code: 'fixture-ineligible' }),
    },
    operations: { updateItem: item.operations.update },
    program: Effect.fn(function* ({ payload, db, failures, operations }) {
      const row = yield* findFirst({
        db,
        model: db.models.item,
        where: { id: { eq: payload.itemId } },
      });
      if (row?.amount === 13) {
        return yield* failures.ineligible.make({
          message: 'Fixture row is ineligible.',
        });
      }
      if (row !== undefined) {
        yield* operations.updateItem({
          resourceId: row.id,
          attributes: { labelStatus: 'pending' },
        });
      }
    }),
  },
);
const updateTrackingInfo = makeAggregateContractRelease(
  defineAggregateContract('updateTrackingInfo'),
  {
    version: 1,
    models: {
      item: {
        model: item,
        fields: [
          'createdAt',
          'updatedAt',
          'amount',
          'labelStatus',
          'trackingStatus',
          'flagId',
          'capturedAt',
          'metadata',
          'note',
        ],
      },
      flag: { model: flag, fields: ['createdAt', 'updatedAt', 'visible'] },
    },
    payload: { itemId: modelId({ model: itemModel }) },
    operations: { updateItem: item.operations.update },
    program: Effect.fn(function* ({ payload, db, operations }) {
      const row = yield* findFirst({
        db,
        model: db.models.item,
        where: { id: { eq: payload.itemId } },
      });
      if (row !== undefined) {
        yield* operations.updateItem({
          resourceId: row.id,
          attributes: { trackingStatus: 'pending' },
        });
      }
    }),
  },
);
const editItem = makeAggregateContractRelease(
  defineAggregateContract('editItem'),
  {
    version: 1,
    models: {
      item: {
        model: item,
        fields: [
          'createdAt',
          'updatedAt',
          'amount',
          'labelStatus',
          'trackingStatus',
          'flagId',
          'capturedAt',
          'metadata',
          'note',
        ],
      },
      flag: { model: flag, fields: ['createdAt', 'updatedAt', 'visible'] },
    },
    payload: {
      itemId: modelId({ model: itemModel }),
      capturedAt: primitives.date(),
      metadata: primitives.json({ schema: metadataSchema }),
      note: primitives.text(),
    },
    failures: {
      ineligible: ContractError.schema({ code: 'fixture-edit-ineligible' }),
    },
    guard: ({ payload, failures }) =>
      payload.note === 'forbidden'
        ? Effect.fail(
            failures.ineligible.make({
              message: 'Fixture note is ineligible.',
            }),
          )
        : Effect.void,
    operations: { updateItem: item.operations.update },
    program: Effect.fn(function* ({ payload, db, operations }) {
      const row = yield* findFirst({
        db,
        model: db.models.item,
        where: { id: { eq: payload.itemId } },
      });
      if (row !== undefined) {
        yield* operations.updateItem({
          resourceId: row.id,
          attributes: { note: payload.note },
        });
      }
    }),
  },
);
const db = makeQueryDbVersion({ models: { item, flag } });
export const positiveItems = makeAggregateAgentRelease({
  agentName: 'positiveItems',
  agentVersion: 1,
  sessionName: 'positiveItems',
  aggregateName: 'fixture',
  aggregateVersion: 1,
  db,
  contracts: {
    createTrackingLabel: makeAgentCommandRef<typeof createTrackingLabel>(
      'createTrackingLabel',
      1,
    ),
    updateTrackingInfo: makeAgentCommandRef<typeof updateTrackingInfo>(
      'updateTrackingInfo',
      1,
    ),
    editItem: makeAgentCommandRef<typeof editItem>('editItem', 1),
  },
  selections: {
    item: db.query.item.findMany({
      where: { amount: { gt: 0 }, flag: { visible: { eq: true } } },
    }),
    flag: db.query.flag.findMany({}),
  },
});
export const agents = { positiveItems };
export const agentSessions = {
  positiveItems: {
    kind: 'aggregate',
    makeSession: inputs =>
      makeAggregateAgentSession({
        agentRelease: agents.positiveItems,
        ...inputs,
      }),
  },
} satisfies IAgentSessionFactories;
