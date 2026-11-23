import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import sodium from 'libsodium-wrappers';

import { getPasskeySecret } from './passkey';

export type IPeerRole = 'host' | 'guest';

export type IPeerIdentity = {
  credentialId: string;
  peerPrivateKey: Awaited<ReturnType<typeof makePeerPrivateKey>>;
  encryptionPublicKey: Uint8Array;
  encryptionPrivateKey: Uint8Array;
};

function makePeerPrivateKey(seed: Uint8Array) {
  return generateKeyPairFromSeed('Ed25519', seed);
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('Invalid base64url');
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

/** The passkey output is never stored or included in a WebAuthn response sent to a peer. */
export async function unlockIdentity(
  role: IPeerRole,
  credentialId?: string,
): Promise<IPeerIdentity> {
  const passkey = await getPasskeySecret(role, credentialId);
  const prf = passkey.secret;
  const key = await crypto.subtle
    .importKey('raw', prf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .finally(() => prf.fill(0));
  const deriveSeed = async (purpose: string) =>
    new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(`zerospin-peer-spike/v2/${role}/${purpose}`),
      ),
    );
  const [peerSeed, encryptionSeed] = await Promise.all([
    deriveSeed('peer'),
    deriveSeed('invitation'),
  ]);
  await sodium.ready;
  const peerPrivateKey = await makePeerPrivateKey(peerSeed);
  const encryption = sodium.crypto_box_seed_keypair(encryptionSeed);
  peerSeed.fill(0);
  encryptionSeed.fill(0);
  return {
    credentialId: passkey.credentialId,
    peerPrivateKey,
    encryptionPublicKey: encryption.publicKey,
    encryptionPrivateKey: encryption.privateKey,
  };
}
