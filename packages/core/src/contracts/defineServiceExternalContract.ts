import { mapParseError, type IZerospinError } from '@zerospin/error';
import {
  captureShape,
  isAttributeDescriptor,
  makeShapeCodecs,
  type IInferPortableRow,
} from '@zerospin/shapes';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as SchemaParser from 'effect/SchemaParser';
import * as SchemaTransformation from 'effect/SchemaTransformation';

import { VersionSchema } from '../declaration/VersionSchema.ts';
import type { IInferCommandPayload } from '../models/types.ts';

import type { IPayloadFieldDescriptor } from './make/constructContractRelease.ts';
import {
  makeOperationDefinition,
  type IExternalOperationBinding,
  type IOperationDefinition,
} from './operationDefinition.ts';
import type { IServiceExternalOperation } from './serviceExternalOperation.ts';

const definitionBrand: unique symbol = Symbol('service external definition');
export interface IServiceExternalContractDefinition<
  NAME extends string = string,
  VERSION extends number = number,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor> = Record<
    string,
    IPayloadFieldDescriptor
  >,
  RESPONSE extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
> {
  readonly [definitionBrand]: true;
  readonly commandName: NAME;
  readonly version: VERSION;
  readonly payload: Readonly<PAYLOAD>;
  readonly response: RESPONSE;
  readonly timeoutMs: number;
  readonly externalOperation: IServiceExternalOperationDefinition<
    IServiceExternalContractDefinition<NAME, VERSION, PAYLOAD, RESPONSE>
  >;
}
export type IServiceExternalOperationProps<
  CONTRACT extends IServiceExternalContractDefinition,
> = Readonly<{
  payload: IInferCommandPayload<CONTRACT['payload']>;
}>;
export type IServiceExternalOperationDefinition<
  CONTRACT extends IServiceExternalContractDefinition,
> = IOperationDefinition<
  IServiceExternalOperationProps<CONTRACT>,
  IServiceExternalOperation<CONTRACT>,
  {
    readonly operationName: 'external';
    readonly externalContractName: CONTRACT['commandName'];
    readonly externalContractVersion: CONTRACT['version'];
    readonly payload: IInferPortableRow<CONTRACT['payload']>;
  },
  IZerospinError<'external-emission-unregistered'>
> &
  IExternalOperationBinding<'service'> &
  Readonly<{
    contractName: CONTRACT['commandName'];
    contractVersion: CONTRACT['version'];
    payload: CONTRACT['payload'];
  }>;

const definitions = new WeakSet<object>();
export function isServiceExternalContractDefinition(
  value: unknown,
): value is IServiceExternalContractDefinition {
  return typeof value === 'object' && value !== null && definitions.has(value);
}

/** Declare portable external work without importing provider or external command authority. */
export function defineServiceExternalContract<
  const NAME extends string,
  const VERSION extends number,
  const PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  RESPONSE extends Schema.Codec<unknown, unknown>,
>(props: {
  name: NAME;
  version: VERSION;
  payload: PAYLOAD;
  response: RESPONSE;
  timeoutMs?: number;
}): IServiceExternalContractDefinition<NAME, VERSION, PAYLOAD, RESPONSE> {
  Schema.decodeUnknownSync(
    Schema.Struct({
      name: Schema.NonEmptyString,
      version: VersionSchema,
      payload: Schema.Record(
        Schema.String,
        Schema.declare(
          (value: unknown): value is IPayloadFieldDescriptor =>
            isAttributeDescriptor(value) &&
            value.references === undefined &&
            value.primaryKey !== true,
        ),
      ),
      response: Schema.declare(
        (value: unknown): value is Schema.Codec<unknown, unknown> =>
          Schema.isSchema(value),
      ),
      timeoutMs: Schema.optionalKey(
        Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
      ),
    }),
    { onExcessProperty: 'error' },
  )(props);
  const { name, version, payload, response, timeoutMs } = props;

  type IExternalContract = IServiceExternalContractDefinition<
    NAME,
    VERSION,
    PAYLOAD,
    RESPONSE
  >;
  const capturedPayload = captureShape(payload);
  const payloadCodec = makeShapeCodecs(capturedPayload).portableCompleteCodec;
  const domain = Schema.Struct({
    operationName: Schema.Literal('external'),
    contract: Schema.declare(
      (value): value is IExternalContract => value === definition,
    ),
    payload: Schema.toType(payloadCodec),
  });
  const ownedDomain = Schema.declareConstructor<typeof domain.Type>()(
    [domain],
    ([codec]) =>
      (value, _ast, options) =>
        SchemaParser.decodeUnknownEffect(codec)(value, options).pipe(
          Effect.map(operation =>
            Object.freeze({
              ...operation,
              payload: structuredClone(operation.payload),
            }),
          ),
        ),
  );
  const portable = Schema.Struct({
    operationName: Schema.Literal('external'),
    externalContractName: Schema.Literal(name),
    externalContractVersion: Schema.Literal(version),
    payload: payloadCodec,
  });
  const schema = portable.pipe(
    Schema.decodeTo(
      ownedDomain,
      SchemaTransformation.transform({
        decode: operation => ({
          operationName: operation.operationName,
          contract: definition,
          payload: operation.payload,
        }),
        encode: operation => ({
          operationName: operation.operationName,
          externalContractName: name,
          externalContractVersion: version,
          payload: operation.payload,
        }),
      }),
    ),
  );
  const externalOperation = makeOperationDefinition(
    schema,
    (operationProps: IServiceExternalOperationProps<IExternalContract>) =>
      Effect.suspend(() =>
        Schema.decodeUnknownEffect(Schema.toType(schema))(
          {
            operationName: 'external',
            contract: definition,
            ...operationProps,
          },
          { onExcessProperty: 'error' },
        ).pipe(
          Effect.updateContext<never, never>(() => Context.empty()),
          mapParseError({
            code: 'external-emission-unregistered',
            prefix: 'Invalid service external operation',
          }),
        ),
      ),
    {
      operationName: 'external',
      family: 'service',
      contractName: name,
      contractVersion: version,
      payload: capturedPayload,
    },
  );
  const definition: IExternalContract = {
    [definitionBrand]: true,
    commandName: name,
    version,
    payload: capturedPayload,
    response,
    timeoutMs: timeoutMs ?? 30_000,
    externalOperation,
  };
  definitions.add(definition);
  return definition;
}
