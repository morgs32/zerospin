# Explorer RPC call trees with ts-morph

## Summary

Add an **RPC methods** page at `/rpc`. List framework RPC methods by package and owner; selecting a method opens an expandable static call tree with branches, callbacks, signatures, and source links.

Generate the catalog from current workspace source during Vite development and production builds. This work inspects RPC code; behavior changes remain under Plan 069.

## Implementation

1. **Build the analyzer.** Add `ts-morph` as an Explorer development dependency. Create analysis projects using the relevant package tsconfigs. Resolve workspace imports to authored source, including `.js` imports backed by `.ts` files, so stale `dist` declarations cannot determine the tree. Use ts-morph’s [project configuration and custom module resolution](https://ts-morph.com/setup/).

2. **Discover RPC owners from source.** Include framework-owned Cap’n Web and Cloudflare RPC capability classes, Repos and Chains, browser SharedWorker capabilities, Studio APIs, failure capabilities, and returned queue/subscriber capabilities. Include inherited framework methods and functions explicitly exposed through RPC transports. Exclude constructors, static helpers, local instance fields, runtime lifecycle hooks, declarations without implementations, examples, tests, and third-party owners. Keep returned capabilities associated with their exposing owner.

3. **Resolve calls through their implementations.** Follow imported functions, aliases, class methods, callable fields, factory-produced classes, concrete receiver types, and callbacks supplied to workspace factories. Recognize `Effect.fn`, `Effect.gen`, pipelines, `makeApiHandler`, and `makeAsync`; retain their callback bodies rather than stopping at the wrapper. When a factory receives an identifiable callback, connect its parameter invocation to that supplied implementation. Use symbols and declarations, not matching method names across unrelated owners.

4. **Preserve source structure.** Record calls in source order under existing JavaScript branches, `Match` cases, loops, failure handlers, and early exits. Show predicate calls and link named schema predicates to their declarations. Label callbacks separately from immediate calls. External implementations, runtime-selected contracts, ambiguous receivers, and unresolved computed calls remain visible leaves with their expressions and locations. These trees describe possible source paths, not observed execution.

5. **Generate a reusable graph.** Introduce an internal catalog containing owner/method identities, signatures, declaration locations, callable bodies, and call/branch relationships. Store each callable once; expand it as a tree in the browser. Recursion renders an ancestor reference. Repeated calls retain their individual call-site locations. No runtime RPC interface or persisted schema changes are required.

6. **Integrate generation with Vite.** Expose metadata through `virtual:explorer-rpc-catalog`. Generate it before serving or building the page; regenerate after analyzed source, manifest, or tsconfig changes, including additions and deletions. Analysis failures surface as development/build errors. Extend the source registry and Nx cache inputs to cover analyzed workspace files and configuration. Worker implementations are read as text and never imported for execution.

7. **Build the page.** Add navbar navigation and a lazy-loaded `/rpc` view. Provide case-insensitive search across package, owner, method, and implementation path; group results alphabetically. Show signatures and an expandable tree beside the method list, stacked on mobile. Preserve selection through `/rpc?method=<catalog-id>` and browser history. Without a selection, prompt the user to choose a method; invalid selections show an unavailable-method state.

8. **Share source inspection.** Move the existing source viewer, loader, stylesheet, and Copy chat link behavior into shared components. Reuse them in Invocation and RPC views, preserving highlighting, selected-line scrolling, retry, focus restoration, themes, and reduced-motion behavior.

## Planned layout

`+` create, `~` modify, `→` move.

```text
/Users/morgs32/GitHub/zerospin/
├── explorer/
│   ├── scripts/
│   │   ├── + rpc-call-tree.mjs
│   │   └── + rpc-call-tree.test.mjs
│   ├── src/
│   │   ├── ~ App.tsx, env.d.ts, components/Navbar.tsx
│   │   ├── → components/source-viewer/
│   │   ├── + data/rpc-types.ts
│   │   └── + views/rpc/
│   └── ~ vite.config.ts, package.json, .oxlintrc.json, README.md
├── ~ pnpm-lock.yaml
└── wiki/plans/
    └── + 073-plan-explorer-rpc-call-trees.md
```

## Verification and completion

1. Add analyzer fixtures covering cross-file aliases, inherited and factory-produced methods, returned capabilities, bound callbacks, Effect wrappers, branches, schema references, recursion, and unresolved calls. Assert catalog output and source locations.
2. Check real production paths: `SystemApi.executeAggregateCommand` reaches its handler body and `executeDirectAggregateCommand`; browser session methods reach core Node implementations; inherited Repo methods link to their defining source.
3. Add an `explorer:rpc:check` Nx task. Run it with Explorer build, typecheck, lint, and formatting checks through one scoped Nx invocation.
4. Verify development regeneration and production preview, including search, URL selection/history, expansion, source viewing, keyboard access, themes, and mobile layout. Confirm Invocation still works after sharing its viewer.
5. Record this plan when implementation begins. Update Explorer documentation, reconcile any implemented domain terminology, and archive the plan after verification. This reversible tooling addition does not require an ADR.

## Defaults

1. Analyze the current checkout; generate metadata during Vite execution rather than checking in a snapshot.
2. Include all statically identifiable framework RPC owners. Display unresolved boundaries explicitly.
3. Leave existing RPC branches and schemas unchanged; no blanket Schema or Match conversion accompanies this feature.

## Implementation outcome

Implemented on branch `codex/explorer-rpc-call-trees` in the managed worktree
`/Users/morgs32/.codex/worktrees/explorer-rpc-call-trees/zerospin`, from `5eabd2a2a1`.
The original checkout and its concurrent work were preserved.

- Added the source-only ts-morph analyzer and lazy RPC page, with 237 framework
  methods, stable selection URLs, bound factory/constructor callbacks, returned
  capabilities, inherited provenance, branches and explicit unresolved boundaries.
- Shared source inspection with Invocation. Source files are fetched as plain text
  assets, avoiding the browser's failed dynamic-import cache so source Retry can
  recover. Worker implementations are never executed by this registry.
- Preserved authored parameter and return annotations. Unannotated returns are
  labelled as inferred from the body rather than forcing expensive generic type
  evaluation during catalog generation.
- Added source/config watch invalidation, Nx inputs, Explorer documentation and
  glossary entries. Metadata requested during a pending watch debounce is reused.
  Analysis takes about one minute on this checkout.

Verification:

- The scoped Nx graph passed `rpc:check`, `build`, `typecheck`, `lint` and
  `format:check`, including all 13 analyzer fixtures and production API, Node and
  inherited Repo checks. Nx Cloud reports an access error (401); local gates pass.
- Chrome production preview verified case-insensitive search, URL selection and
  history, keyboard expansion, themes, mobile layout, highlighted source lines,
  focus restoration, Escape/backdrop closing and reduced motion. The actual bound
  API handler expands through `executeDirectAggregateCommand`.
- Invocation's shared viewer and source retry passed. Its standalone guard example
  still returns a passing result and the expected `empty-message` failure.
- Development source addition/editing/deletion, manifest/tsconfig invalidation, visible syntax
  errors and repair recovery were verified with a disposable capability. Temporary
  source and configuration changes were restored.

Integrated into `main` in merge commit `f7c09ada7d`, preserving the newer
architecture diagram pages and their navigation, Vite catalog and Nx inputs.
The exact committed merge passed `rpc:check`, `test:diagrams`, `build`,
`typecheck`, `lint` and `format:check` in the isolated checkout: 13 RPC tests,
5 diagram tests and all 22 Nx tasks passed. Concurrent uncommitted backend work
in the main checkout was preserved and excluded from this verification.
The merged production preview retained RPC source inspection and both the
architecture and Invocation pages.

## Remaining work

None.
