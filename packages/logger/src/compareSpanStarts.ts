import type { ISpanRecord } from './types.ts';

/** Start order survives completion-order collection and millisecond rounding. */
export const compareSpanStarts = (
  left: ISpanRecord,
  right: ISpanRecord,
): number => {
  const timeOrder = left.startedAt - right.startedAt;
  if (timeOrder !== 0) {
    return timeOrder;
  }
  const leftOrder = left.attributes?.['span.invocationOrder'];
  const rightOrder = right.attributes?.['span.invocationOrder'];
  return typeof leftOrder === 'number' && typeof rightOrder === 'number'
    ? leftOrder - rightOrder
    : 0;
};
