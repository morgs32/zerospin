import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import type {
  PrivateKey as IPrivateKey,
  Stream as IStream,
} from '@libp2p/interface';
import { noise } from '@libp2p/noise';
import { peerIdFromString } from '@libp2p/peer-id';
import { webSockets } from '@libp2p/websockets';
import { yamux } from '@libp2p/yamux';
import { multiaddr } from '@multiformats/multiaddr';
import { createLibp2p } from 'libp2p';

const protocol = '/zerospin/peer-spike/1.0.0';
const maxMessageLength = 512 * 1024;

export interface IPeerConnectionOptions {
  identity: IPrivateKey;
  onIncoming: (peerId: string, streamId: string) => void;
  onMessage: (
    peerId: string,
    message: string,
    streamId: string,
  ) => void | Promise<void>;
  onDisconnect: (peerId: string, streamId: string) => void;
}

/** A Noise-authenticated stream through the local circuit relay. */
export async function openPeerConnection(options: IPeerConnectionOptions) {
  const infoResponse = await fetch('/peer-spike-info', { cache: 'no-store' });
  if (!infoResponse.ok) throw new Error('Peer relay unavailable');
  const relayInfo: unknown = await infoResponse.json();
  if (
    relayInfo === null ||
    typeof relayInfo !== 'object' ||
    !('peerId' in relayInfo) ||
    typeof relayInfo.peerId !== 'string'
  ) {
    throw new Error('Invalid peer relay identity');
  }
  const relaySocketAddress = `/dns4/${globalThis.location.hostname}/tcp/443/wss/http-path/peer-spike-relay/p2p/${relayInfo.peerId}`;
  const relayAddress = `/p2p/${relayInfo.peerId}`;
  const makeWebSockets = webSockets();
  // This release's WebSocket matcher omits the standardized http-path component.
  // Accept only this application's configured relay path, then use its native dialer.
  const makeRelayWebSockets: typeof makeWebSockets = components => {
    const transport = makeWebSockets(components);
    const originalDialFilter = transport.dialFilter.bind(transport);
    transport.dialFilter = addresses => {
      const matching = originalDialFilter(addresses);
      for (const address of addresses) {
        if (address.toString() === relaySocketAddress) matching.push(address);
      }
      return matching;
    };
    return transport;
  };
  const node = await createLibp2p({
    start: false,
    privateKey: options.identity,
    addresses: { listen: [`${relayAddress}/p2p-circuit`] },
    transports: [makeRelayWebSockets, circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: { identify: identify() },
    connectionGater: { denyDialMultiaddr: async () => false },
  });
  await node.peerStore.merge(peerIdFromString(relayInfo.peerId), {
    multiaddrs: [multiaddr(relaySocketAddress)],
  });
  await node.start();
  const streams = new Map<string, { id: string; stream: IStream }>();

  const attach = (peerId: string, stream: IStream) => {
    const previous = streams.get(peerId);
    if (previous !== undefined && previous.stream !== stream) {
      previous.stream.abort(new Error('Peer stream replaced'));
    }
    const id = crypto.randomUUID();
    streams.set(peerId, { id, stream });
    void (async () => {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let pending = '';
      try {
        for await (const chunk of stream) {
          pending += decoder.decode(chunk.subarray(), { stream: true });
          if (pending.length > maxMessageLength)
            throw new Error('Peer message too large');
          let newline = pending.indexOf('\n');
          while (newline !== -1) {
            const text = pending.slice(0, newline);
            pending = pending.slice(newline + 1);
            const message: unknown = JSON.parse(text);
            if (typeof message !== 'string')
              throw new Error('Invalid peer message');
            if (streams.get(peerId)?.id !== id) return;
            await options.onMessage(peerId, message, id);
            newline = pending.indexOf('\n');
          }
        }
        if (pending !== '') throw new Error('Incomplete peer message');
      } catch (error) {
        stream.abort(
          error instanceof Error ? error : new Error('Peer stream failed'),
        );
      } finally {
        if (streams.get(peerId)?.id === id) {
          streams.delete(peerId);
        }
        options.onDisconnect(peerId, id);
      }
    })();
    return id;
  };

  await node.handle(
    protocol,
    (stream, connection) => {
      const peerId = connection.remotePeer.toString();
      const streamId = attach(peerId, stream);
      options.onIncoming(peerId, streamId);
    },
    { runOnLimitedConnection: true },
  );

  const peerId = node.peerId.toString();
  return {
    peerId,
    address: `${relayAddress}/p2p-circuit/p2p/${peerId}`,
    async dial(address: string, expectedPeerId: string) {
      if (address !== `${relayAddress}/p2p-circuit/p2p/${expectedPeerId}`) {
        throw new Error(
          'Peer address does not match the expected identity and relay',
        );
      }
      const connection = await node.dial(multiaddr(address));
      if (connection.remotePeer.toString() !== expectedPeerId) {
        await connection.close();
        throw new Error('Peer identity did not match');
      }
      const stream = await connection.newStream(protocol, {
        runOnLimitedConnection: true,
      });
      return attach(expectedPeerId, stream);
    },
    async send(remotePeerId: string, message: string, streamId: string) {
      const attached = streams.get(remotePeerId);
      if (attached === undefined || attached.id !== streamId) {
        throw new Error('Peer stream is not current');
      }
      const bytes = new TextEncoder().encode(`${JSON.stringify(message)}\n`);
      if (bytes.length > maxMessageLength)
        throw new Error('Peer message too large');
      if (!attached.stream.send(bytes)) await attached.stream.onDrain();
    },
    isCurrent(remotePeerId: string, streamId: string) {
      return streams.get(remotePeerId)?.id === streamId;
    },
    async close() {
      for (const { stream } of streams.values())
        stream.abort(new Error('Peer connection closed'));
      streams.clear();
      await node.stop();
    },
  };
}
