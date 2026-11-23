import { primitives } from '@zerospin/shapes';
export const modelOperationShape = {
  commandId: primitives.text(),
  operationIndex: primitives.integer(),
  modelName: primitives.text(),
  resourceId: primitives.text(),
  operationName: primitives.enum({
    values: ['create', 'delete', 'move', 'update'],
  }),
  body: primitives.text(),
};

export const modelOperationKeyIndex = {
  name: 'model_command_operation',
  columns: ['commandId', 'operationIndex'] as const,
  unique: true,
};
