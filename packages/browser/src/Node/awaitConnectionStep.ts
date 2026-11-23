import { makeZerospinError } from '@zerospin/error';

/** Abort local opening without letting an opaque promise publish into a retired lifetime. */
export async function awaitConnectionStep<A>(
  work: PromiseLike<A>,
  signal: AbortSignal,
): Promise<A> {
  if (signal.aborted) {
    void Promise.resolve(work).catch(() => undefined);
    throw makeZerospinError('node-tab-detached');
  }
  const canceled = Promise.withResolvers<never>();
  const abort = () => canceled.reject(makeZerospinError('node-tab-detached'));
  signal.addEventListener('abort', abort, { once: true });
  try {
    return await Promise.race([work, canceled.promise]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
