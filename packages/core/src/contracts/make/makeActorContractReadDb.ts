import { makeZerospinError } from '@zerospin/error';
import type { Query } from 'drizzle-orm';
import { durableSQLiteCodecs } from 'drizzle-orm/durable-sqlite/codecs';
import { SQLiteDialect } from 'drizzle-orm/sqlite-core/dialect';
import {
  SQLiteRelationalQuery,
  type SQLiteRelationalQueryHKT,
} from 'drizzle-orm/sqlite-core/query-builders/query';
import { SQLiteSession } from 'drizzle-orm/sqlite-core/session';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { bindDatabaseDefinition } from '../../drizzle/definition/bindDatabaseDefinition.ts';
import { renderDrizzleRelations } from '../../drizzle/definition/renderDrizzleRelations.ts';
import { renderDrizzleSchemas } from '../../drizzle/definition/renderDrizzleSchemas.ts';
import type { IDb } from '../../drizzle/types.ts';
import type {
  IAnyQueryDbVersion,
  ISelection,
} from '../../models/make/makeQueryDbVersion.ts';
import type { IAnyModels } from '../../models/types.ts';

import { scopeContractReadDb } from './makeContractReadDb.ts';

class ActorReadSession extends SQLiteSession {
  prepareQuery(): never {
    throw new Error(
      'Actor read queries execute through the owning transaction',
    );
  }
}

/** Preserve Drizzle's compiled codecs and relational mapping when reading actor CTEs. */
class ActorReadQuery extends SQLiteRelationalQuery<
  SQLiteRelationalQueryHKT,
  unknown
> {
  private readonly queryMode: string;

  constructor(...args: ConstructorParameters<typeof SQLiteRelationalQuery>) {
    super(...args);
    this.queryMode = args[7];
  }

  read(db: Pick<IDb, '_'>, visible: Query) {
    const { query, builtQuery } = this._toSQL();
    const compiled: Query = {
      ...builtQuery,
      sql: `${visible.sql} ${builtQuery.sql}`,
      params: [...visible.params, ...builtQuery.params],
    };
    const mapper = this.dialect.mapperGenerators.relationalRows({
      isFirst: this.queryMode === 'first',
      parseJson: true,
      parseJsonIfString: false,
      rootJsonMappers: false,
      selection: query.selection,
      arrayModeRoot: true,
    });
    return db._.session
      .prepareQuery(compiled, 'arrays', false, 'all', mapper)
      .all();
  }
}

/** Public programs read selected rows and exposed columns from the current canonical transaction. */
export function makeActorContractReadDb(props: {
  db: Pick<IDb, '_'>;
  actor: {
    exposedModels: IAnyModels;
    db: IAnyQueryDbVersion;
    capturedSelections: Readonly<Record<string, ISelection>>;
  };
  identity: Readonly<Record<string, unknown>>;
}) {
  const { db, actor, identity } = props;
  const dialect = new SQLiteDialect({ codecs: durableSQLiteCodecs });
  const physicalNames = new Set(
    Object.values(actor.db.config.definition.tables).map(table =>
      table.physicalName.toLowerCase(),
    ),
  );
  const names = mapValues(actor.exposedModels, (_model, name) => {
    let alias = `__actor_visible_${String(name)}`;
    while (physicalNames.has(alias.toLowerCase())) alias = `_${alias}`;
    physicalNames.add(alias.toLowerCase());
    return alias;
  });
  const definition = bindDatabaseDefinition(
    mapValues(actor.exposedModels, model => model.table),
    names,
  );
  const schemas = renderDrizzleSchemas(definition, true);
  const relations = renderDrizzleRelations(definition, schemas);
  const session = new ActorReadSession(dialect);
  const selections = Object.values(
    mapValues(actor.exposedModels, (model, name): Query => {
      const columns = Object.keys(model.table.shape)
        .map(column => dialect.escapeName(column))
        .join(', ');
      const selection = actor.capturedSelections[name];
      const selected = selection?.bind(identity);
      const canonicalName =
        actor.db.config.definition.tables[name]?.physicalName;
      if (canonicalName === undefined) {
        throw new Error(`Missing canonical actor model ${String(name)}`);
      }
      return {
        sql: `${dialect.escapeName(names[name]!)} as (select ${columns} from ${selected === undefined ? `${dialect.escapeName(canonicalName)} where 0` : `(${selected.sql})`})`,
        params: selected?.params ?? [],
      };
    }),
  );
  const visible: Query = {
    sql: `with ${selections.map(selection => selection.sql).join(', ')}`,
    params: selections.flatMap(selection => selection.params),
  };
  for (const edge of definition.references) {
    const source = dialect.escapeName(edge.source.physicalName);
    const destination = dialect.escapeName(edge.destination.physicalName);
    const reference = dialect.escapeName(edge.sourceColumn);
    const primaryKey = dialect.escapeName(edge.destinationColumn);
    const missing = db._.session
      .prepareQuery(
        {
          sql: `${visible.sql} select 1 from ${source} as actor_source where actor_source.${reference} is not null and not exists (select 1 from ${destination} as actor_destination where actor_destination.${primaryKey} = actor_source.${reference}) limit 1`,
          params: visible.params,
        },
        'arrays',
        false,
        'all',
      )
      .all();
    if (
      Schema.decodeUnknownSync(Schema.Array(Schema.Unknown))(missing).length !==
      0
    ) {
      throw makeZerospinError('projection-projected-resource-invalid');
    }
  }
  return scopeContractReadDb(
    {
      read: (model, options, first) =>
        Effect.sync(() => {
          const relation = relations[model.modelName];
          if (relation === undefined) {
            throw new Error(`Missing actor model query ${model.modelName}`);
          }
          return new ActorReadQuery(
            'sync',
            relations,
            relation.table,
            relation,
            dialect,
            session,
            options,
            first ? 'first' : 'many',
            true,
          ).read(db, visible);
        }),
    },
    actor.exposedModels,
  );
}
