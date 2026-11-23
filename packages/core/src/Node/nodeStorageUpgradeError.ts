import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
} from '@zerospin/error';

/** Upgrade validation cannot authorize the ordinary destructive recovery fallback. */
export function nodeStorageUpgradeError(failure: unknown) {
  if (
    isZerospinError(failure) &&
    (failure.code.startsWith('node-storage-upgrade-') ||
      failure.code === 'node-read-tables-snapshot-required' ||
      /identity-mismatch|selection-mismatch|definition.*mismatch|authentication|node-closed|node-tab-detached/u.test(
        failure.code,
      ))
  ) {
    return failure;
  }
  return makeZerospinError({
    code: 'node-storage-upgrade-invalid',
    message: 'Connected storage could not be validated for a safe upgrade.',
    cause: prettyUnknownFailure(failure),
  });
}
