---
name: zerospin-author-feature
description: >-
  Use when designing a Zerospin feature, adding models or ordinary commands,
  choosing aggregate versus service ownership, or registering a feature in a
  System. Route provider effects to zerospin-external-work before designing
  models. Browser/React session setup is a separate task.
metadata:
  purpose: Define owned data and typed ordinary commands with exact release registrations.
  type: core
  library: '@zerospin/sdk'
  library_version: '37.1.0'
requires:
  - zerospin-parallel-models
---

# Author an owned Zerospin feature

First load `pnpm exec intent load @zerospin/sdk#zerospin-parallel-models` and
apply its model-data invariant throughout this task.

Follow the [System registry rule](../zerospin-parallel-models/SKILL.md#system-registry-changes):
present exact before-and-after snippets and obtain the user's approval before
changing `system.ts`.

Before proposing models or coordination, trace the user action through existing
models, commands, session selections and queries, and Agent behaviors. Identify
what each consumer needs to observe and which actions must execute durably.
Session selections may already expose the required domain facts; verify which
component owns subsequent execution rather than assuming observation supplies
orchestration. Add fields, contracts or coordination only for demonstrated gaps.

Browser service data belongs in authenticated actor selections and a service
session's local query database. Services do not declare named query callbacks,
and an aggregate session has no general service-read capability. Backend-only
administrative reads use typed SystemApi selections; do not introduce a read-only
command merely to retrieve another owner's facts.

If completing the action requires a provider call, load
`pnpm exec intent load @zerospin/sdk#zerospin-external-work` and design the
command → external request → recorded continuation flow first. Derive persisted
domain fields from what callers need to observe. Do not duplicate framework-owned
pending work or continuation history in application models.

1. Read the application's existing declarations and installed SDK types. Choose
   an aggregate for independently identified instances or a service for shared
   data. Keep every model and recorded mutation inside its owner; resource IDs
   and aggregate instance IDs are different identities.
2. Import shared models, ordinary contracts and primitives from
   `@zerospin/sdk/browser`; use `@zerospin/sdk` for owner releases, `makeSystem`
   and `makeConfig` in the backend graph. Put each concrete version in its own
   defining file and [call the Zerospin constructor directly with an inline object literal](../zerospin-parallel-models/SKILL.md#call-zerospin-constructors-directly).
   Authored versions are positive safe integers, starting at `1`,
   and advance independently per named declaration. Register releases with numeric
   keys such as `{ user: { 1: userReleaseV1 } }`. A containing release's new version
   does not bump unchanged models or contracts. Import declarations directly and
   list models explicitly.
3. For a new declaration, author with `makeModelVersion` and
   `makeAggregateContractRelease` or `makeServiceContractRelease`. Changes to an
   existing declaration **must use its matching upgrade API** and the exact prior
   declaration; load `@zerospin/sdk#zerospin-evolve-declarations` first. Do not
   create disconnected V2 declarations. Put every business input in `payload`, including
   named IDs such as `instanceId` or `reservationId`. Declare readable `models`
   as `{ model, fields: [...] }` projections and query with `db.models` inside
   the guard or program. The ID is always available; an empty field list grants
   an ID-only read. Declare every other field used in results, filters, ordering
   or relations. The selected owner model must retain the projected read shape.
   Recheck
   existence, ownership and current eligibility on every evaluation. Named
   `operations` grant exact recording permissions; their `resourceId` identifies
   the resource being changed. Guards read invocation state
   and claims, refusing through inline declared `failures`. Programs yield or
   return recording Effects and return only the domain result. Declare its
   result codec when needed; omission means void. Evaluation collects a checked
   batch and applies nothing; the surrounding transaction applies it. Keep
   provider callbacks outside ordinary guards/programs. The same program may
   record model, command and same-family external operations. Browser
   staging validates the complete batch and applies only model operations.
   Only original execution on the addressed owner release prepares outbound
   work. Reads do not see model changes recorded earlier in the batch.
4. Register every contract with its owner release using the exact shared
   declarations.
   If the contract is not on an aggregate/service release it's not supported.
   Actor, Agent and session exposure and runtime lineage do not grant
   support independently. New commands use the exact contract version registered
   on their addressed release; replay may adapt historical payloads. A session
   bound to a registered noncanonical release can invoke the contracts granted
   by that release without promoting it. An older release that lacks the new
   command retains a local unsupported outcome without applying its operations,
   so do not assume its view includes the newer command's effects. Only
   session-invoked contracts also require registration
   in the actor capability and session's public contract map. Internal system commands,
   including aggregate provisioning through `authorize.executeCommand`, remain
   outside those public maps. Ordinary guards also
   run authoritatively; owner guards add distinct policy. Assemble owners with
   `makeAggregateRelease` or `makeServiceRelease`, then register them in
   `makeSystem`. Name/version keys must match. Preserve the deployed `systemId`;
   keep provider requests, external continuation implementations, owner guards
   and authentication outside the browser graph. The ordinary program and its
   pure command/external operation definitions stay shared. Ordinary actor commands retain
   selected-row reads; use an explicit claims-free internal ordinary command for
   canonical private derivation.
   Each completed Aggregate, Service or Agent Release owns an eager readonly
   `.spec`: detached, recursively frozen portable metadata. Declare all contract
   upgrades before `makeSystem`; successful composition finalizes every reachable
   lineage node and refuses later extension, including through a shared System.
   `makeSystemSpec` compiles exact release bindings and complete owner-scoped own
   contract-version facts, including historical codecs, then returns one immutable
   SystemSpec with its canonical hash. Authors provide no second registry.
   SystemRepo accepts the whole snapshot atomically; startup and session-ticket
   issuance require the actual compiled hash instead of repeating structural
   comparisons. Historical metadata grants no fresh-command support. Callback and
   executable codec/adapter bodies remain outside the spec guarantee; session-lock
   fields stay selected-version facts.
5. Run existing application type/build checks, including its browser bundle.
   For contained backend behavior checks, load
   `pnpm exec intent load @zerospin/sdk#zerospin-test-authored-behavior` and follow
   the [testing skill](../zerospin-test-authored-behavior/SKILL.md).

When authoring an ordinary create command or wiring its registrations, read the
[ordinary feature example](references/ordinary-feature.md).

## Stable model IDs and local relationships

Import `modelId` and `modelRef` from `@zerospin/sdk/browser` and use stable
`defineModel` identities. `modelId({ model: site })` declares an ID value, including
payloads and cross-owner IDs. `modelRef({ model: site, relation: 'site', inverse: 'pages' })`
adds a local SQL/query relationship. The owning aggregate/service release selects
the Site version. Neither helper retains another model's `.table` object or grants
model authority. Generic SQL tables declare scalar `references` metadata using
logical table/column names. Keep model and operation declarations exact within
the owner.

## Independent Agent releases

An Agent release is its own session definition. Use `makeAggregateAgentRelease`
or `makeServiceAgentRelease` from `@zerospin/sdk/browser`. Bind the exact owner
with `aggregateName`/`aggregateVersion` or `serviceName`/`serviceVersion`; do not
import the server-side owner declaration into a browser definition.

Declare `agentName`, `agentVersion`, `sessionName`, `db`, `selections`
and `contracts`. For each grant, import the canonical owner contract as a type,
create `makeAgentCommandRef<typeof contract>(name, version)`, and pass the same
reference to `yield* stageCommand(ref, payload)` in a wake callback. System assembly validates the models, selected
fields, wake selections and claims-free ordinary contract
grants against the registered owner release. Owner `contracts` registers
permission-neutral contracts; only `system`, Actor or Agent grants authorize
invocation. External requests belong in command execution.

Selections use structured query conditions only. `RAW`, SQL callbacks and hidden
fields are rejected. Relation predicates operate on the related model's selected
rows, so declare that model's selection too. Dependency cycles are rejected.

Register independently of the owner's immutable composition:

```ts
const system = sdk.makeSystem({
  name: 'shopping',
  aggregates: {},
  services: { promotion: { releases: { 1: promotionV1 }, canonical: 1 } },
  serviceAgents: {
    promotion: {
      reservations: { releases: { 1: reservationsAgentV1 }, active: 1 },
    },
  },
});
```

The active Agent may change without a new owner release. Its exact owner binding
is independent of `canonical` history adoption. Delete the Agent entry to stop
its callbacks and abandon its outstanding deliveries.

Declare each selected model with a flat `findMany()`. Each optional named entry in the sibling `wakeRules` map refers to one selection by name. Return an absolute millisecond deadline or null from `wakeAt({ row, db })`. Synchronous queries such as `db.query.purchaseItem.findMany({ where: { purchaseId: { eq: row.id } } }).sync()` read the confirmed selected view. A delta that changes a related row can change the anchor’s deadline. Equal deadlines preserve a consumed wake.

The wake program receives `resourceId` and `at`. Use `yield* stageCommand(ref, payload)` to obtain the typed local result. Subsequent synchronous reads in the callback include that stage’s model changes. The Node commits wake consumption and frozen command deliveries together. Owner history confirms the command by ID, including when it produces an empty selected delta. Persist obligations in owner models when they must survive release replacement.

See Shopping's `reservationsAgentV1.ts` for a complete authored example and
[Agent execution](https://github.com/morgs32/zerospin/blob/main/wiki/architecture/server/AgentExecution.md) for
runtime ownership, catch-up and recovery.
