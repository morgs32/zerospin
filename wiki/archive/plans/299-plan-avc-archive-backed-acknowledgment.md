# Revert PR #133 and evaluate archive-backed acknowledgment

**Status:** Completed and verified. [Revert PR #134](https://github.com/morgs32/zerospin/pull/134) landed on main at `3377e78251`. The isolated candidate is based on that commit.

## Revert

1. Verify the landed commit for [PR #133](https://github.com/morgs32/zerospin/pull/133), revert it from current `main` in a clean worktree, and open a standalone PR. The exact revert restores immediate AVC backpressure and removes the deferral policy from the fanout and outbox factories.
2. Run the root TypeScript check and focused core and Aggregate history Workers tests. The revert at `038a764bef` matches the pre-#133 tree and passed all 18 focused tests.
3. Preserve the earlier results via the [commit-pinned Plan 298](https://github.com/morgs32/zerospin/blob/fa31d5b4f7b373b95ee31a5629e19e162a33cf2e/wiki/archive/plans/298-plan-avc-backpressure-and-bounded-replay.md).

## Isolated candidate

1. AggregateVersionRepo (AVR) owns pending publication. AggregateVersionArchive (AVA) owns evaluated history. AggregateVersionChain (AVC) owns Archive routing and the published head. Preserve the append request and success envelope. Acknowledge only after all positions in the offered page are durable in AVA and AVC has recorded the new head.
2. Under AVC's append permit, validate ownership, order, exact repeats, operation payloads, and a contiguous fresh suffix of at most 64 commands before sending new commands to AVA. Serialize publication and rollover for each AVC. Use synchronous local transactions and make RPCs between transactions.
3. Rotate only on definite `SQLITE_FULL` with a valid durable shard head. Persist the successor route before writing to it. If 65–96 are durable and 97–128 fail, AVC still exposes head 64. AVR keeps the page. Retry verifies the exact repeats and completes the suffix. Commit the whole page's head once and wake Actor and Agent fanout.
4. Await the AVA RPC result without an AVC timer or retry loop. Stop the attempt on a write or transport failure. Keep AVR outbox recovery armed and retry an ambiguous result against the same AVA shard. Canonical replay continues awaiting the AVR publication drain.
5. Remove AVC's local command table, Archive subscriber cursor, and Archive fanout from the candidate. Serve published history from AVA through the directory and bound reads by AVC's head. Preserve the sibling Archive paths and existing AVR production policy.
6. Before candidate activation, check serving Repo registrations and refuse to reuse affected AVC or AVA identities when registered or when freshness cannot be established. Verify rejection against an old AVC fixture with pending commands and verify that it still serves its history. The candidate uses fresh isolated storage. Existing deployments and storage upgrades require a separate decision.

## Verification and comparison

1. Extend the existing Workers coverage for healthy publication, AVA stalls, partial persistence across rollover, lost AVA and AVC replies, eviction, exact repeats, conflicting repeats, and gaps. Verify published visibility, fanout and outbox acknowledgment at the whole-page boundary. Run the focused Nx Workers suites and type checks.
2. Run the same canonical replay fixture on reverted `main` and the candidate. Run 100,000 commands per variant with healthy AVA and with a controlled AVA stall. Record throughput, publication and canonical replay acknowledgment latency, peak AVR pending rows and bytes, AVC append permit hold time, and recovery time. Verify one materialization per position, contiguous history, and an empty outbox at completion.
3. Record results before deciding adoption. Reconcile terminology with the existing glossary. [ADR 024](../../adrs/024-version-chain-sql-archives.md) governs the serving design until adoption.

## Planned files

`+` adds a file, `~` changes a file, and `-` removes a file. The revert reverses the merged PR diff. The tree covers the candidate.

```text
zerospin/
├── packages/system-worker/
│   ├── src/AggregateVersionChain/
│   │   ├── ~ AggregateVersionChain.ts
│   │   ├── ~ aggregateVersionChainDbConfig.ts
│   │   ├── ~ aggregateHistoryStorage.ts
│   │   ├── - appendEvaluatedCommandsTx.ts
│   │   └── + validateEvaluatedCommandPublication.ts
│   └── tests/
│       ├── aggregate-history-fanout/~ aggregate-history-fanout.workerd.spec.ts
│       └── chain-command-delivery/~ chain-command-delivery.workerd.spec.ts
└── wiki/plans/+ 299-plan-avc-archive-backed-acknowledgment.md
```

## Execution notes

1. The 256-command baseline smoke comparison passed in both healthy and stalled conditions. The 100,000-command baseline and candidate comparisons use the same canonical Account V2 fixture, an opt-in test selection, and a one-second AVA stall on the first write.
2. The read-only preflight proof passed against the serving revert tree. An existing AVC registration refused reuse and the old AVC continued serving its pending evaluated command with the stored row unchanged.
3. The candidate patch is based on the exact revert tree. It passed the root TypeScript check, all 18 focused tests including both lost-reply cases, and `system-worker` typecheck and lint. The landed `main` tree matched the tested revert tree exactly, and the final candidate diff and new validator matched the tested draft byte for byte.
4. Run each scale case in a separate Workers process. The freshness guard rejected retained registrations when the second case reused the first case's process.
5. The healthy 100,000-command baseline completed in 447.268 s at 223.6 commands/s. Publication, canonical replay acknowledgment, and append permit hold p95 were 11 ms, 461 ms, and 11 ms. AVR peaked at 64 pending rows and 38,849 serialized bytes.
6. The healthy 100,000-command candidate completed in 445.639 s at 224.4 commands/s. Publication, canonical replay acknowledgment, and append permit hold p95 were 8 ms, 361 ms, and 8 ms. AVR peaked at 64 pending rows and 38,593 serialized bytes. Both healthy runs finished at the same published position with an empty outbox and one materialization per position.

7. The stalled 100,000-command candidate completed in 449.734 s at 222.4 commands/s. Publication, canonical replay acknowledgment, and append permit hold p95 were 8 ms, 362 ms, and 8 ms. The injected AVA stall lasted 1,001 ms, the longest append held its permit for 1,015 ms, and the first publication success followed the end of the stall by 7 ms. AVR peaked at 64 pending rows and 38,849 serialized bytes. The run recorded zero publication failures and completed with contiguous history, an empty outbox, and one materialization per position.

8. The stalled 100,000-command baseline completed in 584.777 s at 171.0 commands/s. Publication, canonical replay acknowledgment, and append permit hold p95 were 6 ms, 545 ms, and 6 ms. The injected AVA stall lasted 1,005 ms, the longest append held its permit for 537 ms, and the first publication success followed the end of the stall by 77 ms. AVR peaked at 64 pending rows and 38,593 serialized bytes. The run recorded 17 publication failures and completed with contiguous history, an empty outbox, and one materialization per position.
9. Treat the elapsed times as local measurements. The two variants used the same canonical replay fixture and instrumentation with no-op commands, and some isolated Workers processes ran concurrently. The stalled candidate's first append held its permit until AVA finished, while the baseline retried publication against a full local suffix. Canonical replay acknowledgment is measured at AVR's subscriber, including its awaited publication drain.

## Reproduce

Use the isolated comparison patches on the exact revert and candidate trees. Select one scenario per process. For example:

```sh
pnpm nx run zerospin:test --args='packages/system-worker/tests/chain-command-delivery/chain-command-delivery.workerd.spec.ts --testNamePattern="Plan 299 comparison: stall" --disableConsoleIntercept'
```

## Adoption

Accepted for fresh storage under [ADR 028](../../adrs/028-archive-backed-aggregate-publication.md).
The adoption adds the deployment guard to SystemRepo and staged SystemApi acceptance.
SystemRepo rejects an unmarked catalog with retained declarations or registrations
before schema provisioning. The staged SystemApi requires an affirmative layout
attestation before accepting the candidate SystemSpec.

## Remaining work

Existing-storage upgrade and rollout are separate decisions.
