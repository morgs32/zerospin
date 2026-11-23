# Explorer source viewer

**Status:** Archived on 2026-10-26 after maintainer-approved cancellation of the remaining acceptance work. Source-viewer implementation is retained. Browser acceptance was not established; no Explorer verification ran during archival.

## Archival disposition — 2026-10-26

The maintainer approved retiring the remaining checklist. Current repository instructions forbid Explorer verification, so the former browser, build, typecheck and lint checklist is cancelled. The implementation and historical evidence below remain as context; archival does not establish visual or behavioral acceptance.

## Agreed behavior and scope

1. Clicking an Invocation source filename opens the full file in a read-only Shiki modal with line numbers, the referenced line highlighted and scrolled into view, and Explorer's light/dark theme.
2. Closing by button, Escape or backdrop restores focus and preserves graph selection and viewport. Keep source text selectable and readable on desktop and mobile. Handle loading, unavailable files, highlight failures and retry.
3. Load only source files referenced by the authored invocation metadata as Vite raw modules. Development uses workspace source; production bundles source from the build. No arbitrary filesystem endpoint or native file URL is needed.
4. Add Shiki directly to Explorer, reuse Base UI Dialog primitives, and cache one lazy highlighter with TypeScript/TSX and two themes.
5. Limit code changes to Explorer and its dependency lockfile. No command behavior, domain vocabulary or governing architecture decision changes.

## Implementation and verification

1. Derive a Vite source catalogue from Invocation provenance and add source-file inputs to Explorer's cached build so changes in referenced source invalidate it.
2. Create the modal and integrate filename actions without unmounting the diagram or inspector. Render Shiki tokens as React text elements; keep source files read-only and avoid executing them.
3. Update the Explorer README with source loading and viewer behavior.
4. Run Explorer build, typecheck, lint, formatting and existing tests through one scoped Nx task graph. Verify line navigation, full-file text, theme changes, dismissal/focus restoration, graph preservation, source changes and mobile behavior in the browser. Verify a production preview also loads bundled source.

## Outcome and verified evidence

1. Invocation source filenames open a Base UI modal with full read-only source, lazy Shiki highlighting, separate line-number gutters, cited-line highlighting, vertical-only line centering, both Explorer themes, loading/error/retry states and a mobile layout. The filename action establishes the focus return location before opening; the graph and inspector remain mounted.
2. Vite derives the raw-source catalogue from existing Invocation provenance. The source loader rejects paths outside that catalogue, including inherited object property names. Shared Nx `invocationSource` inputs cover the referenced Core and Browser files for build and tests.
3. Explorer build, typecheck, formatting and lint passed. All 32 tests passed, including exact source loading for all 17 referenced files and catalogue rejection checks. The production chunks for all 17 files imported as strings and matched checkout contents byte for byte. Installed Shiki highlighted every catalogue file in both themes; all 5,092 token lines reconstructed the original source lines. TSX highlighting also passed for the viewer itself.
4. The code pane remains a focusable document for keyboard scrolling. Explorer's local lint configuration retains the shared rule set, plugins and browser/Node environments while allowing that role only in `SourceViewer.tsx`.
5. Browser automation is blocked on the existing in-app tab's `data:` connection-error page. An attempted normal navigation to the running HTTP Explorer page was also rejected by the browser URL policy. The user has been asked to reload the Invocation tab; no alternate automation route was used to bypass the block. Nx Cloud reported its existing workspace-access 401 after successful local checks.
6. On 2026-10-08, source cards were simplified to their filename action, path, cited line and optional note. Clipboard controls, copied Markdown fields, their styles and the workspace-path injection were removed from the shared Invocation/RPC component. Explorer build, typecheck and formatting passed. Its restarted development server reported ready on port 3040. Browser verification remains blocked by the in-app URL policy; the concurrent Vite Plus migration introduced lint warnings outside this removal.

## Remaining work

None under this archived plan.
