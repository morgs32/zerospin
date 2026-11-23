import type { ISystemSpec } from '@zerospin/core/system/types';
import { createServer } from 'vite';

import { makeStudioViteConfig } from './makeStudioViteConfig.js';

/** Acquire the server and return its one memoized shutdown, including late acquisition after cancellation. */
export async function openStudioServer(props: {
  projectRoot: string;
  port: number;
  open: boolean;
  publicUrl?: string;
  systemSpec: ISystemSpec;
  signal: AbortSignal;
}) {
  const { signal, projectRoot, port, open, publicUrl, systemSpec } = props;
  signal.throwIfAborted();
  const server = await createServer(
    makeStudioViteConfig({
      projectRoot,
      port,
      open,
      systemSpec,
      ...(publicUrl === undefined ? {} : { publicUrl }),
    }),
  );
  let startup: Promise<unknown> = Promise.resolve();
  let disposal: Promise<void> | undefined;
  const dispose = () =>
    (disposal ??= (async () => {
      signal.removeEventListener('abort', canceled);
      await startup.catch(() => undefined);
      await server.close();
    })());
  const canceled = () => {
    void dispose().catch(() => undefined);
  };
  signal.addEventListener('abort', canceled, { once: true });
  try {
    signal.throwIfAborted();
    startup = server.listen();
    await startup;
    signal.throwIfAborted();
    return {
      url:
        publicUrl ??
        server.resolvedUrls?.local[0] ??
        `http://127.0.0.1:${port}`,
      dispose,
    };
  } catch (failure) {
    await dispose().catch(() => undefined);
    throw failure;
  }
}
