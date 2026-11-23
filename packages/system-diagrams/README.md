# @zerospin/system-diagrams

Render a declaration board from authored Zerospin metadata:

```tsx
import { SystemDiagrams } from '@zerospin/system-diagrams';

<SystemDiagrams
  systemSpec={systemSpec}
  navigation={{
    sectionId: 'system-board-aggregate-organization',
    basePath: '',
  }}
/>;
```

`SystemDiagrams` requires `systemSpec: ISystemSpec` and routed `navigation` props,
and exports `ISystemDiagramsProps`. The host owns route matching, redirects,
and unknown-owner responses. The component performs no fetching or authentication
and requires no runtime session.
React and React DOM peers remain `>=19 <19.3`.

## Declaration board

A left outline lists Aggregates and Services by name. Select an
owner to display its Actors, Agents, Models, and Contracts columns. Only one
owner is rendered at a time, selected by the host's owner-page route.

Each logical declaration appears in a padded, white `StudioCard`, separated by
a gap from neighboring cards within its Aggregate or Service, with
versions sorted numerically, oldest first. Names shared by different owners
remain separate. Cards display authored names and versions, without release
lists, computed counts, or invented version badges for agents.

The board fills the viewport. Each column has a fixed heading and its own
keyboard-focusable, vertically scrolling card area. The sidebar scrolls
independently and its edge can be dragged or resized with the arrow keys when
focused. Its initial width is 220px, bounded by a 180px minimum and half the
layout width; the content retains at least 160px. Width is kept while mounted.
Narrow layouts allow horizontal scrolling across the columns. Empty columns and
systems remain explicit. Studio mounts the board in the browser with SSR disabled.

The required `navigation={{ sectionId, basePath }}` identifies the selected owner.
Sidebar links use `${basePath}/aggregates/:name` or `${basePath}/services/:name`,
with encoded owner names. Section IDs are
`system-board-aggregate-${encodeURIComponent(name)}` or
`system-board-service-${encodeURIComponent(name)}`. Local Studio uses an empty
base path and redirects its root to the first Aggregate (or first Service).
Only an empty System uses an undefined section ID; owner pages supply an exact
section ID. There is no local owner-selection mode.

Model fields and contract payloads render as always-visible compact tables,
flush with the card edges. Each table scrolls horizontally within its card and
shows names, types, nullability, primary keys, uniqueness, defaults, and
references. Embedded tables use `CompactTable framed={false}` so the card owns
the outer border; standalone tables retain their frame by default. Multiple
versions have separate labelled tables. Empty shapes
show “No fields declared.”

## Styles

Import the package stylesheet once from the application's global stylesheet:

```css
@import '@zerospin/system-diagrams/styles.css';
```

The stylesheet uses Geist Mono from Fontsource. The board styles are scoped to
`.system-diagrams` and include a numbered outline, muted labels, thin separators,
and underlined actions. They work without Tailwind or a consumer component
library, and the page follows the OS light/dark preference.

## Supply display metadata

Project your existing declarations in server or build code:

```ts
import * as sdk from '@zerospin/sdk';
import { system } from './zerospin/system';

const systemSpec = sdk.makeSystemSpec({ system });
```

The synchronous projection returns `ISystemSpec`, also exported as a type from
`@zerospin/sdk`. It does not start a runtime or fetch backend data. Keep the
authored system and root SDK runtime import outside the browser bundle.
Pass serialized metadata through the application's existing server/build data
path. The package entry declares its client boundary for React Server Component
applications. Studio supplies metadata through RSC and mounts the board only in
the browser.

See the [integration guide](https://github.com/morgs32/zerospin/blob/main/docs/content/guides/system-diagrams.md).

## Actor and agent filtering

Actor and Agent cards have a right-aligned **View →** link. Their version tabs
start at the newest version and choose which version View uses; selecting a tab
does not change the current filter. The card surface remains inert. Model and
Contract tabs retain their existing initial version behavior.

The URL records one owner-scoped selection: `?actor=mentor&version=1` or
`?agent=name&version=1`. View updates the board in place and supports native link
behavior, reloads, and browser Back/Forward. A selected card is outlined, and a
removable label beside the owner name clears the filter. Actors and Agents stay
visible; only Models and Contracts are filtered. Switching owners clears the
selection. Unavailable or malformed selections show **Selection unavailable**
with a clear action and empty Models/Contracts columns.

Actor models come from that exact version's `exposedModels`, including its
restricted field shapes. Agent models are that version's own declared database
models. Contract grants resolve their exact versions from the owner catalogue.
Selections do not infer models from SQL predicates or contract mutation models.
The default board still includes all owner declarations. The exported
`IDeclarationScope` and optional `IDeclarationCard.scopes` retain these per-version
facts. Optional `DeclarationCard.view` and `DeclarationColumn.getCardView` props
provide per-card navigation. SystemSpec's wire format is unchanged.
