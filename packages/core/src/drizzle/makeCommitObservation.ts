import type { ISqliteClient } from './types.ts';

/** Delay table-change observation until statement execution and the outer transaction settle. */
export function makeCommitObservation(client: ISqliteClient) {
  let executionDepth = 0;
  let transactionDepth = 0;

  return {
    beginTransaction() {
      transactionDepth += 1;
    },
    finishTransaction() {
      transactionDepth -= 1;
      this.flushWhenSettled();
    },
    beginExecution() {
      executionDepth += 1;
    },
    finishExecution() {
      executionDepth -= 1;
      this.flushWhenSettled();
    },
    flushWhenSettled() {
      if (transactionDepth !== 0 || executionDepth !== 0) return;
      try {
        client.flushTableChanges();
      } catch (cause) {
        // Publication happens after SQLite settled; it cannot change its result.
        console.error('SQLite committed-table observation failed', cause);
      }
    },
  };
}

export type ICommitObservation = ReturnType<typeof makeCommitObservation>;
