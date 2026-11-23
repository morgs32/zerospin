import { Button } from '@base-ui/react/button';
import { Input } from '@base-ui/react/input';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { openPeerConnection } from '../peerSpike/connection';
import {
  decodeBase64Url,
  encodeBase64Url,
  unlockIdentity,
  type IPeerIdentity,
} from '../peerSpike/identity';
import { makeInvitation, makeInvitationToken, openInvitation } from '../peerSpike/invitation';
import { assertIdentity, randomChallenge, registerIdentity, verifyAssertion, verifyRegistration } from '../peerSpike/passkey';
import {
  readAdmittedGuests,
  readGuestHost,
  readGuestRegistration,
  readIdentity,
  saveAdmittedGuest,
  saveGuestHost,
  saveGuestIdentity,
  saveIdentity,
  type IAdmittedGuest,
} from '../peerSpike/storage';

export const Route = createFileRoute('/peer-spike')({ component: PeerSpike });

type IRole = 'host' | 'guest';
type IConnection = Awaited<ReturnType<typeof openPeerConnection>>;
type IIdentityAvailability = 'loading' | 'missing' | 'present' | 'error';
type IIdentityAction = 'create' | 'unlock';

interface IPendingGuest extends IAdmittedGuest {
  token: string;
}

interface IAuthenticationAttempt {
  challenge: string;
  guest: IAdmittedGuest;
  invitation: boolean;
  streamId: string;
}

interface IRuntime {
  role: IRole;
  identity: IPeerIdentity;
  connection: IConnection;
  registration?: unknown;
  registrationChallenge?: string;
  pending: Map<string, IPendingGuest>;
  attempts: Map<string, IAuthenticationAttempt>;
  admitted: Map<string, string>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown, key: string): string {
  if (!record(value) || typeof value[key] !== 'string') {
    throw new Error(`Missing ${key} in peer message.`);
  }
  return value[key];
}

function parseIntroductionLink(text: string): { hostPeerId: string; hostAddress: string } {
  const url = new URL(text);
  if (url.origin !== window.location.origin || url.pathname !== '/peer-spike') {
    throw new Error('Use an introduction link from this app.');
  }
  const hostPeerId = url.searchParams.get('host');
  const hostAddress = url.searchParams.get('address');
  if (!hostPeerId || !hostAddress) throw new Error('The introduction link is incomplete.');
  return { hostPeerId, hostAddress };
}

function PeerSpike() {
  const [role, setRole] = useState<IRole>('host');
  const [email, setEmail] = useState('');
  const [introductionLink, setIntroductionLink] = useState('');
  const [invitationLink, setInvitationLink] = useState('');
  const [invitationInput, setInvitationInput] = useState('');
  const [status, setStatus] = useState('Choose a role and unlock your identity.');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [identityUnverified, setIdentityUnverified] = useState(false);
  const [initialRecoveredHostSaved, setInitialRecoveredHostSaved] = useState(false);
  const [identityAvailability, setIdentityAvailability] = useState<IIdentityAvailability>('loading');
  const [connected, setConnected] = useState(false);
  const [pendingChallenge, setPendingChallenge] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const remotePeerId = useRef('');
  const runtime = useRef<IRuntime | null>(null);
  const introductionStream = useRef<{ peerId: string; streamId: string } | null>(null);
  const awaitingChallenge = useRef<{ peerId: string; streamId: string } | null>(null);
  const challengeRef = useRef<{ peerId: string; streamId: string; challenge: string } | null>(null);
  const sentAssertion = useRef<{ peerId: string; streamId: string } | null>(null);
  const handleMessage = useRef<(peerId: string, message: string, streamId: string) => Promise<void>>(async () => {});

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('host')) setRole('guest');
  }, []);
  useEffect(() => {
    try {
      setIdentityAvailability(readIdentity(role) ? 'present' : 'missing');
      setError('');
    } catch {
      setIdentityAvailability('error');
      setError(`Saved ${role} identity information could not be read.`);
    }
  }, [role]);
  useEffect(() => () => { void runtime.current?.connection.close(); }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The operation failed.'); }
    finally { setBusy(false); }
  };

  handleMessage.current = async (peerId, raw, streamId) => {
    const current = runtime.current;
    if (!current || !current.connection.isCurrent(peerId, streamId)) return;
    const parsed: unknown = JSON.parse(raw);
    const kind = getString(parsed, 'kind');
    if (current.role === 'host' && kind === 'introduction') {
      if (!record(parsed)) throw new Error('Invalid introduction.');
      const guestEmail = getString(parsed, 'email');
      const encryptionPublicKey = getString(parsed, 'encryptionPublicKey');
      const registrationChallenge = getString(parsed, 'registrationChallenge');
      const credential = await verifyRegistration(parsed.registration, registrationChallenge);
      const token = await makeInvitationToken();
      const guest: IPendingGuest = { peerId, email: guestEmail, encryptionPublicKey, credential, token };
      const ciphertext = await makeInvitation({
        hostPeerId: current.connection.peerId,
        hostAddress: current.connection.address,
        guestPeerId: peerId,
        credentialId: credential.id,
        token,
      }, decodeBase64Url(encryptionPublicKey));
      if (!current.connection.isCurrent(peerId, streamId)) return;
      current.pending.set(peerId, guest);
      setInvitationLink(ciphertext);
      setEmail(guestEmail);
      setStatus(`Introduction received from ${guestEmail}. Copy the encrypted invitation into Gmail.`);
      return;
    }
    if (current.role === 'host' && (kind === 'redeem' || kind === 'resume')) {
      const credentialId = getString(parsed, 'credentialId');
      let guest: IAdmittedGuest | undefined;
      if (kind === 'redeem') {
        const candidate = current.pending.get(peerId);
        if (!candidate || candidate.token !== getString(parsed, 'token') || candidate.credential.id !== credentialId) {
          throw new Error('The invitation does not match this guest.');
        }
        guest = candidate;
      } else {
        guest = readAdmittedGuests().find(item => item.peerId === peerId && item.credential.id === credentialId);
        if (!guest) throw new Error('This guest has not been admitted.');
      }
      const challenge = randomChallenge();
      current.attempts.set(peerId, { challenge, guest, invitation: kind === 'redeem', streamId });
      await current.connection.send(peerId, JSON.stringify({ kind: 'challenge', challenge }), streamId);
      return;
    }
    if (current.role === 'host' && kind === 'assertion') {
      if (!record(parsed)) throw new Error('Invalid assertion.');
      const attempt = current.attempts.get(peerId);
      if (!attempt || attempt.streamId !== streamId) throw new Error('There is no outstanding passkey challenge.');
      current.attempts.delete(peerId);
      const newCounter = await verifyAssertion(parsed.assertion, attempt.guest.credential, attempt.challenge);
      if (!current.connection.isCurrent(peerId, streamId)) return;
      if (attempt.invitation) {
        if (current.pending.get(peerId) !== attempt.guest) throw new Error('The invitation is no longer pending.');
      }
      saveAdmittedGuest({
        peerId: attempt.guest.peerId,
        email: attempt.guest.email,
        encryptionPublicKey: attempt.guest.encryptionPublicKey,
        credential: { ...attempt.guest.credential, counter: newCounter },
      });
      if (attempt.invitation) current.pending.delete(peerId);
      current.admitted.set(peerId, streamId);
      remotePeerId.current = peerId;
      setConnected(true);
      setStatus(`${attempt.guest.email} is authenticated.`);
      await current.connection.send(peerId, JSON.stringify({ kind: 'admitted' }), streamId);
      return;
    }
    if (current.role === 'guest' && kind === 'challenge') {
      const host = readGuestHost();
      if (!host || host.hostPeerId !== peerId || awaitingChallenge.current?.peerId !== peerId || awaitingChallenge.current.streamId !== streamId) throw new Error('The challenge came from an unexpected host.');
      const challenge = getString(parsed, 'challenge');
      awaitingChallenge.current = null;
      challengeRef.current = { peerId, streamId, challenge };
      sentAssertion.current = null;
      remotePeerId.current = peerId;
      setPendingChallenge(challenge);
      setStatus('Approve your passkey to authenticate to the host.');
      return;
    }
    if (current.role === 'guest' && kind === 'admitted') {
      const host = readGuestHost();
      if (!host || host.hostPeerId !== peerId || sentAssertion.current?.peerId !== peerId || sentAssertion.current.streamId !== streamId) throw new Error('Unexpected host admission.');
      sentAssertion.current = null;
      current.admitted.set(peerId, streamId);
      remotePeerId.current = peerId;
      setConnected(true);
      setStatus('The host admitted this guest.');
      return;
    }
    if (kind === 'message') {
      if (current.admitted.get(peerId) !== streamId) throw new Error('The peer is not authenticated.');
      setMessages(items => [...items, `Peer: ${getString(parsed, 'text')}`]);
      return;
    }
    throw new Error('Unexpected peer message.');
  };

  const unlock = (action: IIdentityAction) => run(async () => {
    const saved = readIdentity(role);
    if (action === 'create' && saved) {
      throw new Error(`This browser already has a ${role} identity. Unlock it instead.`);
    }
    const challenge = randomChallenge();
    const created = action === 'create' ? await registerIdentity(role, challenge) : undefined;
    const identity = created?.identity ?? await unlockIdentity(role, saved?.credentialId);
    const connection = await openPeerConnection({
      identity: identity.peerPrivateKey,
      onIncoming: peerId => {
        const current = runtime.current;
        const wasAdmitted = current?.admitted.delete(peerId);
        current?.attempts.delete(peerId);
        const authenticating = challengeRef.current?.peerId === peerId ||
          awaitingChallenge.current?.peerId === peerId || sentAssertion.current?.peerId === peerId;
        if (challengeRef.current?.peerId === peerId) {
          challengeRef.current = null;
          setPendingChallenge('');
        }
        if (awaitingChallenge.current?.peerId === peerId) awaitingChallenge.current = null;
        if (sentAssertion.current?.peerId === peerId) sentAssertion.current = null;
        if (wasAdmitted && remotePeerId.current === peerId) setConnected(false);
        if (authenticating || (wasAdmitted && remotePeerId.current === peerId)) {
          setStatus('The peer connection changed. Start authentication again.');
        }
      },
      onMessage: (peerId, raw, streamId) => handleMessage.current(peerId, raw, streamId).catch(() => {
        setError('The peer message was rejected.');
        throw new Error('Peer message rejected.');
      }),
      onDisconnect: (peerId, streamId) => {
        const current = runtime.current;
        if (current?.admitted.get(peerId) === streamId) {
          current.admitted.delete(peerId);
          if (remotePeerId.current === peerId) {
            setConnected(false);
            setStatus('The peer disconnected.');
          }
        }
        if (current?.attempts.get(peerId)?.streamId === streamId) current.attempts.delete(peerId);
        const authenticating = challengeRef.current?.streamId === streamId ||
          awaitingChallenge.current?.streamId === streamId || sentAssertion.current?.streamId === streamId;
        if (challengeRef.current?.streamId === streamId) {
          challengeRef.current = null;
          setPendingChallenge('');
        }
        if (awaitingChallenge.current?.streamId === streamId) awaitingChallenge.current = null;
        if (sentAssertion.current?.streamId === streamId) sentAssertion.current = null;
        if (authenticating) setStatus('The connection closed before authentication completed. Reconnect to try again.');
        if (introductionStream.current?.peerId === peerId && introductionStream.current.streamId === streamId) {
          introductionStream.current = null;
          setStatus('The introduction connection closed. If no invitation arrives, send the introduction again.');
        }
      },
    });
    const publicKey = encodeBase64Url(identity.encryptionPublicKey);
    if (saved && (saved.peerId !== connection.peerId || saved.encryptionPublicKey !== publicKey)) {
      await connection.close();
      throw new Error('This passkey does not match the saved identity. Identities created with a phrase cannot be unlocked by this version.');
    }
    if (!saved) {
      try {
        if (readIdentity(role)) {
          throw new Error(`A ${role} identity was saved while setup was in progress. Unlock it instead.`);
        }
      } catch (cause) {
        await connection.close();
        throw cause;
      }
    }
    if (!saved && created) {
      if (role === 'guest') {
        saveGuestIdentity(identity.credentialId, connection.peerId, publicKey, created.registration, challenge);
      } else {
        saveIdentity(role, identity.credentialId, connection.peerId, publicKey);
      }
    }
    let initialHostSaved = false;
    if (!saved && !created && role === 'host') {
      try {
        if (readAdmittedGuests().length === 0) {
          saveIdentity('host', identity.credentialId, connection.peerId, publicKey);
          initialHostSaved = true;
        }
      } catch (cause) {
        await connection.close();
        throw cause;
      }
    }
    const savedRegistration = role === 'guest' ? readGuestRegistration() : null;
    runtime.current = {
      role, identity, connection, registration: savedRegistration?.registration,
      registrationChallenge: savedRegistration?.challenge,
      pending: new Map(), attempts: new Map(), admitted: new Map(),
    };
    setIdentityUnverified(!saved && !created);
    setInitialRecoveredHostSaved(initialHostSaved);
    if (saved || created || initialHostSaved) setIdentityAvailability('present');
    setUnlocked(true);
    if (role === 'host') {
      const url = new URL('/peer-spike', window.location.origin);
      url.searchParams.set('host', connection.peerId);
      url.searchParams.set('address', connection.address);
      setIntroductionLink(url.toString());
      setStatus('Host unlocked. Share the introduction link with the guest browser.');
    } else {
      const url = new URL(window.location.href);
      if (url.searchParams.has('host')) setIntroductionLink(url.toString());
      setStatus('Guest unlocked. Introduce this guest or reconnect to the host.');
    }
  });

  const introduce = () => run(async () => {
    const current = runtime.current;
    if (!current || current.role !== 'guest') throw new Error('Unlock the guest first.');
    if (!email.trim()) throw new Error('Enter the guest email address.');
    if (!current.registration || !current.registrationChallenge) throw new Error('The original guest registration is unavailable. Reload this page and choose Create passkey to request a new invitation, or reconnect to a host that already admitted this passkey.');
    const host = parseIntroductionLink(introductionLink);
    saveGuestHost(host);
    introductionStream.current = null;
    const streamId = await current.connection.dial(host.hostAddress, host.hostPeerId);
    introductionStream.current = { peerId: host.hostPeerId, streamId };
    try {
      await current.connection.send(host.hostPeerId, JSON.stringify({
        kind: 'introduction', email: email.trim(),
        encryptionPublicKey: encodeBase64Url(current.identity.encryptionPublicKey),
        registration: current.registration,
        registrationChallenge: current.registrationChallenge,
      }), streamId);
      if (!current.connection.isCurrent(host.hostPeerId, streamId)) throw new Error('The introduction connection closed. Send the introduction again.');
      if (introductionStream.current?.streamId === streamId) setStatus('Introduction sent. Wait for the host to email your encrypted invitation.');
    } catch (cause) {
      if (introductionStream.current?.streamId === streamId) introductionStream.current = null;
      throw cause;
    }
  });

  const redeem = () => run(async () => {
    const current = runtime.current;
    if (!current || current.role !== 'guest') throw new Error('Unlock the guest first.');
    const invitation = await openInvitation(invitationInput.trim(), current.identity.encryptionPublicKey, current.identity.encryptionPrivateKey, current.connection.peerId, current.identity.credentialId);
    const host = { hostPeerId: invitation.hostPeerId, hostAddress: invitation.hostAddress };
    const introducedHost = readGuestHost();
    if (!introducedHost || introducedHost.hostPeerId !== host.hostPeerId || introducedHost.hostAddress !== host.hostAddress) {
      throw new Error('The invitation does not match the introduced host.');
    }
    current.admitted.delete(host.hostPeerId);
    setConnected(false);
    introductionStream.current = null;
    const streamId = await current.connection.dial(host.hostAddress, host.hostPeerId);
    awaitingChallenge.current = { peerId: host.hostPeerId, streamId };
    await current.connection.send(host.hostPeerId, JSON.stringify({ kind: 'redeem', credentialId: current.identity.credentialId, token: invitation.token }), streamId);
    if (!current.connection.isCurrent(host.hostPeerId, streamId)) throw new Error('The connection closed before authentication completed. Reconnect to try again.');
    if (awaitingChallenge.current?.streamId === streamId) setStatus('Invitation opened. Waiting for the host challenge.');
  });

  const resume = () => run(async () => {
    const current = runtime.current;
    const savedHost = readGuestHost();
    const host = savedHost ?? (introductionLink.trim() ? parseIntroductionLink(introductionLink) : null);
    if (!current || current.role !== 'guest' || !host) throw new Error('No host connection has been saved.');
    if (!savedHost) saveGuestHost(host);
    current.admitted.delete(host.hostPeerId);
    setConnected(false);
    introductionStream.current = null;
    const streamId = await current.connection.dial(host.hostAddress, host.hostPeerId);
    awaitingChallenge.current = { peerId: host.hostPeerId, streamId };
    await current.connection.send(host.hostPeerId, JSON.stringify({ kind: 'resume', credentialId: current.identity.credentialId }), streamId);
    if (!current.connection.isCurrent(host.hostPeerId, streamId)) throw new Error('The connection closed before authentication completed. Reconnect to try again.');
    if (awaitingChallenge.current?.streamId === streamId) setStatus('Waiting for the host challenge.');
  });

  const authenticate = () => run(async () => {
    const current = runtime.current;
    const pending = challengeRef.current;
    if (!current || !pending || !pendingChallenge || !remotePeerId.current) throw new Error('No passkey challenge is pending.');
    const assertion = await assertIdentity(current.identity.credentialId, pending.challenge);
    if (challengeRef.current !== pending || !current.connection.isCurrent(pending.peerId, pending.streamId)) throw new Error('The peer connection changed during passkey verification.');
    challengeRef.current = null;
    setPendingChallenge('');
    sentAssertion.current = { peerId: pending.peerId, streamId: pending.streamId };
    await current.connection.send(pending.peerId, JSON.stringify({ kind: 'assertion', assertion }), pending.streamId);
    if (!current.connection.isCurrent(pending.peerId, pending.streamId)) throw new Error('The connection closed before authentication completed. Reconnect to try again.');
    if (sentAssertion.current?.streamId === pending.streamId) setStatus('Passkey proof sent. Waiting for the host.');
  });

  const send = () => run(async () => {
    const current = runtime.current;
    const peerId = remotePeerId.current;
    if (!current || !connected || !peerId || !message.trim()) return;
    const streamId = current.admitted.get(peerId);
    if (!streamId || !current.connection.isCurrent(peerId, streamId)) throw new Error('The peer is not authenticated.');
    await current.connection.send(peerId, JSON.stringify({ kind: 'message', text: message }), streamId);
    setMessages(items => [...items, `You: ${message}`]);
    setMessage('');
  });

  const copy = (value: string, message: string) =>
    run(async () => {
      await navigator.clipboard.writeText(value);
      setStatus(message);
    });

  return (
    <main className="peer-spike">
      <header className="peer-spike__header">
        <div>
          <p className="peer-spike__eyebrow">
            Zerospin <span aria-hidden="true">/</span> Experiment
          </p>
          <h1>Browser peers</h1>
          <p>Connect two browsers and exchange encrypted messages.</p>
        </div>
        <span className="peer-spike__badge">Local spike</span>
      </header>

      <div className="peer-spike__notice" role="status">
        <span className="peer-spike__status-dot" aria-hidden="true" />
        <div>
          <strong>
            {connected
              ? 'Connected'
              : unlocked
                ? 'In progress'
                : 'Getting started'}
          </strong>
          <p>{status}</p>
        </div>
      </div>
      {error && (
        <div className="peer-spike__error" role="alert">
          {error}
        </div>
      )}

      {!unlocked && (
        <section className="peer-spike__card" aria-labelledby="identity-title">
          <div className="peer-spike__card-header">
            <div>
              <p className="peer-spike__step">Step 1</p>
              <h2 id="identity-title">Set up your browser</h2>
              <p>
                Open this page in two separate browsers or profiles, and choose
                a different role in each.
              </p>
            </div>
          </div>
          <div className="peer-spike__card-body">
            <div className="peer-spike__field">
              <span className="peer-spike__label" id="role-label">
                Browser role
              </span>
              <div
                className="peer-spike__roles"
                role="group"
                aria-labelledby="role-label"
              >
                <Button
                  className="peer-spike__role"
                  disabled={busy}
                  aria-pressed={role === 'host'}
                  onClick={() => setRole('host')}
                >
                  Host <span>Sends the invitation</span>
                </Button>
                <Button
                  className="peer-spike__role"
                  disabled={busy}
                  aria-pressed={role === 'guest'}
                  onClick={() => setRole('guest')}
                >
                  Guest <span>Receives the invitation</span>
                </Button>
              </div>
            </div>
            <div className="peer-spike__actions">
              <Button
                className="peer-spike__button peer-spike__button--primary"
                disabled={busy || identityAvailability !== 'missing'}
                onClick={() => unlock('create')}
              >
                Create passkey
              </Button>
              <Button
                className="peer-spike__button"
                disabled={busy || identityAvailability === 'loading' || identityAvailability === 'error'}
                onClick={() => unlock('unlock')}
              >
                Use existing passkey
              </Button>
            </div>
            <p className="peer-spike__hint">
              {identityAvailability === 'present'
                ? `A ${role} identity is saved in this browser. Unlock it to continue.`
                : identityAvailability === 'missing'
                  ? `No ${role} identity is saved here. You can create a passkey or select an existing one.`
                  : identityAvailability === 'error'
                    ? 'Your saved identity could not be read.'
                    : 'Checking for a saved identity…'}
            </p>
          </div>
        </section>
      )}

      {unlocked && identityUnverified && (
        <div className="peer-spike__notice" role="status">
          <div>
            <strong>Existing passkey selected</strong>
            <p>
              This browser had no saved identity to compare, so the selected
              identity cannot be confirmed locally.
              {initialRecoveredHostSaved
                ? ' The current host identity was saved in this browser.'
                : ' No new identity was saved.'}
            </p>
          </div>
        </div>
      )}

      {unlocked && role === 'host' && (
        <>
          <section
            className="peer-spike__card"
            aria-labelledby="host-intro-title"
          >
            <div className="peer-spike__card-header">
              <p className="peer-spike__step">Step 2</p>
              <h2 id="host-intro-title">Introduce a guest</h2>
              <p>
                Share this link with the guest browser to receive its public
                key.
              </p>
            </div>
            <div className="peer-spike__card-body">
              <label className="peer-spike__label" htmlFor="host-intro">
                Introduction link
              </label>
              <textarea
                className="peer-spike__input peer-spike__textarea"
                id="host-intro"
                readOnly
                value={introductionLink}
                rows={3}
              />
              <Button
                className="peer-spike__button"
                disabled={busy}
                onClick={() =>
                  copy(introductionLink, 'Introduction link copied.')
                }
              >
                Copy introduction link
              </Button>
            </div>
          </section>
          {invitationLink && (
            <section
              className="peer-spike__card"
              aria-labelledby="host-invitation-title"
            >
              <div className="peer-spike__card-header">
                <p className="peer-spike__step">Step 3</p>
                <h2 id="host-invitation-title">Email the invitation</h2>
                <p>
                  Send this encrypted invitation to {email} using Gmail. The
                  guest can paste it into the same tab used for the
                  introduction.
                </p>
              </div>
              <div className="peer-spike__card-body">
                <label className="peer-spike__label" htmlFor="host-invitation">
                  Encrypted invitation
                </label>
                <textarea
                  className="peer-spike__input peer-spike__textarea"
                  id="host-invitation"
                  readOnly
                  value={invitationLink}
                  rows={4}
                />
                <Button
                  className="peer-spike__button peer-spike__button--primary"
                  disabled={busy}
                  onClick={() =>
                    copy(
                      invitationLink,
                      'Encrypted invitation copied. Send it using Gmail.',
                    )
                  }
                >
                  Copy encrypted invitation
                </Button>
              </div>
            </section>
          )}
        </>
      )}

      {unlocked && role === 'guest' && (
        <>
          <section
            className="peer-spike__card"
            aria-labelledby="guest-intro-title"
          >
            <div className="peer-spike__card-header">
              <p className="peer-spike__step">Step 2</p>
              <h2 id="guest-intro-title">Introduce yourself</h2>
              <p>
                Share your email and public key with the host to request an
                invitation.
              </p>
            </div>
            <div className="peer-spike__card-body">
              <div className="peer-spike__field">
                <label className="peer-spike__label" htmlFor="email">
                  Your email
                </label>
                <Input
                  className="peer-spike__input"
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={event => setEmail(event.currentTarget.value)}
                />
              </div>
              <div className="peer-spike__field">
                <label className="peer-spike__label" htmlFor="intro">
                  Host introduction link
                </label>
                <textarea
                  className="peer-spike__input peer-spike__textarea"
                  id="intro"
                  value={introductionLink}
                  onChange={event =>
                    setIntroductionLink(event.currentTarget.value)
                  }
                  rows={3}
                />
              </div>
              <Button
                className="peer-spike__button peer-spike__button--primary"
                disabled={busy}
                onClick={introduce}
              >
                Send introduction
              </Button>
              {identityUnverified && (
                <p className="peer-spike__hint">
                  If this browser has no guest registration, you can reconnect
                  to a host that already admitted this passkey. To request a
                  new invitation, reload this page and choose Create passkey
                  on the guest setup screen.
                </p>
              )}
            </div>
          </section>
          <section
            className="peer-spike__card"
            aria-labelledby="guest-invitation-title"
          >
            <div className="peer-spike__card-header">
              <p className="peer-spike__step">Step 3</p>
              <h2 id="guest-invitation-title">Open the invitation</h2>
              <p>
                Paste the invitation you received by email into this guest tab.
              </p>
            </div>
            <div className="peer-spike__card-body">
              <label className="peer-spike__label" htmlFor="invite">
                Encrypted invitation
              </label>
              <textarea
                className="peer-spike__input peer-spike__textarea"
                id="invite"
                value={invitationInput}
                onChange={event =>
                  setInvitationInput(event.currentTarget.value)
                }
                rows={3}
              />
              <div className="peer-spike__actions">
                <Button
                  className="peer-spike__button peer-spike__button--primary"
                  disabled={busy}
                  onClick={redeem}
                >
                  Open invitation
                </Button>
                <Button
                  className="peer-spike__button"
                  disabled={busy}
                  onClick={resume}
                >
                  Reconnect to host
                </Button>
              </div>
              {pendingChallenge && (
                <div className="peer-spike__verification">
                  <p>Verify your passkey to complete the connection.</p>
                  <Button
                    className="peer-spike__button peer-spike__button--primary"
                    disabled={busy}
                    onClick={authenticate}
                  >
                    Verify with passkey
                  </Button>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {connected && (
        <section className="peer-spike__card" aria-labelledby="messages-title">
          <div className="peer-spike__card-header">
            <p className="peer-spike__step">Connected</p>
            <h2 id="messages-title">Encrypted messages</h2>
            <p>Messages stay in memory while this page is open.</p>
          </div>
          <div className="peer-spike__card-body">
            <div className="peer-spike__messages" aria-live="polite">
              {messages.length ? (
                messages.map((item, index) => (
                  <p key={`${index}-${item}`}>{item}</p>
                ))
              ) : (
                <p className="peer-spike__hint">
                  No messages yet. Say hello to the other browser.
                </p>
              )}
            </div>
            <div className="peer-spike__field">
              <label className="peer-spike__label" htmlFor="message">
                Message
              </label>
              <Input
                className="peer-spike__input"
                id="message"
                value={message}
                onChange={event => setMessage(event.currentTarget.value)}
              />
            </div>
            <Button
              className="peer-spike__button peer-spike__button--primary"
              disabled={busy || !message.trim()}
              onClick={send}
            >
              Send message
            </Button>
          </div>
        </section>
      )}
      <p className="peer-spike__footer">
        This experiment is for local testing and has not been security reviewed.
      </p>
    </main>
  );
}
