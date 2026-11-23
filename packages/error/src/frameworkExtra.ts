import * as Schema from 'effect/Schema';

const ExcludedExtraKeySchema = Schema.Literals(['stack', 'cause']);

export function frameworkExtra(
  value: unknown,
  ancestors = new Set<object>(),
): Schema.Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || ancestors.has(value)) {
    throw new Error('Invalid public error extra');
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new Error('Public error extra must contain plain JSON values');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Array.from(value, item => frameworkExtra(item, ancestors));
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !Schema.is(ExcludedExtraKeySchema)(key))
        .map(([key, item]) => [key, frameworkExtra(item, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}
