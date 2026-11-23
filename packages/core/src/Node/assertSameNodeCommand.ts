import {
  makeNodeCommandInputConflictError,
  makeZerospinError,
} from '@zerospin/error';
import { isEqual } from 'es-toolkit';

import type { NodeCommandAllocationSchema } from './NodeCommandCoverage.ts';

/** The same immutable command may be held with less allocation knowledge. */
export function assertSameNodeCommand<
  RETAINED extends typeof NodeCommandAllocationSchema.Type,
  REQUESTED extends typeof NodeCommandAllocationSchema.Type,
>(retained: RETAINED, requested: REQUESTED) {
  const {
    id: _retainedId,
    nodeId: _retainedNodeId,
    nodeIndex: _retainedNodeIndex,
    pushIndex: _retainedPushIndex,
    ...retainedInput
  } = retained;
  const {
    id: _requestedId,
    nodeId: _requestedNodeId,
    nodeIndex: _requestedNodeIndex,
    pushIndex: _requestedPushIndex,
    ...requestedInput
  } = requested;
  if (!isEqual(retainedInput, requestedInput)) {
    throw makeNodeCommandInputConflictError();
  }
  if (
    retained.nodeId !== null &&
    requested.nodeId !== null &&
    (retained.id !== requested.id ||
      retained.nodeId !== requested.nodeId ||
      retained.nodeIndex !== requested.nodeIndex ||
      retained.pushIndex !== requested.pushIndex)
  ) {
    throw makeZerospinError('session-staged-coordinate-conflict');
  }
}
