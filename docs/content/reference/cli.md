---
title: CLI reference
description: Configure agent instructions, run the local backend and Studio, package an iPhone System, seed authored commands, and deploy the current system configuration.
order: 4
---

## Run in the configured project

`@zerospin/cli` provides the `zerospin` executable. Backend and Studio commands load the current project's `zerospin.config.ts`, which must export the authored `makeConfig(...)` result. `configure-agents-md` works without that configuration or a running backend. In this monorepo, prefer the existing Nx targets because they supply the project's working directory and dependencies. From a configured project directory, the equivalent package executable is `pnpm exec zerospin`.

Use `pnpm exec zerospin --help` or `pnpm exec zerospin <command> --help` for the installed checkout's usage. This reference is sourced from [current CLI commands](https://github.com/morgs32/zerospin/tree/main/packages/cli/src/commands); it does not claim that the published CLI has this unreleased surface.

## Commands and arguments

| Command                | Inputs                                                                             | Successful result                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `zerospin dev`         | `--port <number>`, `--clean`, `--state-dir <directory>`, `--shared-r2 <directory>` | Local Workerd session running after `SystemWorker` accepts and initializes the System |
| `zerospin studio`      | `--port <number>`                                                                  | Declaration Board opens on the selected port or Portless URL                          |
| `zerospin seed <file>` | Required module path resolved from the current project                             | Reports “Seed program completed” after the program succeeds                           |
| `zerospin deploy`      | No authored command-specific options                                               | Run ID, progress, and promoted Worker version after initialization                    |
| `zerospin package`     | `--platform ios`                                                                   | Writes an executable iPhone System package to `dist/zerospin-system.zip`              |

`zerospin configure-agents-md [--directory <path>] [--check | --dry-run]` installs or checks the System registry approval rule in the selected directory's AGENTS.md.

Deploy is also the CLI's default command. Run `dev` explicitly for local development; an empty invocation is not a local serve command.

Run one self-hosted deploy at a time from your laptop. The CLI uses your
Cloudflare credentials and prints progress through **Live**.
[Develop and deploy a System](/guides/develop-and-deploy#deploy-the-backend-then-connect-the-frontend)

## Configure AGENTS.md

Run from the consumer repository root using its installed matching CLI:

```sh
pnpm exec zerospin configure-agents-md --dry-run
pnpm exec zerospin configure-agents-md
pnpm exec zerospin configure-agents-md --check
```

The default operation creates AGENTS.md or appends/refreshes one managed block.
`--directory <path>` selects an existing directory explicitly; the command does
not walk up to a workspace root. `--dry-run` prints the complete before/after
documents without writing. `--check` exits zero only when the installed rule is
current; missing, stale, malformed, or unreadable content exits nonzero. The two
flags cannot be combined. An unchanged document is never rewritten.

The source is the rule in the installed CLI's matching SDK parallel-models
skill, exposed as the raw `@zerospin/sdk/agent-rules` asset. Before changing any
`system.ts`, agents must present exact before-and-after snippets of every proposed
change and wait for the user's approval. They may then make the approved changes.

The installer owns only the region between the standalone comments
`<!-- zerospin:agent-rules:start -->` and `<!-- zerospin:agent-rules:end -->`.
It preserves surrounding text, the document's line-ending convention, and
existing file permissions. It rejects symlinks, nonregular files, invalid UTF-8,
and incomplete, duplicate, reversed, or non-standalone markers without repairing
them. Updates use a temporary sibling file, recheck the original document before
replacement, and clean up that temporary output. This detects observed concurrent
changes; it does not lock editors or guarantee exclusion against concurrent writes.

No application configuration, credentials, runtime, storage, or network service
is loaded. The command does not change canonical selections or release
registrations, install hooks, or configure Intent, Nx, or Graft. Keep Intent's
skill discovery/loading guidance alongside this literal rule block.

After upgrading framework packages, explicitly refresh the block and review its
diff. In CI, run the same command with `--check` from the repository root after
installing dependencies. This proves rule presence and freshness, not agent
compliance, approval, or runtime release-promotion eligibility. A package
version change with unchanged policy content does not require a block rewrite.

## Package an iPhone System

From the project containing the authored `zerospin.config.ts`, run:

```sh
pnpm exec zerospin package --platform ios
```

The command bundles the configured System's executable JavaScript and writes
`dist/zerospin-system.zip` with its `SystemSpec` and package manifest. Attach
that ZIP as an asset of a public GitHub Release. The iPhone app selects a release
from the repository and inspects its System before installation. The package
contains executable code; choose a repository you trust.

The first iPhone host supports one Aggregate definition and its ordinary
System-granted commands. Services, Actors, Agents, external requests and emitted
commands are not supported. Application Effect services are not supplied; their
requirements cannot always be detected before a command executes. See the
[list System example](https://github.com/morgs32/zerospin-list-example) and
the [native runtime documentation](https://github.com/morgs32/zerospin/blob/main/packages/native/README.md).
App Store approval of downloaded System logic has not been established.

## Local backend

`dev` loads the project and its `ownerReleaseSources`, resolves local
environment bindings, and builds the Worker executables from the checkout.
Wrangler runs `SystemWorker`, every registered Aggregate and Service
release Worker, and `AgentWorker` in one local Workerd session with their
deployed roles and bindings. `SystemWorker` accepts the generated SystemSpec
and initializes the System before the CLI reports readiness. Restart to
build from edited declarations or application Wrangler configuration.

Port selection uses the explicit `--port` first, then `ZEROSPIN_PORT`; otherwise the development runtime chooses its default. Both configured port forms must be integers from 1 to 65535. `--clean` defaults to false.

Local persistence lives under `.wrangler/zerospin/dev-worker/<encoded-systemId>`. Use `--state-dir <directory>` to change the parent of `<encoded-systemId>`. The project directory supplies `zerospin.config.ts` and development bindings. Ordinary restarts reuse the active development history and its backend storage. An explicit `--clean` publishes a fresh history under `.zerospin-histories`, records the histories it replaces, and retires the previous System-owned backend data. The authenticated local session snapshot identifies the active history so a returning browser can select fresh storage even if its previous Node database is unreadable. A browser with no previously verified history preserves its original storage. Other Systems, browser profiles and app drafts keep their own data.

`dev` checks the Worker layout before opening local state. If an earlier
co-located or split-Worker layout is present, startup refuses the directory,
including with `--clean`. Select an empty `--state-dir` to start a separate
history and preserve the original storage and bundles.

Example from a configured project:

```sh
pnpm exec zerospin dev --port 3006
```

For local service bindings, set the same `WRANGLER_REGISTRY_PATH` for `zerospin dev` and the other Workers' `wrangler dev` commands. The Zerospin Worker uses the registry when you supply this setting. Use an absolute path if commands run from different directories.

To share a local R2 bucket, give `zerospin dev --shared-r2 <directory>` the same directory the other Workers use with `wrangler dev --persist-to <directory>`. Use the same bucket name on each Worker. Zerospin links the shared `v3/r2` directory into active System storage. An ordinary start reports a conflict if that history already has its own R2 directory or a link to another directory. The System and other Workers keep separate Durable Object storage. Pass `--shared-r2` again when starting a new System history with `--clean`. The new history links to the selected directory and the clean preserves any previously linked R2 data. Choose a different System state directory and shared Wrangler directory for a fresh local stack.

A “Ready … (system spec accepted)” message confirms acceptance of the startup SystemSpec and successful initialization. The [development guide](/guides/develop-and-deploy) shows how the runnable examples start both sides.

## Local Declaration Board

`studio` loads `.env.local`, then `.env`, and imports `zerospin.config.ts` from the current project. It generates a serialized SystemSpec from the authored system and passes it through a React Server Component to the shared Declaration Board. No running backend or `ZEROSPIN_SECRET_KEY` is required.

The command accepts `--port <number>` with an integer from 1 to 65535. Port selection uses `--port`, then `PORT`, then `5555`. Studio binds to `127.0.0.1` with a strict port and fails if that port is occupied. When Portless supplies `PORTLESS_URL`, Studio opens and prints that public URL; otherwise it uses the direct localhost URL. Keep the CLI process running while using the board, and restart it after changing declarations. CLI cancellation owns server teardown.

Repo/table inspection is available in the Zerospin Cloud customer console under the selected Instance. Cloud imports the same `@zerospin/system-diagrams` package for its board. Trace pages and provider links are deferred. See [the Studio guide](/guides/studio).

## Run a named seed program

The file exports a named `seeds` function of type `ISeedProgram` from
`@zerospin/sdk`. It receives the typed `ISystemApi` and returns
`Effect.Effect<void, unknown, never>`. See [Shopping's seeds](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/seeds.ts) for the complete working module.

```sh
pnpm exec zerospin seed ./src/zerospin/seeds.ts
```

A minimal program using Shopping's existing release looks like this; add later
commands after the failure check to keep them sequential:

```ts title="src/zerospin/seeds.ts"
import type { ISeedProgram } from '@zerospin/sdk';
import { Effect } from 'effect';
import { marketplaceServiceReleaseV1 } from './services/marketplace/marketplaceServiceReleaseV1';

export const seeds: ISeedProgram = api =>
  Effect.gen(function* () {
    const outcome = yield* api.executeServiceCommand(
      marketplaceServiceReleaseV1,
      {
        contractName: 'createProduct',
        payload: {
          id: 'prd_one',
          name: 'T-shirt',
          description: 'Classic cotton tee',
          price: 2000,
        },
      },
    );
    if (outcome.result._tag === 'Failure') {
      return yield* Effect.fail(outcome.result.failure);
    }
  });
```

The loader invokes the function once, validates that it returned an Effect and
runs that program through the existing CLI failure boundary. The program owns
explicit sequential calls such as `api.executeServiceCommand(release, input)`.
After every call it must inspect `outcome.result`; business Failure stops later
submissions. A successful procedure displays “Seed program completed”, including
when its result is void.

Each invocation creates a new Chain-allocated command. Commands commit independently,
so earlier successes remain if a later command fails. Shopping reuses its create-only
catalog action through an explicit System grant. A rerun stops at the first existing
product; it never upserts, overwrites, resets or recovers an earlier command's outcome.
Provider
work may continue after the initiating command's outcome. Choose the API
environment intentionally.

## Environment and deployment

| Variable or requirement                                 | Used for                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ZEROSPIN_SECRET_KEY`                                   | Required by deploy and seed config loading; keep server-side                 |
| `ZEROSPIN_API_URL`                                      | API endpoint for server CLI commands; defaults to `https://api.zerospin.dev` |
| `ZEROSPIN_PORT`                                         | Local backend port when `dev --port` is omitted                              |
| `VITE_ZEROSPIN_API_URL`, `NEXT_PUBLIC_ZEROSPIN_API_URL` | Seed endpoint overrides after `ZEROSPIN_API_URL`, where configured           |
| Wrangler/Cloudflare authentication                      | Uploads and traffic changes from the laptop                                  |
| Browser publishable key and API URL                     | Separate frontend connection configuration, not a secret-key replacement     |

For self-hosted Cloudflare deployments, the CLI loads the authored config and deploys a private Worker for each newly registered Aggregate or Service release. It stages a version of the stable Worker with the new service bindings and carries forward earlier release bindings from the serving version. Before promotion it checks that the stable candidate retains the Aggregate and Service Chain namespace IDs and can call each new release Worker through its own binding. The probe verifies the System, owner release, and deployed Worker version.

On a fresh installation the CLI first creates the stable Worker and Chain
namespaces with ingress closed. After promotion it checks the executing
SystemRepo version, finishes AgentWorker activation, initializes the System,
and opens ingress. If a binding check fails during staging, the incumbent
continues to serve with its existing ingress settings.

Accepted `zerospin dev` startup/reloads and `zerospin deploy` initialization
initialize selected Agents and explicitly retry persisted initialization failures.
A wake-rule initialization failure stays on the Agent Repo and pauses callbacks;
ordinary alarms do not retry it. Fix the wake rule, then reload dev
or deploy again. Retry captures a fresh selected view and rebuilds pending wakes
without replaying historical callbacks.

To change an Agent’s behavior, declare a new Agent release and set its registry’s
`active` version to that release when you are ready to replace the installation.
Registering an inactive release leaves the current installation in place.
Redeploying the same selected release and owner binding preserves pending
deliveries and consumed wakes. Replacing or removing the installation
permanently abandons its outstanding command deliveries. Commands already
admitted by the owner Chain remain in its history.

Keep browser/session code and backend declarations coherent across deployment. For more detail, follow [versioning](/handbook/versioning-and-deployment) and [the deployment guide](/guides/develop-and-deploy).
