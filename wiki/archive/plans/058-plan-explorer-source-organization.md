# Explorer source organization

**Status:** Archived on 2026-10-26 after maintainer-approved cancellation of the obsolete remainder. Existing source organization is retained; the former two-view layout and acceptance checklist are retired.

## Archival disposition — 2026-10-26

Current App renders the Overview, and the former Invocation view is removed. The maintainer approved retiring this old layout/import-cleanup proposal and its verification checklist. Current repository instructions forbid Explorer verification. No Explorer checks ran during archival, and this is not verified completion of the original proposal.

## Problem and scope

1. Explorer's `src/` mixes application entrypoints, two complete views, view-specific components, theme infrastructure, a shared hook, source loading, and catalog types. The filesystem does not show their ownership.
2. `App.tsx` contains both route selection and the overview's entire `Workbench`. `Inspector.tsx` and the overview import display constants from `diagram.tsx`, coupling them to the canvas implementation.
3. Organize the existing frontend files by their current responsibilities. Preserve routes, behavior, styling, provider placement, source loading, and lazy loading. The user approved implementation in this chat.
4. Keep the existing `data/`, `components/ui/`, and `lib/` arrangements. The separate chat-backend work in [Plan 057](057-plan-explorer-chat-system.md) was outside this reorganization. The maintainer subsequently requested its removal on 2026-10-17; its source, configuration, dependencies and README section are removed.

## Proposed layout

```text
explorer/src/
├── App.tsx
├── main.tsx
├── env.d.ts
├── style.css
├── views/
│   ├── overview/
│   │   ├── Overview.tsx
│   │   ├── Diagram.tsx
│   │   ├── Inspector.tsx
│   │   ├── TypeScriptIcon.tsx
│   │   └── presentation.ts
│   └── invocation/
│       ├── Invocation.tsx
│       ├── invocation.css
│       └── source-viewer/
│           ├── SourceViewer.tsx
│           ├── loadSourceFile.ts
│           └── source-viewer.css
├── components/
│   ├── Navbar.tsx
│   └── ui/                     # existing generated primitives
├── hooks/
│   └── useMobile.ts
├── theme/
│   ├── ThemeProvider.tsx
│   └── theme-preference.ts
├── data/
│   ├── types.ts
│   └── …                       # existing catalogs and snapshot
└── lib/
    └── utils.ts
```

## Ownership and decisions

1. Keep `App.tsx` at the root as the thin application composition: route selection, the lazy Invocation import and fallback, `TooltipProvider`, and the overview's `ReactFlowProvider`. Keep `main.tsx`, `env.d.ts`, and the global stylesheet beside it as entrypoints and app-wide infrastructure.
2. Extract the current `Workbench`, overview-only constants, `toggleSet`, and local `useReducedMotion` into `views/overview/Overview.tsx`. Rename `Workbench` to `Overview`. It continues to own filters, selection, mobile sidebar state, and the composition of Diagram and Inspector. Moving it must preserve the existing provider boundary and state lifetime.
3. Move Diagram, Inspector, and TypeScriptIcon into that view. Both consumers of TypeScriptIcon belong to the overview. Rename `diagram.tsx` to `Diagram.tsx` to match its primary component export.
4. Extract `ownerNames`, `ownerColors`, `connectionNames`, and `connectionColors` into overview-local `presentation.ts`. Overview, Diagram, and Inspector import the constants directly from their defining module. View composition and the inspector no longer import the canvas merely to obtain display metadata.
5. Move Invocation and its stylesheet together. Keep its private operation cards, guide, inspector, graph helpers, and state in the same file during this pass. Its source viewer has one current consumer, Invocation, so colocate the viewer, loader, and CSS under `views/invocation/source-viewer/`. Rename `source-files.ts` to `loadSourceFile.ts` to match its exported responsibility.
6. Navbar belongs in `components/` because both views and the loading fallback use it. `useMobile` belongs in `hooks/` because both views use it; this also matches the existing shadcn hooks alias. Keep the theme provider and preference helpers together in `theme/`, renaming `theme.tsx` to `ThemeProvider.tsx` while retaining its existing `useTheme` export.
7. Move `types.ts` to `data/types.ts`. Its catalog, graph, snapshot, and shared `ISource` shapes describe the checked-in data consumed by the views. Keep that small module intact; Invocation must not depend on overview-internal types for source provenance.
8. Keep `style.css` global. Invocation currently uses shared workspace, sidebar, inspector, and canvas classes from it. Splitting that stylesheet would require a separate ownership and cascade review. Colocate the two existing feature stylesheets without changing their rules or import timing.
9. Import moved modules directly, using the existing `@/` alias across folders and local imports within a folder. Update paths in one cutover; add no forwarding files, re-export barrels, compatibility aliases, packages, or routing abstractions.

## File changes

Paths below are relative to `explorer/src/`.

| Current file or declaration            | Proposed location                                  |
| -------------------------------------- | -------------------------------------------------- |
| Overview body and helpers in `App.tsx` | `views/overview/Overview.tsx`                      |
| `diagram.tsx`                          | `views/overview/Diagram.tsx`                       |
| Display constants in `diagram.tsx`     | `views/overview/presentation.ts`                   |
| `Inspector.tsx`                        | `views/overview/Inspector.tsx`                     |
| `TypeScriptIcon.tsx`                   | `views/overview/TypeScriptIcon.tsx`                |
| `Invocation.tsx`                       | `views/invocation/Invocation.tsx`                  |
| `invocation.css`                       | `views/invocation/invocation.css`                  |
| `SourceViewer.tsx`                     | `views/invocation/source-viewer/SourceViewer.tsx`  |
| `source-files.ts`                      | `views/invocation/source-viewer/loadSourceFile.ts` |
| `source-viewer.css`                    | `views/invocation/source-viewer/source-viewer.css` |
| `Navbar.tsx`                           | `components/Navbar.tsx`                            |
| `useMobile.ts`                         | `hooks/useMobile.ts`                               |
| `theme.tsx`                            | `theme/ThemeProvider.tsx`                          |
| `theme-preference.ts`                  | `theme/theme-preference.ts`                        |
| `types.ts`                             | `data/types.ts`                                    |

## Implementation steps

1. Recheck the worktree for concurrent edits and reuse the current Explorer configuration. Move the files and extract Overview and the presentation constants without altering their logic. Preserve named exports and adapt App's lazy named-export import to Invocation's new path.
2. Update every consumer, including the metadata modules that import `types.ts`. Update the file-specific override in `explorer/.oxlintrc.json` to the new SourceViewer path so its focusable document retains the existing lint treatment.
3. Keep `index.html` loading `/src/main.tsx`, shadcn's CSS location at `src/style.css`, the Vite virtual-module declaration in `env.d.ts`, and Vite's Invocation metadata import at `src/data/invocation.ts`. Keep the schema-capture output and generated UI aliases at their existing locations. These paths need no relocation.
4. Search for superseded imports and active path references; repair references where needed and confirm the old modules are removed. Preserve historical verification records. [Plan 055](055-plan-explorer-source-viewer.md) retains its separate unfinished browser verification; this organization pass does not complete or archive it.
5. Add a short source-layout description to `explorer/README.md`, incorporating concurrent README changes. Run the scoped verification below and address only failures caused by this reorganization.
6. Reconcile terminology after implementation. This proposal introduces no domain vocabulary and is a routine reversible folder decision, so it currently warrants no glossary entry or ADR. Record the actual result and verification, then archive this plan when all its work is complete.

## Historical verification proposal — cancelled

1. Run the existing checks through one Explorer task graph: `pnpm nx run-many -t build typecheck lint format:check -p explorer`. Reinspect resolved Nx configuration if concurrent backend work changes its tasks or dependencies. Explorer currently exposes no test task; do not introduce tests that merely assert file locations.
2. Verify `/` and `/invocation` still render in a browser. Smoke-check overview filtering, selection, desktop Inspector and mobile sheets; Invocation selection and failure visibility; theme switching; and source-modal opening, highlighted line, dismissal, and focus return. Check that Invocation remains a separate lazy page chunk and Shiki remains lazy.
3. Preserve current CSS order and global tokens. Verify both views at desktop and mobile widths because moving CSS imports or changing provider placement can cause visible regressions even when TypeScript passes.
4. Report planning, static validation, and browser evidence separately. If browser access remains blocked as recorded in Plan 055, retain that limitation and leave the relevant verification unfinished.

## Alternatives considered

1. Moving every component into one flat `components/` directory would reduce root clutter but continue to hide which view owns the diagram, inspector, icon, and source viewer.
2. Moving every catalog into its view would make ownership more local but expand the change into Vite source-catalog generation, schema-capture paths, and provenance documentation. The existing `data/` directory is already organized and can remain stable for this loose-file cleanup.
3. Splitting the large Diagram and Invocation files into many smaller modules would be a separate component-extraction task. The proposed pass introduces only the two extractions needed to make application and presentation ownership clear.

## Remaining work

None under this archived plan.
