import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import {
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinError,
} from '@zerospin/error';
import { and, asc, eq, getTableColumns, lt, sql, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as Effect from 'effect/Effect';
import { mapValues } from 'es-toolkit';

import type { IFanoutEnrollmentError } from './makeFanoutQueue.js';

export type IFanoutSubscriberTable = SQLiteTable;
export type IFanoutIdentityColumns = Readonly<
  Record<string, AnySQLiteColumn<{ data: string | number; notNull: true }>>
>;
export type IFanoutIdentity<COLUMNS extends IFanoutIdentityColumns> = {
  readonly [FIELD in keyof COLUMNS]: COLUMNS[FIELD]['_']['data'];
};
export type IFanoutSubscriber<
  IDENTITY = Readonly<Record<string, string | number>>,
> = {
  identity: IDENTITY;
  currentIndex: number;
};

/** The subscriber store owns durable identity, enrollment and confirmed progress. */
export const makeFanoutQueueStorage = <
  KEY extends Readonly<Record<string, string | number | undefined>>,
  TABLE extends IFanoutSubscriberTable,
  COLUMNS extends IFanoutIdentityColumns,
>(props: {
  db: IDb;
  subscriberTable: TABLE;
  subscriberIdentityColumns: COLUMNS;
  subscriberIndexColumn: AnySQLiteColumn<{ data: number | null }>;
  subscriberPrefixColumn?: AnySQLiteColumn<{ data: number; notNull: true }>;
  subscriberIdentityFromKey(
    key: KEY,
  ): Effect.Effect<
    IFanoutIdentity<COLUMNS>,
    IZerospinError<
      | 'repo-key-encode-failed'
      | 'aggregate-version-unsupported'
      | 'service-version-unsupported'
      | 'actor-version-unsupported'
      | 'agent-version-unsupported'
    >
  >;
  availableSubscriberIdentities?: readonly IFanoutIdentity<COLUMNS>[];
  acknowledge?(
    tx: ITx,
    identity: IFanoutIdentity<COLUMNS>,
    deliveredThrough: number,
  ): void;
  subscribersWhere?: readonly (SQL | undefined)[];
  key: Readonly<Record<string, string | number | undefined>>;
}) => {
  const {
    db,
    subscriberTable,
    subscriberIdentityColumns,
    subscriberIndexColumn,
    subscriberPrefixColumn,
    subscriberIdentityFromKey,
    availableSubscriberIdentities,
    key,
    subscribersWhere,
  } = props;
  const tableColumns = getTableColumns(subscriberTable);
  const identityColumns = Object.values(subscriberIdentityColumns);
  if (
    identityColumns.length === 0 ||
    Object.values(
      mapValues(
        subscriberIdentityColumns,
        (column, field) =>
          tableColumns[String(field)] === column &&
          column.name !== subscriberIndexColumn.name,
      ),
    ).some(valid => !valid)
  ) {
    throw makeZerospinError({
      code: 'fanout-subscriber-identity-columns-invalid',
      message:
        'Fanout identity columns must name distinct subscriber table fields',
    });
  }
  const indexField = Object.values(
    mapValues(tableColumns, (column, field) =>
      column === subscriberIndexColumn ? field : undefined,
    ),
  ).find(field => field !== undefined);
  if (indexField === undefined) {
    throw makeZerospinError({
      code: 'fanout-subscriber-index-column-invalid',
      message: 'Fanout subscriber cursor must belong to its subscriber table',
    });
  }
  const currentIndex = sql<number>`coalesce(${subscriberIndexColumn}, 0)`;
  const deliveryIndex =
    subscriberPrefixColumn === undefined
      ? currentIndex
      : sql<number>`max(${currentIndex}, ${subscriberPrefixColumn})`;
  const matchesIdentity = (identity: IFanoutIdentity<COLUMNS>) =>
    and(
      ...Object.values(
        mapValues(subscriberIdentityColumns, (column, field) =>
          eq(column, identity[field]),
        ),
      ),
    );
  // One JSON parameter keeps large membership and exclusion sets within SQLite limits.
  const matchesIdentitySet = (identities: Iterable<IFanoutIdentity<COLUMNS>>) =>
    sql`exists (select 1 from json_each(${JSON.stringify([...identities])}) as subscriber_identity where ${and(
      ...Object.values(
        mapValues(
          subscriberIdentityColumns,
          (column, field) =>
            sql`${column} = json_extract(subscriber_identity.value, ${`$.${JSON.stringify(field)}`})`,
        ),
      ),
    )})`;
  const getSubscriberIdentity = (params: KEY) =>
    Effect.gen(function* () {
      yield* Effect.all(
        Object.values(
          mapValues(key, (expected, field) =>
            Reflect.get(params, field) === expected
              ? Effect.void
              : Effect.fail(
                  makeZerospinError({
                    code: 'fanout-subscriber-owner-mismatch',
                    message: `Fanout subscriber key.${field} does not belong to this owner`,
                  }),
                ),
          ),
        ),
      );
      const identity = yield* subscriberIdentityFromKey(params);
      if (
        availableSubscriberIdentities !== undefined &&
        !availableSubscriberIdentities.some(available =>
          Object.values(
            mapValues(
              subscriberIdentityColumns,
              (_, field) => available[field] === identity[field],
            ),
          ).every(Boolean),
        )
      ) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'fanout-subscriber-unavailable',
            message: `Fanout subscriber ${JSON.stringify(identity)} has no available receiving code`,
          }),
        );
      }
      return identity;
    });
  const eligible = (
    tip: number,
    excluded: ReadonlySet<IFanoutIdentity<COLUMNS>>,
    limit: number,
  ): IFanoutSubscriber<IFanoutIdentity<COLUMNS>>[] =>
    db
      .select({
        identity: subscriberIdentityColumns,
        currentIndex: deliveryIndex,
      })
      .from(subscriberTable as never)
      .where(
        and(
          ...(subscribersWhere ?? []),
          availableSubscriberIdentities === undefined
            ? undefined
            : matchesIdentitySet(availableSubscriberIdentities),
          lt(deliveryIndex, tip),
          excluded.size === 0
            ? undefined
            : sql`not ${matchesIdentitySet(excluded)}`,
        ),
      )
      .orderBy(
        asc(deliveryIndex),
        ...identityColumns.map(column => asc(column)),
      )
      .limit(limit)
      .all();
  const acknowledge = (identity: IFanoutIdentity<COLUMNS>, index: number) =>
    Effect.sync(() => {
      db.transaction(tx => {
        tx.update(subscriberTable as never)
          .set({ [indexField]: sql`max(${currentIndex}, ${index})` } as never)
          .where(matchesIdentity(identity))
          .run();
        props.acknowledge?.(tx, identity, index);
      });
    });
  const enroll = (
    subscribeProps: KEY & { currentIndex: number },
  ): Effect.Effect<void, IFanoutEnrollmentError> =>
    Effect.gen(function* () {
      const identity = yield* getSubscriberIdentity(subscribeProps);
      if (subscriberPrefixColumn !== undefined) {
        return yield* makeZerospinError({
          code: 'fanout-subscriber-enroll-failed',
          message: 'This fanout enrolls subscribers through its owner',
        });
      }
      yield* Effect.try({
        try: () =>
          db.transaction(tx => {
            tx.insert(subscriberTable as never)
              .values({
                ...identity,
                [indexField]: subscribeProps.currentIndex,
              } as never)
              .onConflictDoUpdate({
                target: identityColumns,
                set: {
                  [indexField]: sql`max(${currentIndex}, ${subscribeProps.currentIndex})`,
                },
              })
              .run();
            props.acknowledge?.(tx, identity, subscribeProps.currentIndex);
          }),
        catch: cause =>
          makeZerospinError({
            code: 'fanout-subscriber-enroll-failed',
            message: `Failed to enroll fanout subscriber ${JSON.stringify(identity)}`,
            cause: prettyUnknownFailure(cause),
          }),
      });
    });
  return { eligible, acknowledge, enroll };
};
