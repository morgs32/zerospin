export function get<T, K extends readonly string[]>(
  obj: T,
  path: K,
): IDeepReadonly<T, K> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- must use any to index by string key through the path
  let current: any = obj;

  for (const key of path) {
    if (current === null || typeof current !== 'object' || !(key in current)) {
      return undefined as IDeepReadonly<T, K>;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    current = current[key];
  }

  return current as IDeepReadonly<T, K>;
}

type IDeepReadonly<T, K extends readonly string[]> = K extends [
  infer First,
  ...infer Rest,
]
  ? First extends keyof T
    ? Rest extends readonly string[]
      ? IDeepReadonly<T[First], Rest>
      : never
    : undefined
  : T;
