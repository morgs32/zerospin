import { mapValues, omitBy } from 'es-toolkit';

function captureValue(value: unknown): unknown {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(captureValue);
  if (
    value !== null &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  ) {
    return mapValues(value, captureValue);
  }
  return value;
}

/** Credentials refresh independently; semantic configuration changes replace the facade. */
export function captureSessionInputs(props: object): object {
  return mapValues(
    omitBy(
      props,
      (value: unknown, key: string) =>
        key === 'getCredentials' || value === undefined,
    ),
    (value: unknown, key: string) =>
      key === 'definition' || key === 'layer'
        ? value
        : key === 'backupPath' &&
            value !== null &&
            typeof value === 'object' &&
            'source' in value
          ? value.source
          : captureValue(value),
  );
}

export function sessionInputsEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date && right instanceof Date) {
    return Object.is(left.getTime(), right.getTime());
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => sessionInputsEqual(item, right[index]))
    );
  }
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Object.getPrototypeOf(left) !== Object.getPrototypeOf(right) ||
    (Object.getPrototypeOf(left) !== Object.prototype &&
      Object.getPrototypeOf(left) !== null)
  ) {
    return false;
  }
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.values(
      mapValues(
        left,
        (value: unknown, key: string) =>
          Object.hasOwn(right, key) &&
          sessionInputsEqual(value, Reflect.get(right, key)),
      ),
    ).every(Boolean)
  );
}
