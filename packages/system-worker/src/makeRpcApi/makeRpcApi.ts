import {
  makeZerospinError,
  type IErrorJson,
  type IZerospinError,
} from '@zerospin/error';
import {
  captureTelemetry,
  makeFn,
  type ISpanLinkRecord,
  type ITraceContext,
  type TelemetryCollector,
} from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as SchemaIssue from 'effect/SchemaIssue';
import * as SchemaTransformation from 'effect/SchemaTransformation';
import { mapValues } from 'es-toolkit';

import { reportRpcTelemetry } from '../reportRpcTelemetry/reportRpcTelemetry.js';
import { reportWorkerFailure } from '../reportWorkerFailure/reportWorkerFailure.js';
import { RepoServicesLive } from '../repoServices/RepoServicesLive.js';
import { runWorkerPromise } from '../workerConfiguration/workerConfiguration.js';
import { WorkerTelemetry } from '../WorkerTelemetry/WorkerTelemetry.js';

const execute = Symbol('makeRpcApi.execute');
type IWorkerServices = Layer.Success<typeof RepoServicesLive>;
type IRpcMethodDefinition = {
  readonly name: string;
  readonly schema: Schema.Top;
  readonly [execute]: (
    request: unknown,
  ) => Effect.Effect<unknown, never, unknown>;
};
type IMethods<M extends Record<string, IRpcMethodDefinition>> = {
  [K in keyof M]: (
    request: M[K]['schema']['Encoded'],
  ) => Promise<Effect.Success<ReturnType<M[K][typeof execute]>>>;
};
type IRequiredServices<M extends Record<string, IRpcMethodDefinition>> =
  Exclude<
    Effect.Services<ReturnType<M[keyof M][typeof execute]>>,
    IWorkerServices
  >;
type IConstructor<M extends Record<string, IRpcMethodDefinition>> = new (
  ...args: [IRequiredServices<M>] extends [never]
    ? []
    : [Layer.Layer<IRequiredServices<M>>]
) => RpcTarget & IMethods<M>;

/** Install declared Promise-returning methods on a native RPC prototype. */
export function makeRpcApi<M extends Record<string, IRpcMethodDefinition>>(
  name: string,
  methods: M,
): IConstructor<M>;
export function makeRpcApi(
  name: string,
  methods: Record<string, IRpcMethodDefinition>,
): unknown {
  class Api extends RpcTarget {
    readonly #initialized: Layer.Layer<never>;

    constructor(initialized: Layer.Layer<never> = Layer.empty) {
      super();
      this.#initialized = initialized;
      // Native private fields and symbol members are unreachable by string RPC dispatch.
      // Reject inherited public bypasses even when a subclass escaped source lint.
      let prototype = new.target.prototype;
      while (prototype !== Api.prototype) {
        if (
          Object.getOwnPropertyNames(prototype).some(
            member => member !== 'constructor',
          )
        ) {
          throw new Error(
            `${name}: public subclass members must be declared RPC methods`,
          );
        }
        prototype = Object.getPrototypeOf(prototype);
      }
    }

    [execute](method: IRpcMethodDefinition, request: unknown) {
      return runWorkerPromise(
        method[execute](request).pipe(
          Effect.provide(this.#initialized),
          Effect.provide(RepoServicesLive),
          Effect.tapCause(cause =>
            Effect.sync(() =>
              reportWorkerFailure({ boundary: method.name, cause }),
            ),
          ),
        ),
      );
    }
  }
  mapValues(methods, (method, methodName) => {
    if (
      !method ||
      !Schema.isSchema(method.schema) ||
      typeof method[execute] !== 'function' ||
      method.name !== `${name}.${methodName}` ||
      methodName in Api.prototype ||
      methodName === 'then' ||
      methodName === '__proto__'
    ) {
      throw new Error(
        `${name}.${methodName}: invalid or colliding RPC method definition`,
      );
    }
    Object.defineProperty(Api.prototype, methodName, {
      value(this: Api, request: unknown) {
        return this[execute](method, request);
      },
      configurable: false,
      writable: false,
    });
  });
  return Api;
}

type IOutcome<L extends boolean, A> = L extends true
  ? { result: A; link: ISpanLinkRecord | null }
  : A;
type IEncoded<E, C extends string> = IErrorJson<E | IZerospinError<C>>;
export interface IMethod<
  S extends Schema.Top,
  A,
  E,
  R,
  Success,
  Failure,
  L extends boolean,
  C extends string,
> {
  readonly name: string;
  readonly schema: S;
  readonly fn: (
    input: S['Type'],
  ) =>
    | Generator<Effect.Effect<unknown, E, R>, A, never>
    | Effect.Effect<A, E, R>;
  readonly onSuccess: (success: A) => Success;
  readonly onFailure: (failure: IEncoded<E, C>) => Failure;
  readonly [execute]: (
    request: unknown,
  ) => Effect.Effect<
    IOutcome<L, Success | Failure>,
    never,
    Exclude<R | S['DecodingServices'], TelemetryCollector> | WorkerTelemetry
  >;
}
type IDomainEffect<P> =
  P extends Generator<infer Eff, infer A, never>
    ? Effect.Effect<A, Effect.Error<Eff>, Effect.Services<Eff>>
    : P;
export interface IMethodBuilder<
  S extends Schema.Top,
  C extends string,
  L extends boolean,
> {
  <
    P extends
      | Generator<Effect.Effect<unknown, unknown, unknown>, unknown, never>
      | Effect.Effect<unknown, unknown, unknown>,
    Success,
    Failure,
  >(
    fn: (input: S['Type']) => P,
    callbacks: {
      onSuccess: (success: Effect.Success<IDomainEffect<P>>) => Success;
      onFailure: (
        failure: IEncoded<Effect.Error<IDomainEffect<P>>, C>,
      ) => Failure;
    },
  ): IMethod<
    S,
    Effect.Success<IDomainEffect<P>>,
    Effect.Error<IDomainEffect<P>>,
    Effect.Services<IDomainEffect<P>>,
    Success,
    Failure,
    L,
    C
  >;
}
type IMethodOptions<
  S extends Schema.Top,
  C extends string,
  L extends boolean,
> = {
  name: string;
  schema: S;
  parseError:
    | { code: C; prefix: string }
    | ((error: Schema.SchemaError, input: unknown) => IZerospinError<C>);
  linked?: L;
};

/** Contextually type a separately authored schema/body/outcome method definition. */
export function rpcMethod<
  S extends Schema.Top,
  C extends string,
  L extends boolean = false,
>(options: IMethodOptions<S, C, L>): IMethodBuilder<S, C, L>;
export function rpcMethod(
  options: IMethodOptions<Schema.Top, string, boolean>,
): unknown {
  if (
    !Schema.isSchema(options.schema) ||
    !options.name ||
    !options.parseError ||
    (typeof options.parseError !== 'function' &&
      (typeof options.parseError.code !== 'string' ||
        typeof options.parseError.prefix !== 'string'))
  ) {
    throw new Error('Invalid RPC method schema or parse-error policy');
  }
  return function (
    fn: (
      input: unknown,
    ) =>
      | Generator<Effect.Effect<unknown, unknown, unknown>, unknown, never>
      | Effect.Effect<unknown, unknown, unknown>,
    callbacks: {
      onSuccess: (success: unknown) => unknown;
      onFailure: (failure: unknown) => unknown;
    },
  ) {
    if (
      typeof fn !== 'function' ||
      typeof callbacks?.onSuccess !== 'function' ||
      typeof callbacks?.onFailure !== 'function'
    ) {
      throw new Error(
        `${options.name}: invalid domain body or outcome callbacks`,
      );
    }
    const annotated = makeFn(options.name, { root: true })(function* (
      protectedRequest: Redacted.Redacted<unknown>,
    ) {
      const request = Redacted.value(protectedRequest);
      const decodedRequest = yield* Schema.decodeUnknownEffect(options.schema)(
        request,
        { onExcessProperty: 'error' },
      ).pipe(
        Effect.mapError(error =>
          typeof options.parseError === 'function'
            ? options.parseError(error, request)
            : makeZerospinError({
                code: options.parseError.code,
                message: `${options.parseError.prefix}: ${SchemaIssue.makeFormatterDefault()(error.issue)}`,
              }),
        ),
      );
      const program = fn(decodedRequest);
      return yield* Effect.isEffect(program)
        ? program
        : Effect.gen(() => program);
    });
    return {
      ...options,
      fn,
      ...callbacks,
      [execute]: (request: unknown) =>
        Effect.uninterruptibleMask(restore =>
          Effect.gen(function* () {
            const capture = yield* captureTelemetry(
              restore(annotated(Redacted.make(request))),
            );
            const { envelope, link } = yield* reportRpcTelemetry({
              capture,
              methodName: options.name,
              request,
              emit: (yield* WorkerTelemetry).emit,
            });
            const { result } = envelope;
            const converted =
              result._tag === 'Success'
                ? callbacks.onSuccess(result.success)
                : callbacks.onFailure(result.failure);
            return options.linked ? { result: converted, link } : converted;
          }),
        ),
    };
  };
}

/** Existing argument-envelope policy: validate only args; retain transport context internally. */
export function rpcRequestSchema<A, E, RD, RE>(
  args: Schema.Codec<A, E, RD, RE>,
): Schema.Codec<
  A,
  Readonly<{ args: E; traceContext: ITraceContext | null }>,
  RD,
  RE
> {
  return Schema.StructWithRest(
    Schema.Struct({
      args,
      traceContext: Schema.declare<ITraceContext | null>(
        (_input): _input is ITraceContext | null => true,
      ),
    }),
    [Schema.Record(Schema.String, Schema.Unknown)],
  ).pipe(
    Schema.decodeTo(
      Schema.toType(args),
      SchemaTransformation.transform({
        decode: request => request.args,
        encode: args => ({ args, traceContext: null }),
      }),
    ),
  );
}
