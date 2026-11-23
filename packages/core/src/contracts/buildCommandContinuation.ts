import '@zerospin/server-only';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeShapeCodecs } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IAnyAggregateRelease } from '../aggregate/types.ts';
import type { IAnyServiceRelease } from '../service/types.ts';

import {
  CommandOutcomeSchema,
  type ICommandOutcome,
} from './CommandOutcomeSchema.ts';
import { encodeContinuationPayload } from './encodeContinuationPayload.ts';
import { getCommandOperationDeclarations } from './operationSchema.ts';
import {
  RecordedCommandSchema,
  type IRecordedCommand,
} from './RecordedCommandSchema.ts';

export const CommandContinuationInputSchema = Schema.Struct({
  recorded: RecordedCommandSchema,
  outcome: Schema.toType(CommandOutcomeSchema),
});
export type ICommandContinuationInput =
  typeof CommandContinuationInputSchema.Type;

/** Build the ordinary command using only the frozen destination payload and finalized outcome. */
export const buildCommandContinuation = Effect.fn('buildCommandContinuation')(
  function* (
    release: IAnyAggregateRelease | IAnyServiceRelease,
    input: {
      recorded: IRecordedCommand;
      outcome: ICommandOutcome;
    },
  ) {
    const { recorded, outcome } = input;
    const { continuation, command, type } = recorded;
    if (continuation === undefined) return null;
    if (release.version !== continuation.ownerVersion) {
      return yield* makeZerospinError('command-continuation-owner-mismatch');
    }
    const result = outcome.result;
    const operations = getCommandOperationDeclarations(
      release,
      continuation.declaration,
    );
    const operation = Object.hasOwn(
      operations ?? {},
      continuation.declaration.operationKey,
    )
      ? operations?.[continuation.declaration.operationKey]
      : undefined;
    if (
      operation?.operationName !== 'command' ||
      operation.contract.commandName !== command.commandName ||
      operation.contract.version !== command.contractVersion ||
      (type === 'aggregate'
        ? operation.destination.aggregate?.name !==
            recorded.command.aggregateName ||
          operation.destination.version !== recorded.command.aggregateVersion
        : operation.destination.service?.name !==
            recorded.command.serviceName ||
          operation.destination.version !== recorded.command.serviceVersion)
    ) {
      return yield* makeZerospinError('command-continuation-unregistered');
    }
    const { onSuccess, onFailure } = operation;
    const branch = result._tag === 'Success' ? onSuccess : onFailure;
    if (branch === undefined) return null;
    if (release.contracts[branch.contract.commandName] !== branch.contract) {
      return yield* makeZerospinError('command-continuation-unregistered');
    }
    const payload = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(
        makeShapeCodecs(operation.contract.payload).portableCompleteCodec,
      ),
    )(command.payload, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'command-continuation-payload-invalid',
        prefix: 'Invalid frozen command operation payload',
      }),
    );
    let build: () => Effect.Effect<unknown, unknown, unknown>;
    if (result._tag === 'Success' && onSuccess !== undefined) {
      const success =
        operation.contract.result === undefined
          ? null
          : yield* Schema.decodeUnknownEffect(operation.contract.result)(
              result.success,
            ).pipe(
              mapParseError({
                code: 'command-continuation-result-invalid',
                prefix: 'Invalid destination command result',
              }),
            );
      build = () => onSuccess.payload({ payload, success });
    } else if (result._tag === 'Failure' && onFailure !== undefined) {
      build = () => onFailure.payload({ payload, failure: result.failure });
    } else {
      return yield* makeZerospinError('command-continuation-unregistered');
    }
    return {
      id: continuation.id,
      ...(yield* encodeContinuationPayload({
        contract: branch.contract,
        build,
        mapperFailureCode: 'command-continuation-payload-builder-failed',
      })),
    };
  },
);
