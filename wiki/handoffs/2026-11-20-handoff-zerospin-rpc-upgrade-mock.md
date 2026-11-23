# Handoff for a Zerospin RPC upgrade mock

**Date:** 2026-11-20

**Focus:** Mock a minor or major Zerospin change that alters an RPC between the System Worker and a pinned owner release Worker.

## Goal

Use one concrete change to show which parts of an RPC contract must survive a direct framework upgrade. Start with the System Worker and a pinned owner release Worker from the same baseline. Change the System Worker, keep the original owner executable, and trace the request and reply at each call.

## Done

- The user chose a clean npm baseline, direct framework upgrades in one `zerospin deploy`, and continuity for commands queued in an already-open tab during rollout. [ADR 032](../adrs/032-direct-framework-upgrades.md) and the [glossary](../glossary.md#direct-framework-upgrade) capture those decisions as uncommitted documentation. Runtime implementation is pending.
- The code trace located the browser command decoder in the pinned ActorVersionChain. The System Worker issues the ticket and `SystemRepo` forwards the connection. An existing tab can exercise the upgrade through the same owner release. [Socket forwarding](../../packages/system-worker/src/SystemRepo/handleFetch/forwardSessionSocket.ts#L61)

## Remaining

1. Consider this mock. Add a field to the admitted command returned by `ServiceChain.admitServiceCommands`. The original `ServiceActorVersionChain` checks that the returned command matches what it submitted after removing only `serviceIndex`. Show where the old caller fails. Follow the same admission in the other direction to `ServiceReleaseWorker.validateServiceAdmission`, which strictly decodes the command sent by the newer System Worker. [Old caller](../../packages/system-worker/src/ServiceActorVersionChain/onMessage/admitServiceSocketCommand.ts#L56) · [Release decoder](../../packages/owner-release-worker/src/ServiceReleaseWorker.ts#L138)
2. Sketch how the candidate keeps the original request and reply usable and exposes the changed behavior where needed. Walk the same queued command through admission, original execution, and retained `outcome`. Use its original command ID and producer position so the mock tests the upgrade of an existing System. [Service original execution dispatch](../../packages/system-worker/src/ServiceChain/ServiceChain.ts#L252)
3. Show the deploy step with the candidate CLI talking to the baseline System Worker. Today `SystemApi.preflightDeployment` asks the serving version to decode the candidate's full `SystemSpec`. A stable read-only deployment exchange is the proposed starting point. [Serving preflight caller](../../packages/cli/src/deploy/utils/verifyServingSystem.ts#L52) · [Serving decoder](../../packages/system-worker/src/SystemApi/preflightDeployment/preflightDeployment.ts#L14)

## Open decisions

- Choose the change to mock and decide whether the resulting public behavior calls for a minor or major release.
- Decide where the first runtime wire schemas live and how future peers select a revision when multiple revisions exist. The prior recommendation was to derive TypeScript types from the wire schemas and treat the npm version as optional build metadata. The deploy can identify an owner executable through its accepted pin and use migration records to identify committed storage steps. [Owner identity](../../packages/core/src/system/ownerReleaseDeployment.ts#L29) · [Framework storage](../adrs/009-forward-only-framework-storage.md)

## Suggested skills

1. `$rubber-duck` and `$grill-with-docs` to walk through the mock and settle the compatibility decisions.
2. `$spike` if the user wants a small code sketch.
3. `$use-morgs32-wiki-patterns` for the repository's RPC and deployment rules.
