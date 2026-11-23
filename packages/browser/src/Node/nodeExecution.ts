import { makeAggregateNodeOptimisticView } from '@zerospin/core/AggregateNode/makeAggregateNodeOptimisticView';
import type { IAggregateNodeDefinition } from '@zerospin/core/AggregateNode/types';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import type { ISqliteClient } from '@zerospin/core/drizzle/types';
import { makeServiceNodeOptimisticView } from '@zerospin/core/ServiceNode/makeServiceNodeOptimisticView';
import type { IServiceNodeDefinition } from '@zerospin/core/ServiceNode/types';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { makeServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import type { IServiceSessionDefinition } from '@zerospin/core/serviceSession/types';
import type {
  IAggregateSessionReplayRequirements,
  IServiceSessionReplayRequirements,
} from '@zerospin/core/sessionExecution/requirements';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import { isEqual } from 'es-toolkit';

import type { IAggregateNodeRequest } from '../AggregateNode/aggregateNodeRequest.ts';
import type { IServiceNodeRequest } from '../ServiceNode/serviceNodeRequest.ts';

import { closeNodeStorageOwner } from './closeNodeStorageOwner.ts';

export type INodeExecution<D> = Readonly<{
  sessionDefinition: D;
  layer?: Layer.Layer<unknown, IAnyError>;
}>;

export type INodeExecutionRequirements<D> = Exclude<
  D extends IAggregateSessionDefinition
    ? IAggregateSessionReplayRequirements<D>
    : D extends IServiceSessionDefinition
      ? IServiceSessionReplayRequirements<D>
      : never,
  CuidFactory | MonotonicFactory
>;

export type IAssertNodeExecutions<
  S extends readonly INodeExecution<unknown>[],
> = {
  [K in keyof S]: [
    INodeExecutionRequirements<S[K]['sessionDefinition']>,
  ] extends [never]
    ? unknown
    : {
        layer: Layer.Layer<
          INodeExecutionRequirements<S[K]['sessionDefinition']>,
          IAnyError
        >;
      };
};

function openExecution(layer: Layer.Layer<unknown, IAnyError> | undefined) {
  return ManagedRuntime.make(
    Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory, layer ?? Layer.empty),
  );
}

export function assertAggregateNodeRequest(
  sessionDefinition: IAggregateSessionDefinition,
  request: IAggregateNodeRequest,
) {
  if (
    sessionDefinition.systemName !== request.systemName ||
    sessionDefinition.aggregateName !== request.aggregateName ||
    sessionDefinition.aggregateVersion !== request.aggregateVersion ||
    sessionDefinition.sessionName !== request.sessionName ||
    !isEqual(
      makeAggregateSessionSpec(sessionDefinition).aggregateSessionLock,
      request.lock,
    )
  ) {
    throw makeZerospinError('node-session-definition-mismatch');
  }
}

/** Select the exact authored Aggregate session definition before opening its projection runtime. */
export async function openAggregateNodeExecution(
  registration: INodeExecution<IAggregateSessionDefinition>,
  definition: IAggregateNodeDefinition,
  openMemory?: () => Promise<ISqliteClient>,
  signal?: AbortSignal,
  onCleanupFailure?: (error: unknown) => void,
) {
  const { sessionDefinition } = registration;
  assertAggregateNodeRequest(sessionDefinition, {
    ...definition.identity,
    lock: definition.lock,
  });
  if (
    sessionDefinition.actorName !== definition.identity.actorName ||
    sessionDefinition.actorVersion !== definition.identity.actorVersion
  ) {
    throw makeZerospinError('node-session-definition-mismatch');
  }
  const runtime = openExecution(registration.layer);
  try {
    await runtime.runPromise(Effect.void, { signal });
    const view = await makeAggregateNodeOptimisticView({
      sessionDefinition,
      openMemory,
      runSync: program => runtime.runSync(program),
    });
    return {
      view,
      close: () => closeNodeStorageOwner({ node: view, runtime }),
    };
  } catch (error) {
    await runtime
      .dispose()
      .catch(cleanupError => onCleanupFailure?.(cleanupError));
    throw error;
  }
}

export function assertServiceNodeRequest(
  sessionDefinition: IServiceSessionDefinition,
  request: IServiceNodeRequest,
) {
  if (
    sessionDefinition.systemName !== request.systemName ||
    sessionDefinition.serviceName !== request.serviceName ||
    sessionDefinition.serviceVersion !== request.serviceVersion ||
    sessionDefinition.sessionName !== request.sessionName ||
    !isEqual(
      makeServiceSessionSpec(sessionDefinition).serviceSessionLock,
      request.lock,
    )
  ) {
    throw makeZerospinError('node-session-definition-mismatch');
  }
}

/** Select the exact authored Service session definition before opening its projection runtime. */
export async function openServiceNodeExecution(
  registration: INodeExecution<IServiceSessionDefinition>,
  definition: IServiceNodeDefinition,
  openMemory?: () => Promise<ISqliteClient>,
  signal?: AbortSignal,
  onCleanupFailure?: (error: unknown) => void,
) {
  const { sessionDefinition } = registration;
  assertServiceNodeRequest(sessionDefinition, {
    ...definition.identity,
    lock: definition.lock,
  });
  if (
    sessionDefinition.actorName !== definition.identity.actorName ||
    sessionDefinition.actorVersion !== definition.identity.actorVersion
  ) {
    throw makeZerospinError('node-session-definition-mismatch');
  }
  const runtime = openExecution(registration.layer);
  try {
    await runtime.runPromise(Effect.void, { signal });
    const view = await makeServiceNodeOptimisticView({
      sessionDefinition,
      openMemory,
      runSync: program => runtime.runSync(program),
    });
    return {
      view,
      close: () => closeNodeStorageOwner({ node: view, runtime }),
    };
  } catch (error) {
    await runtime
      .dispose()
      .catch(cleanupError => onCleanupFailure?.(cleanupError));
    throw error;
  }
}
