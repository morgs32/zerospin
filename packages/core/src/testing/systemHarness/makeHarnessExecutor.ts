import { makeZerospinError, type IAnyError } from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { ICommandOutcome } from '../../contracts/CommandOutcomeSchema.ts';
import type {
  RetainedAggregateCommandSchema,
  RetainedServiceCommandSchema,
} from '../../contracts/CommandSchema.ts';
import type {
  EncodedContinuationPayloadSchema,
  FailedContinuationPayloadSchema,
} from '../../contracts/ContinuationPayloadSchema.ts';
import { decodeAndAdaptPayload } from '../../contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts';
import { DownAdapterRefused } from '../../contracts/DownAdapterRefused.ts';
import { encodeBusinessFailure } from '../../contracts/failureCodec.ts';
import type {
  IAggregateCommand,
  IContractFailure,
  IEncodedCommand,
  IServiceCommand,
} from '../../contracts/types.ts';
import type { makeOwnerReleaseLayerProvider } from '../../execution/provideReleaseLayer.ts';
import type { ISystem } from '../../system/types.ts';

import {
  encodeHarnessCommand,
  executeHarnessCommand,
} from './executeHarnessCommand.ts';
import type { IHarnessStore, IQueuedHarnessWork } from './executionTypes.ts';
import type { makeHarnessStores } from './makeHarnessStores.ts';
import type { makeHarnessAgents } from './reconcileHarnessAgents.ts';
import type { ISystemHarnessCommand } from './types.ts';

type IEncodedHarnessCommand =
  | IEncodedCommand<IAggregateCommand>
  | IEncodedCommand<IServiceCommand>;
type IHarnessExecution = Readonly<{
  command:
    | typeof RetainedAggregateCommandSchema.Type
    | typeof RetainedServiceCommandSchema.Type;
  exit: Exit.Exit<unknown, IContractFailure>;
  outcome: ICommandOutcome;
}>;

const commandKey = (store: IHarnessStore, id: ISystemHarnessCommand['id']) =>
  JSON.stringify([
    store.kind,
    store.release.name,
    store.release.version,
    store.kind === 'aggregate' ? store.aggregateId : null,
    id,
  ]);

/** Own command identity, local outcomes and completion after model commitment. */
export function makeHarnessExecutor(props: {
  system: ISystem;
  agents: Effect.Success<ReturnType<typeof makeHarnessAgents>>;
  stores: Effect.Success<ReturnType<typeof makeHarnessStores>>;
  queue: IQueuedHarnessWork[];
  countExecution: (invocation: string) => Effect.Effect<void, IAnyError>;
  provideReleaseLayer: ReturnType<typeof makeOwnerReleaseLayerProvider>;
}) {
  const { system, stores, queue, countExecution } = props;
  const cache = new Map<string, IHarnessExecution>();

  const executeAtStore = Effect.fn('systemHarness.execute')(function* (
    store: IHarnessStore,
    inputCommand: ISystemHarnessCommand,
    framework = false,
  ) {
    const contract = store.release.contracts[inputCommand.commandName];
    if (contract === undefined) {
      return yield* makeZerospinError('system-harness-contract-unregistered');
    }
    if (contract.version !== inputCommand.contractVersion) {
      return yield* makeZerospinError('contract-payload-version-unsupported');
    }
    yield* props.agents
      .initialize([store])
      .pipe(
        Effect.mapError(() =>
          makeZerospinError('system-harness-agent-initialization-failed'),
        ),
      );
    yield* props.agents.catchUp(store);
    const encoded = yield* encodeHarnessCommand(store, inputCommand);
    const command = {
      ...inputCommand,
      payload: yield* decodeAndAdaptPayload(contract, {
        command: encoded,
      }).pipe(
        Effect.mapError(error =>
          error === DownAdapterRefused
            ? makeZerospinError('contract-down-adapter-refused')
            : error,
        ),
      ),
    };
    const key = commandKey(store, command.id);
    const previous = cache.get(key);
    if (previous !== undefined) {
      if (!isEqual(previous.command, encoded)) {
        return yield* makeZerospinError(
          'system-harness-command-identity-conflict',
        );
      }
      if (previous.outcome.result._tag === 'Success') {
        const entry = store.release.contracts[command.commandName];
        if (entry === undefined) {
          return yield* makeZerospinError(
            'system-harness-contract-unregistered',
          );
        }
        const value =
          entry.result === undefined
            ? undefined
            : yield* Schema.decodeUnknownEffect(entry.result)(
                previous.outcome.result.success,
              ).pipe(
                Effect.updateContext<never, never>(() => Context.empty()),
                Effect.mapError(() =>
                  makeZerospinError('contract-result-decode-failed'),
                ),
              );
        return { ...previous, exit: Exit.succeed(value) };
      }
      return previous;
    }
    yield* countExecution(command.commandName);
    const exit = yield* props.provideReleaseLayer(
      store.release,
      Effect.exit(executeHarnessCommand({ system, store, command, framework })),
    );
    const finalizedAt = new Date(yield* Clock.currentTimeMillis);
    let outcome: ICommandOutcome;
    let resultExit: IHarnessExecution['exit'];
    if (Exit.isSuccess(exit)) {
      outcome = {
        result: { _tag: 'Success', success: exit.value.encodedResult },
        finalizedAt,
      };
      resultExit = Exit.succeed(exit.value.value);
      queue.push(...exit.value.work);
    } else {
      const reason = exit.cause.reasons[0];
      if (
        exit.cause.reasons.length !== 1 ||
        reason === undefined ||
        !Cause.isFailReason(reason) ||
        typeof reason.error !== 'object' ||
        reason.error === null ||
        !('scope' in reason.error)
      ) {
        return yield* Effect.failCause(exit.cause);
      }
      const entry = store.release.contracts[command.commandName];
      if (entry === undefined) {
        return yield* Effect.failCause(exit.cause);
      }
      const failure = yield* encodeBusinessFailure(entry, reason.error);
      outcome = { result: { _tag: 'Failure', failure }, finalizedAt };
      resultExit = Exit.failCause(exit.cause);
    }
    const execution: IHarnessExecution = {
      command: structuredClone(encoded),
      exit: resultExit,
      outcome: structuredClone(outcome),
    };
    cache.set(key, execution);
    props.agents.retainConfirmation(store, command.id);
    yield* props.agents.catchUp(store);
    return execution;
  });

  const execute = (command: ISystemHarnessCommand, framework = false) =>
    Effect.gen(function* () {
      const store = yield* stores.forCommand(command);
      // Keep the owner outcome and its Agent confirmations ordered across pushes, retries and wake scans.
      return yield* store.execution.withPermits(1)(
        executeAtStore(store, command, framework).pipe(Effect.uninterruptible),
      );
    });

  const decodeCommand = Effect.fn('systemHarness.decodeCommand')(function* (
    command: IEncodedHarnessCommand,
  ) {
    const store = yield* stores.forCommand(command);
    const entry = store.release.contracts[command.commandName];
    if (entry === undefined) {
      return yield* makeZerospinError('system-harness-contract-unregistered');
    }
    const contract = entry;
    if (contract.external !== undefined) {
      return yield* makeZerospinError('administrative-contract-unavailable');
    }
    const payload = yield* decodeAndAdaptPayload(contract, { command });
    return { ...command, payload };
  });

  const executeContinuation = Effect.fn('systemHarness.executeContinuation')(
    function* (
      store: IHarnessStore,
      continuation: (
        | typeof EncodedContinuationPayloadSchema.Type
        | typeof FailedContinuationPayloadSchema.Type
      ) & { id: ISystemHarnessCommand['id'] },
    ) {
      const { id, commandName, contractVersion, payload, failure } =
        continuation;
      const common = {
        id,
        commandName,
        contractVersion,
        kind: 'system' as const,
      };
      const command =
        store.kind === 'aggregate'
          ? {
              ...common,
              aggregateId: store.aggregateId,
              aggregateName: store.release.name,
              aggregateVersion: store.release.version,
            }
          : {
              ...common,
              serviceName: store.release.name,
              serviceVersion: store.release.version,
            };
      if (payload !== null) {
        return yield* execute(
          yield* decodeCommand({ ...command, payload }),
          true,
        );
      }

      const retained = { ...command, payload };
      const key = commandKey(store, id);
      const previous = cache.get(key);
      if (previous !== undefined) {
        if (!isEqual(previous.command, retained)) {
          return yield* makeZerospinError(
            'system-harness-command-identity-conflict',
          );
        }
        return previous;
      }
      yield* countExecution(commandName);
      const execution: IHarnessExecution = {
        command: structuredClone(retained),
        exit: Exit.fail(makeZerospinError(failure)),
        outcome: {
          result: { _tag: 'Failure', failure: structuredClone(failure) },
          finalizedAt: new Date(yield* Clock.currentTimeMillis),
        },
      };
      cache.set(key, execution);
      return execution;
    },
  );

  return { execute, decodeCommand, executeContinuation };
}

export type IHarnessExecutor = ReturnType<typeof makeHarnessExecutor>;
