import { PrimitiveKind } from '@zerospin/shapes';
import { isEqual, mapValues } from 'es-toolkit';

import type { IModel } from '../models/types.ts';

export function validateModelVisibility(props: {
  model: IModel;
  canonicalModel: IModel | undefined;
  context: string;
}): void {
  const { model, canonicalModel: canonical, context } = props;
  const { modelName } = model;
  if (
    canonical === undefined ||
    modelName !== canonical.modelName ||
    model.abbreviation !== canonical.abbreviation ||
    model.version !== canonical.version
  ) {
    throw new Error(
      `${context} model ${modelName} must retain its canonical identity and version`,
    );
  }
  const resourceFields: readonly string[] = [
    'id',
    'modelName',
    'version',
    'createdAt',
    'updatedAt',
  ];
  for (const field of resourceFields) {
    if (!Object.hasOwn(model.propertiesShape, field)) {
      throw new Error(
        `${context} model ${modelName} must retain framework field ${field}`,
      );
    }
  }
  mapValues(model.propertiesShape, (descriptor, key) => {
    const field = String(key);
    if (
      !resourceFields.includes(field) &&
      !Object.hasOwn(model.attributes, field)
    ) {
      throw new Error(
        `${context} model ${modelName}.${field} must expose a declared top-level attribute`,
      );
    }
    const canonicalDescriptor = canonical.propertiesShape[field];
    if (
      canonicalDescriptor === undefined ||
      (descriptor.kind === PrimitiveKind.Json &&
        (canonicalDescriptor.kind !== PrimitiveKind.Json ||
          descriptor.schema !== canonicalDescriptor.schema)) ||
      !isEqual(descriptor, canonicalDescriptor)
    ) {
      throw new Error(
        `${context} model ${modelName}.${field} must retain its canonical descriptor and codec`,
      );
    }
  });
  mapValues(model.attributes, (_descriptor, key) => {
    const field = String(key);
    if (!Object.hasOwn(canonical.attributes, field)) {
      throw new Error(
        `${context} model ${modelName}.${field} must be a canonical top-level attribute`,
      );
    }
  });
}
