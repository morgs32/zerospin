import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

import {
  decodeBase64Url,
  encodeBase64Url,
  unlockIdentity,
  type IPeerIdentity,
  type IPeerRole,
} from './identity';

export type IRegistration = RegistrationResponseJSON;
export type IAssertion = AuthenticationResponseJSON;
export type IRegisteredCredential = { id: string; publicKey: string; counter: number };

export function randomChallenge(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function withPasskeyFeedback<T>(request: Promise<T>, message: string): Promise<T> {
  try {
    return await request;
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'NotAllowedError') throw new Error(message);
    throw cause;
  }
}

export async function registerIdentity(
  role: IPeerRole,
  challenge: string,
): Promise<{ identity: IPeerIdentity; registration: IRegistration }> {
  const userId = crypto.randomUUID();
  const user = { id: userId, name: `${role}-${userId}`, displayName: `Zerospin ${role}` };
  const credential = await withPasskeyFeedback(navigator.credentials.create({
    publicKey: {
      challenge: decodeBase64Url(challenge),
      rp: { id: globalThis.location.hostname, name: 'Zerospin peer spike' },
      user: { id: new TextEncoder().encode(userId), name: user.name, displayName: user.displayName },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      attestation: 'none',
      extensions: { prf: {} },
    },
  }), 'Passkey creation was canceled, timed out, or is unavailable.');
  if (!(credential instanceof PublicKeyCredential) || !(credential.response instanceof AuthenticatorAttestationResponse)) {
    throw new Error('Passkey creation was canceled, timed out, or is unavailable.');
  }
  const response = credential.response;
  const registration: IRegistration = {
    type: 'public-key',
    id: credential.id,
    rawId: encodeBase64Url(new Uint8Array(credential.rawId)),
    clientExtensionResults: {},
    response: {
      attestationObject: encodeBase64Url(new Uint8Array(response.attestationObject)),
      clientDataJSON: encodeBase64Url(new Uint8Array(response.clientDataJSON)),
      transports: response.getTransports(),
    },
  };
  const identity = await unlockIdentity(role, credential.id);
  return { identity, registration };
}

function normalizePasskeySecret(value: unknown): Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) {
    if (value.byteLength !== 32) throw new Error('The passkey returned an invalid PRF result.');
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    if (value.byteLength !== 32) throw new Error('The passkey returned an invalid PRF result.');
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value.buffer instanceof ArrayBuffer) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const copy = Uint8Array.from(bytes);
    bytes.fill(0);
    return copy;
  }
  if (Array.isArray(value) && value.length === 32 && Array.from(value).every(byte =>
    typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255,
  )) {
    const copy = Uint8Array.from(value);
    try { value.fill(0); } catch { /* The provider may return an immutable array. */ }
    return copy;
  }
  throw new Error('The passkey returned an invalid PRF result.');
}

export async function getPasskeySecret(
  role: IPeerRole,
  credentialId?: string,
): Promise<{ credentialId: string; secret: Uint8Array<ArrayBuffer> }> {
  const credential = await withPasskeyFeedback(navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: globalThis.location.hostname,
      allowCredentials: credentialId === undefined
        ? []
        : [{ type: 'public-key', id: decodeBase64Url(credentialId) }],
      userVerification: 'required',
      extensions: {
        prf: { eval: { first: new TextEncoder().encode(`zerospin-peer-spike/v1/${role}`) } },
      },
    },
  }), 'Passkey unlock was canceled, timed out, or is unavailable.');
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error('Passkey unlock was canceled, timed out, or is unavailable.');
  }
  if (credentialId !== undefined && credential.id !== credentialId) {
    throw new Error('A different passkey was selected.');
  }
  const secret: unknown = credential.getClientExtensionResults().prf?.results?.first;
  if (secret === undefined || secret === null) {
    throw new Error('This passkey or browser does not support WebAuthn PRF.');
  }
  return { credentialId: credential.id, secret: normalizePasskeySecret(secret) };
}

export async function assertIdentity(credentialId: string, challenge: string): Promise<IAssertion> {
  const credential = await withPasskeyFeedback(navigator.credentials.get({
    publicKey: {
      challenge: decodeBase64Url(challenge),
      rpId: globalThis.location.hostname,
      allowCredentials: [{ type: 'public-key', id: decodeBase64Url(credentialId) }],
      userVerification: 'required',
    },
  }), 'Passkey verification was canceled, timed out, or is unavailable.');
  if (!(credential instanceof PublicKeyCredential) || !(credential.response instanceof AuthenticatorAssertionResponse)) {
    throw new Error('Passkey verification was canceled, timed out, or is unavailable.');
  }
  const response = credential.response;
  return {
    type: 'public-key',
    id: credential.id,
    rawId: encodeBase64Url(new Uint8Array(credential.rawId)),
    clientExtensionResults: {},
    response: {
      clientDataJSON: encodeBase64Url(new Uint8Array(response.clientDataJSON)),
      authenticatorData: encodeBase64Url(new Uint8Array(response.authenticatorData)),
      signature: encodeBase64Url(new Uint8Array(response.signature)),
      ...(response.userHandle ? { userHandle: encodeBase64Url(new Uint8Array(response.userHandle)) } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasSafeExtensions(value: unknown): boolean {
  return isRecord(value) && !('prf' in value);
}

export function isRegistration(value: unknown): value is IRegistration {
  if (!isRecord(value) || !isRecord(value.response)) return false;
  const response = value.response;
  return value.type === 'public-key' && typeof value.id === 'string' && value.id === value.rawId &&
    hasSafeExtensions(value.clientExtensionResults) &&
    typeof response.attestationObject === 'string' && typeof response.clientDataJSON === 'string' &&
    (response.transports === undefined || (Array.isArray(response.transports) &&
      response.transports.every(transport => typeof transport === 'string')));
}

function isAssertion(value: unknown): value is IAssertion {
  if (!isRecord(value) || !isRecord(value.response)) return false;
  const response = value.response;
  return value.type === 'public-key' && typeof value.id === 'string' && value.id === value.rawId &&
    hasSafeExtensions(value.clientExtensionResults) && typeof response.clientDataJSON === 'string' &&
    typeof response.authenticatorData === 'string' && typeof response.signature === 'string' &&
    (response.userHandle === undefined || typeof response.userHandle === 'string');
}

function checkClientContext(clientData: string): void {
  const client: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(clientData)));
  if (!isRecord(client)) throw new Error('Invalid passkey client data.');
  if (client.crossOrigin || (client.topOrigin && client.topOrigin !== globalThis.location.origin)) {
    throw new Error('Cross-origin passkey use is not supported.');
  }
}

export async function verifyRegistration(value: unknown, challenge: string): Promise<IRegisteredCredential> {
  if (!isRegistration(value)) throw new Error('Invalid passkey registration.');
  checkClientContext(value.response.clientDataJSON);
  const result = await verifyRegistrationResponse({
    response: value,
    expectedChallenge: challenge,
    expectedOrigin: globalThis.location.origin,
    expectedRPID: globalThis.location.hostname,
    requireUserPresence: true,
    requireUserVerification: true,
    supportedAlgorithmIDs: [-7, -257],
  });
  if (!result.verified || result.registrationInfo.credential.id !== value.id) {
    throw new Error('Passkey registration failed or the credential ID does not match.');
  }
  const credential = result.registrationInfo.credential;
  return { id: credential.id, publicKey: encodeBase64Url(credential.publicKey), counter: credential.counter };
}

export async function verifyAssertion(value: unknown, credential: IRegisteredCredential, challenge: string): Promise<number> {
  if (!isAssertion(value)) throw new Error('Invalid passkey assertion.');
  if (value.id !== credential.id) throw new Error('Passkey credential ID does not match.');
  checkClientContext(value.response.clientDataJSON);
  const result = await verifyAuthenticationResponse({
    response: value,
    expectedChallenge: challenge,
    expectedOrigin: globalThis.location.origin,
    expectedRPID: globalThis.location.hostname,
    requireUserVerification: true,
    credential: { id: credential.id, publicKey: decodeBase64Url(credential.publicKey), counter: credential.counter },
  });
  if (!result.verified) throw new Error('Passkey assertion verification failed.');
  return result.authenticationInfo.newCounter;
}
