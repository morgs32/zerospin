# Plan 305: Browser-hosted passkey and encrypted messaging spike

Status: Archived at the maintainer’s request, 2026-11-17. The runnable two-browser experiment is closed; this is not a production security design.

## Agreed journey

1. The host and guest each create or select a passkey. WebAuthn PRF recreates role-separated identity keys; no PRF output or private key is persisted.
2. The guest shares its public encryption key through a libp2p relay. The host creates a recipient-encrypted invitation, which the user sends manually through Gmail.
3. The host verifies a fresh guest passkey assertion bound to the invitation and encrypted peer connection before admitting the guest. The host remembers guest authorization in browser storage; the guest keeps non-secret connection metadata.
4. The browsers exchange messages through a Noise-protected connection. After the host tab restarts and is unlocked, the remembered guest can reconnect without another invitation. Messages remain in memory.

## Implementation

1. Use an isolated Tic-Tac-Toe route and its existing `https://tic-tac-toe.zerospin.localhost/` origin. Route a local libp2p Circuit Relay WebSocket through that origin; do not replace the authenticated peer channel with an unauthenticated one.
2. Verify passkey registration and assertion in the host browser, including challenge, origin, relying-party ID, credential, and user verification. Do not forward the PRF output. Use documented library operations for deterministic identity and invitation encryption; the combined construction requires security review before production use.
3. Provide copyable invitation content for manual Gmail delivery. Preserve unrelated browser storage and avoid modifying Zerospin model rows outside command execution.
4. After implementation, reconcile implemented domain terminology with the glossary. Create an ADR only if an implemented decision meets the repository's criteria.

Planned file tree (`+` create, `~` modify):

```text
zerospin/
  wiki/plans/
    + 305-plan-browser-peer-authentication-spike.md
  examples/tic-tac-toe/
    ~ package.json
    ~ vite.config.ts
    ~ README.md
    src/
      ~ routeTree.gen.ts
      routes/
        + peer-spike.tsx
      peerSpike/
        + identity.ts
        + passkey.ts
        + invitation.ts
        + connection.ts
        + relay.ts
        + storage.ts
```

## Verification

1. Complete the passkey setup in two browser profiles, manually send and redeem the Gmail invitation, and exchange a message each way.
2. Restart the host tab, unlock with the same passkey, and verify the remembered guest reconnects with a fresh assertion.
3. Verify altered invitations, mismatched guest identities, invalid assertions, unavailable PRF, and canceled passkey approval are rejected or clearly reported.
4. Inspect relay traffic or diagnostics for evidence that message plaintext is not visible. Do not create test files, fixtures, or test runners.

## Assumptions

1. The guest receives the introduction link through the user's manual same-computer workflow. The email provider delivers mail faithfully but need not see invitation plaintext.
2. The local relay remains available while the host tab restarts; cross-device access and relay deployment are outside this spike.
3. Verify actual WebAuthn PRF, browser-side verifier, and libp2p path-routed WebSocket compatibility. Report a blocker instead of substituting an unauthenticated channel.
4. The user approved a narrow 1Password PRF compatibility path on 2026-11-15: accept its 32-byte numeric array alongside a standard WebAuthn buffer, while rejecting malformed output. The browser journey must verify whether this resolves the observed host unlock error.
5. An existing discoverable passkey can be selected when local identity metadata is absent. An existing guest can reconnect only when the host retains its public credential; a new guest introduction still needs the original registration record or a new passkey. An unmatched recovered host identity is not silently bound to existing guest authorizations.
6. The user removed the phrase on 2026-11-15. Passkey-only derivation changes existing phrase-derived identities; the spike preserves saved metadata and rejects an identity mismatch instead of resetting storage. The passkey is required for recovery; there is no separate recovery mechanism.

## Verification evidence

The user confirmed on 2026-11-15 that the manually emailed invitation, messaging in both directions, host restart and guest reconnection all worked; canceling the actual passkey prompt displayed the intended feedback. In-memory checks of `openInvitation` accepted a matching invitation and rejected an incorrect guest peer ID, credential ID, modified ciphertext, and an incorrect recipient key. Other in-memory checks rejected invalid assertion signatures, origins, relying-party IDs, user verification, challenges, and credentials; and produced clear cancellation and unavailable-PRF messages from mocked credential operations. Two ephemeral libp2p peers through the configured relay rejected a mismatched expected peer ID and delivered a control message when the ID matched.

The guest rejection check was exercised in the browser on 2026-11-15 using a temporary invalid reconnect credential ID. The guest displayed “The connection closed before authentication completed. Reconnect to try again,” and the user reported seeing the peer-message rejection. The normal credential ID was restored afterward. An earlier temporary libp2p peer sent an unrecognized resume request to the unlocked host through the configured relay, and the host closed that peer's stream.

The actual relay was inspected on 2026-11-15 using temporary observers on its unwrapped forwarding streams after outer transport decryption. After the user confirmed delivery of a distinct marker in each direction, the observed streams grew from 3,867 to 5,612 bytes and from 3,276 to 5,020 bytes; neither plaintext marker appeared in either stream. The observers and debugger were removed afterward. An earlier instrumented equivalent relay with isolated Node peers produced the same result.

The glossary now defines the spike's browser peer invitation. No ADR is warranted for this reversible local experiment. The scoped TypeScript and lint tasks passed after the rejection-feedback change; lint reported three pre-existing warnings in the unrelated game `app.tsx`.

## Closure and verification limit

1. The maintainer requested archival on 2026-11-17. Implementation is integrated on `main`; no further work is scheduled under this plan.
2. The remaining actual-browser unavailable-PRF check is closed without execution. The mocked credential operation returned the intended error, but an actual unsupported browser or passkey was not exercised. Archival does not establish that verification passed.
