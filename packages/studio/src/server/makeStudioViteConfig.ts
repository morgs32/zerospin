import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import rsc from '@vitejs/plugin-rsc';
import type { ISystemSpec } from '@zerospin/core/system/types';
import {
  defaultClientConditions,
  defaultServerConditions,
  searchForWorkspaceRoot,
  type InlineConfig,
} from 'vite';

/** Build Studio's local server configuration without opening resources. */
export function makeStudioViteConfig(props: {
  projectRoot: string;
  port: number;
  open: boolean;
  publicUrl?: string;
  systemSpec: ISystemSpec;
}): InlineConfig {
  const { projectRoot, port, open, publicUrl, systemSpec } = props;
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const systemSpecModule = 'virtual:zerospin-studio-system-spec';
  const serializedSystemSpec = JSON.stringify(systemSpec);
  return {
    root,
    configFile: false,
    appType: 'custom',
    resolve: {
      conditions: ['source', ...defaultClientConditions],
    },
    plugins: [
      rsc({
        entries: {
          rsc: resolve(root, 'src/entry.rsc.tsx'),
          ssr: resolve(root, 'src/entry.ssr.tsx'),
          client: resolve(root, 'src/main.tsx'),
        },
      }),
      react(),
      tailwindcss(),
      {
        name: 'zerospin-studio-declarations',
        resolveId(id) {
          if (id === systemSpecModule) {
            return `\0${systemSpecModule}`;
          }
          return null;
        },
        load(id) {
          if (id !== `\0${systemSpecModule}`) {
            return;
          }
          if (this.environment.name !== 'rsc') {
            throw new Error(
              'Studio metadata is only available to its Server Component.',
            );
          }
          return `export default ${JSON.stringify(serializedSystemSpec)};`;
        },
      },
    ],
    optimizeDeps: {
      exclude: ['@zerospin/system-diagrams'],
    },
    environments: {
      rsc: {
        resolve: {
          conditions: ['react-server', 'source', ...defaultServerConditions],
          noExternal: ['@zerospin/system-diagrams'],
        },
      },
      ssr: {
        resolve: {
          conditions: ['source', ...defaultServerConditions],
          noExternal: ['@zerospin/system-diagrams'],
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port,
      open: open ? (publicUrl ?? true) : false,
      strictPort: true,
      fs: { allow: [searchForWorkspaceRoot(root), projectRoot] },
    },
  };
}
