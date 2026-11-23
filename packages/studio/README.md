# Zerospin Studio

`zerospin studio` loads the current project's `zerospin.config.ts` and opens its
Declaration Board. Select its listening port with `--port <number>`, then `PORT`;
the default is `5555`. Both port forms accept integers from 1 to 65535. `.env.local` and `.env` retain their
existing precedence. The command does not require a running backend or a
Zerospin secret key, and it does not execute seeds.

## Server Component metadata

The CLI calls `makeSystemSpec({ system: config.system })` in Node. The Vite RSC
host supplies this startup snapshot to a React Server Component, which passes
serialized, JSON-compatible metadata to the existing client component exported
by [`@zerospin/system-diagrams`](../system-diagrams/README.md). Studio serves a
minimal HTML shell and mounts the board in the browser with `createRoot` after
fetching the route's RSC payload. Board SSR and hydration are disabled; client
components and their hooks execute only in the browser. The Vite `ssr` entry
provides the shell's client entry URL without rendering React components.
Executable project declarations and environment values remain outside the
browser bundle.

The shared board provides an Aggregate/Service outline, separate
declaration columns per Aggregate or Service, field disclosures, and full field
dialogs. Owners have direct page URLs at `/aggregates/:name` and `/services/:name`.
The root redirects to the first Aggregate, or the first Service when there are no
Aggregates. Unknown owners return 404; an empty System renders its empty board
at the root. Names are URL-encoded. Each page renders one owner inside a
viewport-sized board with independently scrolling columns and fixed column
headings. Browser history and direct reloads use normal page navigation.
Studio selects the package's `source` export condition so the component
and stylesheet use the same source revision. The RSC document emits its CSS
resources with `import.meta.viteRsc.loadCss()`.

Restart the command after changing declarations. The caller's
`AbortSignal` owns acquisition and memoized disposal of the local server.

`startStudio` accepts `projectRoot`, `port`, `open`, `systemSpec`, `signal`, and
optional `publicUrl`,
and returns `{ url, dispose }`. It has no deployment-authentication inputs or
local Repo HTTP broker.

## Cloud inspection

The local declaration board uses owner-page routing. Zerospin Cloud's Instance
Studio is the live Repo/table inspector; its deprecated board panel has been
removed. Its authenticated CloudApi resolves the active deployment's artifact
and private credentials for live Repo/table reads.
Historical deployment definitions remain separate from active-instance data.
Trace pages and external provider navigation are deferred.

## Storybook

Existing Storybook configuration and supporting fixtures remain in this
package. They are independent of the local RSC launcher.

## Portless

Studio binds to loopback HTTP with a strict port. When the CLI receives
`PORTLESS_URL`, it supplies that URL to `startStudio` for browser opening and
display; the HTTPS proxy owns the public origin.

Shopping's `pnpm studio` uses `studio.shopping.localhost` on internal port
12030; Tic-tac-toe uses `studio.tic-tac-toe.localhost` on 12031. Their explicit
Portless commands do not use or modify `dev:app`.
