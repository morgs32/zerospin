import type { IPeerRole } from './identity';
import {
  isRegistration,
  type IRegisteredCredential,
  type IRegistration,
} from './passkey';

export type IStoredIdentity = {
  role: IPeerRole;
  credentialId: string;
  peerId: string;
  encryptionPublicKey: string;
};

export type IAdmittedGuest = {
  peerId: string;
  encryptionPublicKey: string;
  credential: IRegisteredCredential;
  email: string;
};

export type IGuestHost = {
  hostPeerId: string;
  hostAddress: string;
};

export type IStoredGuestRegistration = {
  registration: IRegistration;
  challenge: string;
};

const prefix = 'zerospin-peer-spike/v1/';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCredential(value: unknown): value is IRegisteredCredential {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.publicKey === 'string' &&
    typeof value.counter === 'number' &&
    Number.isSafeInteger(value.counter) &&
    value.counter >= 0
  );
}

function isGuest(value: unknown): value is IAdmittedGuest {
  return (
    isRecord(value) &&
    typeof value.peerId === 'string' &&
    typeof value.encryptionPublicKey === 'string' &&
    typeof value.email === 'string' &&
    isCredential(value.credential)
  );
}

export function readIdentity(role: IPeerRole): IStoredIdentity | null {
  const stored = localStorage.getItem(`${prefix}identity/${role}`);
  if (stored === null) return null;
  const value: unknown = JSON.parse(stored);
  if (
    !isRecord(value) ||
    value.role !== role ||
    typeof value.credentialId !== 'string' ||
    typeof value.peerId !== 'string' ||
    typeof value.encryptionPublicKey !== 'string'
  ) {
    throw new Error(`Saved ${role} identity metadata is invalid.`);
  }
  if (
    role === 'guest' &&
    (!isRegistration(value.registration) ||
      value.registration.id !== value.credentialId ||
      typeof value.challenge !== 'string')
  ) {
    throw new Error('Saved guest registration is invalid.');
  }
  return {
    role,
    credentialId: value.credentialId,
    peerId: value.peerId,
    encryptionPublicKey: value.encryptionPublicKey,
  };
}

export function saveIdentity(
  role: 'host',
  credentialId: string,
  peerId: string,
  encryptionPublicKey: string,
): void {
  const identity: IStoredIdentity = {
    role,
    credentialId,
    peerId,
    encryptionPublicKey,
  };
  localStorage.setItem(`${prefix}identity/${role}`, JSON.stringify(identity));
}

export function readAdmittedGuests(): IAdmittedGuest[] {
  const stored = localStorage.getItem(`${prefix}guests`);
  if (stored === null) return [];
  const value: unknown = JSON.parse(stored);
  if (!Array.isArray(value) || !value.every(isGuest))
    throw new Error('Saved guest authorizations are invalid.');
  return value;
}

export function saveAdmittedGuest(guest: IAdmittedGuest): void {
  const guests = readAdmittedGuests().filter(
    saved => saved.peerId !== guest.peerId,
  );
  localStorage.setItem(`${prefix}guests`, JSON.stringify([...guests, guest]));
}

export function readGuestHost(): IGuestHost | null {
  const stored = localStorage.getItem(`${prefix}host`);
  if (stored === null) return null;
  const value: unknown = JSON.parse(stored);
  if (
    !isRecord(value) ||
    typeof value.hostPeerId !== 'string' ||
    typeof value.hostAddress !== 'string'
  ) {
    throw new Error('Saved host connection metadata is invalid.');
  }
  return { hostPeerId: value.hostPeerId, hostAddress: value.hostAddress };
}

export function saveGuestHost(host: IGuestHost): void {
  localStorage.setItem(`${prefix}host`, JSON.stringify(host));
}

export function readGuestRegistration(): IStoredGuestRegistration | null {
  const stored = localStorage.getItem(`${prefix}identity/guest`);
  if (stored === null) return null;
  const value: unknown = JSON.parse(stored);
  if (
    !isRecord(value) ||
    value.role !== 'guest' ||
    !isRegistration(value.registration) ||
    value.registration.id !== value.credentialId ||
    typeof value.challenge !== 'string'
  ) {
    throw new Error('Saved guest registration is invalid.');
  }
  return { registration: value.registration, challenge: value.challenge };
}

export function saveGuestIdentity(
  credentialId: string,
  peerId: string,
  encryptionPublicKey: string,
  registration: IRegistration,
  challenge: string,
): void {
  if (!isRegistration(registration) || registration.id !== credentialId)
    throw new Error('Invalid guest registration.');
  const identity = {
    role: 'guest',
    credentialId,
    peerId,
    encryptionPublicKey,
    registration,
    challenge,
  };
  localStorage.setItem(`${prefix}identity/guest`, JSON.stringify(identity));
}
