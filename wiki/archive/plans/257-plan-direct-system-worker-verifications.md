# Direct System Worker verifications

Replace the remaining System Worker Repo/Chain test machinery with the real
production Durable Object classes, `cloudflare:test`, and direct Drizzle queries.
The maintainer has approved this implementation and the necessary tests and
fixture declarations. No new harness APIs, wrapper methods, fixture subclasses,
or HTTP operation routers.

## Scope

- Migrate Agent Node Repo scheduling, durable attempts, restart/retry,
  subscription enrollment, and observer independence for Service and Aggregate.
- Migrate Service Actor connection authorization, resolution-prefix snapshots,
  hibernation and disposal, and Actor/Agent projection atomicity.
- Use the real Aggregate session and native SystemApi capabilities.
- Exercise alarm registries with actual Durable Object storage.
- Remove superseded Miniflare and SQLite fixture machinery; retain focused pure
  declaration, SDK wire-codec and evaluation-clock unit tests.
- Update test instructions to describe the current Node and Workers projects.

## Implementation and verification

Independent Agent runtime, Actor connection, and projection test migrations run
in parallel. Shared authored declarations and actual class bindings remain plain
fixture data. Run one Nx task graph at a time. Verify the complete System Worker
suite through `zerospin:test` (including test TypeScript), `system-worker:lint`,
scoped formatting/lint and `git diff --check`. Preserve unrelated work and never
verify Explorer.

## Outcome

All remaining Repo/Chain runtime verifications use production Durable Object
classes, stock `cloudflare:test` controls and inline Drizzle. Agent freezing,
exact admission retries, selection rollback, enrollment gaps, observer
independence, actual release rebinding and stale-source refusal pass for both
Service and Aggregate. Actor snapshot-prefix races, native sockets, connection
cleanup, projection atomicity and actual alarm dispatch pass.

Removed the old Miniflare Worker router, fixture subclasses, SQLjs connection
machinery, fake alarm storage and direct Miniflare dependency. Pure declaration,
SDK wire-codec and evaluation-clock tests remain in Node. Shared Workers support
contains authored declarations and production-class exports.

The Workers project disables Vitest's filesystem module cache: the Cloudflare
pool expands a warm import graph into a single WebSocket message, which exceeded
the runtime message limit in the complete suite. Individual module fetching
passes the full suite.

Verified on 2026-10-22:

- `pnpm nx run zerospin:test -- packages/system-worker/tests`: test TypeScript
  compilation and all 70 tests across 25 files pass, with no exclusions or
  unhandled errors.
- `pnpm nx run system-worker:lint`: passes.
- Scoped test/config lint: zero warnings or errors. Scoped formatting and
  `git diff --check` pass.
- No custom test harness APIs, wrapper methods, fixture subclasses or HTTP
  operation routers remain in System Worker tests. Documentation links resolve
  to the direct suite and historical counts remain explicitly historical.

## Remaining work

None.
