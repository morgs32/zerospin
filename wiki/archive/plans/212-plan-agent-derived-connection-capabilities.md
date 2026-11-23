# Agent derived connection capabilities and socket teardown

**Date:** 2026-10-16

**Status:** Complete — current public Agent history/observer scope verified 2026-10-23 under Plan 151. Historical private-resolution, producer and independent Agent-version requirements are superseded.

## Current scope — 2026-10-23

Completed [Plan 249](249-plan-aggregate-agent-backend-node.md) and Plan 151 replace browser Agent command production with public observation. Definitions at system.agents[agentName] are unversioned and pin exact Aggregate or Service releases. Separate owner-release Agent Version Repos own resources/checkpoints/complete pending publication; Agent Version Chains own retained public history, sockets and the fixed Node Repo acknowledgement. Actor private history and SQL capabilities remain independent.

Agent Chains retain five public history fields with aggregateIndex or serviceIndex, dispositionChainHash, canonical id, commandName and frozen delta. They retain no Agent commandResolutions or connectionLocks. Agent observers hold a nonempty issued/resumed nodeId for ticket and public resume identity, with no command submission, private completion cursor, producer sequence or private bootstrap. Full authored locks remain initial admission facts; derived contract facts grant no observer command authority.

Completed [Plan 257](257-plan-direct-system-worker-verifications.md) supplies current direct-class tests. Existing Agent cases prove Chain-to-Node enrollment, a lost reply after Node commit, Chain reconstruction/alarm acknowledgement recovery and retained history; those do not prove the different Version Repo-to-Chain publication hop. Before this follow-up, the current Agent socket cases proved real open/close, while Plan 249’s browser reconnect result is dated historical evidence. Completed [Plan 221](221-plan-session-ticket-admission-cleanup.md) proves ticket issue/spend/routing and explicitly leaves Agent socket lifecycle separate. Completed [Plan 222](222-plan-remove-system-log-repo-and-admission-audit.md) supplies current seventeen-kind registration/configuration and bounded admission evidence.

This plan now verifies complete initial lock and exact owner/Agent/session/observer Node authority; public resume/live delivery and cold-socket reconstruction; and actual broadcast/onError/install/disposal failure handling without SQL capability storage. Both Agent families are covered. Aggregate final handoff revalidates the full captured attachment; Service final handoff checks phase/Node and null-disposal fencing. Do not claim arbitrary same-node attachment mutation is supported or equivalently revalidated. [Plan 211](211-plan-agent-exposed-command-history.md) owns current retained-history/publication evidence.

**Historical record:** The design and written-outcome notes below retain their original snapshot; the current disposition above governs supersession and remaining work.

## Agreed behavior

The maintainer approved the [Agent connection-lock finding](../../reviews/storage-tables/aggregate-agent-version-chain-connection-locks.md): remove redundant Agent SQL connection storage, derive exact authored capabilities, preserve identity/privacy and fix socket teardown. Actor and Service storage must remain unchanged.

1. Remove physical AggregateAgentVersionChain `connectionLocks`, its full-lock copy, index, inserts, reads and deletes. Add no replacement table, installation marker, capability copy, revocation registry, compatibility alias, migration or fallback. Agent `exposedCommands`/`commandResolutions` and Agent Repo pending storage stay unchanged. The fixed-schema cutover requires empty affected Agent Chain storage; perform no reset or deployment.
2. Preserve full initial lock/Origin/producer decoding, exact bound Agent/release and whole authored-lock equality. Derive readable names from the exact Agent's selected `db.models` and ordinary command versions through existing `makeAggregateSessionLock` / `makeConnectionCapabilities` semantics, including Agent contract unwrapping and external-contract exclusion. Never use the Aggregate release's larger model graph or another/latest Agent version.
3. Treat the trusted WebSocket attachment as per-connection admission/phase state. Before returning Agent capabilities, validate exact Agent/release availability, attachment Aggregate ID/name/version, Agent Origin kind/name/version, exact declared session and nonempty issued Node. For resumed/live state, preserve equality with the issued Node. Apply these checks to message and broadcast reads, including malformed attachment refusal. Keep command own-key/exact-version, full Origin/session/Node, private recipient, replay cursor and pending-command-claim checks.
4. Preserve synchronous broadcast and final replay/live handoff. Supply the exact configured `System` at any synchronous Effect capability read; make no RPC or asynchronous capability lookup. Reuse authored context procedures rather than adding a cache or registry.
5. Agent installation writes only attachment state. Close the original accepted socket on failed installation, including defects/interruption. Reclaim/fence Agent attachment authority during disposal and attempt close even if attachment invalidation fails; attempt invalidation even if close fails. Use structured cleanup so failed notices/sends cannot skip teardown. Forward Agent socket errors to actual disposal. Keep Actor SQL disposal/activation reconciliation and every Service path unchanged in responsibility.
6. Preserve unrelated WIP, including active unverified Plan 211. Update existing checks and affected docs but create no test files, fixtures, runners or configuration. No typecheck, lint, test, build, acceptance, formatting, link/range/whitespace validation, independent implementation review or storage-preservation comparison runs this turn.

## Implementation

1. Remove the Agent connection declaration and its imported full-lock storage schema. Retain the Actor declaration unchanged.
2. Replace Agent SQL capability reads with exact authored derivation and explicit attachment identity checks. Make synchronous context available at broadcast without changing Actor/Service storage.
3. Remove Agent row installation/deletion and fix installation failure, error, invalid-state and send-failure socket teardown. Remove SQL cleanup machinery made obsolete by the table removal; keep live hibernated attachments and Actor cleanup semantics.
4. Adjust the existing acceptance/Workerd checks for Agent table absence, exact capability derivation, malformed/wrong identity rejection, synchronous live delivery and attachment/close failure paths. Preserve existing Actor/Service schema assertions and the unverified Plan 211 public/private history checks. Prepare checks only; do not run them.
5. Reconcile module READMEs, governing ADR 013, glossary, local ownership pattern, architecture clauses, Agent finding and Plan 151. Record implementation separately from the original source review and from deferred verification. Plan 151's next table remains AggregateChain.externalOperationOutbox.

`+` creates; `~` modifies:

```text
zerospin/
  wiki/plans/
    + 212-plan-agent-derived-connection-capabilities.md
    ~ 151-plan-storage-table-review.md
    ~ 211-plan-agent-exposed-command-history.md (subsequent cutover note)
  packages/system-worker/src/aggregateSessionChain/
    ~ aggregateSessionChainDbConfig.ts
    ~ readConnectionCapabilities.ts
    ~ resolveAgentSessionContext.ts
    ~ connectionState.ts
    ~ installConnection.ts
    ~ disposeConnection.ts
    ~ AggregateSessionChain.ts
    ~ onConnect/onConnect.ts
    ~ onMessage/onMessage.ts
    ~ onMessage/admitSocketCommand.ts
    ~ onMessage/replaySocketCommands.ts
    ~ README.md
  packages/system-worker/src/AggregateAgentVersionChain/
    ~ AggregateAgentVersionChain.ts
    ~ README.md
  packages/system-worker/src/AggregateActorVersionChain/
    ~ AggregateActorVersionChain.ts (configured System binding only)
    ~ README.md (Agent distinction only)
  packages/system-worker/src/AggregateAgentVersionRepo/
    ~ README.md (current Agent history/connection reference)
  packages/system-worker/src/aggregateProjection/
    ~ README.md (current Agent connection reference)
  packages/system-worker/test/migratable-do-repo/
    ~ system-repo-activation.workerd.spec.ts
  wiki/
    ~ glossary.md
    adrs/
      ~ 013-aggregate-delivery-history-and-projection-ownership.md
    patterns/
      ~ index.md
      system-worker/
        ~ versioned-aggregate-actor-owned-projection.ts
    architecture/
      ~ AuthoredSystem.md
      server/
        ~ admitAggregateCommands.md
    reviews/storage-tables/
      ~ aggregate-agent-version-chain-connection-locks.md
      ~ aggregate-agent-version-chain-projected-commands.md (subsequent cutover reference)
```

## Historical deferred verification

Run only after the maintainer's requested review/implementation phase is finished. Plans 211 and 212 remain unverified; earlier archived-plan checks do not establish these changes' correctness.

1. Run the scoped `system-worker` graph through Nx, including source/Workerd TypeScript, lint, Workerd tests and required cached dependency tasks. Inspect current graph configuration when the deferred run resumes.
2. Run the prepared Agent table-absence, exact declaration/model/ordinary-contract capability, attachment owner/session/issued/resumed Node and low-level installation/disposal checks. Complete the actual Chain synchronous broadcast/onError and cold hibernation/socket exercise through the existing Workerd environment during the deferred pass; do not add a separate loader, runner or decorated-socket harness just for this seam. Resolve failures and rerun affected checks.
3. Check scoped formatting, whitespace, documentation links/citations and removed Agent SQL references. Compare Actor and Service storage declarations against `/tmp/zerospin-plan212-before`; inspect combined Plan 211/212 Effect context and shared-query typing. Obtain independent implementation review. Never verify Explorer.
4. Record actual results and archive this same filename with repaired links only after required checks pass. Keep ADR 013 active. Plan 211 retains its own deferred completion/archival requirements.

## Implementation outcome

AggregateAgentVersionChain no longer declares, inserts, reads or deletes SQL `connectionLocks`; no replacement storage was introduced. `resolveAgentSessionContext` now returns the exact authored Agent as well as its validated session/Origin. `readConnectionCapabilities` validates phase-specific attachment state and physical Aggregate/Agent/session/issued-and-resumed-Node identity, then derives selected model names and ordinary command versions with the existing lock/capability projections. Full initial authored-lock equality remains at `onConnect`.

`AggregateSessionChain` captures configured `System`, provided by both concrete Chain constructors, and supplies it to synchronous broadcast reads. Attachment reads are inside the per-connection failure guard. Replay/live and pending-command handoffs validate the actual current attachment before updating it, preserving the synchronous live transition and preventing late work from restoring disposed Agent admission.

Agent installation writes only the attachment. Failed installation invokes disposal for the original accepted socket. Agent disposal attempts `setState(null)` before closure and attempts close in `finally` if invalidation throws. Shared invalid-state, send and error paths route through disposal, and AggregateAgentVersionChain now forwards `onError`. Actor SQL cleanup/reconciliation and Actor/Service storage declarations were left unchanged by these edits; their preservation comparison is deferred. Agent public/private retained history and pending storage were not changed by this cutover.

The two existing acceptance/Workerd files were updated for table absence before/after restart, exact selected/ordinary capabilities, attachment/command identity rejection, SQL-free attachment recovery and low-level installation/disposal failure handling. These checks are unrun. Actual `AggregateSessionChain.broadcast`/`onError` runtime exercise remains deferred; no new worker subclass, socket-decorator harness, test file, fixture, runner or configuration was introduced, and `owners.worker.ts` was not changed.

Module READMEs, ADR 013, glossary, ownership guidance, architecture clauses and Agent finding/Plan 151 status reflect the implementation and verification deferral. Plan 151's next table remains AggregateChain.externalOperationOutbox. No formatting, documentation validation, runtime/type/lint/test/build/acceptance, independent implementation review or baseline comparison ran. No storage reset or deployment was performed. Plans 211 and 212 remain active and unverified.

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
