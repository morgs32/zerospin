import { isZerospinError, makeNodeClosedError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

/** Admit complete local SQL programs and drain every admitted program before host close. */
export function makeNodeSqlGate(
  db: SqliteRemoteDatabase,
  persistenceFailure: (cause: unknown) => void,
) {
  let open = true;
  let serial: Promise<unknown> = Promise.resolve();
  return {
    get closed() {
      return !open;
    },
    assertOpen() {
      if (!open) throw makeNodeClosedError();
    },
    preventNewWork() {
      open = false;
    },
    drain() {
      return serial.then(() => undefined);
    },
    run<A>(work: () => Promise<A>): Promise<A> {
      if (!open) return Promise.reject(makeNodeClosedError());
      const result = serial.then(work).catch(cause => {
        if (!isZerospinError(cause)) persistenceFailure(cause);
        throw cause;
      });
      serial = result.catch(() => undefined);
      return result;
    },
    async transaction<A>(work: () => Promise<A>): Promise<A> {
      await db.run(sql`BEGIN IMMEDIATE`);
      try {
        const result = await work();
        await db.run(sql`COMMIT`);
        return result;
      } catch (cause) {
        try {
          await db.run(sql`ROLLBACK`);
        } catch (rollbackFailure) {
          throw new AggregateError(
            [cause, rollbackFailure],
            'Node transaction and rollback failed',
          );
        }
        throw cause;
      }
    },
  };
}
