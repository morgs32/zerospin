import * as Data from 'effect/Data';

export class StateInactive extends Data.TaggedError('StateInactive')<{
  readonly state: string;
  readonly current: string;
}> {}
