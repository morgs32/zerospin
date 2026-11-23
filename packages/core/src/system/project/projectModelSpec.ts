import { encodeShape, type IPrimitiveDescriptor } from '@zerospin/shapes';

import type { IModel, IModelSpec } from '../../models/types.ts';

import { projectSortedRecord } from './projectSortedRecord.ts';

/** Project native Model facts only while compiling a portable SystemSpec. */
export function projectModelSpec(model: IModel): IModelSpec {
  return {
    modelName: model.modelName,
    abbreviation: model.abbreviation,
    version: model.version,
    attributes: Object.keys(model.attributes).sort(),
    attributesShape: encodeShape(
      projectSortedRecord(
        model.attributes,
        (value: IPrimitiveDescriptor) => value,
      ),
    ),
    propertiesShape: encodeShape(
      projectSortedRecord(
        model.propertiesShape,
        (value: IPrimitiveDescriptor) => value,
      ),
    ),
    indexes: model.indexes
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .map(index => ({
        ...index,
        columns: [...index.columns],
        ...(index.where === undefined ? {} : { where: { ...index.where } }),
      })),
  };
}
