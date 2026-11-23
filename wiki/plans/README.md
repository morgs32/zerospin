# Plans and decision records

Linear team MOR is the shared work queue. Use the Zerospin project for new Zerospin specs and sub-issues. This directory preserves historical plans and links to migrated work.

Package/example test suites, compile-only assertions, method profiles, test
fixtures and runners were removed on 2026-10-17. Earlier references to those files
and test tasks are historical, not runnable requirements. Keep behavioral
requirements separate from the removed tooling, and do not recreate tests without
an explicit maintainer request.

The maintainer subsequently authorized the current Effect/Vitest suite. Run
`pnpm nx run zerospin:test` for its compiler checks and current Node/Workers runtime scenarios;
[test instructions](../../tests/README.md) describe the current ownership and
scope. The current Workers project uses the Cloudflare Vitest plugin; retired
Workerd/acceptance commands remain historical.

| Path                     | Contents                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `wiki/plans/`            | Historical implementation plans and Linear backlinks                                                        |
| `wiki/adrs/`             | Decisions that are hard to reverse, surprising without context, and the result of a real trade-off          |
| `wiki/handoffs/`         | New-thread handoffs (`XXX-handoff-<topic>.md` for numbered work, otherwise `YYYY-MM-DD-handoff-<topic>.md`) |
| `wiki/diagrams/`         | Standalone development diagrams                                                                             |
| `wiki/rfcs/`             | Requests for Comments                                                                                       |
| `wiki/archive/plans/`    | Completed, cancelled, or superseded plans with no remaining work                                            |
| `wiki/archive/adrs/`     | Optional archive for decisions that no longer govern anything                                               |
| `wiki/archive/handoffs/` | Completed or superseded handoffs                                                                            |
| `wiki/archive/specs/`    | Previously archived design specs                                                                            |
| `wiki/specs/`            | Existing design specs; do not create new spec files                                                         |

Use Linear issue IDs for new plans. Number ADRs independently within
`wiki/adrs/` and `wiki/archive/adrs/` and link them from related issues.

Capture qualifying ADRs when the decision settles, then amend them if
implementation changes the decision or its consequences. Keep settled domain
terms in `wiki/glossary.md`. Record completion and verification in Linear.
Keep old plans in place and follow their Linear links for current work.

Keep an ADR in `wiki/adrs/` while it still governs anything, even after its
plan is complete. Mark a replaced ADR **Superseded** and link its successor.
Move it to `wiki/archive/adrs/` only when it no longer governs anything and
archival is wanted; age or completed implementation alone is not a reason.

A handoff tied to a numbered plan or legacy spec reuses that number. A
standalone handoff uses a date prefix and does not allocate or consume a plan
number. Writing a handoff does not change or archive its source plan.

## React session component names

[Plan 280](../archive/plans/280-plan-react-session-component-names.md) renames the five concrete React lifecycle components to `…Session`, with callers and current documentation updated in the same cutover.

## Plans after 151 reviewed on 2026-10-27

[Plan 258](../archive/plans/258-plan-schema-backed-backend-errors.md) completed
QRK's installed-artifact confirmation and authenticated responsive, timeout,
unreachable, retained-offline and online-recovery checks on 2026-10-27. The
single-session worker-entry repair passes the production build and scoped
TypeScript check. No package release or dependency upgrade was needed. A
subsequent authorized fix resolves the seven unrelated route/story errors;
the full App typecheck and production build now pass.

[Plan 240](../archive/plans/240-plan-session-store-failures-and-initializer-boundaries.md)
subsequently completed its authenticated Stackshirts Account/purchase-query,
refusal-notification and terminal-retry checks on 2026-10-27. Two application
worker-bundling repairs pass the production build. No payment or storage reset
was performed.

The active drafts for Plan 236 and the session plan numbered 274 were stale
duplicates. [Plan 236](../archive/plans/236-plan-model-rows-and-resource-envelopes.md)
records completed Model row/resource-envelope work; the session plan was
renumbered and completed as
[Plan 276](../archive/plans/276-plan-session-lifetimes-and-node-commands.md).
Their active duplicates were removed, not reopened. This completes the work
identified by this review. Plans 143 and 151 retain their independent scope.
The initial review
changed planning documents only; Plans 240 and 258 record their subsequent
runtime acceptance and application repairs.
