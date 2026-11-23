# Bound model identity for Shopping Purchase storage — cancelled

**Date:** 2026-10-16

**Status:** Cancelled by the maintainer. Its implementation and added documentation were undone. This is not a verified completion.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Replacement:** [Plan 236 — model rows and resource envelopes](236-plan-model-rows-and-resource-envelopes.md).

## Cancellation

1. Plan 235 introduced the unrequested deriveModelIdentity release policy, resourceStorage runtime binding, separate read CTE/session adapters and plumbing through materialization/query procedures. The maintainer rejected this machinery because the storage review must make the architecture cleaner.
2. All Plan 235 source changes, its three new runtime modules, Shopping opt-in, public/spec additions and added README/architecture/glossary/pattern guidance were removed. The unratified ADR 018 was removed. Earlier work was preserved; no global reset, stash, storage/data reset or deployment occurred.
3. The underlying Purchase resource remains legitimate. Its thirteen-column cleanup is not currently implemented. Plan 236 proposes a single framework row/resource distinction using existing model/table codecs, with its broader scope and query API consequences explicit.
4. No tests, typechecks, lint, build, acceptance or formatting/documentation/preservation checks ran. Scoped diff inspection was used solely to identify and undo this plan's edits. Earlier active plans retain their own deferred verification.

## Remaining work

None for this cancelled approach. Replacement planning and any later approved implementation belong to Plan 236. Cancellation does not claim that Plan 235 passed verification.
