import { PrimitiveKind, resolvePrimaryKey, Table, type IPrimitiveDescriptor, type IAnyTable, type IAnyTables, type IDrizzleIndexConfig } from '@zerospin/shapes';
import { mapValues } from 'es-toolkit';

export type IBoundTable = Readonly<{
  key: string;
  table: IAnyTable;
  physicalName: string;
  primaryKeyColumn: string | undefined;
  indexes: readonly Readonly<IDrizzleIndexConfig>[];
}>;
export type IBoundReference = Readonly<{
  source: IBoundTable;
  destination: IBoundTable;
  sourceColumn: string;
  destinationColumn: string;
  descriptor: IPrimitiveDescriptor;
}>;
export type IBoundDatabaseDefinition = Readonly<{
  tables: Readonly<Record<string, IBoundTable>>;
  references: readonly IBoundReference[];
}>;

/** Bind authored identity, physical names, keys, relations and indexes once. */
export function bindDatabaseDefinition<TABLES extends IAnyTables>(tables: TABLES, physicalTableNames: Partial<Record<keyof TABLES & string, string>> = {}): IBoundDatabaseDefinition {
  const identities = new Map<IAnyTable, IBoundTable>();
  const logicalTables = new Map<string, IBoundTable>();
  const physicalNames = new Set<string>();
  const indexNames = new Set<string>();
  mapValues(physicalTableNames, (_name, key) => {
    if (!Object.hasOwn(tables, key)) throw new Error(`Unknown physical table registry key "${key}"`);
  });
  const boundTables: Record<string, IBoundTable> = mapValues(tables, (table, registryKey) => {
    const key = String(registryKey);
    if (!(table instanceof Table)) throw new Error(`Database table "${key}" must be a Table declaration`);
    if (key === '' || identities.has(table)) throw new Error(`Invalid or duplicate table registry identity "${key}"`);
    const physicalName = physicalTableNames[registryKey as keyof TABLES & string] ?? table.name;
    if (typeof physicalName !== 'string' || physicalName === '' || physicalName.includes('\0') || physicalNames.has(physicalName)) throw new Error(`Invalid or duplicate physical table name "${physicalName}"`);
    physicalNames.add(physicalName);
    const primaryKey = resolvePrimaryKey(table, false);
    mapValues(table.shape, (_descriptor, column) => {
      if (column === '' || column.includes('\0')) throw new Error(`Invalid column name on table "${table.name}"`);
    });
    const indexes = table.indexes.map(index => {
      const name = physicalName === table.name ? index.name : `${physicalName}_${index.name}`;
      if (name === '' || name.includes('\0') || indexNames.has(name) || index.columns.length === 0 || new Set(index.columns).size !== index.columns.length || index.columns.some(column => !Object.hasOwn(table.shape, column))) throw new Error(`Invalid or duplicate index "${name}" on "${physicalName}"`);
      indexNames.add(name);
      return Object.freeze({ ...index, name });
    });
    const bound = Object.freeze({ key, table, physicalName, primaryKeyColumn: primaryKey?.columnName, indexes: Object.freeze(indexes) });
    if (logicalTables.has(table.name)) throw new Error(`Table name "${table.name}" is registered more than once`);
    identities.set(table, bound);
    logicalTables.set(table.name, bound);
    return bound;
  });
  const relationNames = mapValues(boundTables, () => new Set<string>());
  const references: IBoundReference[] = [];
  mapValues(boundTables, source => mapValues(source.table.shape, (descriptor, sourceColumn) => {
    const reference = descriptor.references;
    if (reference === undefined) return;
    const destination = logicalTables.get(reference.tableName);
    if (destination === undefined || destination.primaryKeyColumn === undefined) throw new Error(`Reference "${source.table.name}.${sourceColumn}" must reference a registered table with one primary key`);
    const referencedKey = resolvePrimaryKey(destination.table)!;
    if (
      reference.columnName !== referencedKey.columnName ||
      descriptor.kind !== referencedKey.descriptor.kind ||
      (descriptor.kind === PrimitiveKind.Id &&
        (referencedKey.descriptor.kind !== PrimitiveKind.Id ||
          descriptor.abbreviation !== referencedKey.descriptor.abbreviation))
    ) throw new Error(`Reference ${reference.tableName}.${reference.columnName} has an incompatible selected primary key`);
    const names = relationNames[source.key]!;
    const inverseNames = relationNames[destination.key]!;
    if (names.has(reference.relation)) throw new Error(`Duplicate relation "${source.table.name}.${reference.relation}"`);
    names.add(reference.relation);
    if (inverseNames.has(reference.inverse)) throw new Error(`Duplicate relation "${destination.table.name}.${reference.inverse}"`);
    inverseNames.add(reference.inverse);
    references.push(Object.freeze({ source, destination, sourceColumn, destinationColumn: destination.primaryKeyColumn, descriptor }));
  }));
  const visiting = new Set<IBoundTable>();
  const visited = new Set<IBoundTable>();
  function visit(table: IBoundTable) {
    if (visited.has(table)) return;
    if (visiting.has(table)) throw new Error(`Cyclic reference graph at table "${table.table.name}"`);
    visiting.add(table);
    for (const edge of references) if (edge.source === table && edge.destination !== table) visit(edge.destination);
    visiting.delete(table);
    visited.add(table);
  }
  mapValues(boundTables, visit);
  return Object.freeze({ tables: Object.freeze(boundTables), references: Object.freeze(references) });
}
