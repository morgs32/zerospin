import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineAggregateExternalContract } from '@zerospin/core/contracts/defineAggregateExternalContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeAggregateExternalContractRelease } from '@zerospin/core/contracts/make/makeAggregateExternalContractRelease';
import { makeAggregateContractExtension } from '@zerospin/core/contracts/makeAggregateContractExtension';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as SchemaGetter from 'effect/SchemaGetter';

import { accountV1 } from './accountV1.ts';
import { accountV2 } from './accountV2.ts';

export { accountV1, accountV2 };

const counter = makeModelVersion(
  defineModel({ name: 'counter', abbreviation: 'ctr' }),
  {
    version: 1,
    attributes: { value: primitives.integer() },
    indexes: [],
  },
);
const createCounter = makeAggregateContractRelease(
  defineAggregateContract('createCounter'),
  {
    version: 1,
    models: { counter: { model: counter, fields: ['value'] } },
    operations: { createCounter: counter.operations.create },
    failures: { refused: ContractError.schema({ code: 'extension-refused' }) },
    payload: {
      id: primitives.id({ abbreviation: 'ctr' }),
      fail: primitives.boolean(),
    },
    program: Effect.fn(function* ({ payload, operations }) {
      yield* operations.createCounter({
        resourceId: payload.id,
        attributes: { value: 1 },
      });
    }),
  },
);
const extendCounter = makeAggregateContractExtension(createCounter, {
  models: { counter: { model: counter, fields: ['value'] } },
  operations: { updateCounter: counter.operations.update },
  program: Effect.fn(function* ({ db, payload, operations, failures }) {
    const row = yield* findFirst({
      db,
      model: db.models.counter,
      where: { id: { eq: payload.id } },
    });
    if (row === undefined || payload.fail) {
      return yield* failures.refused.make({ message: 'Extension refused' });
    }
    yield* operations.updateCounter({
      resourceId: row.id,
      attributes: { value: row.value + 1 },
    });
  }),
});
const external = defineAggregateExternalContract({
  name: 'sendCounter',
  version: 1,
  payload: { id: primitives.id({ abbreviation: 'ctr' }) },
  response: Schema.String,
});
const recordSentCounter = makeAggregateContractRelease(
  defineAggregateContract('recordSentCounter'),
  { version: 1, payload: external.payload },
);
const recordSentCounterPayload = Effect.fn(function* ({
  payload,
}: {
  payload: { id: `ctr_${string}` };
}) {
  return payload;
});
const sendCounter = makeAggregateExternalContractRelease(external, {
  request: () => Effect.succeed('ok'),
  onSuccess: { contract: recordSentCounter, payload: recordSentCounterPayload },
  onFailure: { contract: recordSentCounter, payload: recordSentCounterPayload },
});
const extendCounterV6 = makeAggregateContractExtension(createCounter, {
  models: { counter: { model: counter, fields: ['value'] } },
  operations: {
    updateCounter: counter.operations.update,
    sendCounter: external.externalOperation,
  },
  program: Effect.fn(function* ({ db, payload, operations, failures }) {
    const row = yield* findFirst({
      db,
      model: db.models.counter,
      where: { id: { eq: payload.id } },
    });
    if (row === undefined || !payload.fail) {
      return yield* failures.refused.make({
        message: 'Target extension refused',
      });
    }
    yield* operations.updateCounter({
      resourceId: row.id,
      attributes: { value: row.value + 10 },
    });
    yield* operations.sendCounter({ payload: { id: payload.id } });
  }),
});
export const accountV3 = makeAggregateRelease(accountV1.definition, {
  version: 3,
  rebuildFrom: accountV2,
  models: { counter },
  actors: {},
  system: { createCounter },
  extensions: { createCounter: extendCounter },
});
export const accountV4 = makeAggregateRelease(accountV1.definition, {
  version: 4,
  rebuildFrom: accountV3,
  models: { counter },
  actors: {},
  system: { createCounter },
  extensions: { createCounter: extendCounter },
});

export const accountV5 = makeAggregateRelease(accountV1.definition, {
  version: 5,
  rebuildFrom: accountV4,
  models: { counter },
  actors: {},
  system: { createCounter },
});

export const codecCounts = { encodes: 0, decodes: 0 };
const contentCodec = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transform(value => {
      codecCounts.decodes++;
      return `${value}!`;
    }),
    encode: SchemaGetter.transform(value => {
      codecCounts.encodes++;
      return value.slice(0, -1);
    }),
  }),
);
const observeCodec = makeAggregateContractRelease(
  defineAggregateContract('observeCodec'),
  {
    version: 1,
    payload: { content: primitives.json({ schema: contentCodec }) },
    guard: Effect.fn(function* ({ command, payload }) {
      if (
        codecCounts.encodes !== 0 ||
        codecCounts.decodes !== 1 ||
        !Schema.is(Schema.Struct({ content: Schema.String }))(
          command.payload,
        ) ||
        command.payload.content !== 'value!' ||
        payload.content !== 'value!'
      ) {
        return yield* Effect.die(
          new Error('Decoded source codec was evaluated again'),
        );
      }
    }),
    program: () => Effect.void,
  },
);
export const accountV6 = makeAggregateRelease(accountV1.definition, {
  version: 6,
  rebuildFrom: accountV5,
  models: { counter },
  actors: {},
  system: { createCounter, observeCodec },
  extensions: { createCounter: extendCounterV6 },
  external: { sendCounter },
  contracts: { recordSentCounter },
});

export const system = makeSystem({
  name: 'servicePublication',

  aggregates: {
    account: {
      releases: {
        1: accountV1,
        2: accountV2,
        3: accountV3,
        4: accountV4,
        5: accountV5,
        6: accountV6,
      },
    },
  },
  services: {},
});

// oxlint-disable-next-line import/no-default-export -- The production config alias supplies this scenario's System.
export default makeConfig({ system, systemId: 'sys_servicePublication' });
