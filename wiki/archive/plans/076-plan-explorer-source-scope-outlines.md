# Explorer source scope outlines and on-demand call resolution

## Status and scope

1. Implemented and verified on 2026-10-09. The source-first behavior and focused standalone extraction are complete; the evidence below records the resulting boundaries and checks.
2. **Settled: source scopes first.** The user selected this behavior on 2026-10-09. The initial list shows authored source scopes immediately; exact RPC exposure and inheritance are verified when an owner is opened. The initial syntax list must not claim to be the complete verified RPC inventory.
3. Preserve the single `pnpm nx run explorer:dev` command, Vite-managed lifecycle, existing source viewer, navigation/search, themes, accessibility and static production preview. Preserve concurrent Explorer and Vite+ work.
4. This builds on [Plan 075](075-plan-explorer-rpc-catalog-performance.md), reusing its workers, atomic cache writes, dependency validation and watcher lifecycle. Its eager development catalog and virtual module are removed. Plan 075's pending visual checks are resolved against the replacement view; its superseded behavior is recorded explicitly before archival.
5. The user also requested planning for glob discovery and the focused extraction of standalone worker RPC APIs into adjacent named modules. Both that scope and the source-first behavior in item 2 are settled. Do not reorganize other capability factories merely to satisfy discovery patterns.

## Problem and source evidence

1. The current analyzer registers RPC methods and reachable functions, then drains every pending callable and analyzes its body in [`rpc-call-tree.mjs`](https://github.com/morgs32/zerospin/blob/692e54cc83a9b9d4d54cbff88cb43f79859ea6e1/explorer/scripts/rpc-call-tree.mjs). The collapsed state in [`RpcCallTree.tsx`](https://github.com/morgs32/zerospin/blob/692e54cc83a9b9d4d54cbff88cb43f79859ea6e1/explorer/src/views/rpc/RpcCallTree.tsx) controls rendering after that graph already exists.
2. Plan 075 measured 38.40 seconds for cold preparation and 37.88 seconds after editing one shared source file. Five package programs were invalidated, despite two retained Projects being reused. A validated warm catalog is fast, but ordinary shared edits remain expensive.
3. A source outline can obtain authored declarations, parameters, return annotations, branches, loops, inline callbacks, call expressions and source positions from one file's syntax. TypeScript documents single-file AST traversal without constructing a type checker in its [Compiler API guide](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#traversing-the-ast-with-a-little-linter).
4. Syntax cannot establish all RPC exposure, inherited implementations, factory-produced receiver identities or supplied callback bindings. Those claims must remain unresolved until verified. Replacing semantic resolution with same-name guesses would change correctness and is excluded.
5. Aggregate and Service SharedWorker APIs already occupy named `*Api.ts` modules. Queue/subscriber/Repo factories are discoverable through regular filename suffixes, and their nested capability classes capture legitimate factory state. The focused exception is [`makeStandaloneSharedWorker.ts`](../../../packages/browser/src/StandaloneNode/makeStandaloneSharedWorker.ts): its nested `Binding` and `WorkerApi` classes capture attachment/drain collaborators and obscure the two distinct RPC scopes. Extract those classes without moving the factory's runtime ownership.

## Terminology and data ownership

1. A **source scope outline** describes the authored structure of a callable and its nested blocks. It reports source facts, not observed execution or proof of RPC exposure.
2. A **scope reference** locates a declaration in a workspace-relative source file. Named declarations use their lexical declaration ancestry; anonymous scopes and call sites use ranges valid only for a particular source-content fingerprint. Source locations are regenerated after edits.
3. A **call resolution** connects one call site, in its supplied binding context, to a verified implementation scope or an explicit unresolved/external boundary. It does not include the implementation's body or recursively resolve its descendants.
4. File outlines and declaration headers belong to the syntax parser and depend on that file's contents, parser implementation/version and extraction rules. Import statements and base expressions are recorded as syntax; resolved imports, inheritance, RPC classification and callback bindings must not enter this file-only cache.
5. Semantic results belong to the existing analysis worker/coordinator and retain dependency-aware fingerprints. The client owns disclosure state, source selection and navigation; it does not reconstruct types or execute inspected worker code.

## Proposed first-view behavior

1. **Chosen: source scopes first.** Build a fresh syntax index of named classes, factories/functions and their authored callable scopes in the glob-discovered root files below. Group by package/file/declaration, label the list as source scopes and expose search over those source facts. Do not label an unverified scope as an RPC method or claim that this is the complete framework RPC inventory.
2. A selected named method such as `AggregateBrowserSessionApi.accept` loads its current file outline independently of semantic discovery. Other method bodies remain collapsed and are fetched only when opened. Preserve existing owner/method navigation identities for declarations that already have them; update in-scope navigation consistently without compatibility aliases. A deep link requiring inherited or factory identity resolution gets a local resolving state while other source scopes remain usable.
3. Opening an owner may request its exact RPC details through the existing semantic discovery rules. Show verified inheritance, exposing-owner relationships, returned capabilities and constructor/factory binding contexts only after a fresh result exists. This may add source scopes to the selected owner's details without pretending the initial syntax index had complete RPC coverage.
4. **Rejected alternative: complete RPC inventory first.** Separating exact owner/method discovery from callable-body traversal would still leave cold whole-program metadata work in the initial list. The user chose immediate authored-source navigation instead.
5. Implement the chosen source-first behavior. Do not ship two competing default views, an old full-catalog fallback or a silent approximate RPC inventory.

## Discovery roots and source inventory

1. Apply an explicit discovery pattern set within the existing configured package `src/` roots, preserving package order and source exclusions. Initial patterns are `**/*Api.ts`, `**/*ApiFailure.ts`, `**/*Repo.ts`, `**/*Chain.ts`, `**/*Queue.ts`, `**/*Subscriber.ts`, `**/*Worker.ts` and `**/*Agent.ts`. The inspected catalog snapshot contained 44 owners in 43 files covered by these suffixes; that snapshot is evidence for this starting set, not proof that filename matching establishes complete RPC exposure.
2. Parse each matching file's syntax, including nested classes and factory declarations. SharedWorker API modules match `*Api.ts`; existing capability factories match their ordinary `*Queue.ts`, `*Subscriber.ts` and `*Repo.ts` names. Avoid an owner-by-owner exception registry and avoid moving closure-bound capabilities solely for indexing.
3. Discovery globs choose initial roots only. Keep a separate canonical allowlisted inventory of authored source files for imported helpers, re-exports and requested implementation outlines. A helper outside the discovery globs can be reached from a discovered declaration without appearing as a root or requiring a scan of every file's body.
4. A changed matching file updates only its syntax index entries. Additions, deletions and discovery-pattern changes update root membership; unchanged file outlines remain cached. Dependency/configuration changes still invalidate affected semantic relationships. Neither a filename match nor a syntactic `extends` expression proves RPC exposure, inherited method ownership or a returned capability's implementation.

## Standalone API extraction

1. Create `StandaloneBrowserSessionApi.ts` and `StandaloneSharedWorkerApi.ts` adjacent to `makeStandaloneSharedWorker.ts`. Export one named `RpcTarget` class from each. Preserve the exposed method names, arguments, returned stubs, errors and disposal behavior; this is a source ownership refactor, not a new worker protocol.
2. `StandaloneBrowserSessionApi` owns its closed flag and retained sink subscription. Its explicit constructor collaborators are the session attachment (`node`, `boundNodeId`, encoded `claims`), `drain(): Promise<void>` and `releaseSession(): void`. Define the attachment's shared `IStandaloneSessionAttachment` type in this module using the existing node/claims types; give the factory's `attach` an explicit return type instead of exporting a type dependent on a local closure. Preserve command validation, claims checks, stale-node checks, snapshot identity claims, push controls and unsupported authentication behavior.
3. `StandaloneSharedWorkerApi` owns one connection's closed flag and session set. Inject `attachSession(input: unknown): Promise<IStandaloneSessionAttachment>` and `drain(): Promise<void>`. It constructs each browser session API with a release callback that removes that session from this connection's set. `ready()` continues reporting `sharedWorkerVersion`; disposing a connection disposes its sessions without taking ownership of the shared worker's storage or lock.
4. `makeStandaloneSharedWorker` retains declaration validation, storage identity/provisioning, the shared AggregateNode owner, serial attachment chain, coalesced execution drain, stopping state, navigator lock, lifetime release and root `close()`. Its `onconnect` constructs one `StandaloneSharedWorkerApi` per port using the local attachment/drain functions, retains the existing transport error hook and disposes that API on a broken connection. Do not introduce another coordinator or move this state into either API class.
5. Move the authored `IStandaloneBrowserSessionApi` and `IStandaloneSharedWorkerApi` contracts to their respective API modules. Update direct imports in [`connectStandaloneNode.ts`](../../../packages/browser/src/StandaloneNode/connectStandaloneNode.ts) and [`e2e/standalone-fixture/main.ts`](../../../packages/browser/e2e/standalone-fixture/main.ts). Keep `IStandaloneWorkerDeclaration` and the factory export in their current module. Remove superseded nested classes and old contract exports outright; do not add compatibility re-exports or rename the wire methods.
6. Update Explorer's standalone method-explanation keys and any affected declaration identity expectations to `StandaloneBrowserSessionApi` and `StandaloneSharedWorkerApi`. Their new file/class identities become canonical. Preserve existing identities for unaffected owners, including the selected `AggregateBrowserSessionApi.accept` method. Reuse the existing standalone fixture for behavioral checks and syntax-discovery fixtures for indexing checks; add no dependency or Nx project for this extraction.
7. The user authorized the browser session API naming and test suite follow-up in this chat. Replace `checks/` with `test/initialized-session.node.spec.mjs` and `e2e/standalone-session.playwright.spec.ts`, retaining the standalone fixture in `e2e/standalone-fixture/`. Register the existing Node integration assertions with `node:test` and the standalone lifecycle scenario with the installed Playwright test runner. Replace the old check scripts and Nx configuration with `test:node` and `test:playwright`; include the Playwright configuration and browser fixtures in the package's auxiliary typecheck.

## Intended request flow

1. The client reads the chosen index and requests the selected method's outline. A syntax outline request must not construct a ts-morph Project, query a type/symbol, wait for a semantic worker or dispatch an analysis job.
2. Collapsed call rows show the authored expression and source location. Branches, loops and inline callback structure come from the same file. Named callback references remain source references until their implementation is resolved.
3. Expanding a call requests resolution for that exact call site and current binding context. Use a bounded syntax fast path for direct lexical declarations and unambiguous workspace imports/re-exports. Preserve scope/shadowing and source-only module resolution. Complex receivers, aliases, factories or inherited members use the existing semantic resolver on demand; do not build a second type system.
4. A successful response supplies an implementation scope reference, its defining source/signature and binding information. The client then requests that file's syntax outline. Deeper calls repeat this process only when expanded.
5. Direct source/predicate declaration links use the same precise reference lookup where needed. Preserve existing Effect wrappers, inline callbacks, factory/constructor-supplied callbacks and runtime/external boundaries. A collapsed block must not require eagerly resolving these relationships.
6. Repeated implementations share file/scope data. Recursion renders the existing ancestor reference based on declaration identity within the current source revision. Do not recursively materialize hidden descendants on the server or client.

## Cache and watch behavior

1. Store regenerable per-file syntax JSON under `.nx/cache/explorer-rpc/scopes/`, keyed by workspace identity, file identity/content, parser/compiler version and extraction implementation. Store dependency-aware owner/call results separately under the same managed cache root. Replace superseded monolithic development records; do not maintain dual cache formats.
2. On an ordinary source edit, immediately invalidate that file's outline and declaration headers. Reparse only that file for syntax results. Update the syntax index entries derived from it; unrelated file outlines remain valid.
3. Invalidate semantic results whose recorded inputs changed. Package-wide dependency invalidation remains permissible for semantic correctness, but it must not cause all syntax outlines to regenerate or block their reads. Regenerate owner/call details according to the chosen index behavior and current visible requests.
4. Additions/deletions update the authored source inventory and discovered-root index. Discovery-pattern changes rebuild root membership without discarding unchanged file outlines. Configuration, manifests, lockfile, installed dependencies and analyzer changes invalidate affected semantic resolution and recreate Projects as required. A parser/extraction change invalidates syntax results; unrelated compiler resolution configuration alone does not change authored block structure.
5. Keep the 80 ms coalescing window for background work. Invalidation is immediate. Verify source fingerprints and semantic dependencies before publishing/caching, discard superseded completions and reject stale source-range requests. Reacquire the selected named declaration from the fresh file index; removed or ambiguous declarations show an explicit unavailable state.
6. HMR notifications identify affected files and semantic/index revisions. Open affected scopes update locally; preserved search/selection/URL and unrelated scope data remain usable. Hide stale resolved relationships and outdated source dialogs immediately. Reconnects reread current state; no polling or catalog-triggered whole-page reload.
7. Use independent loading/ready/error states for index, file outline and call resolution. A failed call lookup must not hide a valid outline. A malformed file must not disable unrelated valid scopes. Subsequent edits and the existing retry interaction recover.

## Runtime and production boundaries

1. Reuse Vite's existing development server and watcher. The virtual data provider exposes index reads, outline reads, owner/call resolution and update subscriptions. Use small Vite-managed endpoints rather than a separate deployed backend or a second launch command.
2. Read/parse a requested source file outside the semantic worker queue so a cold or busy Project cannot delay its outline. Build a cold syntax index incrementally in bounded chunks, yielding between files; do not parse every package into a new whole-program graph on Vite's startup hook.
3. Reuse at most two semantic workers, limited by CPU availability, with at most one live Project each. Prefer matching package work and interactive resolution requests over queued background discovery. Do not increase worker count or invent a new persistent service to compensate for eager work.
4. Authorize source/outline reads from an exact canonical authored-source inventory and Invocation allowlist. Reject files outside that inventory, arbitrary filesystem paths, traversal and installed/generated/test sources. Serving current source must not depend on completing a semantic catalog. Continue returning source as text rather than executing backend implementations.
5. Preserve standalone production preview. At build time, compute the complete semantic information required for existing call expansion and validate its inputs, then emit a small index plus lazy JSON/source assets by file/scope. Production reads those assets through the same client provider interface; it does not need a live TypeScript API server. This intentionally moves deeper production work to build time rather than promising zero semantic work in a static build.
6. Production manifests locate assets and relationships without embedding every body in the RPC JavaScript chunk. Loading a method or expanding a call fetches only the required outline/resolution assets. Invocation and non-RPC pages retain their independent source registry and startup.

## Implementation steps

1. Use the settled source-first index behavior. Add separate timing/job counters for syntax parsing, owner discovery, Project preparation, individual resolution, cache hits and output bytes. These counters establish that lazy rendering is also lazy computation.
2. Extract the two standalone API classes and their public contracts as specified above. Update direct consumers and Explorer explanation/declaration identities together. Verify the existing standalone runtime behavior before changing analyzer execution, keeping failure diagnosis local to the extraction.
3. Add glob-root discovery and a pure single-file parser using the installed TypeScript AST API. Return a declaration index and authored scope/event outlines with current source fingerprints. Implement and test root membership, nested factory scopes, file-cache reuse, single-file replacement, source positions and anonymous-scope revision handling. Retain the broader source inventory for referenced helpers.
4. Refactor `rpc-call-tree.mjs` so owner discovery, single-call/reference resolution and production graph traversal are explicit separate operations. Reuse its existing semantic rules and binding behavior. A development resolution response must register only needed declaration references and must not drain the reachable-callable queue.
5. Update the worker/coordinator protocol for owner and individual call requests. Retain Project affinity, dependency-aware invalidation, errors/recovery, atomic writes and disposal from Plan 075. Add file-outline/index management outside the semantic work queue; remove the development full-body generation path.
6. Replace the monolithic virtual catalog contract with the scoped data-provider operations and update the Vite endpoints, HMR events and source authorization. Generate production asset manifests through that provider interface and remove superseded exports and consumers outright.
7. Update the existing RPC view and call-tree renderer to load the selected outline and resolve expanded calls independently. Preserve navigation/search, current owner presentation where applicable, source/predicate links, contextual callback bindings, recursion, themes and keyboard/mobile behavior. Keep concurrent method explanation and diagram work intact.
8. Replace the whole-catalog loading hook with scoped index/file/resolution hooks. Keep content-version and request-order guards, unsubscribe/abort cleanup and local errors. Do not refetch a complete catalog after every disclosure toggle.
9. Complete verification and measurements below. Update Explorer run/data documentation and reconcile glossary terminology after implementation; create an ADR only if the implemented decision meets all repository criteria. Reconcile Plan 075's pending checks without falsely reporting them complete, then archive this plan when no work remains and repair relative/inbound links.

## Planned files

`+` create, `~` modify, `-` remove. These are future implementation changes; this planning task changes only this document.

```text
zerospin/
├── packages/browser/
│   ├── src/StandaloneNode/
│   │   ├── + StandaloneBrowserSessionApi.ts
│   │   ├── + StandaloneSharedWorkerApi.ts
│   │   ├── ~ makeStandaloneSharedWorker.ts
│   │   └── ~ connectStandaloneNode.ts
│   ├── e2e/
│   │   ├── ~ standalone-fixture/main.ts
│   │   └── ~ standalone-session.playwright.spec.ts
│   ├── test/
│   │   └── ~ initialized-session.node.spec.mjs
│   └── ~ playwright.config.ts, package.json, tsconfig.etc.json
├── explorer/
│   ├── scripts/
│   │   ├── + rpc-scope-outline.mjs
│   │   ├── + rpc-scope-outline.d.mts
│   │   ├── + rpc-scope-outline.test.mjs
│   │   ├── ~ rpc-call-tree.mjs, rpc-call-tree.d.mts, rpc-call-tree.test.mjs
│   │   ├── ~ rpc-analysis-worker.mjs
│   │   ├── ~ rpc-catalog.mjs, rpc-catalog.d.mts, rpc-catalog.test.mjs
│   │   ├── ~ rpc-vite-plugin.ts, rpc-vite-plugin.test.mjs
│   │   └── ~ rpc-test-workspace.mjs
│   ├── src/
│   │   ├── ~ env.d.ts
│   │   ├── ~ data/rpc-types.ts, data/rpc-method-explanations.ts
│   │   ├── ~ components/source-viewer/loadSourceFile.ts
│   │   └── views/rpc/
│   │       ├── ~ Rpc.tsx, RpcCallTree.tsx, RpcMethodExplanation.tsx, rpc.css
│   │       ├── + useRpcIndex.ts
│   │       ├── + useRpcScopeOutline.ts
│   │       ├── + useRpcCallResolution.ts
│   │       └── - useRpcCatalog.ts
│   ├── ~ vite.config.ts, package.json
│   └── ~ README.md
└── wiki/
    ├── ~ glossary.md                 (after implementation)
    └── plans/
        └── + 076-plan-explorer-source-scope-outlines.md
```

## Verification and acceptance

1. Parser fixtures cover authored parameters/return annotations, methods/functions/accessors, nested lexical scopes, branches/loops/early exits, inline callbacks, Effect wrappers, source ordering and exact positions. Ambiguous/dynamic relationships stay unresolved. Do not claim semantic equivalence from a syntax tree alone.
2. Instrument a direct outline request: zero Project creations, zero semantic analysis jobs, one file parse on a miss and zero parses on an unchanged repeat/restart. Edit a shared helper and assert only its file outline regenerates; caller outlines remain reusable even if semantic relationship caches become invalid.
3. With semantic workers deliberately delayed or failed, verify that the selected direct method outline, other pages and Invocation sources remain available. A collapsed call dispatches no resolution work; expanding one call resolves only that edge and loads its implementation outline, with no traversal into hidden descendants. Test shared-request deduplication and request cancellation/disposal.
4. Compare on-demand resolved paths with the current direct semantic analyzer for inherited Repo methods, `AggregateBrowserSessionApi.accept`, `SystemApi.executeAggregateCommand`, factory-produced capabilities, bound callbacks, named predicates, recursion and external/runtime boundaries. Test binding contexts separately so the same callee outline cannot reuse the wrong supplied callback relationship.
5. Test imported helper edits, import/re-export/shadowing changes, file addition/deletion, inheritance/configuration/manifests/installed dependency changes, corrupt caches, stale anonymous ranges, rapid edits, superseded responses, failure/recovery and shutdown. Verify no stale semantic relationship is presented as fresh syntax metadata.
6. Real Vite integration verifies endpoint authorization, independent index/file/call states, custom scoped HMR/reconnect events and a working static production build with lazy assets. Verify the selected method, disclosures, search/history, source dialogs, keyboard interaction and Invocation in development and production preview. If browser tools reject inspection, record the specific unrun visual checks and keep the plan active.
7. Extend the existing `explorer:rpc:check` task with the parser fixtures and run `pnpm nx run-many -t rpc:check test:diagrams build check -p explorer`. Preserve current Vite+ commands and Nx inputs. Do not fix unrelated WIP to make a broad check pass.
8. Record cold/warm index time, first selected-outline latency, single shared-file outline regeneration, first/warm call expansion, type-worker jobs, transfer bytes and peak RSS against Plan 075's 38.40/37.88-second and 4,212/5,682-MiB measurements. Distinguish source-outline latency from any remaining owner/semantic discovery time; claim numerical speedups only after measurement.
9. Acceptance requires that a valid selected outline never waits for whole-program semantic completion, a syntax-only edit reparses only affected files, collapsed calls cause no semantic resolution, requested expansions preserve verified implementations/bindings, and static production preview retains existing expansion functionality. It does not require cold complex semantic lookups to be instantaneous.
10. Discovery fixtures cover each configured suffix, nested queue/subscriber factory classes, nonmatching imported helpers, source exclusions and matching file additions/deletions. Compare discovered root coverage with the current verified owner files without treating that comparison as proof of future semantic completeness. Verify the two standalone classes appear under their own authored module/class identities and that their deeper injected collaborators resolve only when requested.
11. Run the browser package's resolved Nx Node and Playwright test suites, typecheck and lint tasks after the extraction, using the existing fixture rather than starting the user's development server. Preserve multi-tab shared-node behavior, serialized attachments, command/claims validation, stale session capability errors after reset, paused/resumed draining, sink retention/release, per-connection session disposal and shared worker/storage lifetime. Exercise connection disposal during pending attachment and retain its current outcome; do not bundle a lifecycle behavior change with the extraction. Record the actual resolved task names during implementation rather than guessing inferred Nx commands.

## Decisions and alternatives

1. Prefer syntax extraction and deferred relationship lookup to additional parallelism. Extra workers still repeat whole-program work and increase memory; they do not match the collapsed display's needs.
2. Do not use regex/braces as the structural parser. The installed TypeScript AST API handles comments, strings, TypeScript syntax and nesting without a new parser dependency.
3. Keep file-only caches limited to syntax facts. Full semantic call-tree results remain dependency-aware; the previous decision against independent file-content-only semantic caching still applies.
4. Preserve a static production artifact rather than introducing a deployed analysis backend. Production build work and browser fetch size are separate measurements.
5. Source-first navigation changes what the initial list claims, and the user accepted that trade-off to avoid cold metadata discovery before navigation. The rejected exact inventory-first alternative preserves complete RPC classification up front but retains that cost. The chosen behavior still forbids guessed implementations and stale semantic results.
6. Use explicit filename patterns for roots and syntax traversal for nested declarations. Do not invent per-owner discovery metadata or reorganize every factory. Extract the two standalone APIs because they have distinct RPC responsibilities and explicit injectable collaborators; keep the shared runtime lifecycle in its existing factory.

## Implemented outcome

1. `rpc-scope-outline.mjs` uses the installed TypeScript AST API for authored declarations and scope events. The initial index contains 84 source declarations from 51 matching root files in the current checkout. Named ancestry and content-fenced anonymous ranges identify scopes; precise locations are regenerated from current source. A separate canonical authored-source inventory permits imported helper outlines and source viewing without semantic discovery.
2. File-only syntax records live under `.nx/cache/explorer-rpc/scopes/`. Bounded lexical/import resolution handles unambiguous source declarations and re-exports. Owner verification and complex call/reference resolution use dependency-aware worker requests with retained Project affinity, at most two workers, superseded-completion guards and atomic relationship caches. Configuration and installed dependency changes recreate semantic Projects while retaining unchanged syntax records.
3. Development reads use `virtual:explorer-rpc-data` and Vite-managed index, outline, owner and individual-call endpoints. The former development full-catalog provider is removed. Source requests bypass the worker queue, semantic requests return declaration headers without bodies, and hidden descendants are not traversed. Supplied callback relationships carry source fingerprints and reject stale revisions.
4. The source-scope sidebar groups authored classes/functions by package and file. Only opened methods fetch bodies; collapsed calls request no resolution. Each expanded edge resolves independently and then reads its implementation outline. Index, owner, outline and call errors/loading remain independent. Scoped updates and reconnects hide stale relationships/source dialogs, preserve search/selection/history and retain unrelated file outlines.
5. Static builds still compute a validated complete semantic graph, then emit lazy index/outline/owner/call JSON and source assets. JavaScript contains asset URLs rather than all callable bodies. The production provider uses the same client operations; Invocation retains its independent source registry and runtime.
6. The standalone APIs and contracts occupy `StandaloneBrowserSessionApi.ts` and `StandaloneSharedWorkerApi.ts`. Their factory retains shared storage, attachment serialization, drain, lock and worker lifetime. Direct consumers and Explorer explanations use the new canonical class/module identities. The browser package uses `test:node` and `test:playwright`, with its existing standalone fixture under `e2e/` and additional Node assertions for retained sinks, stale/reset bindings and disposal during pending attachment.
7. README and glossary entries describe source facts, deferred relationship verification and cache/production ownership. No ADR was added: this reversible tooling change does not meet all repository ADR criteria. Concurrent Explorer, Vite+, core, SDK and architecture edits were preserved.

## Verification evidence

1. `pnpm nx run-many -t rpc:check test:diagrams build check -p explorer --parallel=2` passed: 27 RPC tests, six diagram tests, production build, formatting, lint with no warnings and TypeScript checking. `pnpm nx run-many -t test:node test:playwright ts lint -p @zerospin/browser` passed: 12 Node tests, one Playwright lifecycle scenario, auxiliary typechecking and lint. The scoped Node suite passed again after formatting its added fixture. Browser lint retains three pre-existing curly-brace warnings in unrelated files; Nx Cloud reports access error 401 while local tasks succeed.
2. Fixtures verify source ordering/ranges, every discovery suffix, nested factories, helper/re-export/shadowing resolution, additions/deletions, file-cache reuse/restart/corruption and independent malformed-file recovery. A direct outline miss performs one parse and no Project/semantic job; unchanged repeats perform no parse. Delayed semantic workers do not block outlines or authorized source reads.
3. Interactive edge fixtures match graph resolution for inheritance, wrappers, bound/supplied callbacks, factories and recursion. Existing real-source paths, predicates and external/runtime boundaries remain covered. Relationship fixtures reject changed caller/binding revisions, invalidate imported-helper/configuration/installed declaration/manifest changes, reject superseded completions, deduplicate requests and clean up pending work on disposal. Vite integration checks exact source authorization, scoped HMR without catalog-triggered reload and static lazy assets without bodies in JavaScript.
4. Chrome inspection verified `AggregateBrowserSessionApi.accept` in development (3040) and static preview (3041): the selected outline renders, other method bodies/calls start collapsed, `this.#node.accept()` opens its implementation with deeper calls still collapsed, source dialogs load current text, Escape closes them, and filtered search plus the selected method URL survive back navigation. Both modes render Invocation, execute its preset guard and open `can.ts` through the independent source registry. Initial owner/loading states were observed separately from the outline; update/reconnect/failure behavior is exercised by the Vite fixtures.
5. The two standalone classes appear in the source index under their new file/class identities. The existing Playwright scenario covers shared multi-tab work, ordered attachments, restart, failures, draining and reset. Added Node tests preserve the existing `node-tab-detached` outcome when disposal races a pending attachment, as well as sink release, claims and stale-capability checks.
6. Scoped `git diff --check` passes. Plan 075 records supersession and completion of its replacement visual checks; both plans are archived with their original filenames.

## Performance measurements

Measured on 2026-10-09 with Node 24.13.1. Provider latency excludes Node startup, HTTP/rendering and the 80 ms background debounce. The outline/edit/semantic sequence copies authored workspace sources and configuration into a disposable workspace, shares installed dependencies and uses a separate empty cache; only the temporary healthcheck copy is edited. Bytes are uncompressed JSON response bytes. RSS includes worker threads, sampled every 100 ms; same-process restart rows retain allocator memory.

| Request                                         |     Latency | File parses | Owner / call jobs | New Projects | JSON bytes |     RSS |
| ----------------------------------------------- | ----------: | ----------: | ----------------: | -----------: | ---------: | ------: |
| Cold selected `accept` outline                  |    13.69 ms |           1 |             0 / 0 |            0 |      4,926 | 207 MiB |
| Warm selected outline                           |     0.18 ms |           0 |             0 / 0 |            0 |      4,926 | 207 MiB |
| Cold source index, selected file already cached |   138.18 ms |          50 |             0 / 0 |            0 |    208,526 | 221 MiB |
| Warm index after provider restart               |    66.97 ms |           0 |             0 / 0 |            0 |    208,526 | 268 MiB |
| One shared-file outline after edit              |     1.43 ms |           1 |             0 / 0 |            0 |      7,542 | 268 MiB |
| Unchanged caller outline after that edit        |     0.19 ms |           0 |             0 / 0 |            0 |      4,926 | 268 MiB |
| First `this.#node.accept` semantic resolution   | 1,590.42 ms |           1 |             0 / 1 |            1 |      1,140 | 558 MiB |
| Warm resolution of that edge                    |   190.75 ms |           0 |             0 / 0 |            0 |      1,140 | 560 MiB |
| Selected owner verification                     | 3,568.27 ms |           0 |             1 / 0 |            0 |      5,557 | 864 MiB |

A separate fresh process with an entirely empty syntax cache reads the current checkout's full index in **152.86 ms**, parsing all 51 files and creating zero Projects or semantic jobs. Provider construction/inventory takes another 63.46 ms; its RSS sample is 220 MiB. The source-copy sequence's sampled peak is 863 MiB (864 MiB at request completion). Plan 075's cold/shared-edit complete graphs took 38.40/37.88 seconds and 4,212/5,682 MiB. Those older measurements materialized the full graph and therefore do not establish a like-for-like percentage speedup. They identify the eager work now removed from source-outline reads; cold complex semantic requests and complete static builds still perform semantic analysis.

## Remaining work

None.
