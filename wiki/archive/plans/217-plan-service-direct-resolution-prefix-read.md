# Direct Service actor command-resolution prefix read

**Date:** 2026-10-16

**Status:** Complete. The maintainer authorized remaining verification under Plan 151 on 2026-10-22; implementation and required scoped checks are complete. Archived without closing parent Plan 151.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [ServiceActorVersionChain.commandResolutions](../../reviews/storage-tables/service-actor-version-chain-command-resolutions.md). **Architecture:** [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md), applicable [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md). [Plan 208](208-plan-direct-actor-resolution-prefix-read.md) is the earlier Aggregate reference; preserve the actual Service identity and cursor semantics rather than copying its implementation.

## Problem and agreed behavior

ServiceActorVersionChain's snapshot RPC and three scalar-only socket probes call `readServiceNodeOutcomes`, which proves a private prefix and then unconditionally joins, decodes and filters public commands. These callers discard the payload. Actual private replay still needs the joined commands.

1. Replace the scalar-only `getNodeOutcomes` RPC/forwarder with `getResolvedThrough`. Its shared synchronous reader queries only `commandResolutions` and returns a number. The class binds its own database/key and uses the existing synchronous-read RPC envelope pattern. Remove the obsolete method/file/interface rather than keeping an alias.
2. Preserve exact bound actor name/version, nonnegative safe `afterOutcomeIndex` and `throughServiceIndex`, null-Node behavior and rejection of offsets beyond the resolved prefix. For a real Node, preserve exact Node/session scope and `serviceIndex <= throughServiceIndex`; another Node/session has no matching resolutions. No current claims/path/subset substitutes for full historical claims.
3. Retain bidirectional `json_tree` structural claims comparison over every scoped historical row, including rows before the requested private offset. Reject mismatches; do not filter them away. Preserve `COUNT(*) = COUNT(DISTINCT pushIndex) = MAX(pushIndex)` as the complete positive-prefix proof and the existing `node-recovery-caller-mismatch`, `node-recovery-checkpoint-invalid` and `node-outcome-gap` failures.
4. Share that prefix reader with `readServiceNodeOutcomes`. Keep the latter's bounded public join, exact recipient/push checks and admitted-model/private-refusal filtering for actual replay. Replace only the snapshot read and three scalar-only socket probes. Keep the initial private-offset validation before entering replay and the synchronous final read/send/live transition.
5. Snapshot capture continues to commit resources/head N together, publish through N and compare the exact history checkpoint/hash before reading its private prefix through that same N. Remove models/payload arguments only from scalar calls. Keep public replay, append/retry, acknowledgement, retention, schema/indexes, connection locks and Actor/Agent storage outside this cleanup. No storage cutover, reset, deployment or commit is needed.

## Decisions and rationale

1. Keep the direct reader synchronous so the existing payload reader and socket tail can share it without converting synchronous exceptions or introducing an asynchronous gap. A separate forwarding-only Effect procedure is unnecessary; ServiceActorVersionChain already adapts synchronous checkpoint reads at its RPC boundary.
2. Preserve Service's existing exact Node/session query scope. The Aggregate reference rejects a mismatched session after selecting Node rows; adopting that difference would change settled Service behavior.
3. Keep payload reads for the one replay call that sends private commands, and for public replay. Their public history joins serve an actual consumer. A scalar progress read does not require models, public delta decoding or refusal payload reconstruction.
4. This is a bounded reader/API cleanup with no new domain term or ownership trade-off. Reconcile existing READMEs and review/plan status; no new ADR or glossary term is justified.

## Implementation sequence

The original implementation sequence below records the initial verification deferral. The maintainer ended Plan 217's deferral on 2026-10-22.

1. Add the shared direct synchronous reader and replace the scalar RPC/interface. Extract the existing prefix algorithm without weakening validation or changing error codes. Remove the old forwarding module.
2. Call the shared reader from `readServiceNodeOutcomes`, retaining only its actual private payload phase after the proof. Update snapshot and the three scalar-only socket probes; preserve their supplied offsets, bounds and order.
3. Extend the existing Service private-prefix acceptance scenario in place with concise direct-reader assertions for captured bounds, identity/claims, cursor/gap rejection and independence from public delta decoding. Preserve existing replay assertions. Create no test/fixture/runner/configuration files and run no verification during deferral.
4. Update affected module READMEs, the recorded finding and Plan 151, preserving the source-review history separately from implementation. The next table remains ServiceActorVersionChain.connectionLocks; do not review its design here.
5. Record implementation outcome and every deferred check. Keep this plan active until the maintainer ends verification deferral and all required scoped checks pass; archive only then.

## Planned file hierarchy

`+` creates; `~` modifies; `-` removes. Preserve unrelated working-tree changes.

```text
zerospin/
  packages/system-worker/src/
    ServiceActorVersionChain/
      + getResolvedThrough/getResolvedThrough.ts
      - getNodeOutcomes.ts
      ~ readServiceBrowserCommandPage.ts
      ~ ServiceActorVersionChain.ts
      ~ onMessage/replayServiceSocketCommands.ts
      ~ README.md
    serviceProjection/
      ~ captureServiceSnapshot.ts
      ~ README.md
    repoServices/
      ~ ServiceActorVersionChains.ts
  wiki/plans/
    + 217-plan-service-direct-resolution-prefix-read.md
    ~ 151-plan-storage-table-review.md
  wiki/reviews/storage-tables/
    ~ service-actor-version-chain-command-resolutions.md
```

## Verification seams

1. Existing Service private-prefix/replay acceptance assertions should prove exact actor identity, Node/session isolation, full historical claims equality, captured bounds, null Node, safe offsets and complete-prefix/gap rejection. A direct prefix read should succeed independently of public delta decoding while actual private/public replay remains payload-filtered. Existing socket/snapshot seams should retain offset validation and captured-N/tail ordering.
2. Inspect the relevant current Nx configuration and run the scoped system-worker/source and Workerd type/lint/test graph with its required dependencies. The historical acceptance runner, `scripts/verify-plan140.mjs`, was removed by commit `65e0245e3e0cf12fa8dbf5794cf64e14f70e5e56`; extend the current authorized SQL and Workerd seams in place rather than reconstructing that runner. No Explorer verification is required or permitted. Keep other active plans' results distinct.
3. Complete scoped formatting, documentation/link/citation/whitespace checks, independent implementation review and unchanged-storage comparisons. Resolve failures and record actual evidence before archival.

## Implementation outcome

The shared synchronous `getResolvedThrough` owns the direct `commandResolutions` prefix query and actor/Node/session/full-claims, safe-bound, null-Node, contiguous-prefix and private-offset validation. It returns a number without a public join, delta decoding or model arguments. ServiceActorVersionChain binds its database/key and adapts the read using `Effect.sync` and its RPC envelope. The obsolete scalar `getNodeOutcomes` RPC, interface entry and forwarding file are removed.

`captureServiceSnapshot` calls that scalar through its captured N after publication and the exact checkpoint/hash comparison. The initial socket validation, post-public-delivery progress read and final-tail size probe use it with their existing offsets and bounds. `readServiceNodeOutcomes` shares the proof and retains the bounded joined payload phase, exact next-push/recipient checks and admitted-model/private-refusal filtering. Its actual socket delivery call and final synchronous tail read/send/live transition remain.

## Verification — 2026-10-22

1. Three Effect-native cases in the existing [SQL seam](../../../packages/system-worker/tests/repo-names.spec.ts) use disposable SQLite, the actual Chain schema and production append transaction. They establish exact Actor binding, Node/session isolation, null Node, safe/overlarge offsets, captured bounds including zero, and the positive-prefix gap rejection. Nested key ordering is equivalent; both missing and extra nested claims reject. A mixed history with an earlier mismatching claims row and latest matching row rejects even at private offset two. Deliberately malformed public delta data does not affect the scalar, while both payload readers reject it. Actual private/public reads retain private refusal visibility, offsets, admitted-model filtering and the six-field browser representation.
2. Two cases extend the existing [Workerd seam](../../../packages/system-worker/tests/agent-runtime.spec.ts) and [fixture](../../../packages/system-worker/tests/support/agentRuntimeWorker.ts). The actual ServiceActorVersionRepo snapshot returns `projection-history-publication-failed` after a selected-Chain Failure envelope. A fixture pause before the real checkpoint read lets N+1 commit; the returned snapshot still contains N's resources, hash and private prefix. A synthetic conflicting checkpoint receipt rejects before the scalar RPC. The actual PartyServer socket rejects an overlarge private offset before any command frame, delivers 64 public commands and newly appended position 65, sends replay completion before marking live, replays private payloads behind an existing public checkpoint and receives position 66 through normal live broadcast.
3. `pnpm nx run zerospin:test` passes the compiler and all **59 tests across eight files**, with required Browser/SDK/System Worker library dependencies and their transitive graph. The installed dependency tree is reused with `pnpm_config_verify_deps_before_run=warn`; no installation or dependency change occurs. The deleted historical acceptance script is not reported as executed. Its reader obligations are covered by the current SQL/Workerd cases.
4. Independent behavioral review found one test gap: identical claims on every row could not distinguish an earlier-row check from a latest-row check. The mixed-history assertion closes that gap. Review of the corrected tests, fixture forwarding and production scalar/snapshot/replay paths found no production defect. Initial fixture-only compiler/decoder/fault-envelope failures were repaired before the passing run.
5. All **54 captured production TypeScript modules** across ServiceActorVersionChain, ServiceActorVersionRepo, serviceProjection and repoServices remain byte-identical to their pre-verification hashes, with no added or missing modules. Qualified Git comparison of implementation commit `ff1c4b34220320b25cc79c1e95e54ccf6f532e9e` against parent `ff3ef7b82e21d6be568e0ac2cdfd8c91a5fe1495` preserves the entire six-column `commandResolutions` declaration/reference/index, nine unaffected complete configuration/schema/name/append/reader/Repo modules, public/private payload portions, captured snapshot/checkpoint portion and final tail/send/live portion. That commit co-lands Plans 217–225; the whole Actor Chain schema changes under Plan 218's separate connection-lock cutover. This establishes qualified source preservation, not physical-database equivalence.

The Workerd seam supplies trusted Actor publication context and connection headers. Its tail hook commits position 65 through the production append transaction synchronously after the first 64-command frame; it omits broadcast while the socket is replaying. Normal class append of position 66 separately exercises live broadcast. These deterministic hooks do not establish remote producer concurrency, authenticated Actor/ticket admission, catalogue acceptance, automatic activation, hibernation, raw network failure recovery or the full connection-capability/disposal lifecycle. Plans 218/221 retain those independent obligations; Plans 196/211/212/213/219 retain their own remaining verification. Plans 214/215/216 are already complete in their archived records.

Module READMEs, the recorded finding and Plan 151 distinguish scalar reads from required payload reads. No new glossary term or ADR is justified. No production code/schema change, compatibility path, existing-storage reset, deployment or commit was needed. Parent Plan 151 remains active.

Scoped `pnpm nx run system-worker:lint` passes with zero errors and the existing unrelated curly warning at `prepareServiceProjectionOccurrence.ts:68`. New fixture/test warnings were corrected. Scoped formatting, whitespace, local links/source-line citations and independent implementation review pass. The obsolete acceptance runner is absent, so no execution of it is claimed; the current suites replace its required reader proof. All checks exclude Explorer. Existing storage and unrelated work remain intact.

## Remaining work

None. Parent Plan 151 and the separately named plans retain their own work.
