import type { IAnyError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';

/** Structural diagnostics follow the one whole-lock acceptance comparison. */
function firstDifference(
  expected: unknown,
  submitted: unknown,
  path: string,
): string | undefined {
  if (Object.is(expected, submitted)) return undefined;
  if (
    typeof expected !== 'object' ||
    expected === null ||
    typeof submitted !== 'object' ||
    submitted === null
  ) {
    return path;
  }
  if (Array.isArray(expected) !== Array.isArray(submitted)) return path;
  const keys = [
    ...new Set([...Object.keys(expected), ...Object.keys(submitted)]),
  ].toSorted();
  for (const key of keys) {
    const fieldPath = `${path}.${key}`;
    if (!Object.hasOwn(expected, key) || !Object.hasOwn(submitted, key)) {
      return fieldPath;
    }
    const difference = firstDifference(
      Reflect.get(expected, key),
      Reflect.get(submitted, key),
      fieldPath,
    );
    if (difference !== undefined) return difference;
  }
  return undefined;
}

export function requireSupportedSessionLock<ERROR extends IAnyError>(props: {
  expected: unknown;
  submitted: unknown;
  refuse: (definitionPath: string) => ERROR;
}): Effect.Effect<void, ERROR> {
  const refuse = props.refuse.bind(props);
  const { expected, submitted } = props;
  if (isEqual(expected, submitted)) return Effect.void;
  return Effect.fail(
    refuse(firstDifference(expected, submitted, 'lock') ?? 'lock'),
  );
}
