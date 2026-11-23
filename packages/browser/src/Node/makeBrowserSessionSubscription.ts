/** Own the retained sink from acquisition through replacement or disposal. */
export const makeBrowserSessionSubscription = () => {
  let current: { close(): void } | undefined;
  return {
    async subscribe<REQUEST, SINK extends Disposable>(
      request: REQUEST,
      retain: () => SINK,
      acquire: (
        request: REQUEST,
        retained: SINK,
        isActive: () => boolean,
      ) => Promise<() => void>,
    ) {
      current?.close();
      const retained = retain();
      let closed = false;
      let unsubscribe: (() => void) | undefined;
      const subscription = {
        close() {
          if (closed) return;
          closed = true;
          if (current === subscription) current = undefined;
          try {
            unsubscribe?.();
          } finally {
            retained[Symbol.dispose]();
          }
        },
      };
      current = subscription;
      try {
        const release = await acquire(
          request,
          retained,
          () => !closed && current === subscription,
        );
        if (closed) release();
        else unsubscribe = release;
      } catch (error) {
        subscription.close();
        throw error;
      }
    },
    dispose() {
      current?.close();
    },
  };
};
