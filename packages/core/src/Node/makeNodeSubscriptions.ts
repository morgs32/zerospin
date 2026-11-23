import { makeZerospinError } from '@zerospin/error';

type ISink<VIEW, STATE> = {
  view(view: VIEW, generation?: number): Promise<void>;
  state(state: STATE, generation?: number): Promise<void>;
  reset?(options?: {
    preservePending?: boolean;
    generation?: number;
  }): Promise<void>;
};
type ILease<VIEW, STATE> = {
  sink: ISink<VIEW, STATE>;
  capture(): Promise<VIEW>;
  closed: boolean;
  sending: boolean;
  wake: boolean;
  epoch: number;
  retired: ReturnType<typeof Promise.withResolvers<void>>;
  ready: ReturnType<typeof Promise.withResolvers<void>>;
};

/** Coalesce resource views while retaining each subscriber's unresolved interests. */
export function makeNodeSubscriptions<VIEW, STATE>(source: {
  readState(): Promise<STATE>;
}) {
  const leases = new Set<ILease<VIEW, STATE>>();
  const tasks = new Set<Promise<void>>();
  let closed = false;
  let resetPause: ReturnType<typeof Promise.withResolvers<void>> | undefined;
  let preparingReset: Promise<() => void> | undefined;
  let preservingReset = false;
  function retire(lease: ILease<VIEW, STATE>, reason: unknown) {
    lease.closed = true;
    lease.retired.resolve();
    lease.ready.reject(reason);
    leases.delete(lease);
  }
  function schedule(lease: ILease<VIEW, STATE>) {
    if (closed || lease.closed || resetPause !== undefined) return;
    lease.wake = true;
    if (lease.sending) return;
    lease.sending = true;
    const task = (async () => {
      try {
        while (lease.wake && !lease.closed && resetPause === undefined) {
          lease.wake = false;
          const epoch = lease.epoch;
          const state = await source.readState();
          if (
            lease.closed ||
            epoch !== lease.epoch ||
            resetPause !== undefined
          ) {
            continue;
          }
          await Promise.race([
            lease.sink.state(state, epoch),
            lease.retired.promise,
          ]);
          if (
            lease.closed ||
            epoch !== lease.epoch ||
            resetPause !== undefined
          ) {
            continue;
          }
          const view = await lease.capture();
          if (
            lease.closed ||
            epoch !== lease.epoch ||
            resetPause !== undefined
          ) {
            continue;
          }
          const delivered = await Promise.race([
            Promise.resolve().then(async () => {
              if (
                lease.closed ||
                epoch !== lease.epoch ||
                resetPause !== undefined
              ) {
                return false;
              }
              await lease.sink.view(view, epoch);
              return true;
            }),
            lease.retired.promise.then(() => false),
          ]);
          if (delivered && !lease.closed && epoch === lease.epoch) {
            lease.ready.resolve();
          }
        }
      } catch (cause) {
        if (resetPause === undefined) retire(lease, cause);
      } finally {
        lease.sending = false;
        if (lease.wake && !lease.closed && resetPause === undefined) {
          schedule(lease);
        }
      }
    })();
    tasks.add(task);
    void task.finally(() => tasks.delete(task)).catch(() => undefined);
  }
  return {
    // A claimed local failure withdraws delivery synchronously; reset later performs tab acknowledgements.
    suspend() {
      if (closed || resetPause !== undefined) return;
      resetPause = Promise.withResolvers<void>();
      for (const lease of leases) {
        lease.retired.resolve();
        lease.retired = Promise.withResolvers<void>();
        lease.epoch += 1;
      }
    },
    resume() {
      if (preparingReset !== undefined) return;
      const pause = resetPause;
      resetPause = undefined;
      pause?.resolve();
      for (const lease of leases) schedule(lease);
    },
    async subscribe(sink: ISink<VIEW, STATE>, capture: () => Promise<VIEW>) {
      while (resetPause !== undefined) await resetPause.promise;
      if (closed) throw makeZerospinError('node-closed');
      const lease: ILease<VIEW, STATE> = {
        sink,
        capture,
        closed: false,
        sending: false,
        wake: false,
        epoch: 0,
        retired: Promise.withResolvers<void>(),
        ready: Promise.withResolvers<void>(),
      };
      void lease.ready.promise.catch(() => undefined);
      leases.add(lease);
      schedule(lease);
      await lease.ready.promise;
      return () => retire(lease, makeZerospinError('node-tab-detached'));
    },
    prepareReset: function prepareReset(
      signal?: AbortSignal,
      preservePending = false,
    ): Promise<() => void> {
      if (closed) return Promise.reject(makeZerospinError('node-closed'));
      if (signal?.aborted) {
        return Promise.reject(makeZerospinError('node-tab-detached'));
      }
      if (preparingReset !== undefined) {
        if (!preservePending && preservingReset) {
          preservingReset = false;
          const previous = preparingReset;
          preparingReset = previous.then(async release => {
            preparingReset = undefined;
            try {
              // A fresh producer needs stronger tab acknowledgement without reopening delivery.
              return await prepareReset(signal, false);
            } catch (error) {
              release();
              throw error;
            }
          });
        }
        return preparingReset;
      }
      preservingReset = preservePending;
      const pause = resetPause ?? Promise.withResolvers<void>();
      resetPause = pause;
      const release = () => {
        if (resetPause !== pause) return;
        resetPause = undefined;
        preparingReset = undefined;
        preservingReset = false;
        pause.resolve();
        for (const lease of leases) schedule(lease);
      };
      for (const lease of leases) {
        lease.retired.resolve();
        lease.retired = Promise.withResolvers<void>();
        lease.epoch += 1;
      }
      preparingReset = Promise.all(
        [...leases].map(async lease => {
          if (lease.closed) return;
          if (lease.sink.reset === undefined) {
            throw makeZerospinError('node-reset-attachment-unsupported');
          }
          let deadline: ReturnType<typeof setTimeout> | undefined;
          let aborted: (() => void) | undefined;
          try {
            await Promise.race([
              Promise.resolve().then(() =>
                lease.closed
                  ? undefined
                  : lease.sink.reset?.({
                      preservePending,
                      generation: lease.epoch,
                    }),
              ),
              lease.retired.promise,
              new Promise<never>((_, reject) => {
                deadline = setTimeout(
                  () =>
                    reject(makeZerospinError('node-reset-attachment-timeout')),
                  15_000,
                );
              }),
              new Promise<never>((_, reject) => {
                aborted = () => reject(makeZerospinError('node-tab-detached'));
                signal?.addEventListener('abort', aborted, { once: true });
                if (signal?.aborted) aborted();
              }),
            ]);
            if (closed) throw makeZerospinError('node-closed');
          } finally {
            clearTimeout(deadline);
            if (aborted !== undefined) {
              signal?.removeEventListener('abort', aborted);
            }
          }
        }),
      ).then(
        () => release,
        cause => {
          release();
          throw cause;
        },
      );
      return preparingReset;
    },
    publish() {
      for (const lease of leases) schedule(lease);
    },
    cancel() {
      closed = true;
      for (const lease of leases) {
        retire(lease, makeZerospinError('node-tab-detached'));
      }
      resetPause?.resolve();
      resetPause = undefined;
    },
    async drainLocalTasks() {
      while (tasks.size > 0) await Promise.allSettled([...tasks]);
    },
  };
}
