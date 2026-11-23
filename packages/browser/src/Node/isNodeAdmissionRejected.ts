const rejected = new Set([
  'authentication-credentials-invalid',
  'aggregate-authentication-failed',
  'service-authentication-failed',
  'authorization-claims-invalid',
  'aggregate-authorization-failed',
  'service-authorization-failed',
  'node-authentication-identity-mismatch',
]);

/** Only a server denial or contradictory verified identity establishes rejection. */
export const isNodeAdmissionRejected = (error: unknown) =>
  error instanceof Error &&
  'code' in error &&
  typeof error.code === 'string' &&
  rejected.has(error.code);
