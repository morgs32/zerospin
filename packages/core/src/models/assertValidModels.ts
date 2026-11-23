import { mapValues } from 'es-toolkit';

import { bindDatabaseDefinition } from '../drizzle/definition/bindDatabaseDefinition.ts';

import type { IAnyModels } from './types.ts';

/** Validate authored model metadata without constructing runtime schemas or relations. */
export function assertValidModels<MODELS extends IAnyModels>(props: {
  models: MODELS;
  context: string;
}): void {
  const { models, context } = props;

  const tables = mapValues(models, (model, registryKey) => {
    const key = String(registryKey);
    if (model.modelName !== key) {
      throw new Error(
        `${context}: models key "${key}" must equal model.modelName "${model.modelName}"`,
      );
    }
    return model.table;
  });
  bindDatabaseDefinition(tables);
}
