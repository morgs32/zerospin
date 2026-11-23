# One session per SharedWorker

**Date:** 2026-10-23
**Status:** Accepted; routing and storage clarification 2026-11-01
**Supersedes:** the "keep one application worker entry" decision in [ADR 002](002-browser-node-journals-and-worker-routing.md). Name parsing and per-kind runtimes stay as ADR 002 decided.

## Context

`makeSharedWorker` accepted lists of aggregate, service, and standalone session definitions in one entry. At the original decision, each running SharedWorker was one authenticated session: its name included `zerospin` kind, compiled version and `sessionKey`, selecting one database. [Plan 284](../archive/plans/284-plan-worker-owned-connected-session-discovery.md) subsequently separated connected host routing from authenticated database identity while retaining one definition per entry. A combined entry only shared a bundle. That bundle loaded every registered session's code and layer into every worker, and the worker looked the attached identity up in the list.

## Decision

One worker entry registers one session definition.

```ts
makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition,
  layer, // required only when replay requirements are not never
});
```

The worker name still selects the aggregate, service, or standalone runtime. A service definition accepts a service name. An aggregate definition accepts an aggregate or standalone name. Any other combination throws `node-session-definition-mismatch` before the worker accepts ports. Connected attachment checks the complete request and session lock against that definition before requesting credentials. The connected host authenticates each incoming attachment independently and selects its own identity-specific Node by the verified `sessionKey`. Several authenticated identities can share that one declaration-specific host; their SQLite databases, synchronization, diagnostics and sign-out lifetimes remain separate. Aggregate host routing additionally includes the requested aggregate ID. Standalone retains its existing storage partition.

Applications pass the bundler's worker URL as `sharedWorkerUrl`. The framework opens that module worker.

## Alternatives

Keeping the registration lists lets one file serve every session, but it does not reduce the number of running workers and it puts every session's code in every worker. Selecting the kind from the definition alone would drop the name's kind check; the name remains the runtime selector and the definition must agree with it.

## Consequences

Shopping, Mentor Mailbox, and Red Rope use one entry file per session. Consumers on `31.0.0` change each `makeSharedWorker` call when they move to this release. The original registration cutover did not change storage schema, partitions or namespaces. The later connected-discovery refactor keeps version-specific authenticated database namespaces while giving connected hosts a separate request-routing name. It introduces no cross-build persistence or database migration contract.

- [`makeSharedWorker.ts`](../../packages/browser/src/makeSharedWorker.ts) — one definition, kind check, runtime selection.
- [`nodeExecution.ts`](../../packages/browser/src/Node/nodeExecution.ts) — direct identity and lock check.

- [`nodeStorageNamespaces.ts`](../../packages/browser/src/Node/nodeStorageNamespaces.ts) — keeps connected database identity independent of host routing.
