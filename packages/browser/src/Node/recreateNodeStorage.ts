/** Called only by the namespace owner after every SQLite/VFS handle has drained. */
export async function recreateNodeStorage(
  namespace: string,
  assertCurrent: () => void,
  onCleanupFailure?: (error: unknown) => void,
): Promise<void> {
  assertCurrent();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(namespace);
    const timeout = setTimeout(() => {
      const error = new Error('Node storage replacement did not complete');
      onCleanupFailure?.(error);
      reject(error);
    }, 10_000);
    request.onsuccess = () => {
      clearTimeout(timeout);
      resolve();
    };
    request.onerror = () => {
      clearTimeout(timeout);
      reject(request.error);
    };
    request.onblocked = () => {
      const error = new Error(
        'Node storage replacement is blocked by an open handle',
      );
      // IndexedDB deletion cannot be cancelled. Retain namespace exclusion until this owner is retired.
      clearTimeout(timeout);
      onCleanupFailure?.(error);
      reject(error);
    };
  });
  assertCurrent();
}
