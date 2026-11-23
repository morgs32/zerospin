# Zerospin dev Worker layout

2026-11-20

## Current design

The current checkout implements **one local Workerd session with separate Workers**. `SystemWorker` serves the gateway and owns `SystemRepo` and the stable Aggregate and Service Chains. `AgentWorker` owns Agent Durable Objects. Each registered Aggregate or Service release has a Worker for its versioned Repos and histories. Local development uses the deployed ownership and binding layout. [CLI reference](../../fragment/content/reference/cli.md#local-backend) · [Authored System startup](../architecture/AuthoredSystem.md#zerospin-dev) · [Package responsibilities](../../README.md#structure)

`openDevelopmentWorkspace` configures each role and connects the bindings, including the predecessor binding when a release declares one. `openDevelopmentWorker` passes all configurations to one `wrangler dev --local` invocation. Wrangler exposes the first Worker over HTTP and reaches the remaining Workers through bindings. The CLI calls `SystemApi.acceptSystemSpec()` and `SystemApi.initialize()` before reporting readiness. [Workspace builder](../../packages/cli/src/dev/openDevelopmentWorkspace.ts#L66-L156) · [Wrangler invocation](../../packages/cli/src/dev/openDevelopmentWorker.ts#L120-L137) · [Cloudflare multi-Worker development](https://developers.cloudflare.com/workers/local-development/multi-workers/#single-dev-command) · [CLI initialization](../../packages/cli/src/dev/initializeDevelopmentSystem.ts#L11-L40)

## How the two descriptions arose

The committed baseline offered two modes. Ordinary `dev` ran the co-located Worker. `--owner-releases` selected separate release Workers that reused first-registration executable bundles. The current working tree removes that switch and builds the deployed roles from the checkout at each start. Wrangler's optional shared registry for separately launched application Workers is a separate setting. [Committed CLI options](https://github.com/morgs32/zerospin/blob/d3bb704dfb63f7d8ef103a3b5e8f276582a1e4ce/packages/cli/src/commands/dev.tsx#L9-L19) · [Committed dev mode selection](https://github.com/morgs32/zerospin/blob/d3bb704dfb63f7d8ef103a3b5e8f276582a1e4ce/packages/cli/src/dev/devFn.ts) · [Committed bundle selection](https://github.com/morgs32/zerospin/blob/d3bb704dfb63f7d8ef103a3b5e8f276582a1e4ce/packages/cli/src/dev/openDevelopmentOwnerWorkers.ts#L126-L189) · [Current CLI reference](../../fragment/content/reference/cli.md#local-backend)

The earlier chat instruction said “Keep `zerospin dev` single-Worker.” The smoke test initially counted Worker scripts. The checked-out implementation and its documentation establish one local session with separate roles, which is the criterion the observed startup satisfies.

## Observed smoke result

The 2026-11-20 smoke test ran the built CLI from a temporary List System copy with a fresh `--state-dir`. One Wrangler invocation received three configurations for `SystemWorker`, `AgentWorker`, and the `list@1` release. `addListItem` returned a successful finalized `outcome` over the real API. A subsequent Repo RPC read back `lit_smoke` in `AggregateVersionRepo` at `avr_sys_list/list_smoke/list/1`. The CLI then exited cleanly. The topology and command commit satisfy the documented design for a fresh local startup. [Example release source declaration](../../examples/list-system/zerospin.config.ts#L5-L13)

## What the Linear specs require

MOR-490 explicitly applies the new System and owner Worker placement to the corresponding local development and Workerd paths. MOR-491 describes both co-located development and split development behind `zerospin dev --owner-releases`. Together these establish deliberate support for exercising the deployed boundaries locally. The change to make this the sole CLI mode appears in the working tree. [MOR-490](https://linear.app/morganatwork/issue/MOR-490) · [MOR-491](https://linear.app/morganatwork/issue/MOR-491)

MOR-491 separately requires split local development to reuse retained executable bytes across restart and release addition. MOR-487 requires recovery verification when the CLI loses the registration reply. The fresh-state smoke result above covers command routing. It leaves executable reuse across restarts unverified. [MOR-491](https://linear.app/morganatwork/issue/MOR-491) · [MOR-487](https://linear.app/morganatwork/issue/MOR-487)
