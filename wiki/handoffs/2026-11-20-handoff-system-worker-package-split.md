# Handoff for the System Worker package split

**Date** 2026-11-20

**Focus** Divide `packages/system-worker` by Worker ownership and wire the resulting boundaries through local development and self-hosted deployment.

## Goal

1. **`SystemWorker`** is the stable Worker for one System. It owns the gateway, `SystemRepo`, `AggregateChain`, `ServiceChain`, and the deployment lock. Use `LocalSystemWorker` for the local entrypoint while it needs a distinct startup path. `zerospin dev` can co-locate release implementations or launch them separately with `--owner-releases`.
2. **`AggregateReleaseWorker`** and **`ServiceReleaseWorker`** each execute one named owner release. For example, `cart@1` and `cart@2` get separate Workers and dispatch to their respective `AggregateVersionRepo`. `OwnerReleaseWorker` can remain the common implementation where behavior is shared.
3. **`AgentWorker`** is the intended independently deployable host for the installed Agents in one System. It owns the Agent Node runtime, including `AggregateAgentNodeRepo` and `ServiceAgentNodeRepo`, whose identities persist across Agent releases. The root Chains still admit commands against the addressed owner release.
4. **`AccountAdminWorker`** is the author-facing account boundary. Install one Zerospin Admin per Cloudflare account and reuse its chosen Worker name. It owns the account's System catalog and the initial `SystemWorker` install. A first deploy falls back to `admin.installSystemWorker()` when no Worker exists, then calls `SystemWorker.acquireDeploymentLock()` with the same run proof. Later deploys acquire the lock directly and can proceed with Admin unavailable. Deploy status in Admin is optional.

## Done

1. PR #176 introduced independent Aggregate and Service release deployments. Both use `OwnerReleaseWorker`. In the current configuration the release script owns its VersionRepo and binds back to `SystemRepo` and the matching root Chain and VersionChain on the stable script. [`makeWranglerConfig.ts`](../../packages/dev-worker/src/makeWranglerConfig.ts) · [`OwnerReleaseWorker.ts`](../../packages/production-worker/src/OwnerReleaseWorker.ts)
2. The Agent Node Repos still run on the System Worker. The separate `AgentWorker` is a design from the self-hosted release spike. [`ProductionWorker.ts`](../../packages/production-worker/src/ProductionWorker.ts) · [Agent Worker sketch](../research/self-hosted-system-releases.spike.ts#L107)
3. The deployment lock and Admin first-install prototype were inspected in `/private/tmp/zerospin-deploy-bootstrap` on `codex/deploy-bootstrap-concurrency`. Bring forward the applicable prototype work deliberately. Its checkout has changes beyond its commits. The [deployment handoff](2026-11-19-handoff-deploy-bootstrap-concurrency-spike.md) tracks that work and its verification boundary.

## Remaining

1. Trace deployment exports and imports before moving files. Sketch the direct calls first. `SystemWorker` dispatches an admitted command through the registered release binding to `getAggregateVersionRepo(key)` or `getServiceVersionRepo(key)`. Each release publishes through the bound Chain. `AgentWorker` consumes selected history and submits through the existing Chain admission path. Move concrete implementations behind these role boundaries. Start with `RepoServicesLive` and the VersionRepo lookup paths, which currently assemble local implementations and remote bindings. Keep shared codecs and binding contracts in the smallest dependency surface their callers need. [`RepoServicesLive.ts`](../../packages/system-worker/src/repoServices/RepoServicesLive.ts) · [`system-worker` exports](../../packages/system-worker/package.json)
2. Wire the role-specific entrypoints and bindings in deploy and local development. Update the package exports, dependencies, build configuration, and affected callers together. For existing placements, preserve script names, Durable Object class and namespace identities, object keys, and command history. For a physical placement change, verify where data lives before changing the binding. Pointing an Agent Node binding at an empty namespace would lose access to its selected rows, wakes, and pending deliveries.
3. Verify both local topologies and a fresh deploy plus redeploy. Use the existing native System API, Repo lifecycle, and Agent Node Workerd coverage where it exercises the new boundaries. Exercise two owner releases side by side, an Agent delivery across the Worker boundary, and a competing deployment that exits with the active run ID before writing. Check that redeploy still works with Admin down. Verify that the author guide retains one Admin per account and tells authors to reuse the same name. The prototype's Access app hostname check rejects an ordinary second install under a different name. Keep the single account catalog and first-install reservation authoritative if installer behavior changes. [Author guide](../../docs/content/guides/develop-and-deploy.md#set-up-the-account-installer)

## Open decisions

1. Choose workspace package boundaries after mapping the imports. The deployable roles are the organizing principle. The number of npm packages and entrypoint files should follow their dependencies and callers.
2. Decide physical placement for owner release VersionChains, projections, and archives separately from code extraction. Preserve current bindings until that decision is made. For deployed Agent Node Repos, settle namespace continuity or explicitly limit the independent `AgentWorker` cutover to fresh Systems.
3. Keep the first-install flow under the current catalog-only registration contract from [MOR-488](https://linear.app/morganatwork/issue/MOR-488/register-self-hosted-systems-in-admin-by-immutable-system-name). Provisioning a generic `SystemWorker` at registration and using a separate account deploy coordinator were explored. Either would change the deployment design and requires its own decision.

## Suggested skills

1. `$codebase-design` for dependency direction and the package boundaries.
2. `$use-morgs32-wiki-patterns` for RPC, deployment preflight, and durable ownership conventions.
3. `$implement` for the approved split and focused verification.

## Pointers

1. [Owner Worker integration, PR #176](https://github.com/morgs32/zerospin/pull/176)
2. [Owner Worker deployment and replay handoff](2026-11-19-handoff-owner-worker-replay-deployment.md)
3. [Self-hosted registration, MOR-488](https://linear.app/morganatwork/issue/MOR-488/register-self-hosted-systems-in-admin-by-immutable-system-name)
