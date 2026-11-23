# Explorer architecture diagram pages

Status: Complete — 2026-10-08.

## Agreed behavior

1. Build an interactive native React Flow canvas for every Mermaid block in `wiki/architecture/**`. The current inventory contains 22 diagrams in 12 documents. Each block has a dedicated, directly loadable URL.
2. Preserve participants, message direction, replies, numbering, notes, optional branches, alternatives, loops, parallel branches, and the projection flowchart. Read the diagrams from the docs during Vite development/build so the pages stay synchronized with the authored diagrams.
3. Add searchable navigation grouped by system, browser, and server, plus zoom, pan, fit, selection, and documentation provenance. Preserve Explorer's theme and mobile behavior and its existing overview and Invocation pages.
4. The user chose interactive canvases like Invocation. Use the existing React Flow dependency and native nodes/edges, with no Mermaid SVG renderer or new graph dependency. Reject unsupported diagram syntax explicitly rather than silently dropping content.

## Files

Legend: `+` create; `~` modify.

```text
zerospin/
  explorer/
    scripts/
      + readArchitectureDiagrams.ts
    src/
      ~ App.tsx
      ~ components/Navbar.tsx
      ~ env.d.ts
      data/
        + IArchitectureDiagram.ts
      views/architecture/
        + Architecture.tsx
        + DiagramCanvas.tsx
        + makeDiagramGraph.ts
        + architecture-diagrams.spec.mjs
        + architecture.css
      ~ views/invocation/invocation.css
    ~ vite.config.ts
    ~ package.json
    ~ README.md
```

## Implementation and verification

1. Extract all current Mermaid fences with document title, diagram title, source line, category, and stable URL. Parse the current sequence and flowchart syntax into explicit canvas data; validate participants, branches, and diagram completeness.
2. Build readable sequence lanes, message edges, note cards, fragment boundaries, and flowchart nodes. Expose selection details, documentation links, fit and zoom controls, and a mobile diagram menu.
3. Add the lazy architecture route and navigation. Include architecture docs in Nx build inputs and Vite watch dependencies. Document the pages and source ownership in Explorer's README.
4. Run Explorer build, typecheck, lint, formatting, and diagram tests through one scoped Nx graph. Verify every generated route in the live browser, inspect representative complex sequences and the flowchart, and check selection, search, theme, mobile navigation, unknown routes, and existing pages.
5. These are ordinary UI terms and reversible frontend choices; no new glossary concept or qualifying ADR is anticipated. Record the final result, resolve required checks, and archive this plan when complete. Preserve the earlier table-purpose repair and unrelated work.

## Outcome and verification

1. Implemented 22 dedicated native React Flow pages from all 22 Mermaid blocks in 12 architecture documents. The lazy architecture route includes grouped search, adjacent-page navigation, selection details, exact documentation lines, zoom, pan, fit, and mobile sheets. Existing overview and Invocation pages remain available.
2. The Vite catalog validates current sequence and flowchart syntax and preserves messages, replies, notes, numbering, actors, self calls, optional work, alternatives, loops, parallel branches, and owner boundaries. The flowchart routes long dependencies beside intervening cards so the before-state dependency remains visible.
3. Verified all 22 URLs in the existing browser, with native nodes and the complete connection counts. Checked search, message selection and Locate, mobile menu and operation details at 390×844, unknown-route recovery, and existing overview/Invocation rendering. Verified dark theme through temporary media emulation on a separate local origin, preserving the user's saved theme preference and restoring the normal viewport.
4. Verified live documentation discovery and removal by creating and removing a temporary diagram document: the menu automatically gained and then removed its page. The temporary document was removed without modifying authored architecture docs.
5. `pnpm nx run-many -t build typecheck lint format:check test:diagrams -p explorer` passed, including dependencies and all five diagram tests. Tests cover complete document inventory, native graph integrity, numbering, replies, self calls, semicolon prose, parallel/nested branches, invalid syntax/participants, and flowchart dependencies. Nx Cloud reported its existing authorization error after local tasks succeeded; that did not fail the checks. `git diff --check` passed.
6. Fixed the pre-existing formatting failure in Invocation CSS by formatting two font shorthand declarations. This changed whitespace only. Preserved the earlier table-purpose repair and concurrent work outside Explorer. Updated Explorer's README; no new domain vocabulary or qualifying ADR arose.

## Remaining work

None.
