import { captureDescriptor } from '@zerospin/shapes';

import { modelId, type IModelIdOptions } from './modelId.ts';

export type IModelRefOptions = IModelIdOptions & {
  relation: string;
  inverse: string;
};

/** Declare a local relationship to a stable model ID; its owner selects the version. */
export function modelRef<const PROPS extends IModelRefOptions>(props: PROPS) {
  const { relation, inverse, ...idOptions } = props;
  const references: Readonly<{
    tableName: PROPS['model']['name'];
    columnName: 'id';
    relation: PROPS['relation'];
    inverse: PROPS['inverse'];
  }> = {
    tableName: idOptions.model.name,
    columnName: 'id',
    relation,
    inverse,
  };
  return captureDescriptor({
    ...modelId(idOptions),
    references,
  });
}
