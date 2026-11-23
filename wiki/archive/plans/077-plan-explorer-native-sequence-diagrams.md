# Explorer native sequence diagrams

Status: Complete — 2026-10-10. The RPC-only repair is superseded by feature removal; automated checks passed and the user cancelled further verification through the yolo skill.

The authorized Explorer RPC browsing removal supersedes the pending RPC-only test repair. Current source-serving and verification instructions below use the retained source plugin and `source:check`; the 2026-10-09 implementation and verification evidence remains historical.

## Problem and current evidence

1. Explorer already has a native React Flow sequence renderer. `Architecture.tsx` routes every architecture page through it except `browser/push-sequence`, which renders one Mermaid SVG inside a React Flow node. Individual participants and messages in that SVG cannot use the native selection model.
2. `readArchitectureDiagrams.ts` validates participant `box` declarations but discards their labels and membership. Simply removing the special route would lose the Browser tab, SharedWorker, and System Worker groups in the command-admission diagram.
3. `makeDiagramGraph.ts` uses fixed lane gaps and event heights. Captions can wrap, nested fragment boundaries expand outside their parents, and Locate considers message endpoints rather than the complete caption and self-call bounds.
4. The native architecture page currently has selection highlighting and Locate, but no inspector. The overview's inspector is about schemas and tables; it does not describe function and API participants.
5. The command-admission code example is currently attached by matching message text and mutating Mermaid's generated SVG. Native rendering must retain that example through explicit data.
6. [Plan 073](./073-plan-explorer-architecture-diagrams.md) records the completed architecture-page work and its native-rendering choice. This plan extends that implementation and removes the subsequent Mermaid exception; it does not reopen or overwrite the completed plan. The existing ADRs govern backend and browser command ownership, not this reversible presentation choice.

## Agreed behavior and scope

1. Use our native React Flow renderer for all architecture sequence diagrams, including `/architecture/browser/push-sequence`. Keep traditional ordered participant lanes, lifelines, horizontal calls, dashed replies, self calls, notes, numbering, and nested `alt`, `opt`, `loop`, and `par` fragments.
2. Keep the Mermaid fences in `wiki/architecture/**` as the single source for workflow topology, labels, ordering, and groups. Mermaid remains the documentation notation; Mermaid.js no longer renders Explorer diagrams. Preserve the existing limited syntax and explicit source-located rejection of unsupported statements rather than attempting general Mermaid compatibility.
3. Preserve the existing page URLs, navigation, diagram search, previous/next links, theme, mobile menu, pan/zoom, Read at 100%, Fit all, and reduced-motion behavior. Keep the projection flowchart working through its existing native rendering path.
4. Preserve participant groups from the authored boxes and the command-admission code example above its original first-call caption. Participant names, message captions, and branch captions stay on one line. Notes may wrap; code keeps its authored line breaks and indentation. Expand the canvas and event spacing to fit content rather than clipping, truncating, or wrapping those captions.
5. Clicking or keyboard-selecting a participant opens a workflow inspector with its role in this diagram, participant kind and group, implementation source links where an implementation exists, and incoming/outgoing messages in authored order. Choosing a listed message selects and locates that message on the canvas. A self call appears once in the message list and is identified as a self call.
6. Selecting a message, note, or fragment uses the same inspector shell to show its actual diagram content, source-document path and line, and relevant participants or enclosing branch. Do not infer implementation calls from message captions. Display schema details only in the existing overview; this inspector describes workflows.
7. Use a desktop side panel and the existing Sheet primitives on mobile. Opening, changing, or closing the inspector or source modal preserves the viewport. Locate is an explicit action and includes the selected item's complete visible bounds. Clearing selection closes the inspector, and source-dialog dismissal returns focus to its source action.
8. Limit implementation to Explorer, its source-serving integration, dependency removal, lockfile, and relevant documentation. Do not change command behavior, storage schemas, architecture workflow semantics, or the overview/Invocation interaction model. The subsequent authorized removal deletes Explorer's RPC browsing and analysis feature while preserving these native diagrams and their authored call trees. Preserve concurrent changes in those areas.

## Terminology and data ownership

1. A **participant** is an authored lane identity within one sequence diagram. A participant alias such as `node`, `repo`, or `api` is local to its diagram; it is not a globally unique implementation identity.
2. A **participant group** is the ordered set of participants inside one authored `box`. Retain its caption, source location, and membership. Render transparent boxes using Explorer's theme; validate the currently used box syntax explicitly and reject unsupported color syntax rather than silently changing its meaning.
3. A **fragment** is an authored control-flow scope; a **branch** belongs to the currently open fragment. Retain that ownership so nested branch separators and captions use their enclosing frame's bounds.
4. Diagram data owns topology and provenance. A small architecture-owned `sequenceParticipantDetails.ts` module owns explanatory roles and explicit implementation `ISource` references, keyed by diagram ID and participant ID. Populate roles for the current participant inventory from its architecture documents and verified source. External callers and host concepts have a role and documentation provenance, without invented implementation links.
5. Validate every authored detail entry against the discovered diagram and participant identities; validate referenced source paths and lines. Missing explanatory data must not be disguised as a verified role. Newly discovered participants still render from their authored declarations and show that role documentation is unavailable until added. This is a content state, not a second renderer or guessed symbol resolver.
6. Keep `commandAdmissionExample.ts` as authored explanatory content. Replace its message-text-only association with an explicit diagram ID and message selector containing the sender, receiver, and caption. Require exactly one matching event. The example annotates that event and cannot change its order, number, endpoints, or workflow meaning.
7. Native graph node and event identities drive selection directly. Preserve participant aliases and event provenance within the current diagram; do not use SVG classes, DOM-order matching, or Mermaid-generated IDs. Clear stale selection when documentation changes remove an item.

## Layout and rendering

1. Add a local browser measurement utility for the actual participant, caption, fragment, note, and code typography. Wait for the self-hosted fonts before the initial layout. Measure untransformed content using the same CSS as the rendered elements; supply explicit dimensions to the pure graph builder so Node fixtures can exercise layout without a browser.
2. Compute participant widths and inter-lane spacing from headers, adjacent-message captions, self calls, and annotations. Wider multi-lane captions constrain the distance between their endpoint lanes. Measure wrapped notes at their final available width, then compute event heights. Include numbering and padding in caption bounds.
3. Place groups behind their member lanes. Lay out nested fragments with reserved internal padding so child frames, branch captions, messages, notes, and annotations remain inside their owning frame. Branch separators span the enclosing fragment, not every lane indiscriminately.
4. Extend the existing custom nodes and message edges rather than adding a second sequence renderer or layout dependency. Participant headers and footers, message captions, notes, and fragment captions expose accessible selection controls. Decorative lifelines, group backgrounds, and invisible message junctions do not intercept other controls.
5. Have the graph builder return visible bounds for selectable items and the complete diagram. Fit all and Locate include message captions, code examples, self-call loops, notes, and group/frame extents. Inspector resizing must not trigger automatic refits; theme changes retain selection and viewport and only remeasure if typography actually changes.
6. Keep measurement/loading failures visible with retry. Do not retain an approximate-layout fallback or Mermaid renderer alongside the native implementation. Recompute layout when the diagram or annotation content changes, without introducing polling.

## Planned files

Legend: `+` create; `~` modify; `-` remove during implementation. The glossary entry is conditional on implemented domain terminology, as described below.

```text
zerospin/
  explorer/
    scripts/
      ~ readArchitectureDiagrams.ts
      ~ source-vite-plugin.ts
      ~ source-vite-plugin.test.mjs
    src/
      data/
        ~ IArchitectureDiagram.ts
        + sequenceParticipantDetails.ts
      views/architecture/
        ~ Architecture.tsx
        ~ DiagramCanvas.tsx
        ~ makeDiagramGraph.ts
        + measureSequenceContent.ts
        + SequenceInspector.tsx
        ~ commandAdmissionExample.ts
        ~ architecture-diagrams.spec.mjs
        ~ architecture.css
        - MermaidDiagramCanvas.tsx
    ~ vite.config.ts
    ~ package.json
    ~ README.md
  ~ pnpm-lock.yaml
  wiki/
    + plans/077-plan-explorer-native-sequence-diagrams.md
    ~ glossary.md (only if implementation introduces domain terminology)
```

## Implementation steps

1. Recheck the dirty worktree and the resolved Explorer Nx configuration. Reuse the existing native renderer, source viewer, Sheet primitives, and parser tests. Keep concurrent Vite+, source-reference, and command-lifecycle work intact.
2. Extend `IArchitectureDiagram.ts` and the parser with participant groups and explicit fragment/branch ownership. Retain complete original source and exact declaration/event lines. Add group, nesting, malformed-group, and branch-ownership fixtures before changing presentation.
3. Add the participant detail module and validate its diagram-local identities and source references. Author each current participant's role from the documented workflow, then derive incoming/outgoing message lists from parsed events. Attach the command-admission example through its unique explicit message selector.
4. Implement content measurement and pure native layout with complete item bounds. Update custom nodes, edges, and CSS together so measured dimensions match the actual presentation. Cover group containment, long captions, notes, nested branches, self calls, and the multiline example in the layout fixtures.
5. Add `SequenceInspector.tsx` and move diagram selection to the page composition that owns the canvas and inspector. Wire participant/message navigation, desktop/mobile presentation, close/clear behavior, keyboard selection, and source viewing through the existing `SourceReference` and `SourceViewer` components. Keep selection separate from viewport navigation.
6. Register participant implementation files with `source-vite-plugin.ts`, which accepts `workspaceRoot` and `authoredSourceFiles`. Pass the union of Invocation and architecture references, including authored call trees. Preserve canonical-path checks, `virtual:explorer-source-files`, authorized development reads, and complete production text assets. Watch referenced source files and emit `explorer:source-update` to close an affected nested source viewer in the authored call-tree modal; reopening fetches fresh text.
7. Remove the special Mermaid route, `MermaidDiagramCanvas.tsx`, obsolete Mermaid-only CSS, and the Explorer `mermaid` dependency through the package manager. Update the lockfile. Search for remaining executable Mermaid imports and SVG participant/message mutations; remove in-scope remnants without deleting the authored Markdown fences.
8. Run the verification below and repair failures caused by this implementation. Update Explorer's README to describe the single native renderer, preserved group/code presentation, workflow inspector, and source ownership.
9. After implementation, reconcile the terminology and decisions against the actual result. Update the existing glossary only for implemented domain concepts that warrant entries; routine UI terms need no new entries. Create an ADR only if an implemented decision is hard to reverse, surprising without context, and the result of a real trade-off. None is anticipated for this reversible frontend change, and no governing ADR is superseded.
10. Record verification evidence and remaining limitations in this plan. Use the implement skill for completion and move this plan, preserving its filename and repairing links, to `wiki/archive/plans/` only after every required check and behavior below is complete.

## Verification and completion evidence

1. Extend the existing `architecture-diagrams.spec.mjs` seam. Cover the complete current documentation inventory, unique routes, exact source/provenance, participant order and groups, message order/direction/numbering, replies, self calls, notes, fragment nesting and branch ownership, unsupported syntax, and unchanged flowchart dependencies. Assert that groups and child content are contained by their intended layout bounds, rather than merely checking that coordinates are finite.
2. Exercise pure layout with supplied deterministic measurements: exceptionally long participant/call/branch labels, calls in both directions, self calls beside the next lane, multiline code annotations, wrapped notes, and nested alternatives/parallel branches. Verify full selectable bounds and separation between consecutive content rows. Test unique example attachment and rejection of missing or ambiguous matches. Verify participant roles/source references use diagram-local identity and message lists preserve order without duplicated self calls.
3. Use the retained `source-vite-plugin.test.mjs` integration seam for architecture-authored source authorization, unknown/noncanonical-path rejection, referenced-source change notifications, and byte-for-byte complete production text assets. Preserve Invocation and architecture source behavior; source opens require only authored references.
4. Run one scoped Nx graph with required dependencies: `pnpm nx run-many -t source:check test:diagrams build check -p explorer`. The resolved `check` command combines formatting, lint, and TypeScript diagnostics. Inspect actual results and distinguish unrelated concurrent failures; do not claim full verification from a server-ready line or a narrower passing check.
5. Verify all discovered architecture URLs in the existing live browser. Inspect the command-admission page at 100% against its current authored participant inventory, owner groups, messages/replies/notes/alternative, and preserved code example. Visually verify long-caption and nested-fragment pages, the flowchart, and existing overview/Invocation pages. Use a production preview to verify native rendering and participant implementation source assets there too. Confirm RPC navigation and analysis requests are gone.
6. Exercise participant pointer and keyboard selection, role/source/message inspector content, self-call lists, message selection from the inspector, Locate including code/caption bounds, clear/close, source-dialog opening/highlight/retry/dismissal/focus restoration, and viewport preservation. Check both themes, reduced motion, desktop and mobile sheets, and unavailable/removed selection after a documentation change. Capture representative screenshots of the native diagram and inspector.
7. Verify a documentation edit updates the native page and a newly added/removed diagram appears/disappears through the existing catalog lifecycle. Use disposable fixtures and remove them after checking. Confirm role metadata has an honest unavailable state for a new participant and stale authored entries fail validation rather than attaching to a different diagram's alias.
8. Review the scoped diff and run `git diff --check`. Confirm no remaining Mermaid renderer/import, no compatibility path, and no implementation or glossary/ADR change outside this plan's scope. Preserve unrelated WIP. Record the exact checks and browser observations before archiving.

## Alternatives and rationale

1. Mermaid SVG with custom participant listeners was rejected: our selection behavior would depend on generated DOM structure and duplicate the native graph's identities. Native nodes and edges own the required behavior directly.
2. Switching only the current route to the existing fixed layout was rejected: it would discard participant groups and the code example and leave the demonstrated layout limitations unresolved.
3. Reauthoring diagrams as TypeScript was rejected: it would create a second workflow source or require a documentation cutover that this request does not need. Extend the existing constrained Markdown parser instead.
4. Reusing the overview schema inspector was rejected for this workflow: many participants are functions, APIs, or host concepts with no infrastructure table to inspect. Reuse its presentation primitives and the shared source modal, with sequence-specific content.
5. Automatic symbol matching from participant aliases or call captions was rejected: aliases recur across diagrams and captions include conceptual actions. Explicit, source-grounded explanatory metadata is simpler and avoids false implementation links.
6. A new generic diagram package, layout engine, editor, trace player, or fully independent production source pipeline is outside this change. The existing application-owned seams are sufficient.

## Implementation outcome and observed verification — 2026-10-09

- All architecture pages use native React Flow nodes and edges. The parser retains complete fence text, exact source locations, participant boxes, and fragment/branch ownership. Actual-font browser measurements supply the pure graph builder; Fit all and Locate include annotations, self calls, notes, and frame/group extents.
- The desktop inspector and mobile Sheet expose authored content, diagram-local roles, implementation links, and ordered message lists. Participant aliases retain selection across label edits; removed items and changed events at a reused source line clear selection. Measurement failures expose Retry and recover without an approximate layout.
- Architecture and Invocation references share the source plugin's `authoredSourceFiles` authorization union with RPC-discovered files. The Mermaid component, executable imports, SVG mutation code, styles, and package dependency were removed; authored Markdown fences remain.
- Concurrent command documentation changed the command-admission inventory from the planned 11 participants to 13 during implementation. Its current 13 lanes, three owner groups, 20 messages, replies, notes, alternative, and original first-call code example were verified; explicit metadata now covers the newly authored outbox participants. No command implementation or workflow semantics were changed by this plan.
- `pnpm nx run-many -t test:diagrams check build -p explorer` passed after the final changes, with all 16 dependency tasks satisfied. The diagram suite passed 12 tests; `check` reported 86 formatted files and no lint warnings/errors or TypeScript errors in 76 files. The production build passed. Evidence: `/tmp/explorer-native-quality.log`.
- The required combined graph `pnpm nx run-many -t test:diagrams rpc:check build check -p explorer` was run. Its RPC suite passed 26 of 27 tests and failed the production API assertion for the removed `AggregateBrowserSessionApi.accept` method. Evidence: `/tmp/explorer-native-verification-final.log`. The browser API removal belongs to concurrent outbox work, so the test was preserved and a bounded repair was requested.
- Development browser verification visited all 22 discovered URLs and checked rendered participant/caption dimensions. The command-admission page at 100% preserved authored code indentation, one-line captions, and unclipped participant headers. Long-label, wrapped-note, and nested alternative/parallel fixtures were inspected visually; pure tests assert child/frame and participant/group containment.
- Pointer and keyboard selection, participant roles, authored-order/self-call lists, message navigation, complete caption/code Locate bounds, notes/fragments, close/clear, source highlight, network failure/Retry, dismissal focus restoration, and viewport preservation were exercised. Both themes, reduced motion, mobile menu/inspector/source sheets, and the existing overview, Invocation inspector, RPC declaration page, and flowchart keyboard selection/Locate were verified.
- Disposable documentation fixtures verified catalog add/remove, live label changes without viewport reset, unavailable role content, participant removal, source-line reuse, visible measurement failure, and successful Retry. Fixtures were removed; temporary browser CSS, network blocking, viewport, and media overrides were restored.
- Production preview at `http://127.0.0.1:3041` rendered the final native diagram and inspector. Source actions opened full emitted implementation assets and highlighted `stageAggregateCommand.ts:78` and the newly authored `makeSessionCommandOutbox.ts:12`.
- Representative screenshots and the complete URL audit are retained in the visualization folder linked below. Scoped diff review and `git diff --check` passed. Searches found no executable Mermaid renderer/import or old `invocationSourceFiles` option. Unrelated WIP was preserved. This presentation change introduced no glossary concept or qualifying ADR.

Evidence artifacts:

- [Native diagram and desktop inspector](/Users/morgs32/.codex/visualizations/2026/10/09/01a121db-3717-7e83-b603-560ece0956a8/native-sequence-inspector.jpg)
- [Mobile workflow inspector](/Users/morgs32/.codex/visualizations/2026/10/09/01a121db-3717-7e83-b603-560ece0956a8/native-sequence-mobile.jpg)
- [All architecture URL observations](/Users/morgs32/.codex/visualizations/2026/10/09/01a121db-3717-7e83-b603-560ece0956a8/native-sequence-routes.json)

## Explorer RPC removal outcome — 2026-10-10

1. Removed the RPC route/navigation, view/data modules, all RPC analysis scripts and tests, semantic workers/caches, virtual RPC API, metrics, and Explorer's `ts-morph` dependency. Preserved Overview, Invocation, native Architecture diagrams, authored sequence call trees, and the shared source viewer. The pnpm lockfile retains unrelated transitive dependencies.
2. A focused `source-vite-plugin.ts` serves only the authored Invocation/Architecture references. It retains canonical-path authorization, development text reads, complete production assets, and scoped source-change events without semantic discovery. Source-serving integration assertions now live in `source-vite-plugin.test.mjs`; build inputs retain external source contents.
3. Before the user's yolo instruction, `pnpm nx run-many -t source:check test:diagrams build check -p explorer` passed all four tasks and 16 dependencies: three source integration tests, 17 diagram tests, a production build, and formatting/lint/TypeScript checks. All 117 authored source references matched emitted production text assets byte for byte, and no RPC analysis assets remained. Nx Cloud's remote artifact storage returned its existing access 401; local checks passed. Evidence: `/tmp/explorer-remove-rpc-verification.log`.
4. Native Chrome showed Overview and Invocation with only Repos & sessions, Invocation, and Diagrams navigation. Invocation's guard example reported `node-rpc-failed: Worker RPC failed`; no guard/runtime source changed under this removal. Development and production-preview HTTP reads succeeded. Full source-modal browser interaction and production-preview browser checks were not completed.
5. The user invoked [yolo](/Users/morgs32/GitHub/wiki/skills/yolo/SKILL.md), whose rule is “No verification, no tests.” Further checks and browser verification were cancelled at that point. This records a waiver, not a browser pass. Previously completed checks and the source regression tests from the approved plan remain. Historical native-diagram evidence above is preserved, Plan 069 remains active, and unrelated worker/profiling WIP is untouched.

## Remaining work

None. Remaining browser verification was cancelled by the user's yolo instruction.
