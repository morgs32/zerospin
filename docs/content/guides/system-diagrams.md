---
title: Render a declaration board
description: Project authored system metadata with the SDK and render a standalone React declaration board.
order: 13
---

## Install the component

Add `@zerospin/system-diagrams` alongside the matching `@zerospin/sdk` release in your React application. React and React DOM `>=19 <19.3` are peer dependencies.

```sh
pnpm add @zerospin/sdk @zerospin/system-diagrams
```

`SystemDiagrams` places Aggregates and Services in a left sidebar outline, styled after the docs app. Select an Aggregate or Service to display its Actors, Agents, Models, and Contracts columns. One owner is displayed at a time.

One card groups each logical declaration's versions numerically, oldest first. Cards show authored names and versions. Agents have no version badge, and repeated names remain separate within each Aggregate or Service.

The board uses the docs app's bundled fonts, canvas and paper colors, thin separators, and underlined actions. The outline supports keyboard navigation. The board fills the viewport with fixed column headings and independently scrolling card areas; narrow screens can scroll horizontally across the four columns. No graph controls or relationship lines remain.

Model fields and contract payloads appear as always-visible compact tables, flush with their white card edges. Each table scrolls horizontally and includes types, nullability, keys, uniqueness, defaults, and references. Multiple versions have separate labelled tables, and empty shapes display “No fields declared.”

## Project metadata outside the browser

Use your existing `sdk.makeSystem(...)` declaration in server or build code:

```ts title="Server or build code"
import * as sdk from '@zerospin/sdk';
import { system } from './zerospin/system';

const systemSpec = sdk.makeSystemSpec({ system });
```

`makeSystemSpec` synchronously returns `ISystemSpec`, a type also exported from
`@zerospin/sdk`. Projection reads the authored `releases` maps, Aggregate
predecessors and each Service's `canonical` release key directly from the
declarations.

The portable shape stores full definitions in each owner's `modelVersions`,
`contractVersions`, `actorVersions` and `agentVersions`. Release maps contain exact
numeric version bindings; `SystemDiagrams` resolves these through the same owner.
Actor exposed-model projections remain inline so limited views retain their exact
fields. Native declaration APIs and browser session locks keep their own shapes.

Pass `systemSpec` as JSON through your application's existing server loader, API response, or build-time data injection. Keep the authored `system` and root SDK runtime import outside the browser bundle, since they can import backend dependencies. The component receives metadata only and performs no fetching or authentication.

For build-time injection, the metadata is a snapshot: restart the development server or rebuild after changing the authored system. If you return it through an API, apply the application's existing access policy to that endpoint.

## Render the page

Once your application's data path supplies the metadata, pass it to the component:

```tsx title="SystemDiagramPage.tsx"
import type { ISystemSpec } from '@zerospin/sdk';
import { SystemDiagrams } from '@zerospin/system-diagrams';

export function SystemDiagramPage({
  systemSpec,
  ownerName,
}: {
  systemSpec: ISystemSpec;
  ownerName: string;
}) {
  return (
    <SystemDiagrams
      systemSpec={systemSpec}
      navigation={{
        sectionId: `system-board-aggregate-${encodeURIComponent(ownerName)}`,
        basePath: '',
      }}
    />
  );
}
```

`systemSpec` and `navigation={{ sectionId, basePath }}` are required. Sidebar
anchors link to `${basePath}/aggregates/:name` and `${basePath}/services/:name`.
Section IDs use `system-board-aggregate-${encodeURIComponent(name)}` and
`system-board-service-${encodeURIComponent(name)}`. The host supplies the selected
ID and handles those routes, including redirects and unknown-owner responses.
There is no local owner-selection mode. An empty System may use an undefined
section ID to render its empty state. The package exports `ISystemDiagramsProps`;
no Studio broker or live session is needed.

The supplied metadata determines the registered declarations, versions and empty states. The board is an authored inventory, rather than a view of execution history.

## Import the stylesheet once

Import the exported stylesheet in the application's global CSS:

```css
@import '@zerospin/system-diagrams/styles.css';
```

For Tailwind CSS 4, place the package import after Tailwind:

```css
@import 'tailwindcss';
@import '@zerospin/system-diagrams/styles.css';
```

The exported stylesheet provides a scoped baseline; the host application does not need Tailwind. The page follows the OS light/dark preference. The package bundles the same fonts as the docs app; no external font service or graph library is required.

## Studio rendering

Local Studio uses a Vite RSC host for authored metadata. It serves a minimal HTML
shell and mounts the board in the browser; SSR and hydration are disabled. The
root redirects to the first Aggregate, or the first Service when no Aggregate
is declared. Every owner has a direct reloadable page URL.

## Filter by an Actor or Agent

Choose a version tab on an Actor or Agent card, then follow **View →** on its
right. The URL records the exact selected version, for example
`/aggregates/organization?actor=mentor&version=1`. Tabs choose the version to
view; they do not apply the filter themselves. Actor and Agent cards initially
select the newest version.

Models and Contracts now show the selected declaration's exact scope. Actor
model tables preserve its `exposedModels` field shapes, including limited
models. Agent model tables describe its own declared models. Contract tables
show only its granted contract versions. Other Actors and Agents remain
available for switching. The label beside the owner heading clears the filter;
switching owners also clears it. Reload and browser history preserve selection.
Unavailable selections provide a clear action rather than choosing another
version. These are authored metadata views; they perform no runtime queries.
