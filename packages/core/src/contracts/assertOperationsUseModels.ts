import type { ITypeError } from '@zerospin/shapes';

import type { IAnyModels, IModel } from '../models/types.ts';

import type { IContractRelease, IInferContractOperations } from './types.ts';
export type IAssertOperationModelInModels<
  OPERATION,
  MODELS extends IAnyModels,
> = [OPERATION] extends [never]
  ? MODELS
  : OPERATION extends { readonly model: infer MODEL extends IModel }
    ? string extends MODEL['modelName']
      ? MODELS
      : MODEL['modelName'] extends keyof MODELS & string
        ? MODELS[MODEL['modelName']] extends MODEL
          ? MODEL extends MODELS[MODEL['modelName']]
            ? MODELS
            : ITypeError<`operation model "${MODEL['modelName']}" must match the registered controller model`>
          : ITypeError<`operation model "${MODEL['modelName']}" must match the registered controller model`>
        : ITypeError<`operation model "${MODEL['modelName']}" is not registered on controller models`>
    : OPERATION extends { readonly operationName: 'external' | 'command' }
      ? MODELS
      : ITypeError<'contract program emitted a non-operation'>;
export type IAssertContractOperationsInModels<
  CONTRACT extends IContractRelease,
  MODELS extends IAnyModels,
> =
  IAssertOperationModelInModels<
    IInferContractOperations<CONTRACT>,
    MODELS
  > extends infer RESULT
    ? Extract<RESULT, ITypeError<string>> extends never
      ? CONTRACT
      : Extract<RESULT, ITypeError<string>> extends ITypeError<infer MESSAGE>
        ? ITypeError<`Contract "${CONTRACT['commandName']}" ${MESSAGE}`>
        : Extract<RESULT, ITypeError<string>>
    : never;
