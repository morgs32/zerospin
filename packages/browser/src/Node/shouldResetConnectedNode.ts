import { isZerospinError } from '@zerospin/error';

import { isNodeAdmissionBackpressure } from './isNodeAdmissionBackpressure.ts';
import { isNodeAdmissionRejected } from './isNodeAdmissionRejected.ts';

/** Classify a connected failure; the owner must obtain authenticated proof before replacing storage. */
export function shouldResetConnectedNode(props: {
  failure: unknown;
  attempted: boolean;
}): boolean {
  const { failure, attempted } = props;
  if (
    attempted ||
    isNodeAdmissionRejected(failure) ||
    isNodeAdmissionBackpressure(failure)
  ) {
    return false;
  }
  if (!isZerospinError(failure)) return failure instanceof Error;
  if ('scope' in failure || failure.code.startsWith('node-storage-upgrade-')) {
    return false;
  }
  if (
    /authentication|credentials|signed-out|identity-mismatch|definition.*mismatch|selection-mismatch/u.test(
      failure.code,
    )
  ) {
    return false;
  }
  return ![
    'node-read-tables-snapshot-required',
    'node-development-history-mismatch',
    'node-development-system-starting',
    'node-tab-detached',
    'node-closed',
    'node-offline',
    'node-backend-timeout',
    'node-backend-unreachable',
    'node-local-preparation-timeout',
    'node-storage-owner-busy',
    'node-storage-runtime-unavailable',
    'node-subscription-timeout',
    'node-subscription-closed',
    'node-admission-uncertain',
    'node-admission-backlog-full',
    'node-push-blocked',
    'node-synchronization-blocked',
  ].includes(failure.code);
}
