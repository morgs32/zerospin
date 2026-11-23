import { mapValues } from 'es-toolkit';

import { validatePrimitiveDescriptor } from './compileDescriptor.ts';
import { PrimitiveKind } from './primitiveKind.ts';
import type { IPrimitiveDescriptor, IShape } from './types.ts';

/** Normalize authored descriptors while retaining native codec capabilities. */
export function captureDescriptor<D extends IPrimitiveDescriptor>(
  descriptor: D,
): Readonly<D> {
  validatePrimitiveDescriptor(descriptor);
  const owned = {
    ...descriptor,
    nullable: descriptor.nullable ?? false,
    unique: descriptor.unique ?? false,
    primaryKey: descriptor.primaryKey ?? false,
  };
  if (descriptor.references === undefined) {
    Reflect.deleteProperty(owned, 'references');
  } else {
    Object.defineProperty(owned, 'references', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: { ...descriptor.references },
    });
  }
  if ('defaultValue' in owned && owned.defaultValue === undefined) {
    Reflect.deleteProperty(owned, 'defaultValue');
  }
  if (descriptor.kind === PrimitiveKind.Enum) {
    Object.assign(owned, { values: [...descriptor.values] });
  }
  return owned;
}

export function captureShape<SHAPE extends IShape>(shape: SHAPE): SHAPE {
  return Object.assign({ ...shape }, mapValues(shape, captureDescriptor));
}
