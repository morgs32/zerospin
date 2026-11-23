# Explorer invocation workflow

Status: Completed — 2026-10-07.

## Agreed behavior

1. Rebuild `/invocation` as an authored native React Flow workflow using the current command source. Replace the Mermaid renderer and Markdown import outright.
2. Distinguish independent optional preflight APIs, fresh synchronous staging, the single SQLite transaction, local outcomes, and the mounted browser owner's asynchronous continuation. Show failures and rollback without implying validation success guarantees commit or Node acceptance.
3. Make individual operation cards selectable, with source-grounded details and exact file locations. Provide explicit Copy chat link actions for native local file links in this chat. Do not invent a browser-to-native file URL scheme.
4. Preserve shared navigation, theme, pan/zoom, fit/locate controls and responsive inspection. Remove the superseded Mermaid dependency.

## Implementation and verification

1. Author workflow data with input/output facts, ownership boundaries, branch edges, and verified source locations. Keep command-ID allocation outside the transaction and session-index allocation inside it.
2. Render native operation cards, labeled edges and transaction/optional-preflight boundaries. Allow inspecting nodes and revealing failure paths.
3. Update Explorer's README. No domain terms or governing architecture decisions change.
4. Run Explorer build, typecheck, lint, existing tests and formatting through a scoped Nx task graph. Verify card selection, failure visibility, source-copy feedback, navigation, theme, controls and mobile inspection in the browser.

## Outcome

1. Created 16 native operation cards with labeled branch edges, independent optional checks, an atomic transaction boundary, local success, asynchronous browser delivery and optional failure paths. Individual selection opens behavior and source provenance. No Markdown import or Mermaid dependency remains.
2. Source review confirmed all 37 implementation references and the workflow's current transaction, activation and delivery semantics. Source actions copy native chat Markdown and display it as selectable text; the staging link's exact absolute path and line were verified in the browser. Direct browser-to-native file opening remains outside the supported page behavior.
3. Explorer build, typecheck, lint, formatting and all 12 existing tests passed. Nx Cloud reported an access error after the successful local checks; local execution completed successfully.
4. Browser verification covered native card selection, fit/locate, zoom/pan, failure visibility and selection clearing, light/dark selection preservation, navigation between the root canvas and invocation page, and mobile guide/inspector sheets at 390 × 844 without document overflow. The dev server remains on port 3040 and the browser is open at `/invocation`.

## Remaining work

None.
