import type {
  IInferDecodedRow,
  IInferIdFromAbbreviation,
  IShape,
} from '@zerospin/shapes';

import type { IModel } from '../models/types.ts';

export type ICreateOperation<
  MODEL extends IModel,
  ATTRIBUTES extends IShape = MODEL['attributes'],
> = {
  readonly model: MODEL;
  readonly modelVersion: number;
  readonly operationName: 'create';
  readonly resourceId: IInferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly body: {
    readonly attributes: IInferDecodedRow<ATTRIBUTES>;
  };
};

export type IInferModelCreateAttributes<MODEL extends IModel> =
  IInferDecodedRow<MODEL['attributes']>;
