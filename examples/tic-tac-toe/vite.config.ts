import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { peerSpikeRelay } from './src/peerSpike/relay';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT ?? 12001),
    strictPort: true,
    allowedHosts: ['tic-tac-toe.zerospin.localhost'],
  },
  plugins: [peerSpikeRelay(), tanstackStart({ spa: { enabled: true } }), react()],
});
