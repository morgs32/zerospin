# Register ordinary continuation contracts in the release inventory

**Date:** 2026-11-20

**Status:** Accepted. Implementation pending.

**Partially supersedes:** [ADR 023](023-flat-command-origins-and-claims-free-continuations.md#explicit-invocation-grants-and-administrative-programs) for contract inventory derivation. Direct invocation grants and original cross-owner dispatch authority still apply.

## Ordinary command failures

Remove top-level `onFailure` from ordinary contracts. The addressed release
returns declared failures in the evaluated command's `outcome.result`, and the
owner Chain records the outcome. Raw JavaScript defects leave execution pending
for recovery.

For plural.fm's `sendEmail@1`, the compose outbox already displays the command
failure. Remove `recordSendFailure` and the failed `queueSubmission` write from
that failure path.

## Operation continuations

External requests and cross-owner command operations keep their declared
`onSuccess` and `onFailure` branches. After the emitting Chain records the
operation's outcome, it calls the pinned emitting release Worker. That Worker
selects the branch, runs its authored payload mapper, and returns the encoded
follow-up. The emitting Chain admits and orders the follow-up as an ordinary
command, and the addressed release Worker executes it. [External request branches](012-opaque-external-work-and-originating-chain-continuations.md#amendment-of-2026-11-19) · [Command operation branches](020-shared-programs-and-portable-operation-declarations.md#amendment-of-2026-11-19)

Remove the release's `continuations` prop. Explicitly list each follow-up
contract in the emitting release's existing `contracts` inventory. The branch
must reference the exact registered name and version. The recorded operation
and its declared branch authorize that follow-up. Keep private follow-ups off
direct Actor, Agent, and System grants.

## Replay and SystemSpec

Replay resolves an already-admitted command through the replaying release's
contract inventory. Permit replay-only entries with no invocation grant or
operation branch. For example, Shopping's `user@2` can list
`markPaymentForReconciliation` to replay commands admitted by `user@1` after
dropping the branch that used to produce them. The pinned `user@1` Worker still
settles requests it started.

SystemSpec validates each branch against the exact version in the release's
inventory and each independent direct grant against its registered contract.
Remove the requirement that every inventory entry derive from a grant.
[Current inventory validation](../../packages/core/src/system/SystemSpecSchema.ts#L535)
