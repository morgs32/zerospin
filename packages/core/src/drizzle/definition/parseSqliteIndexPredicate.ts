import type { IDrizzleIndexConfig } from '@zerospin/shapes';

/** The fixed table contract supports one column's null phase, without arbitrary SQL expressions. */
export function parseSqliteIndexPredicate(
  sql: string,
): IDrizzleIndexConfig['where'] {
  const trimmed = sql.trim();
  // Drizzle renders null predicates inside one expression wrapper.
  const expression =
    trimmed.startsWith('(') && trimmed.endsWith(')')
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  const match =
    /^\s*(?:"((?:[^"]|"")+)"|([a-z_][a-z0-9_]*))\s+IS\s+(NOT\s+)?NULL\s*;?\s*$/i.exec(expression);
  if (match === null) return undefined;
  return Object.freeze({
    column: match[1]?.replaceAll('""', '"') ?? match[2]!,
    condition: match[3] === undefined ? 'isNull' : 'isNotNull',
  });
}

/** SQLite exposes partial index predicates only in their retained SQL declaration. */
export function readSqliteIndexPredicate(
  sql: string,
): IDrizzleIndexConfig['where'] {
  let quote = '';
  for (let index = 0; index < sql.length; index++) {
    const character = sql[index]!;
    if (quote !== '') {
      if (character === quote) {
        if (sql[index + 1] === quote) {
          index++;
        } else {
          quote = '';
        }
      }
      continue;
    }
    if (
      character === '"' ||
      character === "'" ||
      character === '`' ||
      character === '['
    ) {
      quote = character === '[' ? ']' : character;
      continue;
    }
    if (
      sql.slice(index, index + 5).toLowerCase() === 'where' &&
      !/[\w$]/.test(sql[index - 1] ?? '') &&
      !/[\w$]/.test(sql[index + 5] ?? '')
    ) {
      return parseSqliteIndexPredicate(sql.slice(index + 5));
    }
  }
  return undefined;
}
