---
title: Develop and deploy a System
description: Build matching workspace packages, configure local and production workers, and respect immutable declarations and storage cutovers.
order: 11
---

This guide covers **self-hosted on Cloudflare** deployment. You run `zerospin deploy` from your project, and the System runs in your Cloudflare account. With a System **hosted on ZeroSpinner**, ZeroSpinner deploys and runs it in ZeroSpinner’s Cloudflare account.

## Prerequisites

Use Node 24 or newer and the repository's pnpm version. Your backend project needs current workspace CLI/SDK dependencies, Wrangler, and a `zerospin.config.ts`. Production also needs a Cloudflare account with Worker/Durable Object access and Wrangler authentication authorized for the deployment account.

The CLI works from the project directory so it can load that project's config and environment. Prefer the configured Nx commands from the workspace root; they also build dependency libraries. Do not launch a backend from an unrelated working directory and expect it to find your config.

For direct CLI calls, run the project-installed executable from the backend project directory, for example `pnpm exec zerospin dev`. A globally linked CLI can resolve a separate copy of `@zerospin/core` and fail to validate the project's config.

## Choose a Cloudflare account and System name

Authenticate Wrangler on the laptop you will deploy from. Set
`CLOUDFLARE_ACCOUNT_ID` when the credentials can access multiple accounts.
Use the exact authored `name` from `makeSystem`. For example, the System
`shopping` uses the Worker name `shopping-zerospin`. The first verified deploy
establishes the System's identity in that account. Use the same account, name,
`systemId` and production keys when you redeploy.

## Define the project configuration

Tic Tac Toe's real configuration is:

```ts title="examples/tic-tac-toe/zerospin.config.ts"
import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { system } from './src/system';

export const ownerReleaseSources = {
  aggregates: {
    game: {
      1: {
        module: './src/gameAggregateReleaseV1.ts',
        export: 'aggregateRelease',
      },
      2: { module: './src/gameAggregateReleaseV2.ts', export: 'gameReleaseV2' },
      3: { module: './src/gameAggregateReleaseV3.ts', export: 'gameReleaseV3' },
    },
  },
};

export default makeConfig({
  system,
  systemId: 'sys_tictactoe',
});
```

The System registers owner releases and `systemId` identifies the durable deployment. Each Aggregate or Service release declares its backend Effect dependencies in its own `layer`. For local development and deployment, export `ownerReleaseSources` with the module path and named export for every registered release, grouped by `aggregates` or `services`, name, and release version. Paths are relative to `zerospin.config.ts`. The CLI validates that each entry resolves to the exact registered release before building the individual Wrangler artifacts. Existing deployed versions retain their original executables.

Use `makeConfig({ ..., wrangler: { r2_buckets: [{ binding: 'BUCKET',
bucket_name: 'attachments' }] } })` to add native Wrangler configuration to
the authored release Workers and `AgentWorker` in development and deployment.
Supported fields are
`r2_buckets`, `send_email`, `kv_namespaces`, `d1_databases`, `services`,
`vars`. Zerospin reports unsupported fields and conflicts with generated or
telemetry binding names. Configure routes, custom domains, and Worker URL
settings through Cloudflare.
Keep secrets in your local environment or Cloudflare secrets. Restart
`zerospin dev` after editing application Wrangler fields.

## Use the existing workspace checks

From the repository root:

```sh
pnpm nx run tic-tac-toe:ts
pnpm nx run tic-tac-toe:lint
pnpm nx run tic-tac-toe:build
pnpm nx run shopping:ts
pnpm nx run shopping:lint
pnpm nx run shopping:build
```

These are the examples' actual package tasks, and Nx builds the required workspace libraries. Shopping also defines `tsc:typecheck` for its package script. Compiling a frontend does not verify delivery or authorization: your application should verify those at contract/SQLite/Workerd seams.

## Run locally with matching endpoints

Run the chosen example's backend and app in separate terminals. Tic Tac Toe's
backend defaults to port `12003`. Portless serves the app at
`https://tic-tac-toe.zerospin.localhost`.

```sh
pnpm nx run tic-tac-toe:zerospin:dev
pnpm nx run tic-tac-toe:dev
```

Shopping's backend defaults to port `12002`. Portless serves the app at
`https://shopping.zerospin.localhost`. The app requires
`VITE_ZEROSPIN_API_URL` pointing to the local backend and a matching
`VITE_ZEROSPIN_PUBLISHABLE_KEY`. Configure the Shopping Clerk development
application before signing in. `ZEROSPIN_PORT` changes the example backend
port. An explicit CLI `--port` takes precedence.

```sh
pnpm nx run shopping:zerospin:dev
pnpm nx run shopping:dev
```

`zerospin dev` builds `SystemWorker`, the registered Aggregate and Service
release Workers, and `AgentWorker` from the checkout and runs them in one
local Workerd session. `SystemWorker` owns the gateway, catalog, and root
Chains. The release Workers host their own Repos and Actor projections.
`AgentWorker` owns Agent Nodes and their projections. `zerospin deploy`
publishes versions and promotes traffic in Cloudflare.

State defaults to `.wrangler/zerospin/dev-worker/<encoded-systemId>`. Use
an empty `--state-dir` if the CLI reports an older Worker layout. That
preserves the previous history and any saved bundles. With application R2
bindings, `--shared-r2` accepts the other Workers' Wrangler `--persist-to`
directory. [CLI reference](/reference/cli#local-backend)

Wait for accepted System and successful initialization before using it. A Worker root page is not the application's readiness screen; inspect CLI diagnostics and the expected application endpoint/session behavior.

## Name environment values by audience

| Environment value                                        | Where it belongs                                                |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `VITE_ZEROSPIN_API_URL`, `VITE_ZEROSPIN_PUBLISHABLE_KEY` | Vite browser build, addressing the deployed/local System        |
| `ZEROSPIN_API_URL`                                       | CLI tooling and trusted app-worker backend calls                |
| `ZEROSPIN_PUBLISHABLE_KEY`                               | Backend deployment configuration; public browser key must match |
| `ZEROSPIN_SECRET_KEY`                                    | Backend deployment/tooling/trusted app server only              |
| `CLERK_JWT_KEY`, `CLERK_AUTHORIZED_PARTIES`              | Shopping backend/app worker verification only                   |

Next applications must supply their own browser-public environment wiring; `import.meta.env` is the Vite example's mechanism. Do not expose secret-key or provider values using a browser-public prefix.

## Deploy the backend, then connect the frontend

If a framework upgrade changes fixed storage or compatibility is unknown,
[inspect the affected storage](#inspect-storage-before-a-framework-rollout)
before staging the backend. For an authored release on compatible storage,
follow the [replay and promotion checks](/handbook/versioning-and-deployment#add-and-validate-consider-promotion-or-retirement).

Run one `zerospin deploy` at a time from the backend project's working
directory on your laptop:

```sh
pnpm exec zerospin deploy
```

Shopping exposes the same command as an Nx task:

```sh
pnpm nx run shopping:deploy:zerospin
```

The deployment loader reads `.env.local`, then `.env`, for `ZEROSPIN_PUBLISHABLE_KEY` and `ZEROSPIN_SECRET_KEY`. If they are missing, it returns newly generated production keys and the environment-file path. Save those values securely in that project and rerun; generation alone is not deployment success.

On the first deploy, the CLI uploads an ingress-closed System Worker once
Cloudflare confirms that the Worker is absent. The CLI verifies the serving
version and System identity before publishing dependencies. On redeploy, it
verifies the existing Worker and starts from its serving deployment.

The CLI checks the candidate declarations and namespace bindings against
retained state before publishing. It uploads missing owner releases and
prepares the Agent Worker. Compatible redeploys reuse the root Chain, SystemRepo,
and Agent Node namespaces. The CLI checks the candidate at 0% traffic using
its exact Worker version, the expected SystemSpec, and the exact versions of
its bound owner releases.

After SystemRepo accepts the candidate definitions, the CLI rechecks the
staged deployment ID and traffic split and promotes the candidate to 100%.
It verifies the executing SystemRepo version, finishes Agent Worker activation,
and calls `SystemApi.initialize()`. The CLI opens ingress after initialization
on the first deploy and reports **Live**.

If the initial upload response is lost, rerun from the same project and
laptop. The CLI checks the serving version for the recorded run's tag before
resuming. If the outcome is still unresolved, the CLI reports that the upload
is pending. Save the run ID and use the terminal milestones and Worker version
IDs to locate failures after subsequent steps.

Configure your frontend API URL and public key to that exact System, build it, and deploy it through the application's host. Shopping's separate `deploy:app` task deploys its built app worker. QRK, Red Rope Parking, and Stackshirts each have their own application deployment responsibility; deploying Zerospin does not publish their frontend or migrate their source.

## Inspect storage before a framework rollout

Run this read-only preflight when the deployed-to-candidate framework upgrade
changes fixed storage or its compatibility is unknown.

1. **Identify the exact upgrade.** Read the executing Worker version with the
   authenticated `getExecutingWorkerVersion` RPC and match it to the deployed
   SDK artifact. Compare that artifact and the candidate, including intervening
   release notes. Check changes to SQL, migration ledgers, and serialized
   records such as `SystemRepo.acceptedSystemSpecs.spec`.
2. **Inspect the affected storage.** List the live namespace bindings and
   registered Repos. On Cloud instances, [Studio](/guides/studio#inspect-a-cloud-instance)
   exposes Repo and table inspection. The authenticated System API also exposes
   `getRepoRegistrations` and `getRepoTableRows`. A zero registration count
   describes the catalog. To establish whether a namespace has objects, list
   them by namespace ID and follow pagination to completion. An existing
   object with zero domain rows can still have an incompatible schema. Check
   physical schema and ledger compatibility separately, and validate retained
   accepted specs with the candidate schema. Record which immutable
   declaration facts must survive. Treat inaccessible or incomplete evidence
   as unknown and report counts and compatibility without credentials or
   stored contents. [Cloudflare object listing](https://developers.cloudflare.com/api/resources/durable_objects/subresources/namespaces/subresources/objects/methods/list/)
3. **Scope the rollout to the evidence.** With compatible storage, keep the
   existing Worker, `systemId`, and namespace bindings. An affected namespace
   with no objects can provision compatible storage on first use in place.
   If only the catalog is incompatible, scope the compatibility decision to
   SystemRepo and preserve accepted declaration provenance. If affected owner
   objects have incompatible storage, establish an approved, supported
   migration and rehearse it against representative retained history before
   rollout. Report incompatible or unknown storage as a blocker when no
   supported path is established. Treat System ID changes, namespace
   replacement, and any reset as separate decisions. A reset requires explicit
   authorization. Check browser Node compatibility separately.
   [Browser storage upgrades](/reference/browser#connected-browser-storage-upgrades)

In the documented QRK 39.0.0 → 43.1.1 preflight, the 20 namespaces other than
SystemRepo listed zero objects. The one SystemRepo object held an accepted
spec that 43.1.1 rejected. There were no listed AggregateChain objects to
convert for the SQL change, and the retained spec still blocked deployment.
That evidence supported keeping the Worker and all 21 namespace IDs while
addressing the catalog. [QRK investigation](https://github.com/morgs32/zerospin/blob/main/wiki/research/qrk-production-owner-chain-reuse.md)

A successful build, healthcheck, or spec acceptance establishes its own
result. Verify replay and durable publication separately before canonical
handoff. [Owner Chain reuse and handoff](/handbook/versioning-and-deployment#reuse-the-owner-chain-across-releases)

## Clean disposable local storage

The pre-release policy requires empty affected fixed storage unless a supported
upgrade path is explicitly approved. For disposable local backend state,
`zerospin dev --clean` deletes compatible local Durable Object storage
before serving. If the existing Worker layout is incompatible, select an
empty `--state-dir` to run with separate state. Shopping exposes cleanup
through Nx:

```sh
pnpm nx run shopping:zerospin:dev --clean
```

Browser storage belongs to its own origin and has its own upgrade policy.
Use local cleanup only for explicitly authorized disposable state.
For a fresh catalog and command history, see
[Reboot a System](/handbook/versioning-and-deployment#reboot-a-system).

## Diagnose at the failed boundary

A package/typecheck error indicates mismatched source or build dependencies. A config-loading error concerns the current project/config. Authentication failure concerns credentials and verified claims. A promoted-but-uninitialized deployment requires the CLI's actual failure evidence; repeated fresh releases do not repair it. Record the worker/version and command identity before investigating.

See [Versioning and deployment](/handbook/versioning-and-deployment), [Releases and systems](/handbook/releases-and-systems), and [Studio](/guides/studio) for inspecting the running System.
