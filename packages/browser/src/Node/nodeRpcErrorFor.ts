import {
  encodeError,
  isZerospinError,
  makeZerospinError,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  NodeFailureSchema,
  nodeStorageUpgradeFailureCodes,
  NodeStorageUpgradeFailureSchema,
} from './NodeErrors.ts';

/** Preserve declared RPC failures; an unexpected rejection remains a defect. */
export function nodeRpcErrorFor<const CODE extends string>(
  codes: readonly [CODE, ...CODE[]],
) {
  const genericCodes = codes.filter(
    (code): code is Exclude<CODE, typeof NodeFailureSchema.Type.code> =>
      ![
        'node-credentials-timeout',
        'node-local-preparation-timeout',
        'node-storage-owner-busy',
        'node-backend-timeout',
        'node-backend-unreachable',
        'node-authentication-unavailable',
      ].includes(code) &&
      !nodeStorageUpgradeFailureCodes.some(known => known === code),
  );
  const decodeCode = Schema.decodeUnknownOption(
    Schema.Literals([...genericCodes, 'node-closed']),
  );
  return (cause: unknown) => {
    if (isZerospinError(cause) && !('scope' in cause)) {
      const known = Schema.decodeUnknownOption(NodeFailureSchema, {
        onExcessProperty: 'error',
      })(Effect.runSync(encodeError(cause)));
      if (known._tag === 'Some') {
        if (codes.some(code => code === known.value.code)) return known.value;
        throw cause;
      }
      const upgrade = Schema.decodeUnknownOption(
        NodeStorageUpgradeFailureSchema,
        {
          onExcessProperty: 'error',
        },
      )(Effect.runSync(encodeError(cause)));
      if (upgrade._tag === 'Some') {
        if (codes.some(code => code === upgrade.value.code)) {
          return makeZerospinError(upgrade.value);
        }
        throw cause;
      }
      const code = decodeCode(cause.code);
      if (code._tag === 'Some') {
        return makeZerospinError({
          code: code.value,
          message: cause.message,
          status: cause.status,
          cause: cause.cause,
          extra: cause.extra,
        });
      }
    }
    throw cause;
  };
}
export const snapshotFailureCodes = [
  ...nodeStorageUpgradeFailureCodes,
  'node-read-tables-snapshot-required',
  'node-development-history-mismatch',
  'node-development-history-replaced',
  'node-development-registration-stale',
  'node-snapshot-pending-ids-invalid',
  'node-optimistic-view-failed',
  'node-command-input-conflict',
  'session-node-record-invalid',
  'session-staged-coordinate-conflict',
  'session-snapshot-acknowledged-command-missing',
  'session-snapshot-receipt-invalid',
  'node-metadata-missing',
  'node-metadata-ambiguous',
  'node-execution-checkpoint-invalid',
  'node-resource-model-invalid',
  'node-resource-invalid',
  'node-resource-date-invalid',
  'node-command-input-missing',
  'node-command-contract-mismatch',
  'node-command-final-missing',
] as const;
