# Native iOS tic-tac-toe with a shared TypeScript runtime

## Agreed behavior

1. A SwiftUI iOS 17+ application runs the existing TypeScript game contracts, Session, and AggregateNode inside JavaScriptCore. Swift supplies synchronous SQLite, HTTP/WebSocket, crypto, timers, and app lifecycle. No duplicated Swift rules, Wasm runtime, or TypeScript-to-Swift compiler.
2. Preserve Session/Node ownership. Retain session staging before publishing success, recover pending handoffs by original command identity, and reconcile authoritative history without reapplying covered outcomes. Backend O continues after admitted work even when the app closes.
3. Reuse existing backend APIs and Cap'n Web protocol handling in JavaScript. Keep aggregate sessions as the first-release scope. Fixed schema changes require empty storage, without compatibility paths.

## Implementation

1. Prove actual Effect 4 game contracts and transactional native SQLite in JavaScriptCore. Stop and report a concrete incompatibility if this gate fails.
2. Add `@zerospin/native` TypeScript host composition and a `Zerospin` Swift package. Remove unnecessary Wasm-client assumptions from shared execution while preserving browser behavior. Extract reusable orchestration instead of copying it.
3. Add typed host adapters and serialized JavaScript execution. Network callbacks enter that executor; network awaits never hold SQL transactions.
4. Expose initialization, staging, observable state/failures, push/resume, authentication clearing, and disposal through a JSON-compatible Swift interface.
5. Build the tic-tac-toe app using existing contracts and backend, retained anonymous identity, Start/New game, status/errors, and accessible squares. New game keeps unresolved prior-game work. Resume and catch up after foreground/relaunch.
6. Register scoped Nx bundle, Swift, and simulator checks. Document configuration and ownership, reconcile the glossary, and record an ADR only for an implemented qualifying decision.

## Planned hierarchy

`+` means create; `~` means modify.

```text
zerospin/
  packages/
    + native/{package.json,src/,scripts/}
    + swift/{Package.swift,Sources/Zerospin/,Tests/ZerospinTests/}
    ~ core/src/                   # Required database/runtime seams
    ~ browser/src/                # Shared orchestration extraction
  examples/tic-tac-toe/
    + ios/{TicTacToe.xcodeproj/,TicTacToe/,TicTacToeTests/}
    + src/{nativeGameSession.ts,gameSessionDeclaration.ts}
    ~ src/gameSession.ts
    ~ package.json
    ~ README.md
```

## Verification

1. Actual TypeScript contract parity for valid/invalid/stale/terminal moves and identity mismatches; synchronous rollback and commit observation.
2. Restart/offline staging, interrupted handoff, uncertain admission, duplicate delivery, ordered replay, and checkpoint conflicts.
3. Simulator/backend integration: optimistic X, authoritative O, offline/reconnect, and O completed while the app is closed.
4. Scoped Nx TypeScript, Swift package, simulator app, and affected browser/core regression checks.

## Outcome

1. Implemented in worktree `native-ios-tic-tac-toe`, based on main snapshot `80225327f2`. Browser and native hosts share the game declaration and existing canonical contracts. Swift provides JavaScriptCore, synchronous SQLite, HTTP/WebSocket, crypto, timers, and a storage-directory ownership lock. Session and Node keep separate durable files.
2. Native SQLite uses the same shared transaction driver as the browser. The old Wasm-specific driver name and its type aliases were replaced outright; callers and governing links were updated. JavaScript reuses existing authentication and wire protocols. No backend schema or protocol changed.
3. SwiftUI renders observable snapshots, stages X, receives backend O, preserves prior-game identities, and restores journals after relaunch. Clear authentication disposes all loaded example sessions but retains their journals. Disposal is terminal for a Swift Session instance. New identities require online admission; iOS background execution is not promised. Aggregate programs requiring extra application services remain outside this first release.
4. Verified actual contracts through JavaScriptCore: valid, stale, occupied, out-of-range, wrong-identity, and terminal moves; rollback and durable reopening; binary and 64-bit SQLite bindings; storage ownership and release; offline journal-only staging/relaunch; repeated resume without duplicate resource changes; authentication clear/reinitialize; invalid retained cursor rejection.
5. `ZEROSPIN_NATIVE_INTEGRATION=1 pnpm nx run zerospin-swift:test`: three tests passed against this checkout's backend. `pnpm nx run tic-tac-toe:ios:test`: simulator UI test passed for X, authoritative O, and termination/relaunch. `pnpm nx run-many -t test:node -p @zerospin/core,@zerospin/browser`: 27 regression tests passed. TypeScript checks passed for all seven affected projects; final native lint passed with no warnings. Frozen install and `git diff --check` passed. Nx Cloud reported access code 401, but local tasks succeeded.
6. READMEs explain build, configuration, persistence, and lifecycle boundaries; the glossary defines the native host. No ADR was added: this initial, unshipped host integration remains reversible and does not meet all three ADR criteria.

## PR review and rebase verification

1. Renamed `IServiceSessionWaSqliteDb` to `IServiceSessionSqliteDb` and updated devtools. No superseded SQLite type aliases remain.
2. Native snapshots now read transient network failures from Node synchronization, which clears them on recovery. Local session failures remain separate. A real JavaScriptCore/backend regression verifies automatic retry clears the connection failure and that a recognized contract failure remains visible across resume.
3. Rebased on main `3f81840409`. Preserved main's session release, session execution, and explicit aggregate admission APIs. Native execution reuses the shared session lifecycle and failure reporting. Browser and native hosts continue to share the canonical game declaration; credentials contain only the instance identity.
4. Post-rebase verification: four Swift tests passed against the updated backend; all seven affected TypeScript projects passed; native lint passed with no warnings; 99 core/browser Node regression tests passed. The simulator UI test passed for X, authoritative O, and termination/relaunch. The backend required empty local storage for main's credentials schema cutover.

## Remaining work

None.
