import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import type { IAggregateExternalOperation } from '@zerospin/core/contracts/aggregateExternalOperation';
import type { IServiceExternalOperation } from '@zerospin/core/contracts/serviceExternalOperation';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/shapes';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  PreparedAggregateExternalOperationSchema,
  PreparedExternalOperationSchema,
  PreparedServiceExternalOperationSchema,
} from './externalOperation.js';
import { resolveWorkContract } from './resolveWorkContract.js';

type IExternalOperationInput = {
  initiatingCommandId: string;
  operationIndex: number;
};

/** Freeze one original invocation in the parent's synchronous business transaction. */
const freezeExternalOperation = Effect.fn('freezeExternalOperation')(function* (
  props: IExternalOperationInput & {
    release: IAnyAggregateRelease | IAnyServiceRelease;
    operation: IAggregateExternalOperation | IServiceExternalOperation;
    payload: unknown;
    externalContractName: string;
    externalContractVersion: number;
  },
) {
  const {
    release,
    operation,
    payload: inputPayload,
    initiatingCommandId,
    operationIndex,
    externalContractName,
    externalContractVersion,
  } = props;
  const contract = yield* resolveWorkContract(release, {
    externalContractName,
    externalContractVersion,
  });
  if (contract.external?.definition !== operation.contract) {
    return yield* makeZerospinError('external-emission-unregistered');
  }
  const payload = yield* Schema.decodeUnknownEffect(Schema.Json)(
    inputPayload,
  ).pipe(
    mapParseError({
      code: 'external-payload-json-invalid',
      prefix: 'External payload must encode as JSON',
    }),
  );
  const externalCommandId = yield* makeIdFromAbbreviation({
    abbreviation: 'cmd',
  }).pipe(Effect.provide(NanoIdFactory));
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(PreparedExternalOperationSchema),
  )({
    initiatingCommandId,
    operationIndex,
    externalContractName,
    externalContractVersion,
    payload,
    externalCommandId,
  }).pipe(
    mapParseError({
      code: 'external-operation-invalid',
      prefix: 'Invalid retained external work',
    }),
  );
});

export const prepareAggregateExternalOperation = Effect.fn(
  'prepareAggregateExternalOperation',
)(function* (
  props: IExternalOperationInput & {
    aggregateRelease: IAnyAggregateRelease;
    operation: IAggregateExternalOperation;
  },
) {
  const { aggregateRelease, operation, initiatingCommandId, operationIndex } =
    props;
  const encoded = yield* Schema.encodeEffect(
    operation.contract.externalOperation.schema,
  )(operation, { onExcessProperty: 'error' }).pipe(
    Effect.updateContext<never, never>(() => Context.empty()),
    mapParseError({
      code: 'external-operation-invalid',
      prefix: 'Invalid aggregate external operation',
    }),
  );
  const row = yield* freezeExternalOperation({
    initiatingCommandId,
    operationIndex,
    operation,
    ...encoded,
    release: aggregateRelease,
  });
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(PreparedAggregateExternalOperationSchema),
  )({ ...row, aggregateVersion: aggregateRelease.version }).pipe(
    mapParseError({
      code: 'external-operation-invalid',
      prefix: 'Invalid aggregate external operation',
    }),
  );
});

export const prepareServiceExternalOperation = Effect.fn(
  'prepareServiceExternalOperation',
)(function* (
  props: IExternalOperationInput & {
    serviceRelease: IAnyServiceRelease;
    operation: IServiceExternalOperation;
  },
) {
  const { serviceRelease, operation, initiatingCommandId, operationIndex } =
    props;
  const encoded = yield* Schema.encodeEffect(
    operation.contract.externalOperation.schema,
  )(operation, { onExcessProperty: 'error' }).pipe(
    Effect.updateContext<never, never>(() => Context.empty()),
    mapParseError({
      code: 'external-operation-invalid',
      prefix: 'Invalid service external operation',
    }),
  );
  const row = yield* freezeExternalOperation({
    initiatingCommandId,
    operationIndex,
    operation,
    ...encoded,
    release: serviceRelease,
  });
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(PreparedServiceExternalOperationSchema),
  )({ ...row, serviceVersion: serviceRelease.version }).pipe(
    mapParseError({
      code: 'external-operation-invalid',
      prefix: 'Invalid service external operation',
    }),
  );
});
