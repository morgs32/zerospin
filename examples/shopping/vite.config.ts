import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode, command }) => {
  const exampleRoot = fileURLToPath(new URL('.', import.meta.url));
  const environment = loadEnv(mode, exampleRoot, '');
  for (const name of ['VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY']) {
    const value = process.env[name] ?? environment[name];
    if (value !== undefined) process.env[name] = value;
  }
  return {
    plugins: [
      tanstackStart({
        router: {
          routeFileIgnorePattern:
            command === 'build' ? '^\\[__dev\\]' : undefined,
        },
      }),
      react(),
      tailwindcss(),
    ],
    optimizeDeps: {
      include: [
        '@zerospin/devtools > react-router > cookie',
        '@zerospin/devtools > react-router > set-cookie-parser',
      ],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: Number(process.env.PORT ?? 12000),
      strictPort: true,
      allowedHosts: ['shopping.zerospin.localhost'],
    },
  };
});
