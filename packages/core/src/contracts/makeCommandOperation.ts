import { mapParseError, type IZerospinError } from '@zerospin/error';
import { makeShapeCodecs, type IInferPortableRow } from '@zerospin/shapes';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as SchemaParser from 'effect/SchemaParser';
import * as SchemaTransformation from 'effect/SchemaTransformation';

import {
  isAggregateDefinition,
  type IAggregateDefinition,
} from '../aggregate/defineAggregate.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';
import { isServiceDefinition } from '../service/defineService.ts';

import {
  commandContinuationRefs,
  type ICommandContinuationBranches,
  type ICommandContinuationContract,
  type ICommandDestination,
  type ICommandOperation,
  type ICommandOperationProps,
} from './commandOperation.ts';
import {
  isAggregateContract,
  isOrdinaryContract,
  isServiceContract,
} from './make/constructContractRelease.ts';
import {
  makeOperationDefinition,
  type ICommandOperationBinding,
  type IOperationDefinition,
} from './operationDefinition.ts';
import type {
  IAggregateContractRelease,
  IServiceContractRelease,
} from './types.ts';

type ICommandOperationEncoded<
  DESTINATION extends ICommandDestination,
  CONTRACT extends ICommandContinuationContract,
> = Readonly<{
  operationName: 'command';
  family: DESTINATION extends { readonly aggregate: IAggregateDefinition }
    ? 'aggregate'
    : 'service';
  destinationName: DESTINATION extends {
    readonly aggregate: IAggregateDefinition;
  }
    ? DESTINATION['aggregate']['name']
    : DESTINATION extends { readonly service: { readonly name: string } }
      ? DESTINATION['service']['name']
      : never;
  destinationVersion: DESTINATION['version'];
  contractName: CONTRACT['commandName'];
  contractVersion: CONTRACT['version'];
  aggregateId: string | null;
  payload: IInferPortableRow<CONTRACT['payload']>;
  onSuccess?: Readonly<{ commandName: string; version: number }>;
  onFailure?: Readonly<{ commandName: string; version: number }>;
}>;

/** Bind a destination command and optional ordinary continuations in the sending release. */
export function makeCommandOperation<
  const DESTINATION extends ICommandDestination,
  const CONTRACT extends DESTINATION extends {
    readonly aggregate: IAggregateDefinition;
  }
    ? IAggregateContractRelease
    : IServiceContractRelease,
  const SUCCESS extends ICommandContinuationContract,
  const FAILURE extends ICommandContinuationContract,
  SUCCESS_SERVICES = never,
  FAILURE_SERVICES = never,
>(
  props: {
    destination: DESTINATION;
    contract: CONTRACT & {
      readonly external?: undefined;
      readonly claims?: undefined;
    };
  } & ICommandContinuationBranches<
    CONTRACT,
    SUCCESS,
    FAILURE,
    SUCCESS_SERVICES,
    FAILURE_SERVICES
  >,
): IOperationDefinition<
  ICommandOperationProps<DESTINATION, CONTRACT>,
  ICommandOperation<DESTINATION, CONTRACT, SUCCESS_SERVICES, FAILURE_SERVICES>,
  ICommandOperationEncoded<DESTINATION, CONTRACT>,
  IZerospinError<'contract-program-operation-invalid'>
> &
  ICommandOperationBinding<DESTINATION, CONTRACT>;
export function makeCommandOperation(
  props: {
    destination: ICommandDestination;
    contract: ICommandContinuationContract;
  } & ICommandContinuationBranches,
): unknown {
  const { destination, contract } = props;
  const onSuccess = props.onSuccess && Object.freeze({ ...props.onSuccess });
  const onFailure = props.onFailure && Object.freeze({ ...props.onFailure });
  const aggregate =
    'aggregate' in destination && isAggregateDefinition(destination.aggregate);
  const service =
    'service' in destination && isServiceDefinition(destination.service);
  if (aggregate === service || !Schema.is(VersionSchema)(destination.version)) {
    throw new Error(
      'Command operations require a canonical owner definition and release version',
    );
  }
  if (
    !(aggregate
      ? isAggregateContract(contract)
      : isServiceContract(contract)) ||
    !isOrdinaryContract(contract) ||
    contract.claims !== undefined
  ) {
    throw new Error(
      'Command operations require a claims-free ordinary contract of the destination family',
    );
  }
  const owner = aggregate ? destination.aggregate : destination.service;
  if (owner === undefined) {
    throw new Error('Command operation owner is missing');
  }
  const family = aggregate ? 'aggregate' : 'service';
  const payload = makeShapeCodecs(contract.payload).portableCompleteCodec;
  for (const branch of [onSuccess, onFailure]) {
    if (
      branch !== undefined &&
      (!(
        isAggregateContract(branch.contract) ||
        isServiceContract(branch.contract)
      ) ||
        !isOrdinaryContract(branch.contract) ||
        branch.contract.claims !== undefined ||
        typeof branch.payload !== 'function')
    ) {
      throw new Error(
        'Command continuations require claims-free ordinary contracts',
      );
    }
  }
  const branches = {
    ...(onSuccess === undefined ? {} : { onSuccess }),
    ...(onFailure === undefined ? {} : { onFailure }),
  };
  const branchSchema = <BRANCH extends object>(branch: BRANCH | undefined) =>
    Schema.optionalKey(
      branch === undefined
        ? Schema.Never
        : Schema.declare((value): value is BRANCH => value === branch),
    );
  const branchRefSchema = (branch: ICommandContinuationContract | undefined) =>
    Schema.optionalKey(
      branch === undefined
        ? Schema.Never
        : Schema.Struct({
            commandName: Schema.Literal(branch.commandName),
            version: Schema.Literal(branch.version),
          }),
    );
  const branchRefs = commandContinuationRefs(branches);
  const domain = Schema.Struct({
    operationName: Schema.Literal('command'),
    destination: Schema.declare(
      (value): value is typeof destination => value === destination,
    ),
    contract: Schema.declare(
      (value): value is typeof contract => value === contract,
    ),
    aggregateId: aggregate ? Schema.NonEmptyString : Schema.Null,
    payload: Schema.toType(payload),
    onSuccess: branchSchema(onSuccess),
    onFailure: branchSchema(onFailure),
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
    operationName: Schema.Literal('command'),
    family: Schema.Literal(family),
    destinationName: Schema.Literal(owner.name),
    destinationVersion: Schema.Literal(destination.version),
    contractName: Schema.Literal(contract.commandName),
    contractVersion: Schema.Literal(contract.version),
    aggregateId: aggregate ? Schema.NonEmptyString : Schema.Null,
    payload,
    onSuccess: branchRefSchema(onSuccess?.contract),
    onFailure: branchRefSchema(onFailure?.contract),
  });
  const schema = portable.pipe(
    Schema.decodeTo(
      ownedDomain,
      SchemaTransformation.transform({
        decode: (operation): typeof domain.Type => ({
          operationName: operation.operationName,
          destination,
          contract,
          aggregateId: operation.aggregateId,
          payload: operation.payload,
          ...branches,
        }),
        encode: (operation): typeof portable.Type => ({
          operationName: operation.operationName,
          family,
          destinationName: owner.name,
          destinationVersion: destination.version,
          contractName: contract.commandName,
          contractVersion: contract.version,
          aggregateId: operation.aggregateId,
          payload: operation.payload,
          ...branchRefs,
        }),
      }),
    ),
  );

  const input = aggregate
    ? Schema.Struct({
        payload: Schema.toType(payload),
        aggregateId: Schema.NonEmptyString,
      })
    : Schema.Struct({
        payload: Schema.toType(payload),
      });
  return makeOperationDefinition(
    schema,
    (value: unknown) =>
      Effect.suspend(() =>
        Schema.decodeUnknownEffect(input)(value, {
          onExcessProperty: 'error',
        }).pipe(
          Effect.flatMap(decoded =>
            Schema.decodeUnknownEffect(Schema.toType(schema))(
              {
                operationName: 'command',
                destination,
                contract,
                aggregateId:
                  'aggregateId' in decoded ? decoded.aggregateId : null,
                payload: decoded.payload,
                ...branches,
              },
              { onExcessProperty: 'error' },
            ),
          ),
          Effect.updateContext<never, never>(() => Context.empty()),
          mapParseError({
            code: 'contract-program-operation-invalid',
            prefix: 'Invalid destination command operation',
          }),
        ),
      ),
    {
      operationName: 'command',
      destination,
      contract,
      ...branches,
    },
  );
}
