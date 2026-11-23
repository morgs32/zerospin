import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { modelId } from '@zerospin/core/models/modelId';
import { modelRef } from '@zerospin/core/models/modelRef';
import { makeTable, primitives } from '@zerospin/shapes';

/**
 * Scalar kinds describe values. Use modelId for stable model ID values and
 * modelRef for local model relationships. Generic table relationships use scalar
 * references metadata naming the destination's logical table and sole key.
 * Every persisted local relationship becomes an immediate SQLite foreign key
 * with default NO ACTION behavior. Compile models and internal tables together.
 * A self relationship names its own logical table; codecs are complete before binding.
 * Column constraints, nullability and relationships never infer scalar kinds.
 *
 * @bad Do not add local references to opaque, polymorphic, provenance or cross-database IDs.
 * @bad Do not put references or primaryKey: true in contract payload descriptors.
 * @bad Do not retain a selected model version or runtime Table in a descriptor.
 * @bad Do not omit caller-supplied IDs or generate them while decoding a payload.
 * @bad Do not split referenced model and internal tables into separate database graphs.
 */
const userModel = defineModel({ name: 'user', abbreviation: 'usr' });

const user = makeModelVersion(userModel, {
  attributes: {
    clerkUserId: primitives.id({ abbreviation: 'clerkusr' }),
    name: primitives.text(),
  },
  version: 1,
});

const auditEventTable = makeTable({
  name: 'auditEvent',
  shape: {
    id: primitives.id({ abbreviation: 'aevt', primaryKey: true }),
    userId: modelRef({
      model: userModel,
      relation: 'user',
      inverse: 'auditEvents',
    }),
    externalRequestId: primitives.id({ abbreviation: 'req' }),
  },
});

const categoryTable = makeTable({
  name: 'category',
  shape: {
    id: primitives.id({ abbreviation: 'cat', primaryKey: true }),
    parentCategoryId: primitives.id({
      abbreviation: 'cat',
      nullable: true,
      references: {
        tableName: 'category',
        columnName: 'id',
        relation: 'parentCategory',
        inverse: 'childCategories',
      },
    }),
  },
});

export const userDbConfig = makeResourceDbConfig({
  models: { user },
  otherTables: {
    auditEvent: auditEventTable,
    category: categoryTable,
  },
});

export const createUser = makeAggregateContractRelease(
  defineAggregateContract('createUser'),
  {
    payload: {
      id: modelId({ model: userModel }),
      clerkUserId: primitives.id({ abbreviation: 'clerkusr' }),
      name: primitives.text(),
    },
    version: 1,
  },
);

export const renameUser = makeAggregateContractRelease(
  defineAggregateContract('renameUser'),
  {
    payload: {
      id: modelId({ model: userModel }),
      name: primitives.text(),
    },
    version: 1,
  },
);
