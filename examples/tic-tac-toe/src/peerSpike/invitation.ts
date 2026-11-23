import sodium from 'libsodium-wrappers';

export interface IPeerInvitation {
  hostPeerId: string;
  hostAddress: string;
  guestPeerId: string;
  credentialId: string;
  token: string;
}

function isInvitation(value: unknown): value is IPeerInvitation {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'hostPeerId' in value &&
    typeof value.hostPeerId === 'string' &&
    'hostAddress' in value &&
    typeof value.hostAddress === 'string' &&
    'guestPeerId' in value &&
    typeof value.guestPeerId === 'string' &&
    'credentialId' in value &&
    typeof value.credentialId === 'string' &&
    'token' in value &&
    typeof value.token === 'string'
  );
}

export async function makeInvitation(
  invitation: IPeerInvitation,
  recipientPublicKey: Uint8Array,
): Promise<string> {
  await sodium.ready;
  const encrypted = sodium.crypto_box_seal(
    sodium.from_string(JSON.stringify(invitation)),
    recipientPublicKey,
  );
  return sodium.to_base64(encrypted, sodium.base64_variants.URLSAFE_NO_PADDING);
}

export async function openInvitation(
  ciphertext: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
  guestPeerId: string,
  credentialId: string,
): Promise<IPeerInvitation> {
  await sodium.ready;
  let invitation: IPeerInvitation;
  try {
    const encrypted = sodium.from_base64(
      ciphertext,
      sodium.base64_variants.URLSAFE_NO_PADDING,
    );
    const plaintext = sodium.crypto_box_seal_open(
      encrypted,
      publicKey,
      privateKey,
    );
    const value: unknown = JSON.parse(sodium.to_string(plaintext));
    if (!isInvitation(value)) throw new Error('Invalid invitation');
    invitation = value;
  } catch {
    throw new Error('The invitation could not be opened with this identity.');
  }
  if (
    invitation.guestPeerId !== guestPeerId ||
    invitation.credentialId !== credentialId
  ) {
    throw new Error('This invitation belongs to another guest.');
  }
  return invitation;
}

export async function makeInvitationToken(): Promise<string> {
  await sodium.ready;
  return sodium.to_base64(
    sodium.randombytes_buf(32),
    sodium.base64_variants.URLSAFE_NO_PADDING,
  );
}
