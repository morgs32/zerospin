import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';

import type { IServiceNodeCommand } from '../ServiceNode/types.ts';

import type { IServiceSessionDefinition } from './types.ts';

/** Validate the full admitted identity before its repeated fields leave the replica row. */
export const validateServiceSessionCommandIdentity = Effect.fn(
  'validateServiceSessionCommandIdentity',
)(function* (props: {
  definition: IServiceSessionDefinition;
  encodedClaims: Readonly<Record<string, unknown>>;
  command: IServiceNodeCommand;
}) {
  const { definition, encodedClaims, command } = props;
  if (
    command.actorName !== definition.actorName ||
    command.actorVersion !== definition.actorVersion ||
    command.serviceName !== definition.serviceName ||
    command.sessionName !== definition.sessionName
  ) {
    return yield* makeZerospinError('pending-command-actor-mismatch');
  }
  if (!isEqual(command.claims, encodedClaims)) {
    return yield* makeZerospinError('pending-command-claims-mismatch');
  }
});
