# AAVC/SAVC Archives — first milestone

## Status

Implemented and verified on `codex/actor-version-chain-archives`, stacked on
[PR 90](https://github.com/morgs32/zerospin/pull/90) at
`15e505c3322dad08504946923e0c15f4fb1768e9`.

Published in [PR 91](https://github.com/morgs32/zerospin/pull/91). Implementation,
required verification and documentation are complete.

## Agreed behavior

1. Move complete exposed-command history into successive SQL
   `AggregateActorVersionArchive` and `ServiceActorVersionArchive` Repos while
   preserving one logical history. Their keys retain the complete source Chain
   identity and first domain index.
2. Retain public commands and private completions permanently. Preserve the
   `commandResolutions` foreign key and append each complete publication in one
   synchronous transaction. Exact retries compare the public row and the exact
   private resolution or its absence.
3. Acknowledge AAVR/SAVR publication after the local AAVC/SAVC commit. Use one
   asynchronous `archiveFanout` subscriber per Chain, the PR 90 acknowledgement
   callback, a durable logical head, an Archive directory, and an archived prefix.
   Archive acknowledgement advances the prefix and deletes local child/parent
   copies atomically. Establish durable recovery before publication acknowledgement.
4. Permit 64 genuinely new unarchived positions. Reject overflow retryably
   before mutation, reject oversized new batches explicitly, and allow exact
   retries at capacity. Build delivery/read pages incrementally within 64 rows
   and a 1 MiB encoded budget, allowing one larger valid command for progress.
5. On definite `SQLITE_FULL`, obtain the old Archive's durable head, record its
   successor at the next domain index in a synchronous source transaction, and
   retry by directory ranges. Timeouts retry the same Archive. Never roll an
   empty Archive indefinitely or acknowledge an incomplete offered page.
6. Route point reads, checkpoints, publication retries, public replay and private
   recovery through local rows or Archives. Capture archived prefix and bounded
   local suffix before remote reads. Preserve fixed bounds and surface Archive
   failures instead of empty history. Trust source-bound committed publications;
   add no canonical-input RPC, command-ID directory, or generic Archive framework.
7. Preserve scalar resolution reads independently of public delta decoding.
   Traverse relevant Archive summaries sequentially. Validate each fragment's
   count/distinct/min/max push indexes, contiguous intervals beginning at 1,
   and all historical session/full-claims ownership. No per-Node routing index
   is required in this milestone.
8. Replay asynchronously through a captured logical head, then synchronously
   revalidate connection authority, capabilities and the current head before
   `replay-complete` and the live marker. Repeat if the head advanced. Complete
   both public and private cursors; short or empty intermediate pages are not EOF.
9. Add Repo registration, acquisition, inspection, namespace typings, worker
   exports, Wrangler and existing Workerd bindings. Preserve Agent-local paths.
   AC/SC, AVC/SVC archival and Agent archival remain separate work.
10. The earlier live Node acknowledgement, public replay expiry and existing-Node
    snapshot replacement proposals are superseded. The Node protocol remains
    unchanged because complete history remains recoverable from Archives.

## File map

`+` means create; `~` means modify. Domain-local procedures stay in their owners.

```text
zerospin/
├─ packages/core/src/system/RepoTypeSchema.ts                  ~
├─ packages/system-worker/
│  ├─ src/AggregateActorVersionArchive/                       +
│  ├─ src/ServiceActorVersionArchive/                         +
│  ├─ src/AggregateActorVersionChain/                         ~
│  ├─ src/ServiceActorVersionChain/                           ~
│  ├─ src/aggregateSessionChain/                              ~
│  ├─ src/repoServices/                                       ~
│  ├─ src/SystemRepo/registerRepo/systemRepoNamespaces.ts      ~
│  ├─ src/SystemApi/getRepoTableRows/utils/resolveRegisteredRepo.ts ~
│  ├─ src/systemWorkerAbbreviations.ts                        ~
│  ├─ src/index.ts                                            ~
│  ├─ tests/aggregate-history-fanout/aggregate-history-fanout.workerd.spec.ts ~
│  ├─ tests/service-actor-prefix/service-actor-prefix.workerd.spec.ts ~
│  ├─ tests/service-actor-connections/service-actor-connections.workerd.spec.ts ~
│  ├─ tests/repo-names/repo-names.spec.ts                       ~
│  └─ wrangler.jsonc                                          ~
├─ packages/dev-worker/src/                                  ~
├─ packages/production-worker/src/                           ~
├─ vitest.workerd.config.mts                                 ~
└─ wiki/architecture/, glossary.md, adrs/                     ~
```

## Verification and documentation

1. Extend existing suites only: prove local-before-Archive acknowledgement,
   exact/conflicting pair retries, lost replies and eviction, rollover,
   mutation-free backlog rejection, and cross-Archive point/checkpoint/public
   and private reads after local pruning.
2. Prove private prefix identity/gap checks, byte-limited pages, Archive failure
   propagation, snapshot N under concurrent archival/publication, and the async
   replay-to-live boundary without losing private completions or disclosure rules.
3. Run focused Workerd projects through `zerospin:test` with two workers and
   affected Nx type/build/lint checks. Never verify Explorer. Create no new test
   files, fixtures, runners or configuration files.
4. Changed fixed schemas require empty affected AAVC/SAVC storage. Do not reset
   runtime storage, translate old rows, deploy or publish packages.
5. After implementation, reconcile the existing architecture and glossary with
   the actual result. Consult ADRs 013, 015 and 024; add an ADR only for an
   implemented hard-to-reverse, surprising decision with a real trade-off.
6. Record evidence, set Remaining work to None, archive this plan, and open a PR
   based on `codex/version-chain-archives`.

## Outcome and evidence

- Both Archive families, bounded local publication queues, logical public/private
  reads and asynchronous replay are implemented. Repo acquisition, inspection,
  worker exports and namespace bindings cover development and production.
- The focused `zerospin:test` run passed **34 tests across five files**:
  `aggregate-history-fanout`, `service-actor-prefix`,
  `service-actor-connections`, `repo-names` and the existing
  `agent-node-aggregate` regression. Workerd execution used two workers.
  The existing suites cover rollover, lost replies, exact/conflicting retries,
  backlog bounds, fixed-prefix reads and capability revocation during archived
  replay. No test files, fixtures, runners or configuration files were created.
- The affected Nx `ts` and `lint` graph passed **14 tasks**, covering
  `@zerospin/core`, `system-worker`, `@zerospin/dev-worker` and
  `@zerospin/production-worker` and their dependencies. Existing lint warnings
  remain; the change introduces no new warnings.
- A frozen offline install and the prerequisite `@zerospin/cli:lib` build passed.
  Changed-file formatting, `git diff --check`, new documentation links and current
  architecture source hashes passed their final checks.
- ADR 024, the glossary and affected architecture workflows describe permanent
  Actor public/private history and asynchronous replay. Historical citations to
  removed implementations link to the prerequisite commit.
- No storage was reset, no runtime was deployed and no packages were published.
  Deployment requires empty affected AAVC/SAVC storage for the fixed-schema cutover.

## Remaining work

None.
