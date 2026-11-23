import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as SchemaIssue from 'effect/SchemaIssue';

import { makeZerospinError } from './makeZerospinError.js';
import type { IZerospinError } from './types.js';

interface IProps<CODE extends string> {
  readonly code: CODE;
  readonly prefix: string;
  readonly extra?: null | Record<string, unknown>;
}

/** Give schema failures a boundary-specific code; preserve other failures. */
export function mapParseError<CODE extends string>(props: IProps<CODE>) {
  const { code, prefix, extra = null } = props;
  function map<A, E, R>(
    self: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, Exclude<E, Schema.SchemaError> | IZerospinError<CODE>, R>;
  function map<A, E, R>(self: Effect.Effect<A, E, R>) {
    return self.pipe(
      Effect.catchCause(cause =>
        Effect.failCause(
          Cause.map(cause, (error: E) =>
            Schema.isSchemaError(error)
              ? makeZerospinError({
                  code,
                  extra,
                  message: `${prefix}: ${SchemaIssue.makeFormatterDefault()(error.issue)}`,
                })
              : error,
          ),
        ),
      ),
    );
  }
  return map;
}
