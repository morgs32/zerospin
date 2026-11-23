import { awaitConnectionStep } from './awaitConnectionStep.ts';

/** One transport owns cancellable host waits, native listeners and ordered Node deliveries. */
export function makeSocketAttempt(isCurrent: () => boolean) {
  const controller = new AbortController();
  const releases = new Set<() => void>();
  let retired = false;
  let deliveries: Promise<void> = Promise.resolve();
  let closed: Promise<void> | undefined;
  const active = () => !retired && isCurrent();
  return {
    signal: controller.signal,
    active,
    wait: <A>(work: PromiseLike<A>) =>
      awaitConnectionStep(work, controller.signal),
    own(release: () => void) {
      if (retired) release();
      else releases.add(release);
      return () => {
        releases.delete(release);
      };
    },
    enqueue(work: () => Promise<void>) {
      const admitted = deliveries.then(async () => {
        if (active()) await work();
      });
      deliveries = admitted.catch(() => undefined);
      return admitted;
    },
    stop(): Promise<void> {
      if (closed !== undefined) return closed;
      const completion = Promise.withResolvers<void>();
      closed = completion.promise;
      retired = true;
      controller.abort();
      let first: unknown;
      let failed = false;
      for (const release of releases) {
        try {
          release();
        } catch (error) {
          if (!failed) {
            first = error;
            failed = true;
          }
        }
      }
      releases.clear();
      void deliveries.then(() => {
        if (failed) completion.reject(first);
        else completion.resolve();
      }, completion.reject);
      return closed;
    },
  };
}
