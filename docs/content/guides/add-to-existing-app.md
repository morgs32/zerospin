---
title: Add Zerospin to an existing app
description: Introduce one owner, one session, and one reactive feature while keeping your application's routing and authentication.
order: 2
---

## Choose one feature to own

Start with a feature whose data changes together: an account's designs, a member's vehicles, or a user's site and pages. Zerospin does not replace your router, identity provider, asset storage, or whole application server. You define models and commands for this feature, then connect a browser session to the deployed System.

QRK registers a user aggregate for site/page data. Red Rope Parking registers member and partner aggregates plus an app service. Stackshirts registers a user aggregate while a guest design exists locally before sign-in. These are useful domain examples, but their current sibling source uses older declarations. Use the APIs below for a new integration.

## Prerequisites and package boundaries

First complete [the workspace quickstart](/guides/quickstart). You need TypeScript, a React client where applicable, an authenticated backend deployment for production, and a browser build that emits Zerospin's packaged module SharedWorker and SQLite WASM assets.

These docs use the current workspace packages, not an assertion that npm's latest package has this API. In a pnpm workspace containing this source, link dependencies with the package manager:

```sh
pnpm --filter your-app add @zerospin/sdk@workspace:* @zerospin/browser@workspace:* @zerospin/react@workspace:* effect
pnpm --filter your-backend add @zerospin/sdk@workspace:* effect
pnpm --filter your-backend add -D @zerospin/cli@workspace:* wrangler
```

Replace `your-app` and `your-backend` with your existing workspace package names. A separate repository must first bring in the matching Zerospin source and workspace packages or consume a release built from that source. A `workspace:*` dependency cannot reach a sibling checkout by itself. Preserve one matching Effect version across your application and Zerospin.

Before agent-assisted work, use the installed matching CLI from your repository
root to review and install the System registry approval rule:

```sh
pnpm exec zerospin configure-agents-md --dry-run
pnpm exec zerospin configure-agents-md
```

Commit the resulting AGENTS.md block. After dependency installation, CI can run
`pnpm exec zerospin configure-agents-md --check` from that same root. If the CLI
is installed only in a backend workspace package, invoke its executable through
that package and pass `--directory` pointing explicitly to the repository root.
Following a framework upgrade, explicitly rerun the installer and review any
policy change. Keep Intent discovery/loading instructions as well. This check
verifies that instructions are present and current; it does not verify agent
obedience. See [the CLI reference](/reference/cli#configure-agentsmd).

Use these import boundaries:

```ts
// Browser-safe models, ordinary contracts, IDs, validation, and staging.
import * as sdk from '@zerospin/sdk/browser';
// Browser lifetimes and transport configuration.
import { makeConnectedAggregateSession } from '@zerospin/browser';
// React ownership and reactive local reads.
import {
  useConnectedAggregateSession,
  SessionProvider,
  SessionReady,
  useSession,
  useLiveQuery,
} from '@zerospin/react';
```

The server SDK entry, `@zerospin/sdk`, also exports System/owner/actor factories, mappings, and external contracts. Keep that entry and authentication/provider modules out of your browser import graph. Do not import a backend `system.ts` just to reuse a model; import the model's defining file directly.

## Add the feature in this order

1. Define one version per model file. Decide which rows share an aggregate identity, or whether genuinely shared data belongs in a service. Use [Aggregates and services](/handbook/aggregates-and-services) before dividing owners.
2. Define ordinary browser-safe contract versions. Declare payloads, guards, models, typed failures, and operation Channels explicitly.
3. Define the backend actor. Verify credentials into claims, select the rows this actor may read, and expose only its permitted contracts.
4. Register the owner release in `system.ts`, then export a `makeConfig({ system, systemId })` configuration from `zerospin.config.ts` in the backend project's working directory. Declare any backend Effect dependencies in the release's `layer` and add its module and named export to `ownerReleaseSources`.
5. Define one pure session definition per file with the matching System, owner, actor, model, and contract versions. Keep API configuration and required Effect services in a separate application layer, and pass the bundler SharedWorker URL as `sharedWorkerUrl`.
6. Call `useConnectedAggregateSession(featureSessionDefinition, options)` or `useConnectedServiceSession` with separate host/instance inputs. Publish the returned handle with `SessionProvider`; gate only readers and commands with `SessionReady definition={featureSessionDefinition}` and required `renderError`. Consumers import the definition directly and use `useSession(featureSessionDefinition)` and `useLiveQuery`.
7. Replace the feature's write endpoint calls with typed staging helpers. Keep provider authorization and secrets on the backend; expose ordinary user actions such as checkout through their authenticated command contracts.

The [Tic Tac Toe walkthrough](/guides/build-first-feature) contains the concrete declaration chain. [React and Next.js](/guides/react-and-nextjs) covers browser assets and client boundaries; [Authentication](/guides/authenticate) shows verified claims.

## Verify the first vertical slice

The feature succeeds when its selected rows appear locally, one valid command updates the UI, the backend finalizes the same command, and reopening the same identity catches up. Test an invalid payload or permission refusal through your existing contract/backend checks. Verify that another identity cannot select or write these rows.

Keep UI ownership tied to account and resource identity. A refreshed token updates the credential callback; switching accounts or aggregates updates hook options and replaces the internal session without remounting public UI. A local prediction is not a successful external purchase, and a command rejection must remain visible.

Do not migrate old persisted rows through undocumented compatibility paths. During this prerelease hard cutover, fixed-schema changes require empty storage. If you are updating an older sibling integration, migrate its in-scope callers to the current declarations together rather than maintaining two APIs.

## Continue by responsibility

Use [Query data](/guides/query-data) for reads, [Write commands](/guides/write-commands) for submission and results, and [Shared services](/guides/shared-services) when multiple accounts interact with the same catalog or inventory. The [SDK reference](/reference/sdk) groups the actual exports so you can identify what your application imports.
