import * as Data from 'effect/Data';
import * as Schema from 'effect/Schema';
import * as SchemaGetter from 'effect/SchemaGetter';

import { defaultErrorMessages } from './defaultErrorMessages.js';
import { frameworkExtra } from './frameworkExtra.js';

export type IErrorExtra = Readonly<Record<string, unknown>> | null;
type IErrorProps<CODE extends string> = {
  code: CODE;
  message?: string;
  status?: number | null;
  cause?: string | null;
  extra?: unknown;
};

export class ZerospinError<CODE extends string = string> extends Data.Error<{
  readonly _tag: 'ZerospinError';
  readonly code: CODE;
  readonly message: string;
  readonly status: number | null;
  readonly cause: string | null;
  readonly extra: unknown;
}> {
  constructor(props: IErrorProps<CODE>) {
    const { code, message, status, cause, extra } = props;
    super({
      _tag: 'ZerospinError',
      code,
      message: message ?? defaultErrorMessages.get(code) ?? code,
      status: status ?? null,
      cause: cause ?? null,
      extra: extra ?? null,
    });
  }

  static schema<const CODE extends string>(props: {
    code: CODE;
    message?: string;
    extra?: typeof Schema.Null;
  }): ReturnType<typeof makeFrameworkSchema<CODE, typeof Schema.Null>>;

  static schema<
    const CODE extends string,
    EXTRA extends Schema.Codec<IErrorExtra, unknown>,
  >(props: {
    code: CODE;
    message?: string;
    extra: EXTRA;
  }): ReturnType<typeof makeFrameworkSchema<CODE, EXTRA>>;

  static schema(props: {
    code: string;
    message?: string;
    extra?: Schema.Codec<IErrorExtra, unknown>;
  }): unknown {
    const { extra, ...errorFields } = props;
    return makeFrameworkSchema({ ...errorFields, extra: extra ?? Schema.Null });
  }
}

function makeFrameworkSchema<
  const CODE extends string,
  EXTRA extends Schema.Codec<IErrorExtra, unknown>,
>(props: { code: CODE; message?: string; extra: EXTRA }) {
  const { code, extra: extraSchema } = props;
  const extraCodec: Schema.Codec<EXTRA['Type'], EXTRA['Encoded']> = extraSchema;
  const wire = Schema.Struct({
    _tag: Schema.Literal('ZerospinError'),
    code: Schema.Literal(code),
    message: Schema.String,
    status: Schema.NullOr(Schema.Number),
    extra: extraCodec,
  });
  type IJson = typeof wire.Encoded;
  type IRuntime = ZerospinError<CODE> & {
    readonly extra: EXTRA['Type'];
    toJson(): IJson;
  };
  function make(
    ...args: [EXTRA['Type']] extends [null]
      ? [input?: Omit<IErrorProps<CODE>, 'code' | 'extra'> & { extra?: null }]
      : [
          input: Omit<IErrorProps<CODE>, 'code' | 'extra'> & {
            extra: EXTRA['Type'];
          },
        ]
  ): IRuntime;
  function make(input?: Omit<IErrorProps<CODE>, 'code'>): IRuntime {
    return constructRuntime(input ?? {});
  }
  function constructRuntime(input: Omit<IErrorProps<CODE>, 'code'>): IRuntime {
    const extra = Schema.decodeUnknownSync(Schema.toType(extraSchema))(
      input.extra === undefined && extraSchema === Schema.Null
        ? null
        : input.extra,
    );
    const error = Object.assign(
      new ZerospinError({ ...props, ...input, code, extra }),
      { extra },
    );
    return Object.assign(error, {
      toJson: (): IJson => {
        const encoded = Schema.encodeSync(wire)({
          _tag: 'ZerospinError',
          code,
          message: error.message,
          status: error.status,
          extra: error.extra,
        });
        return Schema.decodeUnknownSync(Schema.toEncoded(wire))({
          ...encoded,
          extra: frameworkExtra(encoded.extra),
        });
      },
    });
  }
  const runtime = Schema.declare<IRuntime>(
    (value): value is IRuntime =>
      value instanceof ZerospinError &&
      !('scope' in value) &&
      value.code === code &&
      Schema.is(Schema.toType(extraSchema))(value.extra) &&
      'toJson' in value &&
      typeof value.toJson === 'function',
  );
  const codec = wire.pipe(
    Schema.decodeTo(runtime, {
      decode: SchemaGetter.transform(value => constructRuntime(value)),
      encode: SchemaGetter.transform(value =>
        Schema.decodeSync(wire)(value.toJson()),
      ),
    }),
  );
  return Schema.make<typeof codec & { make: typeof make }>(codec.ast, {
    name: code,
    make,
  });
}

type IScopedProps<
  CODE extends string,
  EXTRA extends IErrorExtra,
> = IErrorProps<CODE> & { extra: EXTRA };

export class ContractError<
  CODE extends string,
  EXTRA extends IErrorExtra,
> extends ZerospinError<CODE> {
  readonly scope = 'contract';
  override readonly extra: EXTRA;

  constructor(props: IScopedProps<CODE, EXTRA>) {
    const { code, message, extra } = props;
    super({ ...props, message: message ?? code });
    this.extra = extra;
  }

  static override schema<const CODE extends string>(props: {
    code: CODE;
    extra?: typeof Schema.Null;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      typeof Schema.Null,
      'contract',
      ContractError<CODE, null>
    >
  >;

  static override schema<
    const CODE extends string,
    EXTRA extends Schema.Codec<IErrorExtra, unknown>,
  >(props: {
    code: CODE;
    extra: EXTRA;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      EXTRA,
      'contract',
      ContractError<CODE, EXTRA['Type']>
    >
  >;

  static override schema(props: {
    code: string;
    extra?: Schema.Codec<IErrorExtra, unknown>;
  }): unknown {
    const { code, extra } = props;

    return makeScopedSchema(
      { code, extra: extra ?? Schema.Null },
      'contract',
      input => new ContractError(input),
    );
  }
}

export class ActorError<
  CODE extends string,
  EXTRA extends IErrorExtra,
> extends ZerospinError<CODE> {
  readonly scope = 'actor';
  override readonly extra: EXTRA;

  constructor(props: IScopedProps<CODE, EXTRA>) {
    const { code, message, extra } = props;
    super({ ...props, message: message ?? code });
    this.extra = extra;
  }

  static override schema<const CODE extends string>(props: {
    code: CODE;
    extra?: typeof Schema.Null;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      typeof Schema.Null,
      'actor',
      ActorError<CODE, null>
    >
  >;

  static override schema<
    const CODE extends string,
    EXTRA extends Schema.Codec<IErrorExtra, unknown>,
  >(props: {
    code: CODE;
    extra: EXTRA;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      EXTRA,
      'actor',
      ActorError<CODE, EXTRA['Type']>
    >
  >;

  static override schema(props: {
    code: string;
    extra?: Schema.Codec<IErrorExtra, unknown>;
  }): unknown {
    const { code, extra } = props;

    return makeScopedSchema(
      { code, extra: extra ?? Schema.Null },
      'actor',
      input => new ActorError(input),
    );
  }
}

export class AggregateError<
  CODE extends string,
  EXTRA extends IErrorExtra,
> extends ZerospinError<CODE> {
  readonly scope = 'aggregate';
  override readonly extra: EXTRA;

  constructor(props: IScopedProps<CODE, EXTRA>) {
    const { code, message, extra } = props;
    super({ ...props, message: message ?? code });
    this.extra = extra;
  }

  static override schema<const CODE extends string>(props: {
    code: CODE;
    extra?: typeof Schema.Null;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      typeof Schema.Null,
      'aggregate',
      AggregateError<CODE, null>
    >
  >;

  static override schema<
    const CODE extends string,
    EXTRA extends Schema.Codec<IErrorExtra, unknown>,
  >(props: {
    code: CODE;
    extra: EXTRA;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      EXTRA,
      'aggregate',
      AggregateError<CODE, EXTRA['Type']>
    >
  >;

  static override schema(props: {
    code: string;
    extra?: Schema.Codec<IErrorExtra, unknown>;
  }): unknown {
    const { code, extra } = props;

    return makeScopedSchema(
      { code, extra: extra ?? Schema.Null },
      'aggregate',
      input => new AggregateError(input),
    );
  }
}

export type IScopedError =
  | ContractError<string, IErrorExtra>
  | ActorError<string, IErrorExtra>
  | AggregateError<string, IErrorExtra>;

function makeScopedSchema<
  const CODE extends string,
  EXTRA extends Schema.Codec<IErrorExtra, unknown>,
  const SCOPE extends IScopedError['scope'],
  ERROR extends ZerospinError<CODE> & {
    readonly scope: SCOPE;
    readonly extra: EXTRA['Type'];
  },
>(
  props: { code: CODE; extra: EXTRA },
  scope: SCOPE,
  construct: (props: IScopedProps<CODE, EXTRA['Type']>) => ERROR,
) {
  const { extra: inputExtra, code } = props;

  const extraCodec: Schema.Codec<EXTRA['Type'], EXTRA['Encoded']> = inputExtra;
  const wire = Schema.Struct({
    _tag: Schema.Literal('ZerospinError'),
    code: Schema.Literal(code),
    scope: Schema.Literal(scope),
    message: Schema.String,
    status: Schema.NullOr(Schema.Number),
    extra: extraCodec,
  });
  type IJson = typeof wire.Encoded;
  type IRuntime = ERROR & { toJson(): IJson };
  function make(
    ...args: [EXTRA['Type']] extends [null]
      ? [input?: Omit<IErrorProps<CODE>, 'code' | 'extra'> & { extra?: null }]
      : [input: Omit<IScopedProps<CODE, EXTRA['Type']>, 'code'>]
  ): IRuntime;
  function make(input?: Omit<IErrorProps<CODE>, 'code'>): IRuntime {
    return constructRuntime(input ?? {});
  }
  function constructRuntime(input: Omit<IErrorProps<CODE>, 'code'>): IRuntime {
    const extra = Schema.decodeUnknownSync(Schema.toType(inputExtra))(
      input.extra === undefined && inputExtra === Schema.Null
        ? null
        : input.extra,
    );
    const error = construct({ ...input, code, extra });
    return Object.assign(error, {
      toJson: (): IJson =>
        Schema.encodeSync(wire)({
          _tag: 'ZerospinError',
          code: error.code,
          scope,
          message: error.message,
          status: error.status,
          extra: error.extra,
        }),
    });
  }
  const runtime = Schema.declare<IRuntime>(
    (value): value is IRuntime =>
      value instanceof ZerospinError &&
      'scope' in value &&
      value.scope === scope &&
      value.code === code &&
      Schema.is(Schema.toType(inputExtra))(value.extra) &&
      'toJson' in value &&
      typeof value.toJson === 'function',
  );
  const codec = wire.pipe(
    Schema.decodeTo(runtime, {
      decode: SchemaGetter.transform(value => constructRuntime(value)),
      encode: SchemaGetter.transform(value => ({
        _tag: 'ZerospinError' as const,
        code: value.code,
        scope,
        message: value.message,
        status: value.status,
        extra: value.extra,
      })),
    }),
  );
  return Schema.make<typeof codec & { make: typeof make }>(codec.ast, {
    name: code,
    make,
  });
}
