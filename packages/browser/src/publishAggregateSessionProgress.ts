import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import type {
  IAggregateSessionDrizzleDb,
  ISessionId,
} from '@zerospin/core/aggregateSession/types';
import { eq } from 'drizzle-orm';

/** Committed progress publication cannot change the command's local outcome. */
export function publishAggregateSessionProgress(props: {
  db: IAggregateSessionDrizzleDb;
  sessionId: ISessionId;
  store: {
    setState(progress: {
      aggregateIndex: number;
      dispositionChainHash: string;
    }): void;
  };
}) {
  const { db, sessionId, store } = props;

  try {
    const metadata = db
      .select()
      .from(aggregateSessionRepoDbConfig.schema.sessionMetadata)
      .where(
        eq(
          aggregateSessionRepoDbConfig.schema.sessionMetadata.sessionId,
          sessionId,
        ),
      )
      .get();
    if (metadata === undefined) {
      throw new Error('Aggregate session metadata missing after commit');
    }
    store.setState({
      aggregateIndex: metadata.aggregateIndex,
      dispositionChainHash: metadata.dispositionChainHash,
    });
  } catch (error) {
    console.error('Cannot publish committed aggregate session progress', error);
  }
}
