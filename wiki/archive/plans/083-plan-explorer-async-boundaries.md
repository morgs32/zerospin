# Async boundaries and clickable local steps

## Agreed behavior

1. Audit every Explorer sequence against current source. Arrows represent RPC, messages, network I/O, deferred tasks, and genuine same-runtime suspension. Synchronous calls and returns become ordered clickable local steps, with helper-only lanes consolidated into their execution owner.
2. Preserve diagram URLs, runtime groups, branches, and transaction meaning. Entirely synchronous lifecycle sequences keep their pages with zero arrows.
3. Save agent-authored source call trees in Explorer data modules. Each node has a label, source path and line, and optional children. Include branches, synchronous helpers, transactions, failures and full returns, stopping at explicit async handoff leaves. Do not use compiler, ts-morph, tracing, or on-click generation. Keep the separate Effect.match migration outside this work.
4. Attach trees to exact diagram ID, note participant list and caption. Reject missing or ambiguous attachments. Reuse identical entrypoint trees.
5. Clicking a step opens a keyboard-accessible themed modal with an expanded monospace tree and source links. Preserve the canvas viewport and nested source-viewer return. Keep participant and async-message inspection working.
6. Retain the staging code example on its new local step. Extend measured note rendering for code. Include recursively referenced source files in development and static production assets.

## Planned hierarchy

`+` creates and `~` modifies.

```text
zerospin/
  explorer/
    src/data/
      + sequenceSteps.ts
      + sequence-call-trees/
      ~ sequenceParticipantDetails.ts
    src/views/architecture/
      + SequenceStepModal.tsx
      ~ Architecture.tsx, architecture.css, commandAdmissionExample.ts, tests
    + scripts/resolveSequenceSteps.ts
    ~ scripts/readArchitectureDiagrams.ts, vite.config.ts, README.md
  packages/mermaid-flow/
    ~ note measurement, layout, rendering, tests
  wiki/
    ~ architecture/** sequence diagrams
    + plans/083-plan-explorer-async-boundaries.md
```

## Verification

1. Cover notes-only diagrams, retained asynchronous messages, exact attachments, nested source validation, full tree labels and code-note bounds. Source review establishes the async classifications; tests do not infer execution semantics.
2. Verify development and production source assets, modal and source navigation, keyboard focus, mobile and themes, preserved viewport, and no call-analysis requests when opening steps.
3. Run scoped Explorer diagram/RPC integration/build/check tasks and affected mermaid-flow tests/typecheck/lint/format checks. Preserve unrelated WIP and report any unrelated blockers.
4. Reconcile implemented documentation and qualifying glossary terms, record verification, and archive this plan when no work remains.

## Implemented outcome

All 27 sequence diagrams were reviewed against current source and now use arrows
for actual async boundaries. The four synchronous lifecycle sequences retain their
URLs with zero connections. The projection flowchart keeps its existing workflow.
Helper-only lanes were consolidated into their execution owners while retaining
runtime groups, branches, synchronous transactions and independent async work.

The exact note selectors attach 109 local steps to 96 saved, agent-authored trees.
Their 1,461 nested nodes reference 92 source files. Trees retain complete labels,
branches, callbacks, failures and returns, with explicit async handoff, recursion
and unresolved implementation leaves. Identical entrypoints share authored trees.
No compiler, tracing or on-click agent generates these trees. The existing RPC
inspection behavior and the separate Effect.match migration remain outside this work.

Local steps open expanded monospace trees directly. File/line buttons open the
existing source viewer inside the tree dialog, and closing it returns to the tree.
Step and source dialogs restore keyboard focus and preserve the canvas position.
The staging example is attached to its local step, with measured code-note bounds.
Explorer README and glossary now describe the implemented conventions.

## Verification results

- `pnpm nx run-many -t test:diagrams rpc:check build check -p explorer` passed:
  16 diagram tests, 27 RPC integration tests, production build, formatting, lint
  and type checks. Explorer reports no lint or type warnings. Nx Cloud's access
  notice did not prevent the local tasks from passing.
- `pnpm nx run-many -t test typecheck lint format:check -p mermaid-flow` passed:
  10 tests and the affected package checks. The package's 13 existing parser
  curly-brace lint warnings remain unchanged.
- Source review established each retained async classification. Regression tests
  cover zero-edge sequences, retained async messages, exact attachment identities,
  missing/ambiguous/duplicate matches, recursive source validation, complete tree
  formatting, and code-note layout bounds.
- Development on port 3040 and static preview on port 3041 served all 92 recursive
  tree source files successfully, with content matching current source byte for byte.
- Browser verification covered Enter and Space activation, Tab focus trapping,
  nested source declaration highlighting, Escape return and focus restoration,
  unchanged canvas transforms, participant and async-message inspection, the inline
  staging code's measured bounds, light/dark themes, reduced motion, and mobile
  modal/source navigation at 390 by 844 pixels.
- Network observation confirmed zero requests when opening saved steps in both
  development and static production. Static source navigation loaded only the
  requested bundled source asset and source-viewer assets.
- Scoped `git diff --check` passed. Unrelated work and runtime behavior were preserved.

## Remaining work

None.
