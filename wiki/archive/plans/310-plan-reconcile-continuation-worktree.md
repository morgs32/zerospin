# Plan 310 — Reconcile the command-continuations worktree

Status — Complete on 2026-11-18. The accepted runtime and documentation changes are on main. The maintainer chose to keep the dirty prototype checkouts intact.

Verification against GitHub main `65b35f6434` with the scoped changes applied passed the System Worker and test TypeScript checks, 39 focused Workerd tests, and 42 focused Node tests.

[MOR-487](https://linear.app/morganatwork/issue/MOR-487/admit-ordinary-continuations-and-pin-service-execution-and-replay)
supersedes the operation outcome and terminal refusal retention in decisions 6
and 7. Each sending Chain keeps the first execution outcome on its
`commandOperationOutbox` row until settlement. Terminal admission refusal is
logged before the row is consumed. [Current ADR](../../adrs/020-shared-programs-and-portable-operation-declarations.md)

## Decisions

1. Keep the React and TanStack guidance and the archived browser peer spike plan. The guidance already matches GitHub main, and [PR #161](https://github.com/morgs32/zerospin/pull/161) archived the peer spike plan. Keep main's glossary and Plan 306.
2. Keep main's operation definitions. Retire the continuation worktree's operation metadata WeakMap.
3. Keep main's Aggregate extension contract with explicit read fields, the admitted command and the decoded payload. During replay, run the executing release's extension only if the originating release declared an extension for that command.
4. Keep main's browser Node registration and local-reset recovery behavior. Keep main's read-only SystemRepo preflight coverage and retire the local legacy catalog migration tests.
5. Keep `migrations: []` on AggregateChain and ServiceChain. Retire the local Chain migrations, their regression test and the legacy producer checkpoint fallback. Revisit migration if concrete retained storage needs it. Keep receiver-side `recordedCommandAdmissions` for exact-command deduplication.
6. Use one `commandOperationOutcomes` table per sending Chain, keyed by the sending command's position and operation index. Store `{ result, finalizedAt }` as the operation `outcome`. Its result is `Success`, `Failure`, or `AdmissionFailure`. For execution, preserve the destination command's `finalizedAt` and destination index. For admission refusal, use the sender's recording time and leave the destination index empty.
7. Retain a terminal admission refusal and clear its pending delivery in one transaction. Remove `onAdmissionFailure`. Keep main's `onFailure` for an executed continuation that fails. Executed destination commands still provide an `outcome` to the normal continuation.
8. Keep main’s ordinary contract callback API with the original `command`, adapted `payload`, and `knownCommandSchema`.
9. Remove `continuationPayload`. Command continuations receive the original decoded `sourceCommand` and destination `outcome`. Their `onFailure` also receives the continuation’s failure. Retain the exact encoded source command in the admitted continuation for replay and recovery.
10. Keep SDK publishing separate. In plural.fm, PR #9 merged the direct inbound email flow and manual failure retry. The superseded outbound upload spike branch and worktree have been removed.
11. Retire both framework upload-cleanup designs. plural.fm's app-owned Assets service will own any future cleanup. A late completion must never make a retired upload attempt ready again. Cleanup remains a plural.fm TODO.

## Reconciliation outcome

1. [PR #160](https://github.com/morgs32/zerospin/pull/160) merged as `a1884b7e9`. The clean-baseline run covered source identity after history adoption and repeat delivery. The follow-up decoder fix passed 31 focused tests and the test typecheck. Codex reviewed the final PR head `ee61b3d28` with zero findings.
2. The mainline reboot guidance applies the current registry review rule. [PR #156](https://github.com/morgs32/zerospin/pull/156) removed the legacy catalog migration, and [PR #157](https://github.com/morgs32/zerospin/pull/157) removed legacy upload storage. The old upload-removal checkout's 24 changed paths exactly matched the tree at PR #157.
3. Removed the clean continuation verification, peer archive, peer verification, operation definitions, and upload spike worktrees, plus the duplicate upload-removal checkout. Pruned nine registrations whose directories were already gone. Existing branch refs were retained.
4. Kept `zerospin-command-continuations`, `zerospin-reboot-guidance`, `zerospin-upload-cleanup`, and `zerospin-agent-upload-cleanup` with their uncommitted files. These copies remain available by request. Their superseded changes have no follow-up PR. Other historical and release checkouts remain available.
5. The primary checkout's tracked diff and untracked inventory were verified unchanged when the checkout moved to local branch `codex/local-wip-before-reconciliation` at `8c8902ad35`. Local `main` was aligned to `origin/main` at `a1884b7e9`. Independent Agent work stays in [PR #159](https://github.com/morgs32/zerospin/pull/159) and its own worktree.
6. SDK publication, deployment, and storage resets were outside this reconciliation.

## Worktree retirement

Later on 2026-11-18, the maintainer approved retiring the original command-continuations worktree. The accepted behavior remains in [PR #160](https://github.com/morgs32/zerospin/pull/160). The retired checkout contained the superseded continuation declarations and Chain migration work listed above. The integrated checkout's source JSON validation and its server materialization regression are already present on main.

## Original outcome cleanup files

`+` creates a file. `~` modifies a file.

```text
zerospin/
  + wiki/plans/310-plan-reconcile-continuation-worktree.md
  ~ fragment/content/reference/sdk.md
  packages/system-worker/
    src/
      ~ AggregateChain/AggregateChain.ts
      ~ AggregateChain/admitCommandContinuationTx.ts
      ~ AggregateChain/aggregateChainDbConfig.ts
      ~ ServiceChain/ServiceChain.ts
      ~ ServiceChain/admitCommandContinuationTx.ts
      ~ ServiceChain/serviceChainDbConfig.ts
      + commandOperations/CommandOperationOutcomeSchema.ts
      ~ SystemApi/acceptSystemSpec/acceptSystemSpec.ts
      ~ SystemRepo/SystemRepo.ts
      ~ SystemRepo/registerRepo/systemRepoNamespaces.ts
      ~ repoServices/SystemRepos.ts
    tests/
      ~ chain-command-delivery/chain-command-delivery.workerd.spec.ts
      ~ repo-lifecycle/repo-lifecycle.workerd.spec.ts
```
