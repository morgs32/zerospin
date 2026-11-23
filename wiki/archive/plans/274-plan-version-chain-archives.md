# AVC/SVC Archives

**Status:** Complete and verified, 2026-10-26. Stacked on PR #87 (`codex/direct-system-command-identities`, `c2476497038e323284254eabb7b0b92b8cad2d4f`).

## Problem and agreed scope

1. AVC/SVC currently retain all evaluated commands in their own finite SQL databases. Retain complete immutable history in successive SQL Archive Repos instead, while preserving existing publication and subscriber contracts.
2. This milestone changes AVC/SVC evaluated-history storage only. AC/SC admission, command identity, original execution, and retained history remain unchanged.
3. Acknowledge VAR/SVR publication after the AVC/SVC local commit. Archive delivery is asynchronous; delete covered local copies only after durable Archive acknowledgement.

## Implementation

1. Add explicit AggregateVersionArchive and ServiceVersionArchive Repos using the standard lifecycle. Bind their identities to the complete source identity, evaluating release, and first domain index. The admitted command's original release remains unchanged.
2. Archive append is atomic and contiguous; repeated positions compare complete evaluated commands. Provide pure point/page reads without calls back into the source Chain.
3. Each source retains a durable logical head/checkpoint, an Archive directory keyed by first domain index, and one logical archive subscriber. Its acknowledgement cursor is the archived prefix. Domain indices and disposition hashes never reset during rollover.
4. Trust the corresponding VAR/SVR's committed publication. Keep structural, owner, operation and contiguous-position validation, but add no independent AC/SC read or historical command-ID directory. Compare publication retries at their known local/archived positions.
5. Permit 64 genuinely new unarchived commands, matching the existing publisher batch. Reject overflow retryably before mutation; exact retries remain possible at the cap. Reject a new batch larger than the limit explicitly so it cannot retry forever.
6. Use makeFanoutQueue with one archive subscriber and concurrency one. Add an optional synchronous acknowledgement callback inside its cursor transaction; prune the covered source prefix there. Queue recovery is armed before publication acknowledgement.
7. On definite SQLITE_FULL, obtain the old Archive's durable head and record the successor's first index in a synchronous source transaction. The first append activates the new Repo; there is no creation/ready RPC or source blockConcurrencyWhile. Timeouts retry the same Archive. Retry pages stop at directory boundaries and acknowledge only complete durable pages.
8. Route historical points, checkpoints, publication retries and subscriber pages through the local suffix or Archives. Preserve maxIndex and the logical head after local pruning. Missing/unavailable retained history is an error, never empty history.
9. Archive delivery/read pages contain at most 64 commands and 1 MiB encoded data, allowing one larger valid command for progress. Build pages incrementally.
10. Register both Repo classes, namespaces, acquisition services, inspection cases, worker exports/types, generated Wrangler bindings and existing Workerd bindings.

## Planned file hierarchy

`+` means new; `~` means modified. Domain procedures remain in the owning module.

```text
zerospin/
├─ packages/system-worker/src/
│  ├─ AggregateVersionArchive/                    +
│  │  ├─ AggregateVersionArchive.ts
│  │  ├─ aggregateVersionArchiveDbConfig.ts
│  │  └─ aggregateVersionArchiveName.ts
│  ├─ ServiceVersionArchive/                      +
│  │  ├─ ServiceVersionArchive.ts
│  │  ├─ serviceVersionArchiveDbConfig.ts
│  │  └─ serviceVersionArchiveName.ts
│  ├─ AggregateVersionChain/                      ~
│  ├─ ServiceVersionChain/                        ~
│  ├─ makeFanoutQueue/                            ~
│  ├─ repoServices/                               ~
│  └─ SystemRepo/registerRepo/                     ~
├─ packages/core/src/system/RepoTypeSchema.ts      ~
├─ packages/dev-worker/src/                        ~
├─ packages/production-worker/src/                 ~
└─ vitest.workerd.config.mts                       ~
```

## Verification and rollout

1. Extend existing service-history-fanout and service-publication suites plus compact Aggregate parity. Create no test files, fixtures, runners or configuration files.
2. Prove local acknowledgement before archival, lost replies and eviction recovery without reevaluation, capacity rollover across page boundaries, exact/conflicting archived retries, slow/new subscriber catch-up after pruning, durable checkpoints, and atomic backlog rejection/recovery.
3. Run focused existing Workerd projects through zerospin:test with two workers and affected Nx build/type/lint targets. Never verify Explorer.
4. Changed AVC/SVC fixed schemas require empty affected storage. No existing storage reset, translation migration, deployment or package publication is authorized by this milestone.
5. Reconcile implemented architecture documentation and glossary terminology. Create an ADR only for implemented decisions meeting repository criteria. Record verification, set Remaining work to None and archive this plan after completion.

## Agreed later milestone

1. Keep AC/SC as admission owners. System configuration selects the canonical aggregate/service release whose archived finalized prefix AC/SC may adopt, including that release's outcomes.
2. Adopt fixed prefixes while admissions and pending work continue; advance the prefix as the configured release archives further commands. Other releases do not replay existing materializations merely because the canonical history changes.
3. Execution APIs return the originating release's own outcome. AC/SC pruning depends on the separate admission-identity work and is excluded here.

## Remaining work

None.

## Outcome and evidence

1. Implemented both SQL Archive classes, source directory/head/subscriber state, asynchronous delivery, definite-capacity rollover, Archive-backed reads, retryable backpressure, and atomic acknowledgement/pruning. No AC/SC adoption or identity changes were added.
2. Final focused selection passes all 20 tests across six existing files, with the full test compiler. It covers Aggregate/Service archival, local publication acknowledgement, lost replies, cold recovery, rollover, exact/conflicting historical retries, slow subscriber recovery, backlog rejection, same-release replay, resource materialization and namespace wiring.
3. The affected build/type/lint graph passes all 14 tasks for core, system-worker, dev-worker and production-worker plus dependencies. Only two pre-existing lint warnings remain in the repo-names and external-settlement tests; no new warnings remain. Explorer was not verified.
4. Updated architecture workflows, glossary and lifecycle guidance, and recorded the physical retention decision in [ADR 024](../../adrs/024-version-chain-sql-archives.md), amending the relevant parts of ADRs 013 and 015.
5. Changed-file formatting, source citation hashes/ranges, and diff checks are part of the final source review. Runtime storage was not reset; no deployment or package publication was performed.
