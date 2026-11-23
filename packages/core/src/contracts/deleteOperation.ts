import type { IInferIdFromAbbreviation } from '@zerospin/shapes';

import type { IModel } from '../models/types.ts';

export type IDeleteOperation<MODEL extends IModel> = {
  readonly model: MODEL;
  readonly modelVersion: number;
  readonly operationName: 'delete';
  readonly resourceId: IInferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly body: Record<string, never>;
};
