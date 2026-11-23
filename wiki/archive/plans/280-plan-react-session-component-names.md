# React session component names

**Date:** 2026-10-27

**Status:** Complete — implementation and scoped verification passed.

## Problem and agreed behavior

The concrete React components own construction, startup, readiness, terminal error presentation, retry replacement and disposal for a mounted browser session. The `Initializer` suffix describes only startup. Rename the five components to `ConnectedAggregateSession`, `ConnectedServiceSession`, `StandaloneAggregateSession`, `MockAggregateSession` and `MockServiceSession`, matching the declarative React role of the browser constructors.

## Decisions and scope

1. Rename component declarations, source files, barrel exports, imports and JSX in one hard cutover. Remove obsolete modules and exports; add no compatibility aliases.
2. Preserve props, callback inference, readiness, retry, disposal and separate `makeReactUI` context provision. Browser factories, `initialize()` and private `sessionInitialization/` retain their names and behavior.
3. Update Shopping's two callers and Tic-Tac-Toe's caller. Rename Shopping's misleading missing-context diagnostic to `promotion-observation-provider-missing`.
4. Update current Fragment prose/examples/headings and inbound anchors, package documentation, published skills, patterns, glossary and architecture citations/provenance. Describe these as React session components. Preserve historical APIs and recorded evidence in plans/research, repairing live links where necessary.
5. Keep unrelated changes in the main checkout outside this PR. No storage changes, resets, version changes, releases or external-consumer migrations are included.
6. `…SessionScope` was considered but rejected because the shorter `…Session` names describe the declarative session resource clearly. `…Provider` would obscure the separate context provision owned by `makeReactUI`. This naming change does not warrant an ADR.

## Implementation steps

1. Rename the five components/files and their exports; update current source and example callers, remount diagnostic and `useClaims` comment.
2. Reconcile current developer documentation, skill instructions, source links, Fragment anchors, patterns and plan guidance.
3. After implementation, reconcile the existing glossary with actual names and lifecycle responsibilities; refresh affected architecture source hashes/ranges.
4. Verify at the existing package/build and example compilation seams. Record results, then archive this plan with no remaining work.

## Planned hierarchy

`+` means create; `~` means modify or rename. Grouped entries list affected files only.

```text
zerospin/
  ~ packages/react/
    ~ src/{ConnectedAggregate,ConnectedService,StandaloneAggregate,MockAggregate,MockService}Session.tsx
    ~ src/{index.ts,useClaims.ts,sessionInitialization/SessionAttempt.tsx}
    ~ README.md
    ~ skills/zerospin-react/SKILL.md
  ~ packages/browser/skills/zerospin-browser-sessions/SKILL.md
  ~ packages/sdk/skills/zerospin-submit-commands/{SKILL.md,references/completion-boundaries.md}
  ~ examples/shopping/src/{routes/_app._authenticated.tsx,components/PromotionReservationStatus.tsx}
  ~ examples/tic-tac-toe/src/app.tsx
  ~ fragment/content/{guides,handbook,reference}/{affected pages}
  ~ wiki/{architecture/AuthoredSystem.md,glossary.md,patterns/{affected patterns}}
  ~ wiki/plans/{151-plan-storage-table-review.md,240-plan-session-store-failures-and-initializer-boundaries.md,README.md}
  + wiki/plans/280-plan-react-session-component-names.md
```

## Verification

1. Run `pnpm nx run-many --targets=ts,lint --projects=@zerospin/react,shopping,tic-tac-toe`, retaining normal dependency builds.
2. Inspect built root exports and concrete import subpaths: all five new exports exist; obsolete component modules/exports are absent.
3. Check changed-file formatting, whitespace, affected documentation links/anchors and architecture provenance.
4. Search for stale names in current source/docs. Do not add tests, fixtures, runners or configuration. Do not verify Explorer or run Shopping browser checks.

## Verification results

1. `NX_NO_CLOUD=true pnpm nx run-many --targets=ts,lint --projects=@zerospin/react,shopping,tic-tac-toe --parallel=1 --skipSync --outputStyle=static` passed all 22 tasks (four cache hits), including normal dependency builds. Lint reported warnings in existing code and zero errors. Log: `/private/tmp/react-session-names-nx.log`.
2. An in-memory browser bundle exposed all five new named exports. Each concrete new package subpath resolved, every old component import rejected with `ERR_MODULE_NOT_FOUND`, and no obsolete emitted component module remained.
3. Changed-file formatting and whitespace checks passed. Newly introduced documentation links and anchors resolved; both affected architecture source hashes and ranges matched current source.
4. A read-only review found no compatibility aliases or accidental lifecycle changes. Current SDK/browser skill entrypoints were included after the reference audit found additional lifecycle wording.
5. No tests, fixtures, check runners or configuration were created. Explorer and Shopping browser behavior were not verified. Runtime lifecycle behavior is unchanged.

## Outcome

All five concrete React components now use `…Session` names, including their callers, exports, package subpaths and current documentation. Historical APIs and verification evidence retain their original names. The plan was archived after implementation and verification; package publication and external-consumer migration remain outside this change.

## Remaining work

None.
