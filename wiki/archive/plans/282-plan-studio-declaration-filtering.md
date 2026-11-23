# Actor and agent filtering in Studio

Status: Complete, including the user-requested removal of deprecated embedded boards, verified on 2026-10-29.

## Problem and agreed behavior

1. Card click targets must remain unambiguous alongside version tabs. Actor and Agent cards have a right-aligned View → link; their surfaces are inert.
2. Actor/Agent tabs initially select their newest version. Tabs change the version used by View, and View applies that exact version's filter.
3. Select one Actor or Agent at a time. Keep both columns fully visible; filter Models and Contracts only. Highlight the selected card and display a removable name/version label beside the owner heading.
4. Use `?actor=mentor&version=1` or `?agent=name&version=1`. Preserve unrelated query parameters and fragments, native modified-click behavior, reloads, and Back/Forward. Switching owners clears selection. Unavailable or malformed selections show an unavailable state with a clear action, never another version.
5. Preserve the current viewport layout, fixed gray headings, independent scrolling, inline field tables, resizable sidebar, and client-only Studio rendering.

## Decisions, implementation, and scope

1. Retain exact per-version declaration scopes in the board projection. Actors use exposedModels and restricted propertiesShape; Agents use their own declared models. Resolve exact contract grants through the owner catalogue.
2. Validated Systems prohibit differing definitions for one owner/name/Actor or Agent version. Deduplicate repeated registrations across owner releases; do not add an owner-release selector. Sources: [validateActorVersions](../../../packages/core/src/system/make/makeSystem/validateActorVersions.ts) and [validateAgentReleases](../../../packages/core/src/system/make/makeSystem/validateAgentReleases.ts).
3. Derive display from URL selection and projected metadata. A browser-location subscription observes native history changes; in-place navigation updates the same URL source. Do not introduce a separate persisted filter store or backend queries.
4. Extend exported metadata with IDeclarationScope and optional per-card scopes; add optional View navigation props to DeclarationCard/DeclarationColumn. Keep SystemSpec's wire format unchanged. Following the user's clarification, SystemDiagrams now requires navigation (with an undefined section ID only for an empty System), and SystemOutline requires a route base path; local owner state and callback/button fallback are removed.
5. Reject whole-card actions, immediate filtering from version tabs, and merging all actor versions: distinct controls and exact metadata preserve clear intent. Keep native links so keyboard/modifier/new-tab behavior remains available.
6. Owner-page navigation is required. The user explicitly removed the deprecated embedded-board mode; remove its local state, sidebar button fallback, story, docs, and old Cloud panel caller. Changes belong to Zerospin source. Keep Mentor Mailbox's approved local Studio link active; do not publish, change consumer pins, or alter unrelated WIP. Existing [ADR 020](../../adrs/020-shared-programs-and-portable-operation-declarations.md) supplies context for portable contract facts, not a new routing or authorization mechanism.

## Files

Legend: + create; ~ modify.

```text
zerospin/
├── packages/system-diagrams/
│   ├── src/
│   │   ├── ~ makeDeclarationBoard.ts
│   │   ├── ~ SystemDiagrams.tsx
│   │   ├── ~ DeclarationColumn.tsx
│   │   ├── ~ DeclarationCard.tsx
│   │   ├── ~ index.ts
│   │   └── ~ styles.css
│   └── ~ README.md
├── packages/studio/stories/
│   ├── ~ DeclarationCard.stories.tsx
│   ├── ~ declarationStoryData.ts
│   └── + SystemDiagrams.stories.tsx
├── fragment/content/guides/
│   └── ~ system-diagrams.md
└── wiki/
    ├── ~ glossary.md
    └── plans/
        └── + 282-plan-studio-declaration-filtering.md
```

## Verification and documentation

1. Use existing Storybook seams for multiple versions, exact grants, restricted Actor fields, Agent-local models, duplicate registrations, empty scope, clearing, and history. No backend tests, test runners, or test configuration are introduced.
2. Verify mentor v1 in the linked Mentor Mailbox Studio: five limited roster models and zero contracts; other Actors/Agents stay available. Verify version tabs alone do not filter, direct URLs/reloads/Back/Forward, owner switching, unavailable selection, query preservation, keyboard operation, and native View links.
3. Run existing scoped TypeScript, lint, and formatting checks for system-diagrams and Studio; record results before completion.
4. Reconcile the existing glossary after implementation with actual scope semantics. No ADR is warranted: this display interaction is reversible and follows existing immutable declaration rules. Keep reference docs consistent.
5. Archive this plan, preserving its filename and repairing relative links, after implementation and verification have no remaining work.

## Outcome and evidence

1. Implemented exact Actor/Agent scopes, separate View links, selected-version tabs, URL history, clear/unavailable states, restricted field tables, and owner-switch clearing. Owner-page navigation is now required; the deprecated local selection mode and Cloud board panel have been removed.
2. `pnpm nx run-many -t ts lint format:check -p @zerospin/system-diagrams @zerospin/studio` passed for both packages and their required dependency tasks. Shared-board lint has zero warnings; six pre-existing Studio warnings remain in the existing RSC/bootstrap entries. Nx Cloud cache upload reported account access 401; local target results passed.
3. Storybook `Studio/SystemDiagrams/Filtering` passed all 45 interaction rows; `Studio/DeclarationCard/MultipleActorVersions` passed all 6 rows; `Studio/SystemDiagrams/Embedded` initially passed all 3 rows and was then deleted when the user confirmed that mode was deprecated. Its replacement `Studio/SystemDiagrams/Empty` passed both rows with required navigation. These cover restricted fields, exact grants, Agent-local models, tab changes without filtering, switching, clearing, history, unavailable selections, and the embedded-host guard.
4. Verified the linked Mentor Mailbox Studio: mentor v1 shows exactly course, school, schoolEnrollment, section, and sectionEnrollment plus an empty Contracts column. Other actors remain visible. Verified direct reload, keyboard Enter, Back/Forward, unrelated query/hash preservation, malformed/unavailable recovery, clearing, owner switching, and Meta-click opening a working filtered page in a new tab.
5. Reconciled the existing glossary and package/integration guides. No ADR was created because the UI choice is reversible and follows existing declaration invariants. No backend queries/tests, publication, consumer pin changes, or storage changes were introduced.
6. Existing concurrent Studio component, table, sidebar, SSR, dependency, and consumer-link work was retained. The existing Studio format target also required formatting-only normalization of its project/TypeScript configuration and Vite config file.

## Follow-up: remove deprecated embedded boards

1. Make navigation required in SystemDiagrams and SystemOutline. Remove local owner state, fallback selection, sidebar buttons, and conditional filtering guards.
2. Update Studio and Storybook callers, remove the Embedded story, and reconcile live documentation. Keep the empty-system root valid with an undefined selected section ID.
3. Remove Cloud's obsolete board panel, board-only metadata RPC, CSS/imports, and direct dependency while preserving Repo/table inspection and historical deployment metadata reads. Do not add replacement Cloud routing or publish dependencies.

## Follow-up verification

1. Removed local owner state, first-owner fallback, sidebar button/callback mode, optional navigation guards, and the Embedded story. Studio and controlled Storybook callers supply required navigation. Empty-system routing remains supported.
2. Shared-board/Studio typecheck, lint, and format targets passed. The routed Filtering story passed all 45 rows; Empty passed both rows. Live Mentor Mailbox Studio retains all four sidebar anchors, zero sidebar buttons, and the mentor v1 filter.
3. In `../zerospin-cloud`, removed the Instance Studio board panel, board-only stylesheet, unused getInstanceSystemSpec methods, and Cloud's direct board package dependency. Updated Cloud docs and lockfile importer without changing other dependency pins. Repository inspection routes and getDeploymentSystemSpec remain.
4. `pnpm nx run cloud:build` passed, including API/UI dependency libraries and Next TypeScript checks. The build retains both Instance Studio and Repo/table routes. `pnpm nx run apis:test` passed its one existing test. Cloud's dependency bootstrap confirmed its lockfile was up to date.
5. No new runtime, routing replacement, compatibility path, deployment, publication, storage reset, or unrelated WIP removal was introduced.

## Remaining work

None.
