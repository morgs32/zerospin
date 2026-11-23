/** Attempt independent cleanup in order; release storage exclusion only on success. */
export async function closeNodeStorageOwner(owner: {
  connections?: { close(): void | Promise<void> };
  synchronization?: { stop(): void | Promise<void> };
  node?: { close(): void | Promise<void> };
  runtime?: { dispose(): Promise<void> };
  storage?: { close(): Promise<void> };
  namespace?: { close(): Promise<void> };
}) {
  let first: unknown;
  let failed = false;
  for (const release of [
    () => owner.connections?.close(),
    () => owner.synchronization?.stop(),
    () => owner.node?.close(),
    () => owner.runtime?.dispose(),
    () => owner.storage?.close(),
  ]) {
    try {
      await release();
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
  }
  if (failed) return Promise.reject(first);
  await owner.namespace?.close();
}
