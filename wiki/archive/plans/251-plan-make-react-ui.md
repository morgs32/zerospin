# Rename createUI to makeReactUI

**Date:** 2026-10-21

**Status:** Complete on 2026-10-21. Implementation, 22.0.0 publication and four isolated consumer adoptions are committed. The maintainer explicitly waived all further verification and requested archival on completion.

**Context:** The Initializer/UI separation was agreed in [Review WallTree naming](codex://threads/01a15bc9-1db0-71b1-bda0-97e8e44dc1a5) and implemented in [Zerospin PR 56](https://github.com/morgs32/zerospin/pull/56). [Plan 250](250-plan-scalar-primitives-and-model-ids.md) subsequently published that existing React interface with the scalar descriptor cutover. This plan changes the factory name only.

## Problem and decision

1. `createUI` is broad in imports and searches. `makeReactUI` follows Zerospin's `make…` factory naming and identifies the React interface it constructs.
2. Rename the public factory to `makeReactUI`. It still takes a pure Aggregate or Service session definition and returns the provider component with its attached `useSession()` hook. Keep application exports such as `UserUI`, `GameUI` and `ShopperUI`.
3. Keep the existing seam: `Initializer` and `MockInitializer` own construction, startup, failure handling, retry and disposal. Their callback supplies `{ session, isLoaded }`. The UI provider carries the session; its hook checks provider presence and does not suspend for readiness.
4. This rename improves naming consistency and discovery; it removes no lifecycle machinery. Do not use it to add wrappers, new context abstractions, helper types, configuration or behavior.

```tsx
import { Initializer, makeReactUI } from '@zerospin/react';

export const UserUI = makeReactUI(userSessionDefinition);

// Existing owner supplies definition, connection and identity inputs.
<Initializer {...initializationProps}>
  {({ session, isLoaded }) =>
    isLoaded ? (
      <UserUI session={session}>
        <Editor />
      </UserUI>
    ) : (
      <Loading />
    )
  }
</Initializer>;

// Existing consumers continue to read UserUI.useSession().
```

## Scope and alternatives

1. Rename `packages/react/src/createUI.tsx` to `makeReactUI.tsx`, rename its function, and replace the package-root export. Remove the old source/output module and export outright; add no alias, forwarding wrapper or deprecated path.
2. Preserve the generic signature and inferred session types, private context identity, `session`/`children` props, guarded hook, `session-provider-missing` error, display name and client directive. Keep factories declared outside render.
3. Update live callers, module documentation, shipped React skill, Fragment examples and local patterns. Keep earlier conversation, PR and archived-plan evidence recognizable as history.
4. Re-inventory QRK, Stackshirts, Mentor Mailbox and Red Rope Parking, including the committed consumer branches from Plan 250. Cut over every live `createUI` import/call in those consumers when adopting the renamed release. Preserve unrelated work and existing session ownership, credentials, claims, selections and loading/error behavior. Do not repeat their earlier React API migration.
5. Retaining `createUI` avoids a public-export change but keeps the inconsistent broad name. `makeSessionUI` identifies the session domain but omits the chosen React qualifier. Use `makeReactUI`; do not expose multiple spellings.
6. This is not a stored-definition, fixed-schema or protocol change. No storage reset, migration, application deployment or session-lifecycle redesign belongs to this plan. No new ADR is needed for this reversible naming choice.

## Planned files

Legend: `~` modify or rename; the arrow denotes the old path being removed through the rename. The document patterns cover matching maintained callers only.

```text
zerospin/
  packages/react/
    ~ src/createUI.tsx -> src/makeReactUI.tsx
    ~ src/index.ts
    ~ README.md
    ~ skills/zerospin-react/SKILL.md
  packages/browser/src/sessionDefinition/
    ~ README.md
  examples/shopping/src/zerospin/
    ~ {CatalogUI,PromotionUI,ShopperUI}.ts
  examples/tic-tac-toe/src/
    ~ GameUI.ts
  fragment/content/
    ~ {reference,guides,handbook}/** (current factory names and source links)
  wiki/patterns/
    ~ index.md
    ~ react/one-session-definition-per-file.ts
  ~ package manifests/release metadata required by the fixed-group workflow
  ~ pnpm-lock.yaml (only required release changes)

{qrk.sh,stackshirts,mentormailbox,redropeparking}/
  ~ authored React UI declarations and imports containing createUI
  ~ affected current guidance, direct package pins and pnpm-lock.yaml
  ~ existing package-age exemptions when required
```

## Execution and verification

1. Recheck the current committed framework and consumer branches before editing. Use isolated committed release/adoption checkouts wherever unrelated work exists; preserve ongoing work and do not copy dirty source into a published artifact.
2. Apply the source-file/function/export rename and replace maintained imports, calls, prose and source links. Preserve the existing implementation body and returned interface. Clean builds must not leave `dist/createUI.*` artifacts behind.
3. Run the affected existing Nx library/type/lint graph and the existing checks for changed examples and Fragment. Add no tests, fixtures, compile-only assertions, runners or configuration for a mechanical rename. Inspect the built package entrypoint/declarations for `makeReactUI` and the absence of `createUI`.
4. Use the existing fixed-group release workflow for the breaking export removal; select the actual version at implementation time. Prepare and inspect every published package's required artifacts, publish committed source to the configured local registry, and verify exact registry versions and the React tarball exports. Do not edit installed framework source in consumers.
5. Adopt exact package pins and lockfiles in consumers with live callers, completing the four-repository scan. Run their existing affected application builds/typechecks against the published release. A successful framework build alone does not establish consumer adoption. Preserve unrelated dependency selections and existing package-manager versions.
6. Reconcile current READMEs, shipped skill version metadata, Fragment source links and local pattern guidance with the final rename. Record commits, exact package versions, check outcomes and any unfinished work here. On 2026-10-21 the maintainer waived all further verification and requested archival when implementation was complete; the evidence below records the checks already performed and the final integration boundary.

## Implementation evidence

1. Framework source and the 22.0.0 release were committed as `218bf8bcd6` (`Rename React UI factory to makeReactUI`). Renamed `packages/react/src/createUI.tsx` to `makeReactUI.tsx`, its exported factory and package barrel, and maintained callers, documentation, Fragment examples and patterns. The implementation body is byte-identical after substituting the factory name. Initializer, MockInitializer, browser construction and session definitions have no source changes. The old factory export and module were removed without an alias.
2. All 19 fixed-group packages were published as **22.0.0** to the configured local registry. Exact registry versions and the published React tarball were inspected. The public `@zerospin/react/makeReactUI` module loads; barrel and declarations export the new factory, and old JS/declaration/map module artifacts are absent.
3. Before the maintainer's verification waiver, all 18 existing library targets in the fixed group passed; server-only has no library build. All 24 scoped React/Shopping/Tic-tac-toe/Fragment type/lint/dependency tasks passed. Fragment production build passed and prerendered 35 pages. Scoped TypeScript formatting and whitespace checks passed. Nx Cloud was unavailable; these were local results. A raw Node import of the browser-oriented barrel encountered its existing extensionless Browser imports; existing bundler application builds passed. Mounted browser and authenticated lifecycle behavior were not exercised for this rename.
4. Four isolated consumer adoption commits pin all 86 direct dependencies to exact **22.0.0**, update live factory declarations and current guidance, and retain each repository's package manager. Stackshirts' release-age exemptions and Mentor's exact CLI deployment guard moved with that version. The six CLI deployment helpers and `deployWranglerFn.js` compared byte-identically between 21.0.0 and 22.0.0. Consumer source edits replace the factory name only. Unrelated dependency selections were restored in Mentor and Red Rope Parking's generated lockfiles.

   | Consumer | Commit | Completed checks before waiver |
   | --- | --- | --- |
   | QRK | `42350f817` | App client/SSR/prerender build; API Wrangler dry-run |
   | Stackshirts | `f25fe8bf3` | Next production build, TypeScript and 10 prerendered pages; backend TypeScript |
   | Mentor Mailbox | `a02a1a230` | App/Hub/Admin/API builds; backend typegen; five existing-tsconfig checks |
   | Red Rope Parking | `00dabfa2c` | Web/Admin production builds; backend/Admin existing-tsconfig checks |

5. Consumer commits remain on `codex/plan251-make-react-ui` in their isolated adoption worktrees under `/tmp/zerospin251-consumers/`. Original consumer checkouts and unrelated work were preserved. These commits descend from the committed Plan 250 adoption branches; they do not claim reconciliation with later unrelated sibling work.
6. Main advanced independently through the contract inheritance release `c0b58b6054` (**22.0.1**). The final merge preserves its contract changes, version metadata, shipped skill metadata and changelog while integrating this factory rename. The separately published 22.0.1 artifacts predate this integration; this plan's published rename artifacts and exact consumer adoptions are 22.0.0. No additional publication was performed after the merge.
7. The maintainer explicitly said **“no verification needed archive plan when done”** on 2026-10-21. No further checks were run after that instruction. Earlier consumer checks preceded the final lockfile selection restoration, and the final merge was not reverified. No new tests, fixtures, check runners or configuration were created. No storage operation, application deployment or remote push was performed.

## Remaining work

None. Further verification was waived by the maintainer.
