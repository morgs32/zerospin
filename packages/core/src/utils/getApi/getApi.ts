import {
  encodeError,
  ensureZerospinError,
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
  type IErrorJson,
} from '@zerospin/error';
import {
  LinkedRpcEnvelopeSchema,
  readSpanTraceContext,
  TelemetryCollector,
  type ILinkedRpcEnvelope,
  type IRpcRequest,
} from '@zerospin/logger';
import { type RpcTarget } from 'capnweb';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';

import { newSyncRpcSession } from './newSyncRpcSession/newSyncRpcSession.ts';

export type IApiFailure = IErrorJson<IAnyError>;

type IApiMethod<METHOD> = [METHOD] extends [
  (request: IRpcRequest<infer ARGS>) => infer RESULT,
]
  ? [Awaited<RESULT>] extends [ILinkedRpcEnvelope<infer A, infer E>]
    ? (...args: ARGS) => Effect.Effect<A, E | IApiFailure>
    : never
  : never;

// Map shared capability keys together instead of distributing over receivers.
type IApiMethods<T, KEYS extends keyof T> = {
  [K in KEYS as IApiMethod<T[K]> extends never ? never : K]: IApiMethod<T[K]>;
};
export type IApi<T> = IApiMethods<T, keyof T>;

/**
 * Return a reusable Effect-facing API without opening a session.
 * Each execution opens one HTTP batch and synchronously selects a capability.
 * Selectors must only select capabilities; prepare the admission request before calling getApi.
 * Concurrent calls use separate batches. No retries or shared session state.
 * A body-less Request can supply headers; each execution clones the template.
 */
export function getApi<ROOT extends RpcTarget>(
  apiUrl: string | Request,
): <TARGET extends object>(
  select: (root: ReturnType<typeof newSyncRpcSession<ROOT>>) => TARGET,
) => Effect.Effect<IApi<TARGET>>;
export function getApi(apiUrl: string | Request) {
  let endpoint = '[invalid endpoint]';
  try {
    const url = new URL(typeof apiUrl === 'string' ? apiUrl : apiUrl.url);
    endpoint = url.origin + (url.pathname === '/' ? '' : url.pathname);
  } catch {
    // Do not echo credentials from an unparseable endpoint.
  }
  return (
    select: (root: ReturnType<typeof newSyncRpcSession<RpcTarget>>) => object,
  ) =>
    Effect.sync(
      () =>
        new Proxy(
          {},
          {
            get(_target, method) {
              // An API is neither a Promise nor a remotely disposable capability.
              if (typeof method !== 'string' || method === 'then') {
                return undefined;
              }
              return (...args: unknown[]) =>
                Effect.gen(function* () {
                  const traceContext = yield* Effect.currentSpan.pipe(
                    Effect.map(readSpanTraceContext),
                    Effect.orElseSucceed(() => null),
                  );

                  const extra = { endpoint, method, ...(traceContext ?? {}) };
                  const selectionFailure = (error: unknown) =>
                    ensureZerospinError({
                      code: 'rpc-selection-failed',
                      error,
                      message: `Could not select the RPC API for ${method} at ${endpoint}.`,
                      extra: { ...extra, phase: 'selection' },
                    });
                  const session = yield* Effect.acquireRelease(
                    Effect.try({
                      try: () => newSyncRpcSession<RpcTarget>(apiUrl),
                      catch: selectionFailure,
                    }),
                    session => Effect.sync(() => session[Symbol.dispose]()),
                  );
                  const target = yield* Effect.try({
                    try: () => select(session),
                    catch: selectionFailure,
                  });
                  const settled = yield* Effect.tryPromise({
                    try: () =>
                      Promise.resolve(
                        Reflect.apply(Reflect.get(target, method), target, [
                          { traceContext, args },
                        ]),
                      ),
                    catch: cause => {
                      if (
                        !(
                          cause instanceof TypeError &&
                          /^(Failed to fetch|fetch failed|Load failed|NetworkError when attempting to fetch resource\.?)$/.test(
                            cause.message,
                          )
                        )
                      ) {
                        throw cause;
                      }
                      return makeZerospinError({
                        code: 'rpc-invocation-failed',
                        message: `RPC ${method} at ${endpoint} failed before a usable result was available.`,
                        cause: prettyUnknownFailure(cause),
                        extra: {
                          ...extra,
                          phase: 'invocation',
                          networkUnavailable: true,
                        },
                      });
                    },
                  });
                  const envelope = Schema.decodeUnknownResult(
                    LinkedRpcEnvelopeSchema,
                  )(settled);

                  if (Result.isFailure(envelope)) {
                    return yield* Effect.fail(
                      makeZerospinError({
                        code: 'rpc-invalid-response',
                        message: `RPC ${method} at ${endpoint} returned an invalid result envelope.`,
                        cause: prettyUnknownFailure(envelope.failure),
                        extra: { ...extra, phase: 'response' },
                      }),
                    );
                  }
                  const collector =
                    yield* Effect.serviceOption(TelemetryCollector);
                  if (
                    envelope.success.link !== null &&
                    Option.isSome(collector)
                  ) {
                    collector.value.merge({
                      spans: [],
                      logs: [],
                      links: [envelope.success.link],
                    });
                  }
                  if (envelope.success.result._tag === 'Failure') {
                    return yield* Effect.fail(envelope.success.result.failure);
                  }
                  return envelope.success.result.success;
                }).pipe(
                  Effect.catch(failure =>
                    isZerospinError(failure)
                      ? encodeError(failure).pipe(Effect.flatMap(Effect.fail))
                      : Effect.fail(failure),
                  ),
                  Effect.scoped,
                );
            },
          },
        ),
    );
}
