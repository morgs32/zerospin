# Standalone guard example

Status: Implementation complete — 2026-10-07. Validation commands and browser checks are excluded by the user.

## Agreed work

1. Add one live guard example to the Invocation graph, using the existing chat contract. This guard-only phase replaces the earlier proposal to add guard, rehearsal and staging examples together. Rehearsal is deferred; the existing staging example stays intact.
2. Export one module-level `roomGuardSession` using `makeStandaloneSession`, with the room/member declarations at version `1.0.0`, explicit message and sendMessage bindings, fixed claims `acct_general` / `explorer` / `Explorer`, and persistence key `explorer-room-guard`.
3. Mount it through `useInitializeStandaloneSession` inside one React Flow node with a local error boundary. Two disabled message fields show `Hello from Explorer!` and three spaces labelled “Whitespace-only message”. Enable their separate Check guard buttons after initialization.
4. Call `Effect.runSync(checkGuards(...))` with `contractName: 'sendMessage'` and a fixed preview ID. Display Guard passed for null; otherwise display the failure code and message. Show the actual callable source and connect the node directly to Check guards above the existing staging example.
5. Add explicit workspace dependencies for the browser and React APIs plus the backup-worker Vite plugin. Let the standalone factory own its runtime and local persistence; retain the React root and unmount it during hot reload.
6. Update Explorer's README and reconcile implemented terminology after the change. This phase introduces no new domain term or qualifying governing ADR. Preserve concurrent release/package work.

## Acceptance and scope

1. Valid text passes; whitespace returns `empty-message` from the authored guard. Each preset keeps its own displayed result.
2. Checking runs only the contract guard. It creates no message or command and consumes no session IDs.
3. Initialization failure stays inside the example card; unmount releases the session owner. Local IndexedDB backup storage survives disposal.
4. The graph uses existing operation/source viewer patterns. Rehearsal, interactive staging and chat navigation remain outside this phase.
5. The user explicitly excluded validation commands and browser checks. Do not run build, typecheck, lint, format checks, tests or browser verification as part of this implementation. Dependency installation is required implementation wiring, with lifecycle scripts disabled.

## Planned files

Legend: `+` create, `~` modify. Paths are rooted at the project directory.

```text
zerospin/
├── explorer/
│   ├── package.json ~
│   ├── vite.config.ts ~
│   ├── README.md ~
│   └── src/
│       ├── main.tsx ~
│       ├── zerospin/
│       │   ├── roomGuardSession.ts +
│       │   └── checkMessageGuards.ts +
│       ├── data/invocation.ts ~
│       └── views/invocation/
│           ├── GuardExampleNode.tsx +
│           ├── Invocation.tsx ~
│           └── invocation.css ~
└── pnpm-lock.yaml ~
```

## Implementation steps

1. Link the browser and React workspace dependencies and backup-worker development dependency using pnpm's workspace commands; add `backupWorkerPlugin()` to Vite.
2. Add the direct standalone session declaration and the concise guard-call function. Retain the root handle and unmount it during hot reload.
3. Add the live node, its initialization error boundary, disabled presets, independent results and raw callable source. Add its direct graph connection and source provenance.
4. Update the README and record the outcome, distinguishing implemented code from unrun checks. Archive this plan when the requested implementation and documentation are complete.

## Source evidence

1. [Standalone factory](../../../packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts) and [React lifecycle hook](../../../packages/react/src/useInitializeStandaloneSession/useInitializeStandaloneSession.ts).
2. [Existing contract](https://github.com/morgs32/zerospin/blob/383dfddf4c8b38e3124fa4b8f951a33487070a26/explorer/src/zerospin/sendMessageV1.ts) and [guard-check API](../../../packages/core/src/aggregateSession/checkGuards.ts).
3. [Backup-worker Vite plugin](../../../packages/backup-worker/src/backupWorkerPlugin.ts).
4. [Invocation graph](https://github.com/morgs32/zerospin/blob/244afdddd87d457a5c7d6cb78da5d9ad87b62469/explorer/src/views/invocation/Invocation.tsx) and [workflow metadata](https://github.com/morgs32/zerospin/blob/773596a8e77c76980b313ca5f0b5fc77f44c94a9/explorer/src/data/invocation.ts).

## Outcome

1. The browser and React workspace dependencies and backup-worker development dependency are linked. Vite now includes the existing backup worker plugin; dependency installation used disabled lifecycle scripts.
2. `roomGuardSession` and `checkMessageGuards` are implemented with the fixed claims, explicit declarations and preview ID. The React entrypoint retains its root and unmounts it during hot reload.
3. `GuardExampleNode` mounts the standalone session through the existing lifecycle hook. Its local error boundary preserves the graph and source card during initialization failure. Disabled preset fields and independent result states use the real guard-call function; the full raw source appears in the card.
4. The guard example connects directly to Check guards. Its 740-pixel card and the relocated guard operation share a vertical center; the other operation positions and existing staging example remain intact. Check guards now includes the callable example and session declaration in its source provenance.
5. Explorer's README documents the example, local backup infrastructure and lifecycle. No new domain term or qualifying governing ADR was introduced. Concurrent release/package work was preserved.
6. No build, typecheck, lint, formatting checks, tests or browser verification ran for this implementation, as explicitly requested. Runtime and rendered behavior have not been verified in this chat; completion records the requested implementation, not passing validation results.

## Remaining work

None. Validation is excluded by request; rehearsal and interactive staging are outside this completed guard-only phase.
