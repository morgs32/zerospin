import type { IDevelopmentHistory } from '@zerospin/core/Node/DevelopmentHistorySchema';
import { makeZerospinError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

export const RememberedDevelopmentStorage = Schema.Struct({
  systemId: Schema.String,
  id: Schema.String,
  storageId: Schema.NullOr(Schema.String),
});

export function isLocalNodeEndpoint(apiUrl: string) {
  const { hostname } = new URL(apiUrl);
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

export function localDevelopmentHistory(
  apiUrl: string,
  snapshot: {
    environment: string;
    developmentHistory?: IDevelopmentHistory | undefined;
  },
) {
  if (snapshot.environment === 'dev' && isLocalNodeEndpoint(apiUrl)) {
    return snapshot.developmentHistory;
  }
  return undefined;
}

/** First verified adoption keeps the existing file. Only an explicit successor selects another. */
export function selectDevelopmentStorage(
  previous: typeof RememberedDevelopmentStorage.Type | undefined,
  verified: IDevelopmentHistory | undefined,
  online: boolean,
): typeof RememberedDevelopmentStorage.Type | undefined {
  if (!online) return previous;
  if (previous === undefined) {
    return (
      verified && {
        systemId: verified.systemId,
        id: verified.id,
        storageId: null,
      }
    );
  }
  if (verified?.systemId === previous.systemId) {
    if (previous.id === verified.id) return previous;
    if (verified.replaced.includes(previous.id)) {
      return {
        systemId: verified.systemId,
        id: verified.id,
        storageId: verified.id,
      };
    }
  }
  throw makeZerospinError({
    code: 'node-development-history-mismatch',
    message:
      'The development System could not verify continuity with this browser. Its saved commands have been preserved.',
  });
}
