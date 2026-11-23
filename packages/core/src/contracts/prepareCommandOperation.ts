import '@zerospin/server-only';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IAnyAggregateRelease } from '../aggregate/types.ts';
import type { IAnyServiceRelease } from '../service/types.ts';
import { NanoIdFactory } from '../utils/NanoIdFactory.ts';

import type { ICommandOperation } from './commandOperation.ts';
import { encodePayload } from './encodePayload.ts';
import { isOrdinaryContract } from './make/constructContractRelease.ts';
import { getCommandOperationDeclarations } from './operationSchema.ts';
import {
  RecordedCommandSchema,
  type CommandOperationDeclarationSchema,
} from './RecordedCommandSchema.ts';

/** Allocate and encode once, inside the original source execution transaction. Replay never calls this. */
export const prepareCommandOperation = Effect.fn('prepareCommandOperation')(
  function* (props: {
    operation: ICommandOperation;
    sourceRelease: IAnyAggregateRelease | IAnyServiceRelease;
    declaration: typeof CommandOperationDeclarationSchema.Type;
  }) {
    const { operation, sourceRelease, declaration } = props;
    const { destination, contract, aggregateId } = operation;
    const aggregate =
      'aggregate' in destination && destination.aggregate !== undefined;
    const owner = aggregate ? destination.aggregate : destination.service;
    if (owner === undefined) {
      return yield* makeZerospinError(
        'command-operation-destination-unregistered',
      );
    }
    const operations = getCommandOperationDeclarations(
      sourceRelease,
      declaration,
    );
    const operationKey = Object.keys(operations ?? {}).find(key => {
      const leaf = operations?.[key];
      return (
        leaf?.operationName === 'command' &&
        leaf.contract === contract &&
        leaf.destination === destination &&
        leaf.onSuccess === operation.onSuccess &&
        leaf.onFailure === operation.onFailure
      );
    });
    if (
      operationKey === undefined ||
      !isOrdinaryContract(contract) ||
      contract.claims !== undefined
    ) {
      return yield* makeZerospinError(
        'command-operation-destination-unregistered',
      );
    }
    const payload = yield* encodePayload(contract, {
      version: contract.version,
      payload: operation.payload,
    });
    const id = yield* makeIdFromAbbreviation({ abbreviation: 'cmd' }).pipe(
      Effect.provide(NanoIdFactory),
    );
    let continuation;
    if (
      operation.onSuccess !== undefined ||
      operation.onFailure !== undefined
    ) {
      for (const branch of [operation.onSuccess, operation.onFailure]) {
        if (
          branch !== undefined &&
          sourceRelease.contracts[branch.contract.commandName] !==
            branch.contract
        ) {
          return yield* makeZerospinError('command-continuation-unregistered');
        }
      }
      continuation = {
        id: yield* makeIdFromAbbreviation({ abbreviation: 'cmd' }).pipe(
          Effect.provide(NanoIdFactory),
        ),
        ownerVersion: sourceRelease.version,
        declaration: { ...declaration, operationKey },
      };
    }
    const command = {
      id,
      commandName: contract.commandName,
      contractVersion: contract.version,
      payload,
      kind: 'system',
    };
    const recorded = yield* Schema.decodeUnknownEffect(RecordedCommandSchema)(
      aggregate
        ? {
            type: 'aggregate',
            ...(continuation === undefined ? {} : { continuation }),
            command: {
              ...command,
              aggregateName: owner.name,
              aggregateVersion: destination.version,
              aggregateId,
            },
          }
        : {
            type: 'service',
            ...(continuation === undefined ? {} : { continuation }),
            command: {
              ...command,
              serviceName: owner.name,
              serviceVersion: destination.version,
            },
          },
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'command-operation-invalid',
        prefix: 'Invalid frozen destination command',
      }),
    );
    Object.freeze(recorded.command);
    return Object.freeze(recorded);
  },
);
