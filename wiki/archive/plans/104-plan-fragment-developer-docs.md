# Fragment developer documentation

Status: Complete. Approved in chat; scheduled implementation began October 11, 2026. Implementation and required verification completed in this run.

## Problem and agreed result

Fragment currently hosts a TanStack Start homepage and copied Fragment accounting documentation. Replace its application shell with Next.js 16.4.0 and write complete developer documentation for applications built with the current, unreleased Zerospin source. Preserve the homepage layout, styling, animations, and Storybook stories/fixtures.

Readers know TypeScript and React. Teach the Effect, Layer, and Channel concepts needed at the point of use. Use Tic Tac Toe for the first walkthrough and Shopping for authenticated sessions, shared data, checkout, authoritative validation, and external work. Explicitly mention Red Rope Parking, QRK, and Stackshirts as audience/domain references, while using current upstream APIs for examples.

## Evidence and decisions

1. [Fragment](https://fragment.dev/docs) separates conceptual handbook articles from task guides and API reference. Preserve its existing local reading layout and Outline components.
2. [LiveStore's tutorial](https://docs.livestore.dev/tutorial/0-welcome/) introduces concepts progressively; [Zero's onboarding](https://zero.rocicorp.dev/docs/install) distinguishes existing-app integration from educational examples. Use both writing patterns without borrowing their system guarantees.
3. Use plain `.md` files with YAML title, description, and order. A server-only unified pipeline parses GFM, assigns heading IDs, collects those same headings, highlights code with Shiki, and renders React. Avoid per-article JSX and hand-maintained route/navigation registration.
4. Current source uses Channel operation programs, session releases, and makeReactApp. Existing registry releases and sibling applications use older APIs. Label this documentation as unreleased; the quickstart runs the current workspace example.
5. Distinguish optimistic aggregate staging, durable service acceptance, server admission, and final execution. Document browser-safe imports separately from server authoring and advanced direct server RPC.
6. Preserve unrelated runtime WIP. No package publication, sibling-app migration, runtime API changes, new test files, fixtures, or check runners.

## Implementation

1. Replace TanStack Start routing/config with Next App Router, retaining port 3030, homepage visuals, assets, and interaction behavior. Correct app metadata and documentation navigation. Migrate Storybook to its Next.js Vite framework.
2. Discover articles in fragment/content/{handbook,guides,reference}. Derive navigation order, static route parameters, title/description metadata, and adjacent articles. Unknown and removed copied pages return 404.
3. Render article sections through remark-parse, remark-gfm, remark-rehype, rehype-slug, outline collection, @shikijs/rehype, and rehype-react. Use one AST for rendered anchors and outline links. Keep parsing/highlighting server-only and clipboard interaction in a small client component.
4. Reuse the existing article typography, Outline, responsive layout, and code presentation. Add previous/next article navigation; remove copied documentation HTML and unused documentation assets.
5. Write all 26 articles listed below, including prerequisites, complete source-backed imports/snippets, expected outcomes, failure behavior, and crosslinks.
6. Run scoped existing checks and browser verification for Fragment. Review all articles against refreshed source, public exports, and each other. Reconcile terminology with the existing glossary only after implementation; no new domain concepts are introduced by this website migration.
7. Record verification/outcome and archive this plan only when required work is complete.

## Article inventory

1. Handbook: overview; aggregates-and-services; models-and-ids; contracts-and-operations; actors-and-authorization; releases-and-systems; sessions-and-synchronization; failures-and-recovery; external-work; versioning-and-deployment.
2. Guides: quickstart; add-to-existing-app; build-first-feature; react-and-nextjs; query-data; write-commands; authenticate; shared-services; server-and-external-work; guest-to-account; develop-and-deploy; studio.
3. Reference: sdk; browser; react; cli. Group meaningful exports by developer task and describe import paths, arguments/results, failure behavior, and ownership/lifetime boundaries.

## File hierarchy

Rooted at zerospin. `+` creates, `~` modifies, `-` removes. Directory entries describe the owned subtree.

```text
zerospin/
  ~ pnpm-lock.yaml
  fragment/
    ~ package.json, tsconfig.json, README.md, .storybook/
    + next.config.ts
    + content/{handbook,guides,reference}/*.md
    + src/app/
    + src/documentation/
    ~ src/components/, src/docs.css
    - src/routes/, src/router.tsx, src/routeTree.gen.ts
    - vite.config.ts, tsr.config.json
    - copied HTML documentation and unused assets
  + wiki/plans/104-plan-fragment-developer-docs.md
```

## Verification

1. Fragment: existing Nx ts, lint, build, and build-storybook checks; production route requests; desktop/mobile navigation, layout, anchors, code copying, theme, homepage animations, and unknown-page 404s.
2. Examples: their real ts checks and relevant existing contract/Workerd seams. Shopping application browser verification is forbidden. Report unrelated source/example blockers separately without expanding scope.
3. Documentation: all article links and source links, exact SDK/browser/React/CLI imports, commands and environment names, source-snapshot disclaimer, and completion/ownership guarantees. No placeholders or deprecated examples.

## Outcome and verification

1. Migrated Fragment to Next.js 16.4.0 with static App Router pages, file-derived Markdown navigation/metadata, shared heading IDs, server-rendered Shiki code, filename captions, copy buttons, section indexes, responsive outline disclosure, previous/next links, and persistent themes. Preserved the homepage layout, content, animations, and Storybook inventory. Removed TanStack Start configuration and copied accounting/quickstart assets.
2. Wrote 10 handbook chapters, 12 practical guides, and 4 public API references. The references cover the current root/browser SDK, browser sessions, React including its helper/form subpaths, and CLI. Refreshed source and separately audited lifecycle, imports, returned command IDs, error paths, and completion guarantees. Existing glossary terms cover this work; no runtime/API, sibling application, or glossary changes were needed.
3. Passed `pnpm nx run-many -t ts lint build build-storybook -p fragment --parallel=1`, then rebuilt after the final Studio hook clarification. Passed the filtered frozen-lockfile install. Formatting and scoped whitespace checks pass. Storybook emits dependency bundler warnings but completes; Nx Cloud's unrelated 401 warning does not invalidate successful local checks.
4. Passed Tic Tac Toe and Shopping's actual `ts`, `lint`, and `build` tasks with their shared SDK/runtime dependencies. The earlier stale SDK export is resolved in the refreshed source. No SDK/example compilation blocker remains. This snapshot supplies no runnable Shopping behavioral test suite; no new tests, fixtures, or runners were created, and no Shopping browser verification was performed.
5. Verified all 26 production article responses, descriptions, single H1s, matching outline anchors, and 63 highlighted code blocks. Section indexes and homepage return 200, `/docs` reaches the quickstart, and removed/unknown routes return 404. All authored internal article/heading links and GitHub source paths resolve against the current local source.
6. Verified Fragment in the browser at desktop width 1280 and mobile width 390: no horizontal page overflow, code overflow stays inside its blocks, mobile outline/header navigation works, adjacent navigation works, clipboard copying matches the exact code source, themes persist across navigation, and the homepage headline animation continues. Restored the viewport, theme, and previously empty clipboard after verification. Browser console has no errors.
7. Unrelated worktree status entries are preserved. The production preview is available at http://localhost:3030/guides/quickstart. Current-source/unreleased limitations and the unproven upstream Next worker/WASM asset integration are explicitly documented.

## Remaining work

None.
