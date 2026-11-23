import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import type { IActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

/** Derive only actor partition fields and prove their canonical path is reversible. */
export const makeActorSelection = makeFn('ActorAdmission.makeActorSelection')(
  function* (props: {
    identity: Pick<IActorIdentity, 'identitySchema' | 'pattern'>;
    claims: Readonly<Record<string, unknown>>;
  }) {
    const { identity, claims } = props;

    // 1 — select and validate only the actorPath identity fields
    const actorIdentityFields = Object.fromEntries(
      Object.keys(identity.identitySchema.fields).map(field => [
        field,
        claims[field],
      ]),
    );
    const actorIdentity = yield* Schema.decodeUnknownEffect(
      Schema.toType(identity.identitySchema),
    )(actorIdentityFields, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'identity-selection-invalid',
        prefix: 'Invalid selection claims',
      }),
    );
    const encodedActorIdentity = yield* Schema.encodeEffect(
      identity.identitySchema,
    )(actorIdentity).pipe(
      mapParseError({
        code: 'identity-selection-invalid',
        prefix: 'Selection could not be encoded',
      }),
    );
    const selection = yield* Schema.decodeUnknownEffect(
      Schema.Record(Schema.String, Schema.String),
    )(encodedActorIdentity).pipe(
      mapParseError({
        code: 'identity-selection-invalid',
        prefix: 'Selection claims must encode as strings',
      }),
    );

    // 2 — format the partition path and match its encoded parameters
    const actorPath = yield* Effect.try({
      try: () => createHref(identity.pattern, selection),
      catch: () =>
        makeZerospinError({
          code: 'identity-selection-invalid',
          message: 'Selection could not be formatted',
        }),
    });
    const matched = yield* Effect.try({
      try: () =>
        createMatcher(identity.pattern).match(
          new URL(actorPath, 'https://selection.invalid'),
        ),
      catch: () =>
        makeZerospinError({
          code: 'identity-selection-invalid',
          message: 'Selection path could not be matched',
        }),
    });

    // 3 — require semantic identity equality and canonical path equality
    const recoveredActorIdentity = yield* Schema.decodeUnknownEffect(
      identity.identitySchema,
    )(matched?.params, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'identity-selection-invalid',
        prefix: 'Selection path is not reversible',
      }),
    );
    if (
      !isEqual(recoveredActorIdentity, actorIdentity) ||
      createHref(identity.pattern, matched?.params) !== actorPath
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'identity-selection-invalid',
          message: 'Selection must have a lossless canonical round trip',
        }),
      );
    }
    return { selection, actorPath };
  },
);
