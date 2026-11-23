# Direct Actor command-resolution prefix read

**Date:** 2026-10-16

**Status:** Completed and verified on 2026-10-16. Actor private-prefix reads use `commandResolutions` directly; existing privacy, captured-bound, contiguous-prefix and Agent behavior are preserved.

## Problem and agreed behavior

`AggregateSessionChain.getResolvedThrough` calls the general `readExposedCommands` reader for its private-prefix proof. For AggregateActorVersionChain this joins `exposedCommands`, reads historical public deltas and decodes them, although the proof uses only private resolution information.

1. Query Actor `commandResolutions` directly by the exact `nodeId` and `aggregateIndex <= throughAggregateIndex`, ordered by `pushIndex`. Decode the retained private rows; do not join or decode public commands/deltas for this Actor query.
2. Keep nonnegative safe captured-position validation, exact session and reconstructed full-Origin comparison, and the ordered `1..resolvedThrough` push proof with existing errors. Select all rows for the requested Node before checking session/claims; filtering mismatches away must not manufacture a shorter valid prefix. Return zero for an empty or zero-bound prefix and never include later resolutions.
3. Keep the existing Agent reader and its flat physical storage behavior. Public browser replay and immutable publication comparisons still need joined public/private reads. No schema, RPC, outcome, hash, acknowledgement, retention, Service or socket-lifecycle change.
4. Preserve unrelated WIP. No new test files, fixtures, runners, configuration, aliases or storage operations. This change requires no storage cutover and no new ADR or glossary term.

## Implementation and documentation

1. Read the current helper, caller constraints, existing assertions and local ownership/scoped-execution guidance. Capture its pre-change source for bounded comparison.
2. Add the Actor-only direct query inside `getResolvedThrough`; keep the existing Agent path and share the existing privacy/contiguity loop without forwarding wrappers. Remove the now-unused Actor-only private-prefix WHERE/order branches from `readExposedCommands`; retain its Agent-only option and joined public/retry reads.
3. Extend the existing Actor-prefix acceptance scenario only as necessary to prove captured bounds, session/full-claims mismatch, Node isolation, push-gap rejection and independence from parent delta decoding. Retain existing Agent regression assertions.
4. Update the module README, the finding's implementation-status note and Plan 151's cleanup status after implementation. Keep the dated source review distinct from the new implementation evidence; the next table review remains `AggregateActorVersionChain.connectionLocks`.
5. Run scoped checks, fix in-scope failures, record results, then archive this same plan and repair inbound/relative links only after every required check passes.

`+` creates; `~` modifies:

```text
zerospin/
  wiki/plans/
    + 208-plan-direct-actor-resolution-prefix-read.md
  packages/system-worker/src/aggregateSessionChain/
    ~ getResolvedThrough.ts
    ~ readExposedCommands.ts (remove dead Actor private-prefix branch)
    ~ README.md
  scripts/
    ~ verify-plan140.mjs (existing Actor-prefix scenario only)
  wiki/reviews/
    ~ command-origin-consumers.md (affected citation range only)
  wiki/reviews/storage-tables/
    ~ aggregate-actor-version-chain-command-resolutions.md
    ~ aggregate-actor-version-chain-exposed-commands.md (affected citation range only)
  wiki/plans/
    ~ 151-plan-storage-table-review.md
```

## Verification

1. Reuse the inspected system-worker targets: `pnpm nx run-many -t ts lint test-workerd-ts test-workerd -p system-worker --nxBail`, with required dependencies and caching intact. No library outputs outside that graph may be concurrently cleaned/rebuilt during runtime verification.
2. Then run `node scripts/verify-plan140.mjs` against current artifacts. The existing Agent prefix checks and Actor success/refusal/bounds/full-claims checks remain; add the small missing failure/isolation checks within that same runner. Never verify Explorer.
3. Format/check only changed files, check scoped whitespace and current documentation links/ranges. Review the source diff to confirm no public parent read in the Actor prefix branch, preserved Agent behavior and unchanged privacy/contiguity conditions.

## Verification outcome

1. `pnpm nx run-many -t ts lint test-workerd-ts test-workerd -p system-worker --nxBail` passed all nine tasks, including five required dependency tasks; four used valid cached outputs. Typechecks and lint passed with zero errors and thirteen pre-existing `curly` warnings outside this cleanup. All 27 Workerd tests across six files passed. Nx Cloud emitted ancillary authorization 401 messages while local tasks succeeded.
2. `node scripts/verify-plan140.mjs` passed all thirteen existing acceptance groups. The existing Actor scenario proves captured bounds, full-claims and wrong-session rejection, Node isolation, gap rejection, and private-prefix independence from an invalid parent delta. Temporary SQL mutations restore in `finally` before public replay. Existing Agent prefix/regression scenarios also passed.
3. Independent source review confirmed the Actor query has no public-parent dependency, validates every selected private row without hiding identity mismatches, and preserves the Agent flat-row decoder and shared checks. Removed the now-dead Actor private-prefix WHERE/order branches from the joined public reader.
4. Formatting passed on all nine changed source/documentation files; scoped whitespace checks passed. Documentation link/range validation covered 213 references before archival; archival preserves the filename and repairs inbound/relative links. Module README and both affected review citations reflect the final source.
5. No schema, RPC, retention, acknowledgement, hash, Service or socket-lifecycle change was made. No new test files, fixtures, runners or test configuration were created; no storage reset, deployment or Explorer verification was performed. Plan 151's next table remains `AggregateActorVersionChain.connectionLocks`.

## Remaining work

None.
