# Opaque external work and originating-chain continuations

**Date:** 2026-10-14

**Status:** Accepted
**Authoring amendment:** [ADR 020](020-shared-programs-and-portable-operation-declarations.md) replaces ordinary server adapters with one shared program and separates portable external declarations from backend implementations. Ordinary destination commands use exact registered command descriptors; provider I/O retains the opaque external request boundary below.
**Partial supersession:** [ADR 016](016-aggregate-original-operations-and-external-work.md) supersedes the Aggregate and Service original-output, external-request ownership and duplicate-recovery portions below. Admission Chains now run requests; complete AVC/SVC packets retain all operations. Other governing rules remain unchanged.

**Implementation:** [Plan 150](../archive/plans/150-plan-opaque-external-work.md) completed the original cutover. The [November 19 amendment](#amendment-of-2026-11-19) is tracked in [MOR-487](https://linear.app/morganatwork/issue/MOR-487/admit-ordinary-continuations-and-pin-service-execution-and-replay) and implemented in [PR #176](https://github.com/morgs32/zerospin/pull/176).

**Superseded decisions — command provenance (2026-10-25):**
[ADR 023](023-flat-command-origins-and-claims-free-continuations.md) replaces copied
parent Actor/Agent authority with claims-free immediate-parent Continuations,
object command origin with scalar flat fields, and nullable Actor producer metadata
with a required Node tuple. Both administrative command APIs are System-only.
Statements below about frozen Origin/claims inheritance or null Actor producer
fields are historical. Independent ordering, external request ownership/retry,
exact release, atomic recording, history and privacy decisions remain active.

## Amendment of 2026-11-19

This amendment replaces the original decision’s admitted external command and
its continuation guard and program. The previous design required a replaying
release to interpret the frozen request payload and provider observation using
the source external contract. An older pinned executable can lack that contract
and stall at an otherwise valid command. [PR #176 replay finding](https://github.com/morgs32/zerospin/pull/176#discussion_r4633065231)

1. AggregateChain or ServiceChain retains the first request observation. The
   exact originating release supplies the branch declaration. Each branch names
   an ordinary continuation contract and an Effect-returning payload builder.
   - `onSuccess.payload({ payload, response })` receives the frozen operation
     input and the decoded provider response. A usable payment response of
     `declined` selects this branch.
   - `onFailure.payload({ payload, failure })` receives the frozen operation
     input and the recorded `ExternalRequestFailure`. A payment request that
     timed out can select a command that marks the purchase for reconciliation.
2. Before admission, the originating release builds the payload from those two
   inputs. The originating Chain admits the ordinary command with the stable
   child ID, the original owner release, and the selected continuation contract’s
   name and version. A successful mapper supplies an encoded payload. When the
   mapper fails or the selected contract cannot encode its output, the Chain
   retains that failure before admitting a command with SQL NULL payload.
   Recovery reuses the recorded observation and mapper failure. The child and
   removal of pending work commit together.
3. Each receiving release evaluates the admitted payload under ordinary command
   replay rules. A SQL NULL payload advances ordered original execution and replay
   with the mapper failure as the outcome and zero operations. This path works
   even when the receiving release lacks the selected contract. The request
   observation selects a branch once for that operation. A subsequent guard or
   program refusal belongs to the ordinary continuation command’s own `outcome`.

This moves the provider-specific response decoding and field selection to the
originating release. The ordinary continuation can evolve its own payload
schema. Its command history carries the fields its author chose to preserve.
The ordinary continuation retains its own execution outcome. The external
operation’s `onFailure` branch handles a recorded request failure.
[External request continuation](../glossary.md#external-request-continuation)

Command operations use the same branch pattern with the frozen outgoing command
payload and the destination command’s execution success or failure. [ADR 020 command-operation amendment](020-shared-programs-and-portable-operation-declarations.md#amendment-of-2026-11-19)

## Context

External requests currently combine authored remote work with framework routing to another aggregate or service. That makes an external operation carry an alternate continuation address and duplicate its emitting repo's identity. Replay also retains async descriptions that cannot run. The [opaque-work handoff](../archive/handoffs/2026-10-14-handoff-opaque-external-work.md) settles a simpler boundary: the author owns the request internals, and the framework durably records the invocation and returns its result to the originating admission chain.

This decision supersedes [ADR 001](001-async-replay-retains-output-without-production.md) and [ADR 010](010-source-owned-addressed-async-continuations.md). [ADR 005](005-ordered-original-execution-and-finalized-replay.md), [ADR 008](008-ordinary-and-recorded-continuation-authority.md) and [ADR 011](011-author-owned-external-request-retries.md) retain their independent ordering, authority and retry rules, with the external-work boundary below.

## Decision

`external.request({ payload })` is an opaque authored Effect. The framework retains the exact external contract name/version, frozen payload, stable invocation and child identity, authority, and outcome required for recovery. Provider endpoints, recipients, remote commands, retries and idempotency belong to the author. The framework does not interpret a request destination.

Only the VersionRepo that executes the original command persists or runs its external operations. Resolve each external declaration in that repo's authored release. Keep external work in the concrete AggregateVersionRepo and ServiceVersionRepo databases. [ADR 013](./013-aggregate-delivery-history-and-projection-ownership.md) replaces the retained `asyncOperations` lifecycle with complete `externalOperationOutbox` and `externalCommandOutbox` pending messages; parent lineage survives only while delivery is pending. Remove `receivingAddress` and `emissionOwnerKind`, `emissionOwnerName`, and `emissionOwnerVersion` without substitute fields, aliases or a generic routing envelope. Delete redundant `sourceOwner`/owner-kind dispatch metadata wherever the concrete repo or chain already supplies that identity; preserve complete child proof. [Plan 152](../archive/plans/152-plan-aggregate-chain-command-storage.md) removes command/external-work `systemName`: bound repositories and capabilities establish System ownership, while authored System/session configuration names retain their independent purpose.

A recorded result returns to the originating admission chain. Derive aggregate routing from source System, aggregate name and instance ID, or service routing from source System and service name. The continuation command retains the original `aggregateVersion` or `serviceVersion` and exact frozen `externalContractVersion`; never select the latest release. Normal chain admission, ordered original execution and version replay remain intact; returning to the originating chain does not restrict all continuation execution to one VersionRepo. There is no alternate continuation destination.

Retain immutable first outcomes, stable external command IDs, frozen authority and complete source proof while delivery is pending. After admission, the Chain owns the complete command and outcome; pending parent lineage is deleted. `externalOutcome` is a flat `{ _tag: 'Success', success, recordedAt }` or `{ _tag: 'Failure', failure, recordedAt }` union, with null outside the union for no recorded observation. Success contains the exact contract-encoded external response; failure has a public external request type distinct from command failures. Recording either branch and enqueueing its continuation are one synchronous transaction. A successful JSON null remains explicit. The first recording time is copied unchanged through retries and delivery.

Recorded child reconstruction and delivery recovery use the entire frozen observation without rerunning the request, consulting a live declaration or looking up the source command. Recorded ingress proves the child against the originating VersionRepo before local atomic admission; its authority comes from that release's external declaration and retained observation, independently of the ordinary actor allowlist. Ordinary callers cannot submit either observation branch.

The authored continuation handles either decoded outcome branch. An external failure can produce a successful continuation `commandOutcome`; it never automatically refuses the continuation or changes the originating command's result. Request failure establishes no usable response, not failure of the remote side effect. Authors own reconciliation, using stable provider keys or remote command identities. Later reconciliation is a new observation, not an overwrite of the first outcome. This replaces Plan 150's no-child terminal failure policy.

Authors retain request retryability, bounds, delays and provider idempotency or reconciliation under ADR 011. Keep configurable `timeoutMs` with its 30-second default around the complete invocation. Alarms recover original work with no committed response or failure; recorded failures remain terminal. Child delivery has independent recovery. A lost unrecorded invocation may repeat external work, so exactly-once provider effects are not promised.

Replay evaluates its version's program and applies model changes, but persists no async-operation rows. Replica output carries no async-work descriptions. Retained model `operationIndex` values remain their original authored ordinals after async entries are omitted; never renumber them. Model validation requires safe nonnegative, strictly increasing, unique indexes and correct command/family position association without requiring dense array indexes. Each admitted continuation still replays normally as a command with its own frozen payload and recorded external outcome.

Shopping now co-owns carts and purchases in the user aggregate ([Plan 156](../archive/plans/156-plan-command-query-checkout.md)). Checkout freezes purchase lines and schedules a user-owned external request that calls Marketplace's read-only `quotePurchase` through its existing authenticated SystemApi capability. The recorded outcome returns to the user admission chain; a guarded continuation stores authoritative pricing before scheduling keyed payment. Provider routing remains authored request data without a receiving address. Ordinary cross-owner commands use the command operation boundary in ADR 020.

## Alternatives and consequences

Keeping addressed callbacks makes remote business orchestration part of framework external-operation routing and duplicates source identity in every row. Provider orchestration may use authenticated commands or read-only queries inside the authored request; its own authorization and idempotency remain explicit at that boundary. Ordinary recorded commands use the separate exact destination binding in ADR 020.

Retaining inert replay emissions preserves additional historical output, but blurs which repo owns actual durable work and carries unusable async descriptions through replicas. Dropping that history makes ownership explicit while preserving replayed model changes and normal continuation-command replay. Sparse authored indexes retain correct model associations when async entries are omitted.

This is a pre-release hard cutover. Changed fixed schemas require empty affected storage. No compatibility aliases, dual paths, fallback decoders, translation migrations or row preservation are allowed. This accepted decision does not authorize a local or live reset. Plan 150 records implementation, existing verification and documentation reconciliation. Provider delivery, deployment and local/live storage resets are outside that completed source cutover.
