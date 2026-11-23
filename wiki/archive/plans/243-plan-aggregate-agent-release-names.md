# Shorten Aggregate Agent release names

**Date:** 2026-10-18

**Status:** Complete on 2026-10-18. Naming refactor and all permitted scoped verification passed.

**Prerequisite:** [Rename sessions to definitions](codex://threads/01a14fdb-4277-7740-863c-7281463d4402), completed as [Plan 242](242-plan-session-definitions-and-sibling-rollout.md). Settled baseline: `4bdfabfd383d44050f0ae21a8923db93248e362d`.

## Agreed terminology and changes

1. Use **Agent release** for the independently versioned declaration and **Agent session** for a running instance. This is a naming refactor only.
2. Rename both core and browser `makeAggregateAgentSessionRelease` factories to `makeAggregateAgentRelease`, their defining files/import paths, exports, internal capture alias and diagnostics. Rename `IAggregateAgentSessionRelease` and its Props type to `IAggregateAgentRelease` and `IAggregateAgentReleaseProps`, `AggregateAgentSessionReleaseSchema` to `AggregateAgentReleaseSchema`, and `validateAgentSessionReleases` to `validateAgentReleases`. Remove superseded names outright.
3. Rename Shopping's Agent declaration/file and references to `purchasesAgentRelease`. The approved plan anticipated `purchasesSessionDefinition`; settled Plan 242 deliberately retained the Agent name `purchasesSessionRelease`, so that is the actual source name to replace.
4. Preserve live-session constructors/types, initialization requirements, bootstrap, connection and lifecycle names, `sessionName`, `sessionId`, and the prerequisite's common `sessionDefinition` property and directory layout. Preserve declaration values, identity, contracts, selections, authorization, storage and runtime behavior.
5. Update current documentation, glossary terminology and source links. Preserve historical research, archives and unrelated plans' verification status. No new ADR is warranted.
6. Add no Service-agent feature, overloads, compatibility aliases, structural redesign, storage changes, tests, fixtures or runners. Perform no publication, sibling rollout, application startup, deployment or data reset. Never verify Explorer.

## Planned areas

`~` modifies or renames existing files; `+` creates this implementation plan.

```text
zerospin/
  ~ packages/core/src/{agent,system,agentSession,aggregateSession}/**
  ~ packages/browser/src/{sessionDefinition,makeBrowserSession,index.ts}/**
  ~ packages/studio/{src/fixtures/agents.ts,README.md}
  ~ examples/shopping/{agents.ts,src/zerospin/agents/purchasesAgentRelease.ts}
  ~ fragment/content/{guides/studio.md,reference/browser.md}
  ~ wiki/{glossary.md,architecture/**,plans/**,reviews/storage-tables/**}
  + wiki/plans/243-plan-aggregate-agent-release-names.md
```

## Verification and completion

1. Run existing scoped Nx declaration builds, typechecks and lint for core, browser, Studio and Shopping, including dependencies selected by Nx. Core's declaration build performs its source typecheck; run each project's existing targets only. Check formatting for changed files.
2. Check authored source and emitted declarations for obsolete names and broken imports. Independently compare changed TypeScript against the settled baseline after normalizing the agreed names, import paths and formatter changes; verify that behavior and declaration values are unchanged.
3. Reconcile current glossary/documentation and changed source metadata without a broad documentation rewrite. Record results here and archive this plan only after implementation and permitted checks pass.

## Implementation and verification results

1. Both factories, release types/schema, validator and Shopping declaration now use the agreed names; five defining source files were renamed. Runtime session names, common `sessionDefinition` access, identity/version values, model/contract bindings and fixed schemas remain unchanged. No old exports, import paths or compatibility aliases remain.
2. `NX_NO_CLOUD=true pnpm nx run-many -t lib ts lint -p @zerospin/core @zerospin/browser @zerospin/studio shopping --parallel=2` passed all 24 tasks, including 14 dependency tasks. Core's declaration build checks its source types; browser, Studio and Shopping existing typecheck targets pass. Rename-induced named-import ordering warnings were corrected. Existing lint warnings remain: 40 in core, one in Studio and three in Shopping; browser lint is clean.
3. Scoped `zerospin:format:check` passed for all 45 changed files. Authored source and emitted JavaScript/declarations contain none of the superseded names; rebuilt Core and Browser declarations expose the new factory/schema paths. Five old source paths and their stale emitted filenames are absent. Eleven renamed documentation links resolve; fourteen changed-source architecture metadata hashes match current files. `git diff --check` passes.
4. Independent review compared all 26 production/example/Studio TypeScript files against the settled baseline after the eight exact name substitutions and formatter-only normalization; parsed syntax trees match. The one additional local-pattern TypeScript change is comment-only. Declaration values, object fields, identity/version literals, authorization, storage and runtime behavior are unchanged.
5. Current documentation, glossary, governing ADR wording, local pattern comment and source links use Agent release for the declaration and Agent session for a running instance. Archives, research and unrelated plans' verification statuses are preserved. No feature, structural redesign, overload, compatibility path, test/fixture/runner, package/version change, publication, sibling edit, runtime startup, deployment, storage activation or data reset was introduced. Explorer was not verified.

## Remaining work

None.
