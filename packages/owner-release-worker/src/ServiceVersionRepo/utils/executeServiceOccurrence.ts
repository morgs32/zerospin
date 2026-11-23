import { DownAdapterRefused } from '@zerospin/core/contracts/DownAdapterRefused';
import { encodeBusinessFailure } from '@zerospin/core/contracts/failureCodec';
import { makeContractReadDb } from '@zerospin/core/contracts/make/makeContractReadDb';
import { withCommandEvaluationClock } from '@zerospin/core/contracts/withCommandEvaluationClock';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
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

import { applyServiceOutputTx } from './applyServiceOutputTx.js';
import { evaluateServiceCommand } from './evaluateServiceCommand.js';
import { prepareServiceOutput } from './prepareServiceOutput.js';
import type { readServiceOccurrenceTx } from './readServiceOccurrenceTx.js';
import { resolveServiceExecution } from './resolveServiceExecution.js';

/** Roll back execution before choosing a retained refusal or an outer infrastructure failure. */
export const executeServiceOccurrence = makeFn(
  'ServiceVersionRepo.executeServiceOccurrence',
)(function* (
  tx: Parameters<typeof readServiceOccurrenceTx>[0],
  occurrence: NonNullable<
    Effect.Success<ReturnType<typeof readServiceOccurrenceTx>>
  >,
  executionRelease: Parameters<typeof resolveServiceExecution>[1],
  mode: 'original' | 'replay',
  preparedReplayInput?: Parameters<typeof resolveServiceExecution>[2],
) {
  const { command, payloadFailure } = occurrence;
  if (command.payload === null) {
    if (payloadFailure === undefined) {
      return yield* makeZerospinError(
        'service-command-payload-failure-missing',
      );
    }
    return { kind: 'failure' as const, failure: payloadFailure };
  }
  let executionContract:
    | Effect.Success<
        ReturnType<typeof resolveServiceExecution>
      >['executionContract']
    | undefined;
  const exit = yield* withSavepoint({
    tx,
    program: ({ tx: commandTx }) =>
      Effect.gen(function* () {
        const execution = yield* resolveServiceExecution(
          command,
          executionRelease,
          preparedReplayInput,
        );
        executionContract = execution.executionContract;
        const evaluated = yield* evaluateServiceCommand(
          commandTx,
          command,
          executionRelease,
          execution,
        );
        const output = yield* prepareServiceOutput(
          evaluated.operations,
          occurrence,
          executionRelease,
          mode,
        );
        const { operations } = yield* applyServiceOutputTx(
          commandTx,
          output,
          occurrence,
        );
        const extension = executionRelease.extensions[command.commandName];
        if (
          extension &&
          (mode === 'original' || execution.sourceHasExtension)
        ) {
          if (extension.source !== execution.executionContract) {
            return yield* makeZerospinError(
              'contract-extension-source-mismatch',
            );
          }
          const extensionOperations = yield* extension.evaluate({
            command: {
              ...command,
              payload: execution.invocation.command.payload,
            },
            payload: execution.invocation.payload,
            claims: execution.invocation.claims,
            db: makeContractReadDb({
              db: commandTx,
              models: executionRelease.models,
            }),
          });
          const extensionOutput = yield* prepareServiceOutput(
            extensionOperations,
            occurrence,
            executionRelease,
            mode,
            evaluated.operations.length,
          );
          const appliedExtension = yield* applyServiceOutputTx(
            commandTx,
            extensionOutput,
            occurrence,
          );
          operations.push(...appliedExtension.operations);
        }
        return { result: evaluated.encodedResult, operations };
      }).pipe(Effect.scoped, program =>
        withCommandEvaluationClock(program, occurrence.finalizedAt),
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
    failure = makeZerospinError('service-contract-unsupported');
  }
  const unsupportedReplayCommand =
    mode === 'replay' && failure.code === 'service-contract-unsupported';
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
      'contract-payload-version-unsupported',
      'service-contract-unsupported',
      'service-contract-lineage-unsupported',
      'actor-guard-failed',
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
