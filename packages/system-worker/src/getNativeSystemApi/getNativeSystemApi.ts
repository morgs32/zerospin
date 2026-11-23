import '@zerospin/server-only';
import type { ISystemId } from '@zerospin/core/system/types';
import type { ISystemApi } from '@zerospin/core/systemApi/ISystemApi';
import type { IApiFailure } from '@zerospin/core/utils/getApi/getApi';
import { makeSystemApi } from '@zerospin/core/utils/getSystemApi/makeSystemApi';
import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  LinkedRpcEnvelopeSchema,
  readSpanTraceContext,
  TelemetryCollector,
  type ILinkedRpcEnvelope,
  type ITraceContext,
} from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

import { SystemApi } from '../SystemApi/SystemApi.js';

/** Invoke one native capability method and consume its linked result. */
const invoke = <A, E extends IZerospinErrorJson>(
  method: string,
  request: (
    traceContext: ITraceContext | null,
  ) => Promise<ILinkedRpcEnvelope<A, E>>,
): Effect.Effect<A, E | IApiFailure> =>
  Effect.gen(function* () {
    const traceContext = yield* Effect.currentSpan.pipe(
      Effect.map(readSpanTraceContext),
      Effect.orElseSucceed(() => null),
    );
    const envelope = yield* Effect.tryPromise({
      try: () => request(traceContext),
      catch: cause =>
        makeZerospinError({
          code: 'rpc-invocation-failed',
          message: `Native SystemApi.${method} failed before a usable result was available.`,
          cause: prettyUnknownFailure(cause),
          extra: { method, phase: 'invocation', ...traceContext },
        }),
    });
    if (!Schema.is(LinkedRpcEnvelopeSchema)(envelope)) {
      return yield* makeZerospinError({
        code: 'rpc-invalid-response',
        message: `Native SystemApi.${method} returned an invalid result envelope.`,
        extra: { method, phase: 'response', ...traceContext },
      });
    }
    const collector = yield* Effect.serviceOption(TelemetryCollector);
    if (envelope.link !== null && Option.isSome(collector)) {
      collector.value.merge({ spans: [], logs: [], links: [envelope.link] });
    }
    return yield* envelope.result._tag === 'Failure'
      ? Effect.fail(envelope.result.failure)
      : Effect.succeed(envelope.result.success);
  }).pipe(
    Effect.catch(
      (failure): Effect.Effect<never, E | IApiFailure> =>
        isZerospinError(failure)
          ? encodeError(failure).pipe(Effect.flatMap(Effect.fail))
          : Effect.fail(failure),
    ),
  );

/** Acquire the typed administrative interface from an existing trusted System identity. */
export function getNativeSystemApi(systemId: ISystemId): ISystemApi {
  const api = new SystemApi(systemId);
  return makeSystemApi({
    rpc: {
      healthcheck: () =>
        invoke('healthcheck', traceContext =>
          api.healthcheck({ args: [], traceContext }),
        ),
      initialize: (...args) =>
        invoke('initialize', traceContext =>
          api.initialize({ args, traceContext }),
        ),
      executeServiceQuery: query =>
        invoke('executeServiceQuery', traceContext =>
          api.executeServiceQuery({ args: [query], traceContext }),
        ),
      executeAggregateQuery: query =>
        invoke('executeAggregateQuery', traceContext =>
          api.executeAggregateQuery({ args: [query], traceContext }),
        ),
      executeAggregateCommand: command =>
        invoke('executeAggregateCommand', traceContext =>
          api.executeAggregateCommand({ args: [command], traceContext }),
        ),
      executeServiceCommand: command =>
        invoke('executeServiceCommand', traceContext =>
          api.executeServiceCommand({ args: [command], traceContext }),
        ),
      getRepoRegistrations: query =>
        invoke('getRepoRegistrations', traceContext =>
          api.getRepoRegistrations({ args: [query], traceContext }),
        ),
      getRepoTableRows: query =>
        invoke('getRepoTableRows', traceContext =>
          api.getRepoTableRows({ args: [query], traceContext }),
        ),
      preflightDeployment: request =>
        invoke('preflightDeployment', traceContext =>
          api.preflightDeployment({ args: [request], traceContext }),
        ),
      acceptSystemSpec: (...args) =>
        invoke('acceptSystemSpec', traceContext =>
          api.acceptSystemSpec({ args, traceContext }),
        ),
      getExecutingWorkerVersion: () =>
        invoke('getExecutingWorkerVersion', traceContext =>
          api.getExecutingWorkerVersion({ args: [], traceContext }),
        ),
      makeSystemSpec: () =>
        invoke('makeSystemSpec', traceContext =>
          api.makeSystemSpec({ args: [], traceContext }),
        ),
      openAggregateAgentSession: request =>
        invoke('openAggregateAgentSession', traceContext =>
          api.openAggregateAgentSession({ args: [request], traceContext }),
        ),
      openServiceAgentSession: request =>
        invoke('openServiceAgentSession', traceContext =>
          api.openServiceAgentSession({ args: [request], traceContext }),
        ),
      getAgentAggregateIds: query =>
        invoke('getAgentAggregateIds', traceContext =>
          api.getAgentAggregateIds({ args: [query], traceContext }),
        ),
    },
  });
}
