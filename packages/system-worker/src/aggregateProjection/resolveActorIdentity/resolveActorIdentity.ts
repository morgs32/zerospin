import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import type { IAnyAggregateActorRelease } from '@zerospin/core/aggregateActor/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/** Resolve decoded query bindings and encoded partition fields from a canonical actor path. */
export const resolveActorIdentity = Effect.fn('resolveActorIdentity')(
  function* (props: { actor: IAnyAggregateActorRelease; actorPath: string }) {
    const { actor, actorPath } = props;
    const matched = yield* Effect.try({
      try: () =>
        createMatcher(actor.identity.pattern).match(
          new URL(actorPath, 'https://actor.invalid'),
        ),
      catch: () =>
        makeZerospinError({
          code: 'actor-path-invalid',
          message: 'Invalid actor path',
        }),
    });
    const selectedClaims = yield* Schema.decodeUnknownEffect(
      actor.identity.identitySchema,
    )(matched?.params, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'actor-path-invalid',
        prefix: 'Invalid actor fields',
      }),
    );
    const selectionBindings = yield* Schema.decodeUnknownEffect(
      Schema.Record(Schema.String, Schema.String),
    )(selectedClaims).pipe(
      mapParseError({
        code: 'actor-path-invalid',
        prefix: 'Selection fields must be strings',
      }),
    );
    const encoded = yield* Schema.encodeEffect(actor.identity.identitySchema)(
      selectedClaims,
    ).pipe(
      mapParseError({
        code: 'actor-path-invalid',
        prefix: 'Invalid actor encoding',
      }),
    );
    const encodedIdentity = yield* Schema.decodeUnknownEffect(
      Schema.Record(Schema.String, Schema.String),
    )(encoded).pipe(
      mapParseError({
        code: 'actor-path-invalid',
        prefix: 'Actor fields must encode as strings',
      }),
    );
    if (
      matched === null ||
      createHref(actor.identity.pattern, encodedIdentity) !== actorPath
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'actor-path-noncanonical',
          message: 'Actor path must be canonical',
        }),
      );
    }
    return { selectionBindings, encodedIdentity };
  },
);
