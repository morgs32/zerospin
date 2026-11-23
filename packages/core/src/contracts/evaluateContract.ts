import { mapParseError } from '@zerospin/error';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { runAuthoredCallback } from '../execution/runAuthoredCallback.ts';

import { validateFailure } from './failureCodec.ts';
import { scopeContractReadDb } from './make/makeContractReadDb.ts';
import type {
  IOperationDefinitions,
  IRecordingOperations,
} from './operationDefinition.ts';
import {
  assertReadProjection,
  makeProjectedReadModels,
} from './readProjection.ts';
import { validateContractResult } from './resultCodec.ts';
import { runContractGuard } from './runContractGuard.ts';
import type {
  IContractRelease,
  IContractCallbackInput,
  IContractFailure,
  IContractOutput,
  IContractProgramInput,
} from './types.ts';

const isolateCodec = <A, E>(program: Effect.Effect<A, E>) =>
  program.pipe(Effect.updateContext<never, never>(() => Context.empty()));

export function makeRecordingOperations<
  DEFINITIONS extends IOperationDefinitions,
>(
  definitions: DEFINITIONS,
  recorded: IContractOutput[],
): IRecordingOperations<DEFINITIONS>;
export function makeRecordingOperations(
  definitions: IOperationDefinitions,
  recorded: IContractOutput[],
): unknown {
  return mapValues(
    definitions,
    definition => (props: never) =>
      Effect.suspend(() => definition.make(props)).pipe(
        Effect.tap(operation => Effect.sync(() => recorded.push(operation))),
        Effect.asVoid,
      ),
  );
}

/** Run the shared program and validate its complete output without applying operations. */
export const evaluateContract = Effect.fn('evaluateContract')(
  function* (props: {
    contract: Pick<
      IContractRelease,
      | 'payload'
      | 'claims'
      | 'failures'
      | 'commandName'
      | 'version'
      | 'external'
      | 'models'
      | 'result'
      | 'operations'
      | 'operationsSchema'
    >;
    callbacks: {
      guard: (
        input: IContractCallbackInput,
      ) => Effect.Effect<void, IContractFailure, unknown>;
      program: (
        input: IContractProgramInput<IContractCallbackInput>,
      ) => Effect.Effect<unknown, IContractFailure, unknown>;
    };
    input: Omit<IContractCallbackInput, 'failures'>;
  }) {
    const { contract, callbacks, input } = props;
    const projectedModels = new Set(Object.keys(contract.models));
    mapValues(contract.models, (projection, name) =>
      assertReadProjection({
        projection,
        projectedModels,
        model: input.db.models[name],
        context: `Contract ${contract.commandName}`,
      }),
    );
    const db = scopeContractReadDb(
      input.db,
      makeProjectedReadModels(contract.models),
    );
    const callbackInput = { ...input, failures: contract.failures, db };
    yield* runContractGuard({
      contract,
      guard: callbacks.guard,
      input: callbackInput,
    });
    const recorded: IContractOutput[] = [];
    const operations = makeRecordingOperations(contract.operations, recorded);
    const authored = Effect.suspend(() =>
      callbacks.program({ ...callbackInput, operations }),
    );
    const resultValue = yield* runAuthoredCallback({
      program: authored,
      code: 'contract-program-failed',
      validateBusinessFailure: failure =>
        validateFailure(contract, failure, 'contract'),
    });
    const batch = yield* isolateCodec(
      Schema.decodeUnknownEffect(Schema.toType(contract.operationsSchema))(
        recorded,
        {
          onExcessProperty: 'error',
        },
      ).pipe(
        mapParseError({
          code: 'contract-program-operation-invalid',
          prefix: 'Invalid complete contract operation batch',
        }),
      ),
    );
    const result = yield* validateContractResult(contract, resultValue);
    return { operations: Object.freeze([...batch]), result };
  },
);
export type IEvaluateContractError = Effect.Error<
  ReturnType<typeof evaluateContract>
>;
