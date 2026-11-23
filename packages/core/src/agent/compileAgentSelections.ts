import type { Query } from 'drizzle-orm';
import { Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type {
  IAnyQueryDbVersion,
  ISelection,
  QuerySelection,
} from '../models/make/makeQueryDbVersion.ts';
import { compileReadQuery } from '../models/reads/compileReadQuery.ts';

type IPreparedSelection = ReturnType<
  QuerySelection['prepareStructuredSelection']
>;

// Optimistic changes begin with rows already selected by the owner. Reuse the
// same relation dependency graph, binding each read to the Node's local tables.
const membership = new WeakMap<
  ISelection,
  (names: Readonly<Record<string, string>>) => Query
>();

export function localAgentMembership(
  selection: ISelection,
  names: Readonly<Record<string, string>>,
) {
  const compile = membership.get(selection);
  if (compile === undefined) {
    throw new Error('Agent selection has no structured query');
  }
  return compile(names);
}

const WhereSchema = Schema.Record(Schema.String, Schema.Unknown);

/** Compile relation predicates over the related Agent selections in dependency order. */
export function compileAgentSelections(props: {
  db: IAnyQueryDbVersion;
  selections: ReadonlyMap<string, IPreparedSelection>;
}): Record<string, ISelection> {
  const { db, selections } = props;

  function collectDependencies(
    modelName: string,
    where: unknown,
    dependencies: Set<string>,
  ): void {
    if (where === undefined || typeof where === 'boolean') return;
    const filter = Schema.decodeUnknownSync(WhereSchema)(where);
    mapValues(filter, (operand, field) => {
      if (field === 'AND' || field === 'OR' || field === 'NOT') {
        for (const branch of Array.isArray(operand) ? operand : [operand]) {
          collectDependencies(modelName, branch, dependencies);
        }
        return;
      }
      const relations = db.config.relations[modelName]!.relations;
      if (!Object.hasOwn(relations, field)) return;
      const relatedName = relations[field]!.targetTableName;
      if (!selections.has(relatedName)) {
        throw new Error(
          `Agent relation ${modelName}.${field} requires a selected ${relatedName} view`,
        );
      }
      dependencies.add(relatedName);
      collectDependencies(relatedName, operand, dependencies);
    });
  }

  const direct = new Map<string, Set<string>>();
  for (const [modelName, selection] of selections) {
    const dependencies = new Set<string>();
    collectDependencies(
      modelName,
      selection.request.config.where,
      dependencies,
    );
    direct.set(modelName, dependencies);
  }

  const visiting = new Set<string>();
  const ordered = new Map<string, ReadonlySet<string>>();
  function resolveDependencies(modelName: string): ReadonlySet<string> {
    const resolved = ordered.get(modelName);
    if (resolved !== undefined) return resolved;
    if (visiting.has(modelName)) {
      throw new Error(`Cyclic Agent selection dependency at ${modelName}`);
    }
    visiting.add(modelName);
    const dependencies = new Set<string>();
    for (const relatedName of direct.get(modelName)!) {
      for (const transitiveName of resolveDependencies(relatedName)) {
        dependencies.add(transitiveName);
      }
      dependencies.add(relatedName);
    }
    visiting.delete(modelName);
    ordered.set(modelName, dependencies);
    return dependencies;
  }
  for (const modelName of selections.keys()) resolveDependencies(modelName);

  const tables = db.config.definition.tables;
  const physicalNames = new Set(
    Object.values(tables).map(table => table.physicalName.toLowerCase()),
  );
  const aliases = mapValues(db.models, (_model, name) => {
    let alias = `__agent_selected_${name}`;
    while (physicalNames.has(alias.toLowerCase())) alias += '_';
    physicalNames.add(alias.toLowerCase());
    return alias;
  });
  function buildStatement(
    modelName: string,
    physicalNames: Readonly<Record<string, string>>,
    alreadySelected: boolean,
  ) {
    const dependencies = Array.from(ordered.get(modelName)!);
    const compile = (name: string) => {
      const selection = selections.get(name)!;
      // The owner already applied the offset. An optimistic insert can still
      // displace a selected row when the declaration limits the window.
      const { offset: _offset, ...window } = selection.request.config;
      return compileReadQuery({
        models: db.models,
        query: alreadySelected
          ? { ...selection.request, config: window }
          : selection.request,
        physicalTableNames: mapValues(db.models, (_model, key) =>
          key === name ? physicalNames[name]! : aliases[key]!,
        ),
      }).builtQuery;
    };
    const statement = compile(modelName);
    if (dependencies.length === 0) return statement;
    const ctes = dependencies.map(name => {
      const identifier = `"${aliases[name]!.replaceAll('"', '""')}"`;
      const query = compile(name);
      return { sql: `${identifier} as (${query.sql})`, params: query.params };
    });
    return {
      ...statement,
      sql: `with ${ctes.map(cte => cte.sql).join(', ')} ${statement.sql}`,
      params: [...ctes.flatMap(cte => cte.params), ...statement.params],
    };
  }

  const ownerNames = mapValues(tables, table => table.physicalName);
  return Object.fromEntries(
    Array.from(selections, ([modelName, selection]) => {
      const captured = selection.buildSelection(
        buildStatement(modelName, ownerNames, false),
      );
      membership.set(captured, names => buildStatement(modelName, names, true));
      return [modelName, captured];
    }),
  );
}
