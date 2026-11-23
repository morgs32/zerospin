import { ZerospinError, ZerospinErrorJsonSchema } from '@zerospin/error';
import * as Schema from 'effect/Schema';

const timeoutMs = Schema.Number.check(
  Schema.isFinite(),
  Schema.isInt(),
  Schema.isGreaterThan(0),
);
const endpoint = Schema.String.check(
  Schema.makeFilter(value => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        url.username === '' &&
        url.password === '' &&
        url.search === '' &&
        url.hash === '' &&
        value === url.origin + (url.pathname === '/' ? '' : url.pathname)
      );
    } catch {
      return false;
    }
  }),
);
const operation = Schema.Literals([
  'getSnapshot',
  'createWebSocketTicket',
  'registerNode',
]);

export const NodeCredentialsTimeoutError = ZerospinError.schema({
  code: 'node-credentials-timeout',
  message: 'Could not obtain your sign-in credentials.',
  extra: Schema.Struct({ timeoutMs }),
});
export const NodePreparationTimeoutError = ZerospinError.schema({
  code: 'node-local-preparation-timeout',
  message: 'Local session preparation did not complete.',
  extra: Schema.Struct({ timeoutMs }),
});
export const NodeStorageOwnerBusyError = ZerospinError.schema({
  code: 'node-storage-owner-busy',
  message:
    'Local session storage is still in use. Close other tabs or windows using this app, then retry.',
  extra: Schema.Struct({ timeoutMs }),
});
export const NodeBackendTimeoutError = ZerospinError.schema({
  code: 'node-backend-timeout',
  message: 'Backend is not responding. Try again shortly.',
  extra: Schema.Struct({ endpoint, operation, timeoutMs }),
});
export const NodeBackendUnreachableError = ZerospinError.schema({
  code: 'node-backend-unreachable',
  message: 'Cannot reach the backend.',
  extra: Schema.Struct({ endpoint, operation }),
});
export const NodeAuthenticationUnavailableError = ZerospinError.schema({
  code: 'node-authentication-unavailable',
  message: 'No attached session is available to verify your sign-in.',
});

export const NodeStorageUpgradeCodeSchema = Schema.Literals([
  'node-storage-upgrade-history-invalid',
  'node-storage-upgrade-predecessor-pending',
  'node-storage-upgrade-upload-pending',
  'node-storage-upgrade-invalid',
  'node-storage-upgrade-schema-mismatch',
  'node-storage-upgrade-newer',
  'node-storage-upgrade-ledger-missing',
  'node-storage-upgrade-migration-failed',
  'node-storage-upgrade-journal-invalid',
  'node-storage-upgrade-journal-unavailable',
]);
export const nodeStorageUpgradeFailureCodes =
  NodeStorageUpgradeCodeSchema.literals;
export const NodeStorageUpgradeFailureSchema = Schema.Union([
  Schema.Struct({
    ...ZerospinErrorJsonSchema.fields,
    code: NodeStorageUpgradeCodeSchema,
    extra: Schema.Null,
  }),
  Schema.Struct({
    ...ZerospinErrorJsonSchema.fields,
    code: Schema.Literal('node-storage-upgrade-predecessor-pending'),
    extra: Schema.Struct({
      sessionId: Schema.String,
      sessionIndex: Schema.Number,
      predecessorIndex: Schema.Number,
    }),
  }),
]);

/** The Node transport owns recognition of these framework failures. */
export const NodeFailureSchema = Schema.Union([
  NodeCredentialsTimeoutError,
  NodePreparationTimeoutError,
  NodeStorageOwnerBusyError,
  NodeBackendTimeoutError,
  NodeBackendUnreachableError,
  NodeAuthenticationUnavailableError,
]);
