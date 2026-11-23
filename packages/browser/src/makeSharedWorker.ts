import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import type { IServiceSessionDefinition } from '@zerospin/core/serviceSession/types';
import { makeZerospinError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

import { makeAggregateSharedWorker } from './AggregateNode/makeAggregateSharedWorker.ts';
import { reportWorkerConnectionFailure } from './Node/makeWorkerConnectionDiagnostics.ts';
import type {
  IAssertNodeExecutions,
  INodeExecution,
} from './Node/nodeExecution.ts';
import { makeServiceSharedWorker } from './ServiceNode/makeServiceSharedWorker.ts';
import { parseSharedWorkerName } from './sharedWorkerNames.ts';
import { makeStandaloneSharedWorker } from './StandaloneNode/makeStandaloneSharedWorker.ts';

function isServiceSessionDefinition(
  sessionDefinition: IAggregateSessionDefinition | IServiceSessionDefinition,
): sessionDefinition is IServiceSessionDefinition {
  return 'kind' in sessionDefinition && sessionDefinition.kind === 'service';
}

/** One worker entry runs the single session selected by its name. */
export function makeSharedWorker<
  const E extends INodeExecution<
    IAggregateSessionDefinition | IServiceSessionDefinition
  >,
>(
  props: {
    sqliteWasmUrl: string;
  } & E &
    IAssertNodeExecutions<readonly [NoInfer<E>]>[0],
) {
  const { sqliteWasmUrl, sessionDefinition, layer } = props;
  const error = (event: ErrorEvent) => {
    reportWorkerConnectionFailure({
      scope: 'worker',
      phase: 'worker.runtime',
      reason: 'worker-error',
      sharedWorkerUrl: globalThis.location?.href,
      event,
    });
  };
  const unhandledRejection = (event: PromiseRejectionEvent) => {
    reportWorkerConnectionFailure({
      scope: 'worker',
      phase: 'worker.runtime',
      reason: 'unhandled-rejection',
      sharedWorkerUrl: globalThis.location?.href,
      error: event.reason,
    });
  };
  globalThis.addEventListener('error', error);
  globalThis.addEventListener('unhandledrejection', unhandledRejection);
  const stopObserving = () => {
    globalThis.removeEventListener('error', error);
    globalThis.removeEventListener('unhandledrejection', unhandledRejection);
  };
  try {
    const { name } = Schema.decodeUnknownSync(
      Schema.Struct({ name: Schema.String }),
    )(globalThis);
    const parsed = parseSharedWorkerName(name);
    const input = { sqliteWasmUrl, name };
    const execution =
      layer === undefined
        ? { sessionDefinition }
        : { sessionDefinition, layer };
    if (isServiceSessionDefinition(sessionDefinition)) {
      if (parsed.kind !== 'service') {
        throw makeZerospinError('node-session-definition-mismatch');
      }
      const close = makeServiceSharedWorker({
        ...input,
        routingKey: parsed.routingKey,
        execution: execution as INodeExecution<IServiceSessionDefinition>,
      });
      return () => {
        stopObserving();
        return close();
      };
    }
    if (parsed.kind === 'service') {
      throw makeZerospinError('node-session-definition-mismatch');
    }
    const aggregateExecution =
      execution as INodeExecution<IAggregateSessionDefinition>;
    if (parsed.kind === 'aggregate') {
      const close = makeAggregateSharedWorker({
        ...input,
        routingKey: parsed.routingKey,
        execution: aggregateExecution,
      });
      return () => {
        stopObserving();
        return close();
      };
    }
    const standalone = makeStandaloneSharedWorker({
      ...input,
      sessionKey: parsed.sessionKey,
      execution: aggregateExecution,
    });
    return {
      close() {
        stopObserving();
        return standalone.close();
      },
    };
  } catch (failure) {
    stopObserving();
    reportWorkerConnectionFailure({
      scope: 'worker',
      phase: 'worker.initialize',
      reason: 'worker-initialization-failed',
      sharedWorkerUrl: globalThis.location?.href,
      error: failure,
    });
    throw failure;
  }
}
