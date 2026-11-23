import { makeZerospinError } from '@zerospin/error';

/** The Web Lock remains held until local resources drain; waiting is cancellable. */
export function makeNodeNamespaceLease(namespace: string) {
  const acquired = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const controller = new AbortController();
  let held = false;
  let closing = false;
  let closed: Promise<void> | undefined;
  const lifetime = navigator.locks.request(
    `${namespace}:lifetime`,
    { mode: 'exclusive', signal: controller.signal },
    async () => {
      if (closing) return;
      held = true;
      acquired.resolve();
      await released.promise;
    },
  );
  void lifetime.catch(error => acquired.reject(error));
  void acquired.promise.catch(() => undefined);
  return {
    ready: acquired.promise,
    preventOpening() {
      if (closing) return;
      closing = true;
      if (!held) {
        acquired.reject(makeZerospinError('node-tab-detached'));
        controller.abort();
      }
    },
    close(): Promise<void> {
      if (closed !== undefined) return closed;
      this.preventOpening();
      released.resolve();
      closed = lifetime.catch(error => {
        if (!held && controller.signal.aborted) return;
        throw error;
      });
      return closed;
    },
  };
}
