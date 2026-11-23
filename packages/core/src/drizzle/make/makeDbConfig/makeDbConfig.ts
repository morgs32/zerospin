import { type IAnyTables } from '@zerospin/shapes';
import * as Brand from 'effect/Brand';
import { mapValues } from 'es-toolkit';

import type { IAnyModels } from '../../../models/types.ts';
import { bindDatabaseDefinition } from '../../definition/bindDatabaseDefinition.ts';
import { compileSqliteTableDefinition } from '../../definition/compileSqliteTableDefinition.ts';
import { renderDrizzleSchemas } from '../../definition/renderDrizzleSchemas.ts';
import { renderDrizzleRelations } from '../../definition/renderDrizzleRelations.ts';
import type { IDbConfig, IDrizzleRelationsFromModels, IInferDrizzleSchemaFromTables, IResourceDbConfig } from '../../types.ts';

function compileDatabaseConfig<TABLES extends IAnyTables>(tables: TABLES, physicalTableNames?: Partial<Record<keyof TABLES & string, string>>) {
  const graph = bindDatabaseDefinition(tables, physicalTableNames);
  const schema = renderDrizzleSchemas<TABLES>(graph);
  const querySchema = renderDrizzleSchemas<TABLES, true>(graph, true);
  const relations = renderDrizzleRelations<TABLES>(graph, querySchema);
  const definition = Object.freeze({ ...graph, provisioning: Object.freeze(Object.values(schema).map(table => compileSqliteTableDefinition(table))) });
  return Object.freeze({ tables, schema, relations, definition });
}

export function makeDbConfig<TABLES extends IAnyTables>(props: {
  tables: TABLES;
  physicalTableNames?: Partial<Record<keyof TABLES & string, string>>;
}): IDbConfig<IInferDrizzleSchemaFromTables<TABLES>, IDrizzleRelationsFromModels<IAnyModels, TABLES, true>, TABLES> {
  const { tables, physicalTableNames } = props;

  return compileDatabaseConfig(tables, physicalTableNames);
}

/** Refuse reserved registry collisions before composing model and internal tables. */
export function composeResourceTables<MODELS extends IAnyModels, OTHER_TABLES extends IAnyTables>(models: MODELS, otherTables?: OTHER_TABLES) {
  const modelTables: { [KEY in keyof MODELS]: MODELS[KEY]['table'] } = mapValues(models, (model, registryKey) => {
    const key = String(registryKey);
    if (key !== model.modelName) throw new Error(`Models key "${key}" must equal model.modelName "${model.modelName}"`);
    if (otherTables !== undefined && Object.hasOwn(otherTables, key)) throw new Error(`Internal table key "${key}" collides with a model`);
    return model.table;
  });
  return { ...modelTables, ...otherTables } as { [KEY in keyof MODELS]: MODELS[KEY]['table'] } & OTHER_TABLES;
}

export function makeResourceDbConfig<MODELS extends IAnyModels>(props: { models: MODELS; otherTables?: undefined }): IResourceDbConfig<MODELS, Record<never, never>>;
export function makeResourceDbConfig<MODELS extends IAnyModels, OTHER_TABLES extends IAnyTables>(props: { models: MODELS; otherTables: OTHER_TABLES }): IResourceDbConfig<MODELS, OTHER_TABLES>;
export function makeResourceDbConfig<MODELS extends IAnyModels, OTHER_TABLES extends IAnyTables>(props: { models: MODELS; otherTables?: OTHER_TABLES }) {
  const { models, otherTables } = props;

  const tables = composeResourceTables(models, otherTables);
  return Brand.nominal<IResourceDbConfig<MODELS, OTHER_TABLES>>()(compileDatabaseConfig(tables) as unknown as IResourceDbConfig<MODELS, OTHER_TABLES>);
}
