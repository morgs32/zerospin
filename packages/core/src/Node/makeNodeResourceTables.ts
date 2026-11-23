import { mapValues } from 'es-toolkit';

import type { IAnyModels } from '../models/types.ts';

export function makeNodeResourceTables(models: IAnyModels) {
  return mapValues(models, (model, name) => {
    if (
      name !== model.modelName ||
      ['commands', 'nodeMetadata'].includes(name)
    ) {
      throw new Error(`Invalid node resource table: ${name}`);
    }
    return model.drizzleSchema;
  });
}
