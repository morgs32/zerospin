import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { noise } from '@libp2p/noise';
import { webSockets } from '@libp2p/websockets';
import { yamux } from '@libp2p/yamux';
import { createLibp2p } from 'libp2p';
import type { Plugin as IPlugin } from 'vite';

/** The relay is local to this dev server; browsers only see its same-origin proxy. */
export function peerSpikeRelay(): IPlugin {
  let relay: Awaited<ReturnType<typeof createLibp2p>> | undefined;
  return {
    name: 'peer-spike-relay',
    apply: 'serve',
    async config() {
      relay = await createLibp2p({
        addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
        transports: [webSockets()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: { identify: identify(), relay: circuitRelayServer() },
      });
      const address = relay.getMultiaddrs()[0]?.toString();
      const port = address?.match(/\/tcp\/(\d+)\/ws/)?.[1];
      if (port === undefined) {
        await relay.stop();
        throw new Error('Peer spike relay has no loopback WebSocket listener');
      }
      return {
        server: {
          proxy: {
            '/peer-spike-relay': {
              target: `ws://127.0.0.1:${port}`,
              ws: true,
              rewrite: () => '/',
            },
          },
        },
      };
    },
    configureServer(server) {
      server.middlewares.use('/peer-spike-info', (_request, response) => {
        if (relay === undefined) {
          response.statusCode = 503;
          response.end('Relay unavailable');
          return;
        }
        response.setHeader('content-type', 'application/json');
        response.setHeader('cache-control', 'no-store');
        response.end(JSON.stringify({ peerId: relay.peerId.toString() }));
      });
      server.httpServer?.once('close', () => {
        void relay?.stop();
      });
    },
  };
}
