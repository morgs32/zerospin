import type { IAnyDrizzleSchemas, IAnyTables } from '@zerospin/shapes';
import { defineRelations, type AnyRelation, type RelationsBuilderColumnBase } from 'drizzle-orm';
import { mapValues } from 'es-toolkit';

import type { IAnyModels } from '../../models/types.ts';
import type { IDrizzleRelationsFromModels } from '../types.ts';
import type { IBoundDatabaseDefinition } from './bindDatabaseDefinition.ts';

type IRelationFactory = (config: { from: RelationsBuilderColumnBase; to: RelationsBuilderColumnBase; optional?: boolean }) => AnyRelation;

/** Render the validated edges against the exact decoded schema collection. */
export function renderDrizzleRelations<TABLES extends IAnyTables>(definition: IBoundDatabaseDefinition, schema: IAnyDrizzleSchemas): IDrizzleRelationsFromModels<IAnyModels, TABLES, true> {
  const relations = defineRelations(schema, builder => {
    const result = mapValues(definition.tables, () => ({} as Record<string, AnyRelation>));
    for (const edge of definition.references) {
      const source = builder[edge.source.key] as unknown as Record<string, RelationsBuilderColumnBase>;
      const destination = builder[edge.destination.key] as unknown as Record<string, RelationsBuilderColumnBase>;
      const sourceColumn = source[edge.sourceColumn]!;
      const destinationColumn = destination[edge.destinationColumn]!;
      const one = builder.one[edge.destination.key] as IRelationFactory;
      const inverse = ((edge.descriptor.primaryKey === true || edge.descriptor.unique === true) ? builder.one[edge.source.key] : builder.many[edge.source.key]) as IRelationFactory;
      result[edge.source.key]![edge.descriptor.references!.relation] = one({ from: sourceColumn, to: destinationColumn, optional: edge.descriptor.nullable === true });
      result[edge.destination.key]![edge.descriptor.references!.inverse] = inverse({ from: destinationColumn, to: sourceColumn, ...((edge.descriptor.primaryKey === true || edge.descriptor.unique === true) ? { optional: true } : {}) });
    }
    return result;
  });
  return relations as IDrizzleRelationsFromModels<IAnyModels, TABLES, true>;
}
