import { makeZerospinError } from '@zerospin/error';

/** A revoked identity wins over an independently detached tab. */
export function checkBrowserSessionAccess(props: {
  isCurrent: boolean;
  detached: boolean;
}) {
  const { isCurrent, detached } = props;

  if (!isCurrent) {
    throw makeZerospinError('node-signed-out');
  }
  if (detached) {
    throw makeZerospinError('node-tab-detached');
  }
}
