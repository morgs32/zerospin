import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import { PublicFailureSchema } from '@zerospin/error';
import { makeLiveQuery } from '@zerospin/live-query/makeLiveQuery';
import { eq } from 'drizzle-orm';
import * as Schema from 'effect/Schema';

export type IAggregateCommandOutcome =
  | { readonly status: 'unknown' | 'pending' }
  | { readonly status: 'succeeded'; readonly aggregateIndex: number }
  | {
      readonly status: 'failed';
      readonly aggregateIndex: number;
      readonly failure: typeof PublicFailureSchema.Type;
    };

const unknown = { status: 'unknown' } as const;
const unsubscribe = () => () => {};
const noSnapshot = () => null;

/** Observe only the authoritative result of one command from this session. */
export function useAggregateCommandOutcome<
  DEFINITION extends IAggregateSessionDefinition,
>(props: {
  session: IAggregateSession<DEFINITION>;
  submission: {
    readonly sessionId: string;
    readonly sessionIndex: number;
  } | null;
}): IAggregateCommandOutcome {
  const { session, submission } = props;
  const getInitialized = useCallback(
    () => session.store.getState().initialized,
    [session],
  );
  const initialized = useSyncExternalStore(
    session.store.subscribe,
    getInitialized,
    getInitialized,
  );
  const sessionId = submission?.sessionId;
  const sessionIndex = submission?.sessionIndex;
  const live = useMemo(() => {
    if (
      initialized === null ||
      sessionId !== initialized.sessionId ||
      sessionIndex === undefined
    )
      return null;
    const table = aggregateSessionRepoDbConfig.schema.commands;
    return makeLiveQuery({
      client: initialized.db.$client,
      query: initialized.db
        .select({
          aggregateIndex: table.aggregateIndex,
          failure: table.failure,
        })
        .from(table)
        .where(eq(table.sessionIndex, sessionIndex)),
      onError: error => session.reportFailure({ origin: 'session', error }),
    });
  }, [initialized, sessionId, sessionIndex, session]);
  useEffect(() => live?.subscribe(), [live]);
  const snapshot = useSyncExternalStore(
    live?.store.subscribe ?? unsubscribe,
    live?.store.getState ?? noSnapshot,
    live?.store.getState ?? noSnapshot,
  );
  const row = snapshot?.data[0];
  if (row === undefined || snapshot?.failure !== null) return unknown;
  if (row.aggregateIndex === null) return { status: 'pending' };
  if (row.failure === null)
    return { status: 'succeeded', aggregateIndex: row.aggregateIndex };
  return {
    status: 'failed',
    aggregateIndex: row.aggregateIndex,
    failure: Schema.decodeUnknownSync(
      Schema.fromJsonString(PublicFailureSchema),
    )(row.failure),
  };
}
