# React session and provider lifetimes

Researched 2026-10-30. These sources informed the implemented managed React
session interface; they do not establish Zerospin delivery or durability guarantees.

## LiveStore: released v0.5.0

LiveStore separates its app-wide registry context from individual store
acquisition. `useStore(options)` returns the actual `Store`, augmented with React
methods. It reads `getOrLoadPromise` during render, suspends through `React.use`
only while loading, and retains the store in an effect after a successful render.
An already-loaded store returns synchronously. [Released hook source](https://github.com/livestorejs/livestore/blob/v0.5.0/packages/@livestore/react/src/useStore.ts)

`StoreRegistryProvider` only publishes the supplied registry and children; it
neither acquires nor disposes stores. The registry deduplicates by `storeId` and
owns reference-counted loading/cache lifetimes. Its browser idle cache defaults
to 60 seconds. A render that never commits installs no permanent React retention
hold. The hook documents a render-to-effect disposal race when cache duration is
very short, approximately below 100 ms. These semantics are not a proof of
account-switch safety. [Provider source](https://github.com/livestorejs/livestore/blob/v0.5.0/packages/@livestore/react/src/StoreRegistryContext.tsx),
[registry source](https://github.com/livestorejs/livestore/blob/v0.5.0/packages/@livestore/livestore/src/store/StoreRegistry.ts)

The release exports `useStore`, not a `useStorePromise` hook. Store identity and
application authentication remain separate concerns. [Exports](https://github.com/livestorejs/livestore/blob/v0.5.0/packages/@livestore/react/src/mod.ts),
[official authentication guide](https://docs.livestore.dev/patterns/auth/)

## TanStack DB: current 1.0 RC documentation

The live React overview describes an app-scoped `DbClient` supplied through
`DbProvider`, with query acquisition/subscription through consumer hooks. The
provider itself publishes context rather than replacing application children with
a loading screen. Current RC guidance also removes dependency arrays in favor of
query identity. This separates resource/query lifetime from page-tree identity.
The overview's navigation still says v0; these are live RC docs/source, not an
assertion about an installed stable 1.0 package. [React overview](https://tanstack.com/db/latest/docs/framework/react/overview),
[provider source](https://github.com/TanStack/db/blob/main/packages/react-db/src/DbProvider.tsx),
[1.0 RC migration guide](https://tanstack.com/db/latest/docs/guides/migrate-to-1-0-rc)

## SWR: conditional resolver convention

SWR's unversioned conditional-fetching guide accepts a null key or key resolver;
falsy results or thrown resolver errors suppress fetching. This is an ergonomic
precedent for dependent inputs, not a session lifecycle or authentication model.
[Official guide](https://swr.vercel.app/docs/conditional-fetching)

## Implemented Zerospin distinction

Concrete `use*Session(definition, optionsOrResolver, observers?)` hooks own
commit-time acquisition, generation replacement, retry and release. Their handles
return without suspending. Explicit inactive resolver results disable acquisition;
resolver errors remain failures rather than silently meaning “not ready.”
`SessionProvider` only publishes the handle and keeps public children mounted.
`SessionReady` confines loading, Suspense and terminal presentation to dependent
readers. `useSession(definition)` reads the matching ready session;
`useSessionState(definition)` observes availability elsewhere. Authentication and
guest/account design selection remain application facts. Command submission stays
synchronous; persistence, delivery and safe release stay inside Zerospin.
[Implemented interface](../../packages/react/README.md)
