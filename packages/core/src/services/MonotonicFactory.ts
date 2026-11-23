import * as Context from 'effect/Context';

import type { IMonotonicFactory } from '../utils/types.ts';

export class MonotonicFactory extends Context.Service<
  MonotonicFactory,
  IMonotonicFactory
>()('MonotonicFactory') {}
