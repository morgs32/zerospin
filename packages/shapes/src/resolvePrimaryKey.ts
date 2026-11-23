import { mapValues } from 'es-toolkit';

import { PrimitiveKind } from './primitiveKind.ts';
import type { IAnyTable, IPrimitiveDescriptor } from './types.ts';

export function resolvePrimaryKey(
  table: Pick<IAnyTable, 'name' | 'shape'>,
  required = true,
) {
  let primaryKey:
    | {
        columnName: string;
        descriptor: Extract<
          IPrimitiveDescriptor,
          {
            kind: PrimitiveKind.Id | PrimitiveKind.Integer | PrimitiveKind.Text;
          }
        >;
      }
    | undefined;
  mapValues(table.shape, (descriptor, columnName) => {
    if (descriptor.primaryKey !== true) return;
    if (primaryKey !== undefined) {
      throw new Error(`Table "${table.name}" must have only one primary key`);
    }
    if (
      descriptor.kind !== PrimitiveKind.Id &&
      descriptor.kind !== PrimitiveKind.Integer &&
      descriptor.kind !== PrimitiveKind.Text
    ) {
      throw new Error(`Table "${table.name}" has an unsupported primary key`);
    }
    primaryKey = { columnName, descriptor };
  });
  if (required && primaryKey === undefined) {
    throw new Error(`Table "${table.name}" must have one primary key`);
  }
  return primaryKey;
}
