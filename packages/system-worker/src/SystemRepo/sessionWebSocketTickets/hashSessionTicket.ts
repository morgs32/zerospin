import * as Effect from 'effect/Effect';

/** Issue and spend share the same SHA-256 base64url credential hash. */
export const hashSessionTicket = (ticket: string) =>
  Effect.promise(async () => {
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(ticket),
    );
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
  });
