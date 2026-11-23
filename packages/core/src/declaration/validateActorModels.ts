import { mapValues } from 'es-toolkit';

import { assertValidModels } from '../models/assertValidModels.ts';
import type { IAnyModels } from '../models/types.ts';

import { validateModelVisibility } from './validateModelVisibility.ts';

export function validateActorModels(props: {
  actorName: string;
  exposedModels: IAnyModels;
  canonicalModels: IAnyModels;
}): void {
  const { actorName, exposedModels, canonicalModels } = props;
  assertValidModels({ models: exposedModels, context: `Actor ${actorName}` });
  mapValues(exposedModels, (model, modelName) =>
    validateModelVisibility({
      model,
      canonicalModel: canonicalModels[modelName],
      context: `Actor ${actorName}`,
    }),
  );
}
