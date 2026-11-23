import * as Context from 'effect/Context';

import type { ICuidFactory } from './types.ts';

export class CuidFactory extends Context.Service<CuidFactory, ICuidFactory>()(
  'CuidFactory',
) {}
