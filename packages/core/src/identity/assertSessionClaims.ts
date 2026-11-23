import { makeZerospinError } from '@zerospin/error';
import { isEqual } from 'es-toolkit';

/** Optional expected claims are a local comparison against server-admitted context. */
export function assertSessionClaims(expected: unknown, actual: unknown): void {
  if (expected !== undefined && !isEqual(expected, actual)) {
    throw makeZerospinError({
      code: 'session-claims-mismatch',
      message: 'Expected claims do not match admitted session claims',
    });
  }
}
