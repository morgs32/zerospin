# System Worker tests

Each behavior has its own folder and spec. A `.workerd.spec.ts` suffix selects
Cloudflare's Worker runtime; `.spec.ts` selects Node. Folder names describe the
behavior, independently of the runtime.

## Declarations and Systems

A Workerd behavior folder owns its `system.ts`, which exports `system` and a
default `makeConfig` result. Compose its Aggregate releases, Service releases,
Actors and Agents explicitly from the declarations required by that behavior.
The Workerd configuration wires the same roles used by deploy. The
[System Worker](../../production-worker/src/SystemWorker.ts) owns the catalog and
stable Chains. Each Aggregate or Service release Worker owns its versioned Repos,
Chains, Archives, and Actor projections. The
[Agent Worker](../../agent-worker/src/AgentWorker.ts) owns Agent state and selected
history. Workerd connects these roles through the service and Durable Object
bindings required by each scenario.

A project's Vitest isolate runs the Worker whose private state or implementation
the spec exercises. A suite can have additional projects when several Workers
need private assertions. Use `runInDurableObject` and local spies in the owning
isolate. Across Workers, call the real RPC and assert the reply or resulting
behavior. For a deliberate downstream failure, place the fault in the Worker
handling the call.

The pinned Aggregate and Service projects run independent release executables.
The split Agent wake project calls the root `ServiceChain` from the Agent Worker,
then reaches the addressed Service release Worker.

Share ordinary authored declarations through [`declarations/`](declarations/)
only when multiple behaviors reuse their complete semantics. Put each concrete
version in its own defining file and import it directly. Keep actor selections
inside the actor declaration. Avoid declaration barrels, configurable fixture
factories and a shared all-purpose System.

Keep scenario-specific declarations, instrumentation, provider controls and
helpers beside their spec. Reset mutable controls explicitly. Keep assertions
and meaningful lifecycle sequencing visible in the spec; extract helpers only
when they own a focused responsibility. Node specs need no `system.ts`.

## Runtime discovery

The root [`vitest.config.mts`](../../../vitest.config.mts) discovers nested
`packages/system-worker/tests/**/*.spec.ts` files for its Node project and
explicitly excludes `.workerd.spec.ts` files, preserving Vitest's default
exclusions.

[`vitest.workerd.config.mts`](../../../vitest.workerd.config.mts) discovers
`.workerd.spec.ts` files recursively in deterministic order. The
`workerd/<behavior>` project and its variants include that exact spec and
resolve the `config` alias to the sibling `system.ts`. The configuration
declares each scenario's release sources and Vitest Worker, and shares
compatibility settings and `fsModuleCache: false` across projects.

Workerd specs call production Durable Object methods and use stock
`cloudflare:test` controls for table inspection, alarms, eviction and reset.
A claim about admission, execution commit, dispatch acknowledgement or retained
`outcome` must identify the exact durable fact the spec observes. Forced
eviction and explicit alarm dispatch provide evidence for those seams.

## Running checks

Run the existing Nx command from the repository root:

```sh
pnpm nx run zerospin:test -- packages/system-worker/tests
```

Select one behavior folder or exact spec path by narrowing the file filter:

```sh
pnpm nx run zerospin:test -- packages/system-worker/tests/service-publication
pnpm nx run zerospin:test -- packages/system-worker/tests/service-publication/service-publication.workerd.spec.ts
```

Select the Workerd projects with Vitest's supported project filter:

```sh
pnpm nx run zerospin:test -- packages/system-worker/tests --project 'workerd/*'
pnpm nx run zerospin:test -- packages/system-worker/tests --project workerd/service-publication
```

The Nx task retains its build dependencies and complete test TypeScript
compilation. File and project filters narrow Vitest execution. Runtime passing
evidence belongs to the relevant implementation plan; this README describes
the organization and commands.
