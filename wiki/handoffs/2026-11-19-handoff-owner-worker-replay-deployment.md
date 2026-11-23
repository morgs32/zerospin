# Handoff for ordinary continuations and owner Worker replay

**Date** 2026-11-19

**Focus** Implement external-request and command-operation continuations, including terminal mapper failure, pinned execution, and replay.

**Canonical spec** [MOR-487](https://linear.app/morganatwork/issue/MOR-487/admit-ordinary-continuations-and-pin-service-execution-and-replay)

MOR-487 merged in [PR #176](https://github.com/morgs32/zerospin/pull/176), with pinned replay fixes in [PR #178](https://github.com/morgs32/zerospin/pull/178). The notes below record the earlier prototype, which was developed as uncommitted changes on [`037f63258a66`](https://github.com/morgs32/zerospin/commit/037f63258a66dd2e7c0ec348bb04b51ec02cce72) alongside Aggregate history, predecessor, and deployment bootstrap work.

## Goal

Carry one operation end to end from its recorded provider observation or
destination outcome to an ordinary command on the originating Chain. The
pinned emitting release selects and maps the continuation. A selected branch
always occupies one stable Chain position, including when payload construction
fails. Each receiving release advances through that position in order.

## Done

1. The prototype covers both Chain families, both operation types, and the
   pinned Checkout replay case below. The branch signatures and rationale are
   in the November 19 amendments to [ADR 012](../adrs/012-opaque-external-work-and-originating-chain-continuations.md#amendment-of-2026-11-19)
   and [ADR 020](../adrs/020-shared-programs-and-portable-operation-declarations.md#amendment-of-2026-11-19).
2. The earlier owner Worker work established pinned Actor and System replay
   and the development executable registration journal.
   [Owner Worker execution checkpoint](2026-11-19-handoff-owner-worker-original-execution.md#aggregate-prototype)

## Prototype results

1. AggregateChain and ServiceChain retain the first operation outcome before
   invoking the mapper. The Chain runtime makes provider requests using its
   application bindings. The registered `OwnerReleaseWorker` builds the
   continuation for the exact originating release. The mapper sees the frozen
   outgoing payload and the selected branch result. The child guard and
   program can read models.
   [Owner Worker entrypoint](https://github.com/morgs32/zerospin/blob/30ddb9e6e35092b33ddb248e76c17a7967dd49b4/packages/production-worker/src/OwnerReleaseWorker.ts)
   · [Runtime flow](../architecture/server/DeliveryAndRecovery.md#ordinary-command-delivery)
2. Both external branches are required. A usable `declined` provider response
   selects `onSuccess`. A recorded request failure selects `onFailure`. A
   command operation selects from the destination's finalized execution
   outcome. An omitted command-operation branch consumes delivery without a
   child. Terminal destination admission refusal records `AdmissionFailure`
   and consumes delivery atomically.
   [Shopping payment](../../examples/shopping/src/zerospin/aggregates/user/contracts/processExternalPaymentV1.ts)
   · [Command delivery](../../packages/system-worker/tests/chain-command-delivery/chain-command-delivery.workerd.spec.ts)
3. The originating Chain commits stable child admission and pending-work
   removal together. AggregateVersionRepo executes on the addressed owner
   Worker. In this prototype, ServiceVersionRepo executes in the stable
   System Worker. Checkout@1 has no payment request declaration. It replayed
   the valid `recordPayment@2` through its down adapter and recorded an
   ordinary unsupported outcome for valid `reviewPayment@1` input, then
   advanced to the next supported command.
   [Pinned replay case](../../packages/system-worker/tests/aggregate-adapter-failures/aggregate-adapter-failures.workerd.spec.ts)

## Failed continuation mapper

1. A mapper throw, Effect failure, or output the selected contract cannot
   encode returns the selected contract name and version with a public command
   failure. The mapper runs after the pinned declaration and frozen inputs
   validate. The originating Chain durably retains the mapper result on
   pending work before admission. A lost OwnerReleaseWorker reply, an
   unavailable pinned binding, or an interrupted SQL write leaves work
   eligible for recovery.
   Recovery reuses the first operation outcome and any committed mapper
   failure.
   [Mapper result](../../packages/core/src/contracts/encodeContinuationPayload.ts)
   · [External admission](../../packages/system-worker/src/AggregateChain/recordExternalOutcomeAndAdmitCommandTx.ts)
   · [Command continuation admission](../../packages/system-worker/src/ServiceChain/admitCommandContinuation.ts)
2. The same admission transaction inserts the child under its original owner
   release and stable ID at the next Chain position and deletes pending work.
   SQL `NULL` is reserved for this framework-recorded payload construction
   failure. Ordinary submission requires a valid encoded payload. A guard or
   program refusal keeps the encoded payload it received.
3. AggregateVersionRepo and ServiceVersionRepo check for SQL `NULL` before
   contract lookup, decoding, adaptation, guards, or programs. In-order
   finalization records the mapper failure in `outcome.result`. Replay
   preserves that failure and advances materialization and publication with
   zero operations, including when the receiving release lacks the contract.
   [Aggregate execution](../../packages/system-worker/src/AggregateVersionRepo/utils/executeAggregateCommandTx.ts)
   · [Service execution](https://github.com/morgs32/zerospin/blob/30ddb9e6e35092b33ddb248e76c17a7967dd49b4/packages/system-worker/src/ServiceVersionRepo/utils/executeServiceOccurrence.ts)

### Verification

- Workerd verified throwing mappers and invalid mapped payloads across external
  requests and command operations on both Chain families. The failed children
  retained the selected contract, original release, stable ID, SQL NULL
  payload and mapper failure. The Aggregate command case also verified that a
  program refusal retains its valid encoded payload.
  [Command delivery](../../packages/system-worker/tests/chain-command-delivery/chain-command-delivery.workerd.spec.ts)
  · [Service external delivery](../../packages/system-worker/tests/service-external-delivery/service-external-delivery.workerd.spec.ts)
- The Service external request and command operation cases forced SQL rollback
  during pending-row deletion after the child insert. Wake after eviction
  admitted one child at the same ID, removed the pending row, and reused the
  recorded outcome and mapper failure. A subsequent wake left the provider,
  destination and mapper call counts unchanged.
- Independently pinned Checkout Workers published the same failed
  `recordPayment@2` child at position 6 with zero operations. Checkout@1 also
  published the failed `reviewPayment@1` child at position 8 despite lacking
  the contract. Both releases retained their prior payment rows and advanced
  through `finishCheckout` at position 9. Replay retained four provider calls
  and one destination command ID.
  [Pinned replay case](../../packages/system-worker/tests/aggregate-adapter-failures/aggregate-adapter-failures.workerd.spec.ts)
- The focused Nx run passed 96 tests in 11 files, including all six selected
  Workerd suites, core receipt delivery, Shopping and Tic Tac Toe. The
  `system-worker`, production Worker, native and Shopping typechecks passed.
  Verification used disposable Workerd storage for the changed fixed schemas.

## Service execution placement

The same implementation spec includes pinned Service command execution. The
stable System Worker hosts `ServiceChain`, which admits commands and delivers
each original to `ServiceVersionRepo` on the addressed Service release's
`OwnerReleaseWorker`. Each receiving release replays through its own Repo. The
Repo commits its model changes, materialization checkpoint, and pending
publication in one synchronous transaction. This follows the
[Aggregate execution placement](2026-11-19-handoff-owner-worker-original-execution.md#decision).
Implementation and verification on independently deployed Service Workers are
pending. Preserve [Service canonical publication proof](../adrs/025-canonical-published-history-handoff.md#decision)
when the stable System Worker changes the selected Service release. A pinned
Repo can carry an earlier selection in its bundle.

## Remaining

1. Implement MOR-487 using the settled ADR amendments and the prototype.
   Carry the authored branch API, pinned Worker boundary,
   originating-Chain transaction, and ordered original and replay behavior
   through the SDK, runtime, and in-scope consumers. Keep compatibility and
   storage cutover explicit. The prototype changed fixed Chain and version
   history schemas and used disposable storage.
2. Use the existing Workerd cases as acceptance evidence. Keep coverage for
   valid mapping, omitted command branches, terminal destination admission
   refusal, mapper failure, interrupted admission, and the next valid command
   after pinned replay. The mapper recovery cases forced SQL rollback. Add
   coverage at the pinned Worker call boundary for lost replies and
   unavailable bindings when verifying the complete implementation. Verify
   original Service execution on the addressed Worker and replay on a receiving
   Worker whose bundle predates the originating release. Exercise a valid
   continuation alongside a recorded mapper failure so the check covers source
   validation as well as failure preservation. Carry hosted wiring checks into
   the spec where applicable.
   [Workerd runner](../../packages/system-worker/tests/README.md#running-checks)
3. Reconcile the intended integration base and dependent history work before
   splitting implementation tickets. The prototype shares a dirty worktree
   with Aggregate history and deployment work.
   [Aggregate predecessor catch-up](2026-11-19-handoff-aggregate-predecessor-catchup.md)
   · [Canonical history work](2026-11-19-handoff-remove-canonical.md)

## Deployment work and PR verification

1. Carry the continuation verification into the PR evidence when preparing the implementation for review.
2. **Separate deployment work (P1).** Hosted rollout depends on the [self-hosted deploy manager work](2026-11-19-handoff-deploy-bootstrap-concurrency-spike.md). That work makes `zerospin deploy` enforce one active deployment per Cloudflare account and stable Worker name, across machines. Today `prepareOwnerReleaseBindings` can overwrite a serving owner executable before `stageCandidateDeployment` rejects the stale invocation. Acquire exclusive deployment access before reading the incumbent, including on first deployment. Hold it through owner publication, stable staging, `SystemRepo.acceptSystemSpec`, promotion, initialization, and any rollback. Reconcile uncertain Cloudflare writes before another invocation can publish. Verify that a competing invocation performs no deployment writes while access is held and that an invocation starting after promotion reuses the registered owner binding. [Review finding](https://github.com/morgs32/zerospin/pull/176#discussion_r4633151420)
3. **Owner telemetry secrets (P2).** `deployOwnerReleaseWorker` passes a protected file containing only the available `telemetry.otlp.secretHeaders` values. This applies to newly deployed owner Workers. Registered owner bindings are reused. The CLI build and a simulated Wrangler invocation verified the upload arguments, file contents and permissions, cleanup, and reuse of a registered binding. Hosted verification remains open. Run a command that produces a non-secret log on a newly deployed Aggregate owner Worker and find its execution span and log in the configured provider. [Review finding](https://github.com/morgs32/zerospin/pull/176#discussion_r4633151429)
4. **Live verification.** Exercise Wrangler recovery after `SystemRepo.acceptSystemSpec` commits and the CLI loses the reply before completing registration. Verify that restart selects the original executable bytes. Have the maintainer verify connected-browser reopening under the applicable project rules. Verify owner telemetry on a fresh Cloudflare System. [PR verification status](https://github.com/morgs32/zerospin/pull/176#evidence) · [Shopping verification rules](../../examples/shopping/AGENTS.md)

## Suggested skills

1. `$to-tickets` to slice MOR-487 into independently verifiable work.
2. `$implement` and `$tests` to execute the approved work and verify ordered
   admission, recovery, and replay.

## Pointers

1. [PR #176](https://github.com/morgs32/zerospin/pull/176)
2. [Remote replay adapter research](../research/remote-down-adapter-replay.md)
3. [Owner release deployment](../../packages/cli/src/deploy/utils/prepareOwnerReleaseBindings.ts)
4. [Stable candidate staging](https://github.com/morgs32/zerospin/blob/1b68f70b8e7e6ce2cbcc0c53772b6eddb23fc889/packages/cli/src/deploy/utils/stageCandidateDeployment.ts)
