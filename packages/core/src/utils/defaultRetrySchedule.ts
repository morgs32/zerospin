import * as Schedule from 'effect/Schedule';

/** Three total attempts with exponential delays beginning at 250 milliseconds. */
export const defaultRetrySchedule = Schedule.max([
  Schedule.recurs(2),
  Schedule.exponential(250, 2),
]);
