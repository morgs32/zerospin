import { captureDescriptor } from './captureDescriptor.ts';
import { PrimitiveKind } from './primitiveKind.ts';
import type { IPrimitiveDescriptor, IPrimitiveFactories } from './types.ts';

function makePrimitive<KIND extends PrimitiveKind>(
  kind: KIND,
): IPrimitiveFactories[KIND] {
  const make = (...args: readonly unknown[]) => {
    if (args.length > 1) {
      throw new Error('Primitive construction takes one options object');
    }
    const options = args.length === 0 ? {} : args[0];
    if (
      typeof options !== 'object' ||
      options === null ||
      Array.isArray(options)
    ) {
      throw new Error('Primitive options must be an object');
    }
    if (Object.hasOwn(options, 'kind')) {
      throw new Error('Primitive options cannot replace kind');
    }
    return captureDescriptor({ ...options, kind } as IPrimitiveDescriptor);
  };
  return make as IPrimitiveFactories[KIND];
}

export const primitives: IPrimitiveFactories = {
  [PrimitiveKind.Boolean]: makePrimitive(PrimitiveKind.Boolean),
  [PrimitiveKind.Cursor]: makePrimitive(PrimitiveKind.Cursor),
  [PrimitiveKind.Date]: makePrimitive(PrimitiveKind.Date),
  [PrimitiveKind.Enum]: makePrimitive(PrimitiveKind.Enum),
  [PrimitiveKind.Id]: makePrimitive(PrimitiveKind.Id),
  [PrimitiveKind.Integer]: makePrimitive(PrimitiveKind.Integer),
  [PrimitiveKind.Json]: makePrimitive(PrimitiveKind.Json),
  [PrimitiveKind.Number]: makePrimitive(PrimitiveKind.Number),
  [PrimitiveKind.Text]: makePrimitive(PrimitiveKind.Text),
};
