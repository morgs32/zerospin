# Agent public exposed-command history

**Date:** 2026-10-16

**Status:** Complete — current public Agent history/observer scope verified 2026-10-23 under Plan 151. Historical private-resolution, producer and independent Agent-version requirements are superseded.

## Current scope — 2026-10-23

Completed [Plan 249](249-plan-aggregate-agent-backend-node.md) and Plan 151 replace browser Agent command production with public observation. Definitions at system.agents[agentName] are unversioned and pin exact Aggregate or Service releases. Separate owner-release Agent Version Repos own resources/checkpoints/complete pending publication; Agent Version Chains own retained public history, sockets and the fixed Node Repo acknowledgement. Actor private history and SQL capabilities remain independent.

Agent Chains retain five public history fields with aggregateIndex or serviceIndex, dispositionChainHash, canonical id, commandName and frozen delta. They retain no Agent commandResolutions or connectionLocks. Agent observers hold a nonempty issued/resumed nodeId for ticket and public resume identity, with no command submission, private completion cursor, producer sequence or private bootstrap. Full authored locks remain initial admission facts; derived contract facts grant no observer command authority.

Completed [Plan 257](257-plan-direct-system-worker-verifications.md) supplies current direct-class tests. Existing Agent cases prove Chain-to-Node enrollment, a lost reply after Node commit, Chain reconstruction/alarm acknowledgement recovery and retained history; those do not prove the different Version Repo-to-Chain publication hop. Before this follow-up, the current Agent socket cases proved real open/close, while Plan 249’s browser reconnect result is dated historical evidence. Completed [Plan 221](221-plan-session-ticket-admission-cleanup.md) proves ticket issue/spend/routing and explicitly leaves Agent socket lifecycle separate. Completed [Plan 222](222-plan-remove-system-log-repo-and-admission-audit.md) supplies current seventeen-kind registration/configuration and bounded admission evidence.

This plan now verifies public immutable append/checkpoints, synchronous page rollback, exact source/ID/order rejection, unchanged publication retry after a lost post-commit reply and reconstruction, and acknowledgement-gated pending deletion without history deletion. Both Agent families are covered. [Plan 212](212-plan-agent-derived-connection-capabilities.md) owns the combined observer attachment/lifecycle proof below; retired 5+4/private-prefix assertions are superseded, not unfinished tests.

**Historical record:** The design and written-outcome notes below retain their original snapshot; the current disposition above governs supersession and remaining work.

## Agreed behavior

The [Agent retained-history finding](../../reviews/storage-tables/aggregate-agent-version-chain-projected-commands.md) recommends replacing AggregateAgentVersionChain's flat ten-column `projectedCommands`. The maintainer approved that model and requested implementation while preserving Actor and Service storage.

1. Retain five public columns in physical `exposedCommands`: `aggregateIndex` primary key, `dispositionChainHash`, canonical admitted `id`, `commandName` and frozen `delta`. Preserve unique command ID and all-command Aggregate order, including Failure/no-op/empty selected deltas.
2. Retain an optional `commandResolutions` child with exactly four columns: `aggregateIndex` primary/foreign key to the exposed command, required `nodeId`, required `pushIndex`, nullable complete public `failure`. Preserve unique `(nodeId, pushIndex)`. Absence means no owned resolution; a present child with null failure records owned Success.
3. Derive Agent Origin from the immutable owner and session name from the exact frozen authored Agent version after validating its Aggregate release. Validate incoming resolution session and null Agent claims before omitting owner-derived context. Unavailable/mismatching declarations must fail; never select another/latest version or transient connection identity. Preserve the existing complete publication/browser protocol.
4. Append public command plus exact resolution-or-absence in one synchronous page transaction before one acknowledgement. Preserve source-key checks, exact retry equality, immutable absence, ID/producer uniqueness, contiguous Aggregate positions, rollback and commit-before-broadcast. Pending acknowledgement deletes only Agent Repo pending publication; Agent Chain history remains retained.
5. Update public/private reads, exact checkpoints, replay/live recipient filtering and snapshot/bootstrap consumers. Read private resolution rows directly for `getResolvedThrough`, preserving full recipient validation, exact captured Aggregate bounds and contiguous producer push prefix; do not decode unused public deltas or filter mismatches away.
6. Remove the superseded Agent flat table/decoder/columns outright. Add no aliases, fallback readers, translations, migrations or compatibility tests. This fixed-schema change requires empty affected AggregateAgentVersionChain storage. Do not reset or deploy anything. Keep Actor and all Service storage, Agent connection locks and Agent Repo pending storage unchanged. Additional AggregateVersionChain hash validation remains deferred.
7. Preserve unrelated working-tree changes. Update existing checks and documentation only; create no test files, fixtures, runners or configuration. Do not run verification now, including typechecks, lint, tests, builds, acceptance scripts or documentation-check commands. The requested postponement supersedes the usual immediate-verification sequence.

## Implementation

1. Replace the Agent retained declaration with shared public exposed commands and its owner-specific four-column child. Keep Actor declarations unchanged.
2. Resolve exact authored Agent session context locally, validate incoming publications before persistence and reconstruct complete publications from public/private joins. Remove the old flat decoder and its orphan-failure conversion.
3. Update Agent append, checkpoint/table selection, replay and direct private-prefix readers with the same synchronous transaction and privacy boundaries. Remove obsolete flat-only options and utilities.
4. Adjust existing acceptance and Workerd activation/cold-restart assertions for the new tables, constraints, context validation, immutable retries/absence and bounded private recovery. Prepare these checks for later execution; do not execute them this turn.
5. Amend governing ADR 013, source READMEs, glossary, local ownership guidance, relevant architecture clauses and Plan 151 findings/status. Keep historical review evidence distinct from implementation and from deferred verification. Plan 151's next table remains AggregateAgentVersionChain.connectionLocks.

`+` creates; `~` modifies; `-` removes:

```text
zerospin/
  wiki/plans/
    + 211-plan-agent-exposed-command-history.md
    ~ 151-plan-storage-table-review.md
  packages/system-worker/src/aggregateSessionChain/
    ~ aggregateSessionChainDbConfig.ts
    ~ aggregateExposedPublication.ts
    ~ appendExposedCommands.ts
    ~ readExposedCommands.ts
    ~ getResolvedThrough.ts
    + resolveAgentSessionContext.ts
    onMessage/
      ~ replaySocketCommands.ts
    - aggregateAgentExposedCommandsTable.ts
    ~ README.md
  packages/system-worker/src/AggregateAgentVersionChain/
    ~ README.md
  packages/system-worker/src/AggregateAgentVersionRepo/
    ~ README.md (history reference only)
  packages/system-worker/src/aggregateProjection/
    ~ README.md (history reference only)
  packages/system-worker/test/migratable-do-repo/
    ~ system-repo-activation.workerd.spec.ts
  wiki/
    ~ glossary.md
    adrs/
      ~ 013-aggregate-delivery-history-and-projection-ownership.md
    patterns/system-worker/
      ~ versioned-aggregate-actor-owned-projection.ts
    architecture/
      ~ AuthoredSystem.md (Agent retained-storage clause)
      server/
        ~ admitAggregateCommands.md (Agent retained-storage clause)
    reviews/storage-tables/
      ~ aggregate-agent-version-chain-projected-commands.md
      ~ aggregate-agent-version-repo-projected-command-outbox.md (history reference only)
      ~ aggregate-agent-version-repo-materialization-head.md (next-review reference only)
```

## Implementation outcome

AggregateAgentVersionChain now declares the shared five-column public `exposedCommands` and an optional four-column `commandResolutions` child. The flat Agent table file and decoder are removed. The public ID remains unique; the child position is its primary/foreign key and the Node/push pair remains unique. Actor and Service storage declarations, Agent connection locks and Agent Repo pending storage were not edited for this cutover; their preservation comparison is deferred with the other checks.

`resolveAgentSessionContext` resolves the exact Agent and Aggregate release from `System`, rejects unavailable/mismatching declarations, and supplies declared session plus bound Agent Origin. Append checks incoming session/claims before duplicate comparison or insertion, then writes public/private rows in the existing synchronous page transaction. Joined history reads reconstruct the complete existing publication protocol. `getResolvedThrough` reads only the private child, restores and validates the full Agent resolution codec, validates caller context even for an empty prefix, and retains the captured Aggregate bound and exact push continuity.

These effects now require `System`. The existing managed runtime and `RepoServicesLive` provide it at public method boundaries; the final synchronous socket replay read explicitly receives the captured `System`. This preserves the replay/live transition within the synchronous turn. TypeScript inference for the shared Drizzle queries and the propagated Effect context remain unverified until the deferred pass.

Both existing check files were updated for the physical 5+4 schema, keys/indexes, old-table absence, exact Agent context, rollback, immutable retries/absence, retained replay and bounded recovery across restart. Those assertions are prepared and unrun. Module READMEs, ADR 013, glossary, local ownership guidance, architecture notes, the Agent findings and Plan 151 describe the implementation and its verification status. Plan 151 still points to AggregateAgentVersionChain.connectionLocks.

No verification commands ran for Plan 211: no typecheck, lint, test, build, acceptance runner, formatting/check, documentation validation, independent review or storage-preservation comparison. No reset/deployment was performed. Prior child-plan checks do not establish this change's correctness.

## Subsequent approved connection cutover

Active [Plan 212](212-plan-agent-derived-connection-capabilities.md) separately removes Agent `connectionLocks`, derives exact Agent socket capabilities and fixes teardown. This plan's statements that connection storage stayed unchanged describe the Plan 211 history cutover. Run the later combined verification against the current approved model, including Plan 212's deliberate table absence and configured `System` binding, while retaining this plan's 5+4 history/privacy/recovery requirements. Both plans remain unverified and active.

## Historical deferred verification and archival

Run the required checks only after the maintainer's requested review/implementation phase is finished. Existing implementation evidence from Plans 207–210 does not verify this change.

1. Reuse the scoped `system-worker` task graph: `pnpm nx run-many -t ts lint test-workerd-ts test-workerd -p system-worker --nxBail`, with required dependency tasks/caching. Do not overlap library rebuilds with acceptance execution.
2. Resolve in-scope failures from the existing Nx and Workerd checks and rerun only affected checks.
3. Check scoped formatting, whitespace, documentation links/source citations, removed-name completeness and independent implementation review. Compare Actor/Service storage declarations with their pre-change snapshot. Never verify Explorer.
4. Record actual results, set **Remaining work: None**, and archive this same filename with repaired inbound/relative links only after all required checks pass. Keep ADR 013 governing and active.

## Current verification requirements

1. Extend only the two existing Agent family Workerd specs using real production classes and disposable SQLite. Add no test/fixture/runner/configuration file, fake socket class, loader or decorated-socket harness. Keep fixture-only faults in existing real methods/connections. Preserve unrelated WIP, including Plan 259.
2. Verify Version Repo-to-Chain post-commit lost-reply recovery with exact frozen retries, immutable public history/checkpoints and synchronous refusal rollback. Reuse the already-proved Chain-to-Node hop; extend its existing cases only for any narrow source/acknowledgement gap.
3. Verify actual observer public resume/live, hibernating-socket reconstruction and delivery; complete lock/attachment/Node refusals; and cleanup failure isolation including onError. Retain exact family-specific proof limits. Never restore removed private/producer acceptance or compatibility tests.
4. Run scoped Nx test typing, affected/full System Worker tests, required dependency builds, applicable typing/lint and formatting. Current root targets and the public generator dependency from Plan 222 remain the existing seam; never verify Explorer.
5. Reconcile affected module docs, findings, governing ADRs, glossary/local patterns, architecture/source provenance and parent Plan 151. Fresh source/WIP hashes under /private/tmp/plan211-212-verification-before cover 989 production modules/schema files. The old /tmp/zerospin-plan212-before contains no files; claim no byte-equivalence to that missing original snapshot.
6. Obtain independent review, resolve in-scope findings, validate affected links/citations/whitespace/preservation and record actual proof limits. Archive each original filename with repaired links only after current required checks pass. Keep parent Plan 151 and governing ADRs active. No existing-store reset, deployment, provider send, publication or commit is authorized.

## Current verification outcome — 2026-10-23

Six new cases extend only the two existing Agent family Workerd specs. No test file,
fixture, runner, configuration or dependency was added for this follow-up; no
production source/schema changed.
Both families prove the Version Repo-to-Agent Chain publication hop: an authored
command commits resources, materializationHead and complete pending public output;
the Chain retains it before its reply is lost; real projection reconstruction
retries identical frozen input; durable acknowledgement deletes only pending
publication. Retained public history remains unchanged. Direct Chain invocations
prove five-field public shape, equality without rewrites, changed-input/source
refusal, contiguous page rollback, unique ID enforcement, checkpoint zero and exact
historical checkpoints after later publication. Missing Service checkpoints throw;
Aggregate checkpoints return the typed refusal. Neither path substitutes a newer tip.

Real observer sockets prove public resume/replay-complete/live delivery and retained
issued/resumed Node attachments after stock hibernation. Representative full-lock,
owner and Node refusals plus valid-current-command push probes establish observer
limits. Actual broadcast/onError, attachment installation and disposal faults prove
that cleanup attempts remain independent and healthy delivery/history survive a
failed observer. The existing Aggregate Chain-to-Node case additionally proves
wrong-source refusal and acknowledgement non-regression; earlier gap-free enrollment
and lost Node-reply evidence retains its recorded scope.

Verification:

- Focused Nx run: 14 Agent tests pass across the two existing family specs.
- Full scoped Nx run: 107 System Worker tests pass across 25 files with
  `--maxWorkers=2`; root test typing and required dependency builds pass. The first
  unconstrained run passed the Agent cases but failed four existing Service cases,
  including two 5000ms timeouts and cancellation/cleanup fallout. The same complete
  suite passes with bounded test concurrency; no assertion or configuration was
  weakened to obtain that result.
- `system-worker:ts` and `system-worker:lint` pass. The five new brace warnings are
  fixed; one pre-existing unrelated warning remains at
  `service-actor-connections.workerd.spec.ts:568`.
- Independent reviews corrected strict raw-frame decoding, valid observer refusal
  inputs, close assertions and range-relevant citations. No production defect or
  unresolved in-scope finding remains.
- The fresh baseline compares 989 production modules/schema files byte-for-byte,
  including Actor and Service storage. All remain unchanged. Existing unrelated
  WIP, including Plan 259, is preserved. The original Plan 212 temporary snapshot
  has no files, so no original-snapshot byte-equivalence is claimed.

Scoped formatting, whitespace, affected local links/source ranges and current Agent
source-provenance checks pass. Six unrelated pre-existing AuthoredSystem ranges
remain explicitly tracked in parent Plan 151 before another table review. Governing
ADRs remain active.

Unrelated System Diagrams dependency/lockfile changes arrived concurrently and
were left intact; they are outside this verification and its 989-file source set.

The proof uses real production classes, disposable SQLite and trusted forwarded
socket headers. It does not establish authenticated Agent opening, browser/UI
startup, provider behavior, deployed activation/timing, arbitrary mid-handoff
interruption or Service revalidation beyond its actual phase/Node/null-disposal
fence. Additional AggregateVersionChain cryptographic hash validation remains
maintainer-deferred. No existing store was reset, deployed or published; no commit
or external provider send occurred. Parent Plan 151 and all independent client,
Native, Model/Game and provider obligations remain active.

## Remaining work

None.
