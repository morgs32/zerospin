import { mapValues } from 'es-toolkit';

/** Serializable maps order their authored own keys at the projection boundary. */
export function projectSortedRecord<VALUE, RESULT>(
  record: Readonly<Record<string, VALUE>>,
  project: (value: VALUE, key: string) => RESULT,
): Record<string, RESULT> {
  const entries: [string, RESULT][] = [];
  mapValues(record, (value, key) => {
    entries.push([key, project(value, key)]);
  });
  return Object.fromEntries(
    entries.toSorted(([left], [right]) => left.localeCompare(right)),
  );
}
