# SharedWorker-owned connected-session discovery

**Status:** Completed 2026-11-01. **Approved:** 2026-11-01. **Source baseline:** `main` at `c2adda3cf3c874d7832166f2b6d048322b117297`.

## Problem and agreed behavior

1. Move Aggregate and Service authenticated discovery from the page into their SharedWorker hosts. Each incoming attachment proves its own identity before joining a Node; reuse that snapshot for initial authentication instead of fetching twice.
2. First normal online startup performs zero page snapshots, one SharedWorker `snapshot(null)`, and the existing WebSocket-ticket request. Aggregate uses two credential callbacks; Service keeps its existing admission reuse. Recovery counts are separate. Latency improvement is not established by request counts.
3. Aggregate routing hashes the complete request plus requested aggregate ID. Service routing hashes its complete request. Keep one declaration per executable entry and name this pre-authentication hash `routingKey`. Keep `sessionKey` as the complete authenticated identity hash.
4. Preserve build-specific storage and lease namespaces: `/zerospin/{aggregate|service}/${sharedWorkerVersion}/${sessionKey}`. Do not add cross-build persistence, compatibility aliases, migrations or storage resets.

## Implementation

1. Connect before discovery. Host `ready()` establishes executable/protocol readiness rather than storage ownership. Validate declaration, exact lock and routing scope before invoking credentials. Preserve artifact checks and document-liveness locks.
2. Replace page attachment assertions of `claims`, `revision` and `online` with request, requested aggregate ID where applicable, optional expected claims and existing options. Capture discovery revision inside the host. Only the incoming credential callback may establish that attachment's initial proof.
3. Extend internal verified-admission types to carry the checked definition, discovery revision and online proof or eligible offline identity. Bind proof to the producing attachment's lifetime and pass it into runtime attachment. Register its provider for future reconnects without repeating initial authentication.
4. Each explicit connected factory owns an identity-entry map. Reserve entries before asynchronous acquisition, retain pending and published attachment references, and serialize same-identity acquisition/retirement. Drain runtime and storage before releasing the namespace lease. Retain cleanup failures and namespace exclusion on that identity without blocking unrelated identities.
5. Keep `makeWorkerConnections` and its signature. Its closeable connection group exposes unbound port APIs and aborts unresolved discovery on disposal. Keep identity cleanup failures outside host-wide transport failure. Standalone behavior remains unchanged.
6. Sign-out synchronously fences the matching identity before any await. Hold the entry through discovery invalidation, revocation and drainage. Old unresolved snapshots must recheck their captured discovery revision before acquisition and publication. Preserve unrelated identities.
7. Reuse a baseline only for an empty Node. Retain Node IDs, pending command identities and checkpoints on ordinary attachment. Recovery keeps fresh `snapshot(retainedNodeId)` verification and its private completion prefix. Keep existing timeout classifications and move the 15-second namespace-wait budget into attachment preparation.
8. Derive and fence the page's authenticated `sessionKey` from the validated delivered Node view before replica/journal installation. Retain exact expected-claims, facade identity, generation and delivery-epoch checks. Diagnostics belong only to their producing attachment and selected identity runtime.
9. Hard-cut over all in-scope low-level callers. Application constructors and backend snapshot/ticket APIs retain their contracts. Fixed Node schemas remain unchanged.

## Implemented file hierarchy

Legend: `+` create; `~` modify. Root: `zerospin/`.

```text
zerospin/
├── packages/browser/
│   ├── src/
│   │   ├── ~ makeConnectedAggregateSession.ts
│   │   ├── ~ makeSharedWorker.ts
│   │   ├── ~ sharedWorkerNames.ts
│   │   ├── Node/
│   │   │   ├── ~ nodeExecution.ts
│   │   │   └── + nodeStorageNamespaces.ts
│   │   ├── AggregateNode/
│   │   │   ├── ~ AggregateBrowserSessionApi.ts
│   │   │   ├── ~ aggregateNodeRequest.ts
│   │   │   ├── ~ AggregateSharedWorkerApi.ts
│   │   │   ├── ~ attach/attach.ts
│   │   │   ├── ~ makeAggregateSharedWorker.ts
│   │   │   ├── ~ makeAggregateWorkerRuntime.ts
│   │   │   ├── ~ makeConnectedAggregateConnection.ts
│   │   │   ├── ~ ready/ready.ts
│   │   │   ├── ~ resolveAggregateNode.ts
│   │   │   ├── ~ subscribe/subscribe.ts
│   │   │   └── ~ verifiedAggregateAdmission.ts
│   │   └── ServiceNode/
│   │       ├── ~ ServiceBrowserSessionApi.ts
│   │       ├── ~ serviceNodeRequest.ts
│   │       ├── ~ ServiceSharedWorkerApi.ts
│   │       ├── ~ attach/attach.ts
│   │       ├── ~ makeServiceSharedWorker.ts
│   │       ├── ~ makeServiceWorkerRuntime.ts
│   │       ├── ~ makeConnectedServiceConnection.ts
│   │       ├── ~ ready/ready.ts
│   │       ├── ~ resolveServiceNode.ts
│   │       ├── ~ subscribe/subscribe.ts
│   │       └── ~ verifiedServiceAdmission.ts
│   └── tests/
│       ├── ~ aggregate-host.browser.ts
│       ├── ~ aggregate-public.browser.ts
│       ├── ~ node-subscriber-disposal.spec.ts
│       ├── ~ service-host.browser.ts
│       └── ~ service-public.browser.ts
├── ~ packages/core/tests/node-view-recovery.spec.ts
├── fragment/content/
│   ├── ~ reference/browser.md
│   └── ~ guides/build-first-feature.md
└── wiki/
    ├── + archive/plans/284-plan-worker-owned-connected-session-discovery.md
    ├── ~ glossary.md
    ├── ~ adrs/019-one-session-per-shared-worker.md
    ├── ~ research/worker-owned-connected-session-discovery.md
    └── architecture/browser/
        ├── ~ bootstrapBrowserSession.md
        ├── ~ Identity.md
        └── ~ SessionWebSocket.md
```

## Verification and documentation

1. Extend existing public browser scenarios for fresh and retained startup, request origin/counts, credential callbacks, pending commands and retained Node identity. Verify recovery separately.
2. Extend existing host scenarios for independent proof, simultaneous same-identity acquisition, distinct-identity isolation, telemetry isolation, unaffected identity after sign-out/failure, interrupted discovery, revocation before snapshot completion, drainage and namespace-wait cancellation.
3. Retain declaration/artifact refusals, exact claims assertions and eligible offline discovery. Credentials failure, rejection, ambiguity and revoked eligibility cannot become offline authorization.
4. Run browser `lib`, `ts` and `lint` through Nx and focused existing authentication, network-error, replica-lifetime and disposal specs through `zerospin:test`. Run existing browser entries/scenarios in fresh disposable namespaces. Create no test files, fixtures, runners or configuration. Never verify Explorer.
5. After implementation, update browser workflow docs and Fragment startup descriptions. Reconcile the existing glossary and [ADR 019](../../adrs/019-one-session-per-shared-worker.md), preserving its one-definition-per-entry decision. Create a successor ADR only for an implemented decision that is hard to reverse, surprising without context and a real trade-off. Record evidence and archive this plan only after all required work passes.

## Scope and alternatives

1. Both connected session families are included; use explicit Aggregate/Service methods without a domain discriminator. Keep unrelated Studio/system-diagram work.
2. Retain version-specific persistence rather than introducing stable cross-build storage. Keep per-aggregate-ID host routing rather than one host across every aggregate ID. Preserve constructors instead of adding an application bootstrap API.
3. No publication, deployment, sibling-consumer adoption, storage deletion or reset is authorized by this plan.

## Implementation and verification evidence

1. The page now routes before credentials. `AggregateSharedWorkerApi` / `ServiceSharedWorkerApi` independently verify each attachment, select its complete `sessionKey`, and reuse the internally produced snapshot. Each connected factory owns identity-specific acquisition/drainage gates; `makeWorkerConnections` retains its transport contract.
2. Namespace-loss observation starts only after the delivered identity is validated, using its authenticated storage namespace. Sign-out gates joins synchronously, invalidates offline discovery, delivers a bounded signed-out state through existing subscription sinks, and drains before releasing exclusion. Signed-out/ownership-lost connections cannot automatically reopen. Joined or triggered recovery invalidates the initial proof and obtains fresh authentication.
3. Browser `lib` and `ts` passed. Browser lint passed with **zero errors and zero warnings**. The focused root test run includes the existing six authentication/network/replica/disposal/recovery spec files and their test TypeScript check; the final pass was **6 files / 25 tests**. The added disposal-seam scenario proves that a cleanup failure retains the affected identity’s lease and original failure while another identity acquires and releases normally. This is not a full-repository suite run.
4. Actual browser verification passed **16 scenario categories**, using production public facades, actual SharedWorkers, SQLite/IndexedDB and Web Locks with the existing opt-in simulated backend: two normal fresh/retained discovery scenarios, two identity-isolation/revocation scenarios, two namespace cancellation/drainage scenarios, two remembered offline scenarios, two declaration refusals, four startup recovery cases (preserving and fresh-producer fallback for each family), and two live producer-specific recovery cases.
5. Each fresh and ordinary retained Aggregate startup used `{ pageSnapshots: 0, workerSnapshots: 1, tickets: 1, credentialCalls: 2 }`. Service used `{ pageSnapshots: 0, workerSnapshots: 1, tickets: 1, credentialCalls: 1 }`. Retained startup preserved Node ID and pending optimism. Recovery was measured separately; live recovery requested `snapshot(retainedNodeId)` and preserved the producer. Full claims, per-attachment proof, diagnostic isolation, late/detached discovery, sign-out focus/pageshow fencing, and revoked offline eligibility passed.
6. Browser checks ran against fresh disposable namespaces at `http://127.0.0.1:15184/`, with existing `.browser.ts` exports and sibling `?sharedworker&url` entries; no new test files, fixtures, runners or configuration were created. Each family was loaded in an isolated browser document. Offline checks used `Network.overrideNetworkState` with an unreachable fixture backend and localhost assets still reachable; the existing scenarios require offline browser state. Tests establish browser protocol behavior, not a real backend/login integration or a latency benchmark. The isolated Vite server was stopped after verification. The verified runtime version is `888dd65b5dfaa18addfe07b34a05993b6226c3271fdcaadb84c4ad67fc44c2ec`.
7. Fragment startup prose, the three browser architecture workflows, existing glossary entries and ADR 019 were reconciled with the implementation. ADR 019 still governs one definition per entry; no new ADR was needed for this implementation. The research note preserves its historical baseline and points to this plan for completion evidence.

## Remaining work

None.
