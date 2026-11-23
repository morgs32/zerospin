import {
  compileDescriptor,
  type IPrimitiveDescriptor,
  type IPrimitiveDescriptorDecoded,
  type IShape,
} from '@zerospin/shapes';
import { mapValues } from 'es-toolkit';
import { z } from 'zod';

import { makeDecodedZodValueSchema } from './makeDecodedZodValueSchema.ts';

export function descriptorToZod<D extends IPrimitiveDescriptor>(
  descriptor: D,
): z.ZodType<IPrimitiveDescriptorDecoded<D>> {
  const compiled = compileDescriptor(descriptor);
  const value = makeDecodedZodValueSchema(compiled.decodedSchema);
  const schema =
    compiled.defaultValue === undefined
      ? value
      : value.default(compiled.defaultValue);
  return schema as z.ZodType<IPrimitiveDescriptorDecoded<D>>;
}

export function makeZodSchema<SHAPE extends IShape>(
  properties: SHAPE,
): z.ZodObject<{
  [K in keyof SHAPE]: z.ZodType<IPrimitiveDescriptorDecoded<SHAPE[K]>>;
}> {
  return z.object(mapValues(properties, descriptorToZod)) as z.ZodObject<{
    [K in keyof SHAPE]: z.ZodType<IPrimitiveDescriptorDecoded<SHAPE[K]>>;
  }>;
}
