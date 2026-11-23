import { annotateFunctionSpan } from '#function-span-annotation';
import * as Effect from 'effect/Effect';
import type * as Tracer from 'effect/Tracer';

type IBody = (
  this: unknown,
  ...args: unknown[]
) =>
  | Generator<Effect.Effect<unknown, unknown, unknown>, unknown, never>
  | Effect.Effect<unknown, unknown, unknown>;
type ITransform = (effect: unknown, ...args: unknown[]) => unknown;

function isBody(value: unknown): value is IBody {
  return typeof value === 'function';
}

/** Let Effect own tracing; transform its completed outcome outside the span. */
export function makeFn(
  name: string,
  options?: Tracer.SpanOptionsNoTrace,
): Effect.fn.Traced;
export function makeFn(
  name: string,
  options?: Tracer.SpanOptionsNoTrace,
): unknown {
  const trace = Effect.fn(name, options);
  return function (
    optionsOrBody: IBody | { readonly self: unknown },
    ...transforms: Array<ITransform>
  ) {
    const body = isBody(optionsOrBody) ? optionsOrBody : transforms.shift();
    if (!isBody(body)) {
      throw new TypeError('makeFn requires a function body');
    }
    const boundSelf = isBody(optionsOrBody) ? undefined : optionsOrBody;
    const traced: IBody = trace(
      boundSelf === undefined ? body : body.bind(boundSelf.self),
      annotateFunctionSpan,
    );
    const wrapped = function (this: unknown, ...args: unknown[]) {
      let result: unknown = traced.apply(this, args);
      for (const transform of transforms) result = transform(result, ...args);
      return result;
    };
    Object.defineProperty(wrapped, 'length', { value: body.length });
    return wrapped;
  };
}
