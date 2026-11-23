# Standalone storage partitioning by session lock

**Date:** 2026-10-20
**Status:** Complete

## Decision and cutover

Standalone storage includes the complete canonical aggregate session lock alongside
its existing aggregate/Actor scope, session name and resolved backup path. Keep
incidental claims and runtime/build identity outside that key. The database and
its namespace lease use the same derived key.

The maintainer approved fresh partitions for **every existing standalone session
on first adoption**, including unchanged definitions. Preserve previous databases
without lookup, migration, deletion or fallback. New partitions use existing
configured seeds. Returning to a previously used lock/path reopens that partition;
there is no reconciliation between partitions.

```text
same scope + path + lock A -> reopen partition A
same scope + path + lock B -> initialize separate partition B
return to lock A           -> reopen A; do not merge B into it
```

## Implementation

1. Add the existing complete aggregate session lock to `standaloneStorageKey`'s
   canonical SHA-256 preimage. Keep its signature and authored identity fields.

   ```ts
   // 1. Derive the same complete lock used by worker validation.
   const { aggregateSessionLock } = makeAggregateSessionSpec(definition);
   // 2. Hash the lock together with the existing scope/path fields.
   return sessionKey({
     kind: 'standalone',
     aggregateName: definition.aggregateName,
     aggregateVersion: definition.aggregateVersion,
     actorName: definition.actorName,
     actorVersion: definition.actorVersion,
     sessionName: definition.sessionName,
     path,
     lock: aggregateSessionLock,
   });
   ```

2. Retain the tab and worker's independent calls to that function. Their existing
   key-based worker naming, database selection, lease and attachment validation
   change together. Add no public input, wire field, abstraction or named type.
3. Preserve internal Node identity checks, framework schemas and explicit reset.
   Reset stays within the current definition's partition. Worker cleanup and
   same-namespace takeover are separate Plan 2 work.
4. Amend the accepted standalone storage ADR, glossary, workflows, browser skill
   guidance and affected QRK Library documentation. Qualify build serialization
   as applying to the same namespace.

## Delivery and acceptance

1. Implement and publish from committed development-line code in an isolated
   checkout. Preserve unrelated producer and consumer changes. Publish a breaking
   fixed-group release to the configured local registry, then adopt consistent
   exact package pins and lockfile entries in QRK. Keep its authored backup path.
2. Use existing scoped producer build/type/lint tasks and available QRK builds.
   Add no tests, fixtures, runners or backend integration suite. Never verify
   Explorer. Record compilation separately from browser/runtime observations.
3. Establish stable keys for identical scope/path/lock; incidental claims and
   runtime/build changes alone do not change them. Model, contract or claims-schema
   lock changes select different database and lease identities. Existing path and
   version separation remains.
4. Establish that an owner of partition A does not block partition B, mismatched
   tab/worker definitions still reject, fresh partitions seed, reload retains
   their data, and legacy databases remain untouched.
5. Record publication, installations, checks and runtime observations separately.
   Archive only after all required work is complete. No deployment, deletion,
   migration or worker lifecycle change is included.

## Evidence

- Source change independently reviewed without findings. The complete lock enters
  the shared canonical key; tab and worker continue to derive it independently.
- Upstream Intent and the referenced spec skill are unavailable. QRK's installed
  browser-session skill was loaded; no replacement tooling was installed.
- Producer fixed-group library graph passed (18 library projects); browser
  TypeScript/lint and their dependency graph passed (12 tasks). Nx Cloud reported
  its existing remote 401 warning; local task results passed.
- Built-interface checks passed stable/canonical identity, model/contract/claims
  schema isolation, authored path/version separation, incidental-claims exclusion,
  first-cutover key change, and mismatched worker rejection before storage opens.
- Registry inspection found all nineteen packages already at `17.0.1`; the next
  available breaking fixed-group release is `18.0.0`.
- Producer commit `640a29eadd` published all nineteen fixed-group packages at
  `18.0.0` to the configured local registry. Every published version and integrity
  value was independently read back from the registry.
- QRK installed twenty-eight exact `18.0.0` pins across App, Library, API, Scraper
  and Zerospin manifests, with its lockfile updated. Comparing manifests against
  captured pre-adoption content established that only the intended versions
  changed; existing dependency and script edits were preserved. Installed browser
  source contains the lock preimage, and Intent discovers all eight current skills.
- Existing QRK App production build and Library Storybook build both passed.
  No API migration, test suite, fixture, runner or backend integration test was
  added. Existing peer and source-map warnings remain unrelated.
- The actual Library dev server reported `http://127.0.0.1:4098/` ready behind
  `https://library.qrk.localhost`. In the existing Chrome profile, Library opened
  fresh namespace `/zerospin/standalone/a81469a4c03922f52c2838d1813e889bede10d5591dbf8c11646fba36fc5fd2d`.
  DevTools displayed seeded `wal_library`, label `Library`, both before and after
  reload; the same namespace lease remained held with no pending locks.
- During reload, a separate temporary browser document held the legacy namespace's
  exclusive lifetime lease and an existing IndexedDB handle. Library still became
  usable in its new partition. This exercises the actual browser lock manager;
  it does not claim to recreate the historical stale worker's lifetime behavior.
- Read-only fingerprints of every legacy IndexedDB object store matched before
  and after the browser check: SHA-256
  `248cb9930c7bb0343d76d19babe4055784cfdf1ca487736b2205b92229039786`.
  The old namespace, `__next_debug_channel`, and `localforage` remained present.
  The temporary legacy lease and handle were released and its probe tab closed.
  No reset, deletion, migration or deployment occurred.
- Screenshot of the reloaded Library seed row: `/tmp/plan247-library-verified.png`.
  Worker shutdown and same-namespace takeover remain outside this completed plan.

## Remaining work

None.
