import { makeDrizzleSchemaFromTable, type IAnyDrizzleSchemas, type IAnyTables } from '@zerospin/shapes';
import { getTableColumns } from 'drizzle-orm';
import { mapValues } from 'es-toolkit';

import type { IInferDrizzleSchemaFromTables } from '../types.ts';
import type { IBoundDatabaseDefinition } from './bindDatabaseDefinition.ts';

export function renderDrizzleSchemas<TABLES extends IAnyTables, DECODED extends boolean = false>(definition: IBoundDatabaseDefinition, decoded?: DECODED): IInferDrizzleSchemaFromTables<TABLES, DECODED> {
  const schemas: IAnyDrizzleSchemas = {};
  mapValues(definition.tables, bound => {
    const edges = definition.references.filter(edge => edge.source === bound);
    schemas[bound.key] = makeDrizzleSchemaFromTable(bound.table, descriptor => {
      const edge = edges.find(reference => reference.descriptor === descriptor)!;
      return () => getTableColumns(schemas[edge.destination.key]!)[edge.destinationColumn]!;
    }, decoded, { name: bound.physicalName, indexes: bound.indexes });
  });
  return schemas as IInferDrizzleSchemaFromTables<TABLES, DECODED>;
}
