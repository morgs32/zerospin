import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export type IWranglerDevelopmentAdapter = {
  unstable_getVarsForDev(
    configPath: string,
    envFiles: undefined,
    vars: Record<string, string>,
    env: undefined,
    silent: boolean,
  ): Record<string, { type: string; value: unknown }>;
};

export function loadWranglerDevelopmentAdapter(
  cwd: string,
): IWranglerDevelopmentAdapter {
  const adapter: IWranglerDevelopmentAdapter = require(
    require.resolve('wrangler', { paths: [cwd] }),
  );
  if (typeof adapter.unstable_getVarsForDev !== 'function') {
    throw new Error('Wrangler does not expose the required development API.');
  }
  return adapter;
}
