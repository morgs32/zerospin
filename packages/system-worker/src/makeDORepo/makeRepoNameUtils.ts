import type { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import {
  createMatcher,
  type MatchParams,
} from '@remix-run/route-pattern/match';
import {
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinError,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import {
  REPO_KEY_DECODE_FAILED,
  REPO_KEY_ENCODE_FAILED,
} from './repoNameErrors.js';

export type IRepoNameUtils<KEY> = {
  makeName: (
    key: KEY,
  ) => Effect.Effect<
    string,
    IZerospinError<typeof REPO_KEY_ENCODE_FAILED>,
    never
  >;
  parseName: (
    name: string,
  ) => Effect.Effect<KEY, IZerospinError<typeof REPO_KEY_DECODE_FAILED>, never>;
};

/** Stable, dashboard-friendly Durable Object names from a path pattern. */
/*
 * Repo configurations use one path contract for physical-name creation and
 * parsing. The optional abbreviation is an exact prefix; parsing returns caller
 * key fragments only when both prefix and route pattern match.
 *
 * 1. Bind the prefix and route matcher.
 * 2. Encode a Repo key into its physical name.
 * 3. Reject a mismatched name prefix.
 * 4. Match the unprefixed name against the route.
 * 5. Reject names outside the route contract.
 * 6. Return the matched key fields.
 * 7. Return both sides of the name contract.
 */
export function makeRepoNameUtils<const PATTERN extends string, KEY>(props: {
  abbreviation: string | null | undefined;
  namePattern: RoutePattern<PATTERN>;
  keyCodec: Schema.Codec<KEY, MatchParams<PATTERN>>;
}): IRepoNameUtils<KEY> {
  const { abbreviation, namePattern, keyCodec } = props;

  // 1 — append an underscore only when an abbreviation is configured
  const prefix =
    abbreviation === null || abbreviation === undefined
      ? ''
      : `${abbreviation}_`;
  const matcher = createMatcher(namePattern);

  // 2 — create the route href, remove the leading slash, and prepend the exact prefix
  const makeName = Effect.fn('makeName')(function* (key: KEY) {
    const params = yield* Schema.encodeEffect(keyCodec)(key).pipe(
      Effect.mapError(cause =>
        makeZerospinError({
          code: REPO_KEY_ENCODE_FAILED,
          cause: prettyUnknownFailure(cause),
        }),
      ),
    );
    const routeParams = mapValues(params, value =>
      value === undefined ? undefined : String(value),
    );
    return yield* Effect.try({
      try: () =>
        `${prefix}${createHref<string>(namePattern, routeParams).slice(1)}`,
      catch: cause =>
        makeZerospinError({
          code: REPO_KEY_ENCODE_FAILED,
          cause: prettyUnknownFailure(cause),
        }),
    });
  });

  // 3 — fail before attempting to match the route
  const parseName = Effect.fn('parseName')(function* (name: string) {
    if (!name.startsWith(prefix)) {
      return yield* Effect.fail(
        makeZerospinError({
          code: REPO_KEY_DECODE_FAILED,
          cause: `Durable Object name "${name}" does not start with exact prefix "${prefix}"`,
        }),
      );
    }

    // 4 — use a synthetic URL solely for route-pattern parsing
    const routeName = name.slice(prefix.length);
    const match = yield* Effect.try({
      try: () => matcher.match(`http://do.invalid/${routeName}`),
      catch: cause =>
        makeZerospinError({
          code: REPO_KEY_DECODE_FAILED,
          cause: prettyUnknownFailure(cause),
        }),
    });

    // 5 — return repoKeyDecodeFailed instead of partial key fragments
    if (match === null) {
      return yield* Effect.fail(
        makeZerospinError({
          code: REPO_KEY_DECODE_FAILED,
          cause: `Durable Object name "${name}" does not match namePattern after prefix "${prefix}"`,
        }),
      );
    }

    // 6 — expose the route matcher parameters after both checks
    return yield* Schema.decodeEffect(keyCodec)(match.params).pipe(
      Effect.mapError(cause =>
        makeZerospinError({
          code: REPO_KEY_DECODE_FAILED,
          cause: prettyUnknownFailure(cause),
        }),
      ),
    );
  });

  // 7 — share the exact pattern and prefix between lookup and activation
  return { makeName, parseName };
}
