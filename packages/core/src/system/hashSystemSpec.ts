import { mapValues } from 'es-toolkit';

import { sha256 } from '../utils/sha256.ts';

import type { ISystemSpec } from './types.ts';

/** Canonical JSON rejects values JSON.stringify would silently omit or coerce. */
function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${Array.from(value, canonicalJson).join(',')}]`;
  }
  if (
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  ) {
    if (Reflect.ownKeys(value).length !== Object.keys(value).length) {
      throw new Error(
        'SystemSpec metadata must contain only JSON object properties',
      );
    }
    const fields: [string, string][] = [];
    mapValues(value, (entry, key) => {
      fields.push([key, canonicalJson(entry)]);
    });
    fields.sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${fields.map(([key, entry]) => `${JSON.stringify(key)}:${entry}`).join(',')}}`;
  }
  throw new Error('SystemSpec metadata must contain only JSON values');
}

/** Hash typed portable content; receiving boundaries validate SystemSpecs. */
export function hashSystemSpec(
  spec: Omit<ISystemSpec, 'hash'> & { readonly hash?: string },
): string {
  const { hash: _hash, ...body } = spec;
  return sha256(canonicalJson(body));
}
