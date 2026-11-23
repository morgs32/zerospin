# Shared programs and portable operation declarations

**Date:** 2026-10-23
**Status:** Accepted
**Implementation:** [Plan 259](../archive/plans/259-plan-shared-program-command-operations.md).
**Amends:** [ADR 012](012-opaque-external-work-and-originating-chain-continuations.md) for ordinary command authoring and portable external declarations. Recorded observation, continuation authority, originating Chain delivery and original-only work remain governing.

## Context

Ordinary programs and server adapters duplicated business execution and coupled operation authoring to completed releases and provider implementations. Importing those backend declarations prevented browser programs from recording the same commands and external descriptions. Giving ordinary actor commands canonical private reads would bypass their selected-row boundary.

## Decision

Every ordinary aggregate or service contract owns one program, result codec and ordered operation batch. Ordinary programs may record model operations, ordinary destination commands and same-family external work. Guards cannot record operations. Programs collect before application and do not read their own recorded writes.

Browser staging and optimistic replay validate the complete batch, apply only model operations at their original sparse operation indexes, and retain inverse state in model application order. They allocate no destination command IDs and invoke no provider requests. Staging retains its initiating command identity and observation; canonical execution retains the authoritative `outcome`.

`makeCommandOperation` captures an existing pure `defineAggregate` or `defineService` object, an explicit release version and an exact claims-free ordinary contract. System construction and original preparation require the exact registered owner definition and contract object. Serialized family/name/version/payload facts describe the binding and cannot recreate execution authority. Ordinary destination programs may enter the browser import graph; completed releases, authentication, owner guards and provider implementations do not.

Pure `defineAggregateExternalContract` and `defineServiceExternalContract` declarations own payload/response codecs, timeout and immutable emission identity. Backend external constructors consume the exact definition with request and continuation implementations. The emitting owner release binds each pure definition to its exact same-family implementation, including actor claims checks. Recorded continuation authority remains separate from ordinary actor capabilities.

Only original canonical preparation freezes complete destination commands and external work with local model output and encoded result in the existing source transaction. Existing Chains retry the retained immutable work after commit. Source failure retains no dispatchable work; durable destination admission does not establish destination execution success. Replay, extra releases, projections and optimistic rebasing create no fresh outgoing work.

## Amendment of 2026-11-19

**Command-operation continuations.** MOR-487 applies this amendment to both Aggregate and Service operations. [Implementation spec](https://linear.app/morganatwork/issue/MOR-487/admit-ordinary-continuations-and-pin-service-execution-and-replay)

An original command can emit several destination commands, each with its own
frozen outgoing payload. The destination executes one such command and returns
its outcome. The sending release defines how that operation’s payload and the
destination’s execution result become an ordinary continuation command on the
sending Chain. This follows the [external request continuation decision](012-opaque-external-work-and-originating-chain-continuations.md#amendment-of-2026-11-19).

1. Each declared branch names an ordinary continuation contract and an
   Effect-returning payload builder. The builder takes exactly two inputs.
   - `onSuccess.payload({ payload, success })` receives the frozen outgoing
     command payload and the decoded value of the destination’s
     `outcome.result.success`.
   - `onFailure.payload({ payload, failure })` receives the same outgoing
     payload and the destination’s finalized `outcome.result.failure`.
2. The pinned sending release builds the selected contract’s declared payload
   before admission. The sending Chain admits the ordinary continuation under
   that release. Replay consumes the admitted payload under ordinary command
   rules. A later failure of the continuation belongs to its own `outcome`.
3. Branch selection requires a finalized destination execution. The sending
   Chain stores its first `outcome` on `commandOperationOutbox` until settlement.
   A terminal admission refusal emits a structured error log and consumes the
   row. Transport errors, lost replies and admission capacity keep it pending.
   The continuation payload preserves the business facts its author selects.
   [Current settlement decision](https://linear.app/morganatwork/issue/MOR-487/admit-ordinary-continuations-and-pin-service-execution-and-replay)

This supersedes Plan 310’s `{ sourceCommand, outcome }` continuation payload.
Drop the parent-command lookup, the `sourceCommand` callback argument, and the
embedded copy of the parent command in the admitted continuation. The ordinary
continuation’s contract declares the fields it needs. Callers that used
parent-only fields must revisit their mappings during migration.

## Alternatives

Retaining server adapters or adding canonical callbacks would keep two implementations of an ordinary command. Completed-release descriptors would pull backend code into browser imports and obstruct same-owner authoring. Allowing ordinary private reads would change actor authority. Lazy recursive registries add coordination for command graphs that are currently acyclic.

## Consequences

The SDK removes adapter factories/classes/types and execution tags in one breaking release. Authored consumers use ordinary programs directly. Payload-version up/down adaptation remains independent and unchanged. Portable catalogue shapes no longer contain adapter-only execution fields; affected fixed storage requires empty storage under the development cutover policy. This decision authorizes no storage reset.
