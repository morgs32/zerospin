import type {
  IInferDecodedRow,
  IInferIdFromAbbreviation,
  IShape,
} from '@zerospin/shapes';

import type { IModel } from '../models/types.ts';

export type IUpdateOperation<
  MODEL extends IModel,
  ATTRIBUTES extends IShape = MODEL['attributes'],
> = {
  readonly model: MODEL;
  readonly modelVersion: number;
  readonly operationName: 'update';
  readonly resourceId: IInferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly body: {
    readonly attributes: Partial<IInferDecodedRow<ATTRIBUTES>>;
  };
};
