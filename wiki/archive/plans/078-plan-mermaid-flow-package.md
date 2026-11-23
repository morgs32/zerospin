# Mermaid Flow package

Status: Complete — implementation and scoped verification passed on 2026-10-09.

## Agreed scope

1. Extract Explorer's native React Flow diagram creation, content measurement, nodes, edges, selection identities, and renderer styles into `packages/mermaid-flow`, exposed as `mermaid-flow`.
2. Use Mermaid's built-in sequence parser. The user approved this after verifying that the published `@mermaid-js/parser@2.0.1` omits sequence diagrams. Replace the handwritten sequence grammar outright.
3. Keep Markdown discovery, document routes and metadata, explicit implementation references, inspector UI, and command-admission annotations in Explorer. Preserve the existing flowchart and all current sequence layouts and interaction semantics.
4. Retain exact document lines, participant groups, event order, message numbering, fragment ownership, and source-line selection identities. Reject parsed features the renderer cannot faithfully represent, with source locations.
5. Consume the package through pnpm workspace dependencies. Keep it independent of Explorer aliases, UI primitives, theme providers, and Zerospin domain modules.

## Implementation and verification

1. Scaffold with Nx and expose separate browser, pure graph, parser, and stylesheet entrypoints. Use Mermaid's grammar and lexer to create the sequence model and retain provenance; isolate parser state per invocation.
2. Move renderer styles and expose theme tokens. Preserve Explorer's fonts and colors through its integration settings.
3. Test parser correctness and isolation, syntax outside the old regex grammar, exact lines and same-line statements, unsupported renderer features, and graph layout. Run the existing complete architecture documentation suite through the package.
4. Run one scoped Nx graph for package tests, typecheck, lint, formatting, and Explorer's diagram suite, check, and build. Inspect the browser's actual rendering, selection, theme, and source inspector at a representative sequence page and the retained flowchart.
5. Review the scoped diff, preserve unrelated work, and archive this plan after required checks pass. The previous native-renderer plan's unrelated RPC verification remains owned by that plan.

## Implementation outcome

1. `mermaid-flow` owns the diagram model, independent Mermaid sequence-parser contexts, source provenance, measured graph layout, React Flow canvas, controls, and scoped styles. The browser, pure graph, parser, and stylesheet entrypoints are separate. Explorer consumes the package through `workspace:*`; its catalog, roles, inspector, source viewer, and annotation remain application-owned.
2. Mermaid's published built-in sequence grammar and lexer replace the handwritten sequence parser. Spaces around arrows, punctuated aliases, numbering increments/off, and semicolon-separated statements now follow Mermaid syntax. Unsupported rendering features fail explicitly. Source-derived statement IDs occupy a namespace distinct from participant aliases.
3. Existing diagram captions containing prose semicolons were corrected to commas in place, retaining all source lines and workflow semantics. Malformed-grammar fixtures now assert Mermaid's source-located parse errors.
4. Explorer's diagram-test cache inputs include the package dependency, so parser and layout changes invalidate that suite. Package checks include shared formatting/lint configuration and dependency metadata in their cache inputs.

## Verification evidence

1. `pnpm nx run-many -t test typecheck lint format:check test:diagrams check build -p mermaid-flow explorer` passed with all 16 dependency tasks satisfied. Seven package tests and twelve Explorer diagram tests passed; all 22 authored diagrams were parsed and laid out. The final diagram suite executed after the corrected dependency inputs. Typecheck, lint, formatting, and the production build passed. Log: `/tmp/mermaid-flow-verification-final.log`. Nx Cloud reported its existing access failure (401); the local task graph completed successfully.
2. Development and final production preview rendered the command-admission page with 13 participants, three groups, 20 messages, its code example, and unclipped captions. Keyboard participant selection preserved the viewport; role/source inspection opened the actual implementation at line 78 and restored focus on dismissal. Message selection and Locate included the annotation and caption. The retained six-operation flowchart rendered through the extracted canvas.
3. Scoped diff review and `git diff --check` passed. Searches found no old application-owned renderer/layout/measurement files, Explorer imports in the package, legacy sequence parser, or added casts. Unrelated work and the preceding plan's separate RPC verification remain intact.
4. [Production renderer and inspector](/Users/morgs32/.codex/visualizations/2026/10/09/01a121f5-bea7-7c81-9bb0-efc7f2f077a3/mermaid-flow-inspector.jpg).

## Remaining work

None.
