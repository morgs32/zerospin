# Support direct framework upgrades from the npm baseline

**Date:** 2026-11-20

**Status:** Accepted. Implementation pending.

## Context

Before it can deploy a candidate, the new CLI calls `SystemApi.preflightDeployment`
on the serving System Worker. That RPC decodes the candidate's complete `SystemSpec`
with the serving version's schema. A schema change can prevent the CLI from
checking the retained catalog. [Current preflight call](../../packages/cli/src/deploy/utils/verifyServingSystem.ts#L54)

## Decision

The upcoming npm release establishes the upgrade baseline for self-hosted Systems.
Each later release must upgrade an existing System from any published release
at or after that baseline with one `zerospin deploy`. The upgrade preserves
the System identity and retained data. The deploy can run multiple ordered
migration steps internally.

The new CLI must be able to inspect the serving System through a read-only
exchange that the serving version supports. Preflight must reject incompatible
deployments before changes to durable state or any candidate activation that
can make those changes.
[Deployment preflight policy](../patterns/system-worker/repo-lifecycle.md#check-deployment-compatibility-before-writes)

## Browser synchronization during rollout

During a System Worker framework rollout, already-open browser tabs must
continue synchronizing through their existing AggregateNode or ServiceNode
session. The existing app bundle can reconnect and submit queued commands
without a refresh. Submitting a queued command preserves its original identity,
session binding, and producer order. The usual command admission checks apply.
[Connected browser Node storage upgrades](027-connected-browser-node-storage-upgrades.md)

## Trade-off

Intermediate deployments would limit the old formats that each new CLI needs
to understand and require operators to install and deploy multiple versions.
Direct upgrades put that work in Zerospin. Each new release must preserve a
working deployment exchange and migration path from the supported baseline.
