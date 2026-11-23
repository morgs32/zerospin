import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { resolveServiceActorVersion } from '@zerospin/core/serviceActor/getServiceActorVersion';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/** Reconstruct the actor's projection identity from the canonical durable key. */
export const resolveServiceActorView = Effect.fn('resolveServiceActorView')(
  function* (
    serviceRelease: IAnyServiceRelease,
    key: { actorName: string; actorVersion: number; actorPath: string },
  ) {
    const actor = yield* resolveServiceActorVersion(
      { [serviceRelease.version]: serviceRelease },
      key,
    );
    const matched = yield* Effect.try({
      try: () =>
        createMatcher(actor.identity.pattern).match(
          new URL(key.actorPath, 'https://actor.invalid'),
        ),
      catch: () => makeZerospinError({ code: 'actor-path-invalid' }),
    });
    const decodedActorIdentity = yield* Schema.decodeUnknownEffect(
      actor.identity.identitySchema,
    )(matched?.params, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'actor-path-invalid',
        prefix: 'Invalid actor fields',
      }),
    );
    const selectionBindings = yield* Schema.decodeUnknownEffect(
      Schema.Record(Schema.String, Schema.String),
    )(decodedActorIdentity).pipe(
      mapParseError({
        code: 'actor-path-invalid',
        prefix: 'Selection fields must be strings',
      }),
    );
    const encoded = yield* Schema.encodeEffect(actor.identity.identitySchema)(
      decodedActorIdentity,
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
        prefix: 'Actor fields must be strings',
      }),
    );
    if (
      matched === null ||
      createHref(actor.identity.pattern, encodedIdentity) !== key.actorPath
    ) {
      return yield* Effect.fail(
        makeZerospinError({ code: 'actor-path-noncanonical' }),
      );
    }
    return { actor, selectionBindings, encodedIdentity };
  },
);

export type IServiceProjectionKey = Readonly<{
  systemId: string;
  serviceName: string;
  serviceVersion: number;
  actorName: string;
  actorVersion: number;
  actorPath: string;
}>;
