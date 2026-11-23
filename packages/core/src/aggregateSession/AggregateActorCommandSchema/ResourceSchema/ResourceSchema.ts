/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type is invariant; any is intentional for satisfies */
import * as Schema from 'effect/Schema';

import type { IRef } from '../../../models/types.ts';

export const RefSchema = Schema.Struct({
  id: Schema.String,
  modelName: Schema.String,
}) satisfies Schema.Codec<IRef, any>;
