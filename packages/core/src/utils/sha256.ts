import { hash } from 'fast-sha256';

/** Return the SHA-256 digest of UTF-8 text in portable hexadecimal form. */
export function sha256(value: string): string {
  return Array.from(hash(new TextEncoder().encode(value)), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
