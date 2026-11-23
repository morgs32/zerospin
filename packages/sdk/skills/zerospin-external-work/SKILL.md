---
name: zerospin-external-work
description: >-
  Use when an ordinary Zerospin program records destination commands or provider
  requests, or when authoring recorded external commands. Model-only commands
  and client submission are separate tasks.
metadata:
  purpose: Record ordered commands and external work from one shared program and finalize provider evidence through owned continuations.
  type: core
  library: '@zerospin/sdk'
  library_version: '46.0.0'
requires:
  - zerospin-parallel-models
---

# Author recorded commands and external work

First load `pnpm exec intent load @zerospin/sdk#zerospin-parallel-models` and
apply its model-data invariant throughout this task.

Before choosing a mechanism, distinguish an ordinary command in another owner,
a provider request, and observation of existing domain facts. Use
`makeCommandOperation` for an ordinary command explicitly granted in the destination release's `system` map; inspect session selections and
queries for the facts consumers need. Browser reads stay within authenticated
service sessions and their selected local rows. Private backend observations use
SystemApi typed service selections, not named service queries or read-only
commands. Recording a command does not return the destination's retained
`outcome` synchronously. When follow-up work depends on the destination outcome,
declare a release-bound command continuation. A browser session is not needed to
trigger it. Use session selections to observe domain facts and backend Agent
behaviors only when their separate lifetime and coordination fit the requirement.

Separate provider effects, private material and observable domain results.
External implementations are registered only in the originating release's `external` map. Ordinary Actor, Agent and System grants may reuse the same exact release; command operations require an explicit destination `system` grant.

External responses become retained continuation input; keep private credentials
out of responses that must not retain them, returning an opaque private reference
and safe evidence instead. Explain what the originating Chain already owns
before proposing application checkpoints or lifecycle models. Retain additional
recovery state only for a concrete provider interruption or partial-completion
requirement; external contracts do not guarantee exactly-once provider effects.

1. Keep one ordinary program in `@zerospin/sdk/browser`. Its named `operations`
   may include model, command and same-family external operation definitions. Both
   optimistic staging and original execution validate the complete ordered batch and
   declared result. Browser staging applies only model operations, preserving
   sparse authored indexes and undo order; it allocates no destination command
   IDs and runs no requests. Original execution on the addressed owner release
   prepares complete outgoing intents and commits them with model changes, encoded result and
   `outcome`. An escaping failure retains no successful output or dispatchable work.
2. Ordinary actor programs retain actor-selected rows and exposed columns.
   Guards receive no operation methods, and reads do not see model changes
   recorded earlier in the batch. Derive command payloads from validated input
   and permitted current reads. If private derivation is required, record a
   command to an explicit claims-free internal ordinary contract; that contract
   can read its owner's canonical models when invoked with System Origin.
3. Record an ordinary destination command with browser-safe
   `makeCommandOperation({ destination: { service: ownerDefinition, version: 1 }, contract })`.
   Aggregate destinations use `{ aggregate: ownerDefinition, version: 1 }` and
   additionally require `aggregateId` in the recording method's arguments.
   Use the exact `defineService`/`defineAggregate` object retained by the completed
   release and the exact completed claims-free ordinary contract. System
   construction and original preparation resolve and check both objects.
   Matching portable names confer no execution authority. Application code never
   supplies destination command IDs, kind or transport. The source Chain
   delivers the original frozen command with scalar `kind: 'system'` until
   durable admission acknowledgement. An ordinary recorded command remains a
   System command even when a continuation emitted it. The source Chain delivers
   operations independently and retains each final destination `outcome`, even
   without a continuation. A terminal admission refusal is retained separately
   and does not invoke a continuation. Destination execution refusal does not
   rewrite source success. Interrupted delivery reuses the frozen command ID.
4. Declare provider work with browser-safe `defineAggregateExternalContract` or
   `defineServiceExternalContract`, supplying name, version, payload, response
   codec and optional timeout. Declare its exact `.externalOperation` in the
   initiating program and record payload alone. Keep the pure definition in a
   provider-free module. The backend consumes it with
   `makeAggregateExternalContractRelease(definition, { request, onSuccess, onFailure })` or the
   Service equivalent. Give each branch `{ contract, payload }` and register
   the exact claims-free ordinary contract in the emitting release's
   `contracts` inventory. Keep the provider implementation in backend files.
5. Use an Effect payload builder. The success builder receives the frozen
   outgoing `payload` and decoded `response`. The failure builder receives
   that payload and `failure` from the retained request observation. A usable
   business decline selects success. The owning Chain persists the first
   observation before invoking the builder in the exact emitting release.
   It appends one ordinary command at a stable ID and consumes pending work
   atomically. Model reads and mutations belong in the ordinary command.
6. Author bounded retries and business idempotency inside `request`. The
   definition's timeout defaults to 30 seconds and covers the full invocation.
   A request failure may admit a reconciliation command. Uncertain process
   loss before recording an observation can repeat the request. Recovery
   with a retained observation retries completion admission with that observation.
7. Use the same branch form on `makeCommandOperation` for a destination
   command result. `onSuccess.payload` accepts `{ payload, success }` and
   `onFailure.payload` accepts `{ payload, failure }`. The frozen payload
   is the destination command input. The pinned source release builds and
   encodes the branch command in its ordinary contract.
8. Select a command-operation branch from the destination's finalized
   execution. The originating Chain keeps the first execution outcome on the
   pending row until it admits the continuation and clears the row atomically.
   Terminal admission refusal is logged before the pending row is consumed.
   Authors choose which business facts the continuation payload preserves.
   Each admitted continuation records its own `outcome`.
9. For server-only Aggregate work following a shared ordinary contract, register
   `makeAggregateContractExtension(source, { models, operations, program })` in
   the owning release's `extensions` map under that source command name. Give it
   its own read projections and exact operations. Shared model operations apply
   before extension evaluation; extension model operations and outgoing intents
   commit in the same source transaction. Failure rolls back both. On first
   replay in another release, its extension runs only if the originating release
   also declared one for that command. It applies target-release model effects
   without dispatching outgoing work again; retained-output reconstruction does
   not reevaluate it. Use this boundary when a browser-safe shared contract
   needs server-owned derivation.

For shared authoring, provider recovery, or originating-chain delivery, read
[recorded external work](references/recorded-external-work.md).

Source replay, additional parallel releases, projections, optimistic rebasing and
retry recovery create no fresh outbound work or destination command IDs. Frozen
delivery retries reuse their original command. Destination releases replay their
own admitted command history. Changing historical derivation does not regenerate
downstream commands; changed downstream facts require an explicit new source
command. Projections apply model operations only.
