import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceSessionLockSchema } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { System } from '@zerospin/core/system/System';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';
import type { Connection } from 'partyserver';

import { validateServiceSessionLock } from '../../ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/validateServiceSessionLock.js';
import {
  resolveServiceActorView,
  type IServiceProjectionKey,
} from '../../serviceProjection/resolveServiceActorView.js';
import type { IServiceConnectionState } from '../connectionState.js';
import { installConnection } from '../installConnection.js';
/** Validate the complete trusted admission before retaining only its selected capabilities. */
export const onConnect = Effect.fn('ServiceActorVersionChain.onConnect')(
  function* (props: {
    connection: Connection<IServiceConnectionState>;
    request: Request;
    db: IDb;
    key: IServiceProjectionKey;
  }) {
    const { connection, request, key, db } = props;
    const serviceName = request.headers.get('x-zerospin-service-name'),
      serviceVersionHeader = request.headers.get('x-zerospin-service-version'),
      actorPath = request.headers.get('x-zerospin-actor-path'),
      sessionName = request.headers.get('x-zerospin-session-name');
    if (
      serviceName !== key.serviceName ||
      serviceVersionHeader !== String(key.serviceVersion) ||
      actorPath !== key.actorPath ||
      sessionName === null
    ) {
      return yield* makeZerospinError('service-session-identity-invalid');
    }
    const lock = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceSessionLockSchema),
    )(request.headers.get('x-zerospin-service-session-lock'), {
      onExcessProperty: 'error',
    });
    if (
      lock.actorName !== key.actorName ||
      lock.actorVersion !== key.actorVersion ||
      lock.sessionName !== sessionName
    ) {
      return yield* makeZerospinError('service-session-lock-invalid');
    }
    yield* validateServiceSessionLock({
      serviceName,
      serviceVersion: key.serviceVersion,
      sessionName,
      serviceSessionLock: lock,
    });
    const system = yield* System;
    const release = system.services[serviceName]?.releases[key.serviceVersion];
    if (release === undefined) {
      return yield* makeZerospinError('service-session-owner-unavailable');
    }
    const { actor, encodedIdentity } = yield* resolveServiceActorView(
      release,
      key,
    );
    const claims = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
    )(request.headers.get('x-zerospin-claims'), {
      onExcessProperty: 'error',
    });
    yield* Schema.decodeUnknownEffect(actor.identity.claimsSchema)(claims, {
      onExcessProperty: 'error',
    });
    if (
      !Object.values(
        mapValues(encodedIdentity, (value, field) => claims[field] === value),
      ).every(Boolean)
    ) {
      return yield* makeZerospinError('service-session-identity-invalid');
    }
    const issuedNodeId = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.NullOr(Schema.NonEmptyString)),
    )(request.headers.get('x-zerospin-producer'), {
      onExcessProperty: 'error',
    });
    yield* installConnection({
      db,
      connection,
      lock,
      admission: {
        phase: 'awaiting-resume',
        issuedNodeId,
        claims,
        serviceName,
        serviceVersion: key.serviceVersion,
        actorPath,
        actorName: key.actorName,
        actorVersion: key.actorVersion,
        sessionName,
      },
    });
  },
);
