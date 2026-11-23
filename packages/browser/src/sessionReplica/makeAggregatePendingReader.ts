import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import type { IAggregateSessionDrizzleDb } from '@zerospin/core/aggregateSession/types';
import { and, asc, isNull } from 'drizzle-orm';

/** Every row belongs to this replica; Node coordinates independently stop handoff. */
export function makeAggregatePendingReader(props: {
  db: Pick<IAggregateSessionDrizzleDb, 'select'>;
}) {
  const { db } = props;
  const commands = aggregateSessionRepoDbConfig.schema.commands;
  return (unretainedOnly = false) =>
    db
      .select()
      .from(commands)
      .where(
        and(
          isNull(commands.aggregateIndex),
          ...(unretainedOnly ? [isNull(commands.nodeId)] : []),
        ),
      )
      .orderBy(asc(commands.sessionIndex))
      .all();
}
