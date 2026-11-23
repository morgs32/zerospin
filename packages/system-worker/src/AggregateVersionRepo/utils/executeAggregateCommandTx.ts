import { DownAdapterRefused } from '@zerospin/core/contracts/DownAdapterRefused';
import { encodeBusinessFailure } from '@zerospin/core/contracts/failureCodec';
import { makeContractReadDb } from '@zerospin/core/contracts/make/makeContractReadDb';
import { withCommandEvaluationClock } from '@zerospin/core/contracts/withCommandEvaluationClock';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { System } from '@zerospin/core/system/System';
import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  mapParseError,
  PublicFailureSchema,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';

import { applyAggregateOperationsTx } from './applyAggregateOperationsTx.js';
import { evaluateAggregateCommand } from './evaluateAggregateCommand.js';
import { prepareAggregateOutput } from './prepareAggregateOutput.js';
import type { readAggregateCommandTx } from './readAggregateCommandTx.js';
import {
  resolveAggregateExecution,
  type IPreparedAggregateReplayPayload,
} from './resolveAggregateExecution.js';

/** Roll back execution before choosing a retained refusal or an outer infrastructure failure. */
export const executeAggregateCommandTx = makeFn(
  'AggregateVersionRepo.executeAggregateCommandTx',
)(function* (
  tx: Parameters<typeof readAggregateCommandTx>[0],
  commandContext: NonNullable<
    Effect.Success<ReturnType<typeof readAggregateCommandTx>>
  >,
  executionAggregateRelease: Parameters<typeof resolveAggregateExecution>[1],
  mode: 'original' | 'replay',
  preparedReplayPayload?: IPreparedAggregateReplayPayload,
) {
  const { command, payloadFailure } = commandContext;
  if (command.payload === null) {
    if (payloadFailure === undefined) {
      return yield* makeZerospinError(
        'aggregate-command-payload-failure-missing',
      );
    }
    return { kind: 'failure' as const, failure: payloadFailure };
  }
  let executionContract:
    | Effect.Success<
        ReturnType<typeof resolveAggregateExecution>
      >['executionContract']
    | undefined;
  const exit = yield* withSavepoint({
    tx,
    program: ({ tx: commandTx }) =>
      Effect.gen(function* () {
        const execution = yield* resolveAggregateExecution(
          command,
          executionAggregateRelease,
          preparedReplayPayload,
        );
        executionContract = execution.executionContract;
        const evaluated = yield* evaluateAggregateCommand(
          commandTx,
          command,
          executionAggregateRelease,
          execution,
        );
        const output = yield* prepareAggregateOutput(
          evaluated.operations,
          commandContext,
          executionAggregateRelease,
          mode,
        );
        const applied = yield* applyAggregateOperationsTx(
          commandTx,
          output,
          commandContext,
        );
        const extension =
          executionAggregateRelease.extensions[
            execution.executionContract.commandName
          ];
        if (extension === undefined) {
          return { result: evaluated.encodedResult, ...applied };
        }
        if (mode === 'replay') {
          let sourceHasExtension: boolean;
          if (preparedReplayPayload?._tag === 'Prepared') {
            sourceHasExtension = preparedReplayPayload.sourceHasExtension;
          } else {
            const system = yield* System;
            const sourceRelease =
              system.aggregates[commandContext.command.aggregateName]?.releases[
                commandContext.command.aggregateVersion
              ];
            if (sourceRelease === undefined) {
              return yield* makeZerospinError('aggregate-version-unsupported');
            }
            sourceHasExtension =
              sourceRelease.extensions[commandContext.command.commandName] !==
              undefined;
          }
          if (!sourceHasExtension) {
            return { result: evaluated.encodedResult, ...applied };
          }
        }
        if (extension.source !== execution.executionContract) {
          return yield* makeZerospinError('contract-extension-source-mismatch');
        }
        if (!('id' in execution.invocation.command)) {
          return yield* makeZerospinError('aggregate-command-scope-mismatch');
        }
        const extensionOperations = yield* extension.evaluate({
          aggregateId: commandContext.command.aggregateId,
          command: execution.invocation.command,
          payload: execution.invocation.payload,
          claims: execution.invocation.claims,
          db: makeContractReadDb({
            db: commandTx,
            models: executionAggregateRelease.models,
          }),
        });
        const extensionOutput = yield* prepareAggregateOutput(
          extensionOperations,
          commandContext,
          executionAggregateRelease,
          mode,
          evaluated.operations.length,
          true,
        );
        const extensionApplied = yield* applyAggregateOperationsTx(
          commandTx,
          extensionOutput,
          commandContext,
        );
        return {
          result: evaluated.encodedResult,
          operations: [...applied.operations, ...extensionApplied.operations],
        };
      }).pipe(Effect.scoped, program =>
        withCommandEvaluationClock(program, commandContext.finalizedAt),
      ),
  }).pipe(Effect.exit);
  if (Exit.isSuccess(exit)) {
    return { kind: 'success' as const, ...exit.value };
  }
  const reason = exit.cause.reasons[0];
  if (exit.cause.reasons.length !== 1 || reason === undefined) {
    return yield* Effect.failCause(exit.cause);
  }
  // Adapter failures, including suspension, abort materialization.
  let failure =
    executionContract !== undefined &&
    Cause.isDieReason(reason) &&
    Cause.isAsyncFiberError(reason.defect)
      ? makeZerospinError({
          code: 'program-must-be-synchronous',
          message:
            'Programs and their capabilities must complete synchronously',
        })
      : Cause.isFailReason(reason)
        ? reason.error
        : undefined;
  if (failure === undefined) return yield* Effect.failCause(exit.cause);
  // Source provenance and input were checked before a local support refusal.
  if (failure === DownAdapterRefused) {
    if (mode !== 'replay' || executionContract !== undefined) {
      return yield* makeZerospinError('contract-down-adapter-refused');
    }
    failure = makeZerospinError('aggregate-contract-unsupported');
  }
  const unsupportedReplayCommand =
    mode === 'replay' && failure.code === 'aggregate-contract-unsupported';
  if (
    mode === 'replay' &&
    executionContract === undefined &&
    !unsupportedReplayCommand
  ) {
    return yield* Effect.failCause(exit.cause);
  }
  if (
    !('scope' in failure) &&
    !unsupportedReplayCommand &&
    ![
      'contract-program-result-invalid',
      'contract-result-encode-failed',
      'contract-result-encoding-invalid',
      'program-must-be-synchronous',
      'contract-guard-result-invalid',
      'operation-row-not-found',
      'operation-referential-integrity-failed',
      'aggregate-guard-failed',
      'aggregate-contract-unsupported',
      'actor-contract-lineage-unsupported',
    ].includes(failure.code)
  ) {
    return yield* Effect.failCause(exit.cause);
  }
  if ('scope' in failure && executionContract === undefined) {
    return yield* Effect.failCause(exit.cause);
  }
  const decodedFailure = yield* Schema.decodeUnknownEffect(PublicFailureSchema)(
    'scope' in failure && executionContract !== undefined
      ? yield* encodeBusinessFailure(executionContract, failure)
      : isZerospinError(failure) && 'cause' in failure
        ? yield* encodeError(failure)
        : failure,
  ).pipe(
    mapParseError({
      code: 'command-failure-invalid',
      prefix: 'Invalid failure',
    }),
  );
  return { kind: 'failure' as const, failure: decodedFailure };
});
