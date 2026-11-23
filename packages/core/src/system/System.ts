import * as Context from 'effect/Context';

import type { ISystem } from './types.ts';

export class System extends Context.Service<System, ISystem>()('System') {}
