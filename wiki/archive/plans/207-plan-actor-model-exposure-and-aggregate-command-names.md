# Actor model exposure, exposed commands and command resolutions

**Date:** 2026-10-16

**Status:** Completed and verified on 2026-10-16. The accepted handoff decisions and names apply to Aggregate and Service Actor architecture. Aggregate Agent physical storage is unchanged.

## Agreed names and boundaries

| Current name                                                        | Implemented name / behavior                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Aggregate and Service actor declaration/runtime/SystemSpec `models` | `exposedModels`                                                                            |
| `IAggregateProjectedCommand` / matching codec / constructor         | `IAggregateExposedCommand`, `AggregateExposedCommandSchema`, `makeAggregateExposedCommand` |
| `IServiceBrowserCommand` / matching codec                           | `IServiceExposedCommand`, `ServiceExposedCommandSchema`                                    |
| Aggregate and Service command-family `projectedCommand*` APIs       | Corresponding `exposedCommand*` names                                                      |
| Actor pending publication                                           | `exposedCommandOutbox` with nullable complete `commandResolution`                          |
| Actor retained selected history                                     | `exposedCommands` and optional child `commandResolutions`                                  |
| `delta`, `selections`, `capturedSelections`                         | Keep their names and semantics                                                             |

`exposedModels` is the actor's exposed model inventory; `selections` chooses resource rows. Canonical `db.models`, owner-release models, contract/guard models and session/lock models keep their independent `models` fields. Preserve limited-model visibility, exact ownership validation, actor update inheritance and selection behavior.

`makeServiceExposedCommand` lives in core beside the Service exposed command type and codec.

The public Aggregate and Service exposed command values retain canonical admitted command `id`, `commandName`, `delta`, nullable recipient-filtered `failure`, the corresponding `aggregateIndex` or `serviceIndex`, and `dispositionChainHash`. The encoded browser values do not gain claims or producer metadata. Keep generic `IBrowserCommand` and meaningful browser transport/read method names. This is a command-family rename, not a global replacement of projection terminology.

Canonical `outcome` remains `{ result: Success | Failure, finalizedAt }`. Service canonical execution packets, their source-history representation, operation arrays and `executionStartedAt` resource-application sample remain outside this change. Remove the redundant `executionStartedAt` column from Service selected publication/history. Aggregate Agent Repo/Chain physical table names, column definitions and indexes remain exactly unchanged; bind genuine Actor and Agent storage separately where declarations were shared. Renamed shared interfaces are not permission to alter Agent storage.

## Actor publication and retained history

Use this structure in both AggregateActorVersionRepo/AggregateActorVersionChain and ServiceActorVersionRepo/ServiceActorVersionChain. `position` below means the concrete `aggregateIndex` or `serviceIndex`; do not introduce a generic SQL column.

```text
ActorVersionRepo.exposedCommandOutbox
  aggregateIndex / serviceIndex       PRIMARY KEY
  dispositionChainHash
  id                                  canonical admitted command ID
  commandName
  delta                               frozen selected transition
  commandResolution                   nullable complete object:
    nodeId                            required
    pushIndex                         required
    sessionName                       required
    claims                            complete original actor claims
    failure                           nullable PublicFailure

ActorVersionChain.exposedCommands
  aggregateIndex / serviceIndex       PRIMARY KEY
  dispositionChainHash
  id                                  UNIQUE
  commandName
  delta

ActorVersionChain.commandResolutions
  aggregateIndex / serviceIndex       PRIMARY KEY, REFERENCES exposedCommands
  nodeId                              NOT NULL
  pushIndex                           NOT NULL
  sessionName                         NOT NULL
  claims                              NOT NULL
  failure                             nullable PublicFailure
  UNIQUE(nodeId, pushIndex)
```

1. A missing resolution means this actor projection owns no private resolution. A present resolution requires every recipient field. Null `failure` records owned success; a supplied failure records owned refusal. Preserve full original claims, including values outside actorPath; reconstruct fixed actor Origin kind/name/version from the immutable bound owner.
2. Resources, materialization head and one complete pending publication commit together in the Repo's synchronous page transaction. The corresponding Actor Chain atomically appends public command plus optional private resolution and acknowledges that complete publication. Delete pending rows only after durable receiver acknowledgement; retain both history relations.
3. Public-row insertion seals its resolution or its absence. Identical retry compares the public row and joined resolution-or-null. Reject changes to either, including attaching a resolution later. No independent resolution insertion API, queue, stream, acknowledgement or lifecycle flag.
4. Recover private progress from the local child relation, with exact Node/session/full-Origin checks, contiguous push progress and the captured Aggregate/Service position bound. Browser replay/live delivery reads one ordered exposed-command stream, joins optional resolution, and discloses failure only to its admitted recipient. Preserve synchronous replay/live handoff.
5. Keep source fanout acknowledgement, Repo execution/resource commit, Actor Chain publication acknowledgement and private `outcome` retention distinct. Do not derive private recovery remotely from AggregateVersionChain or ServiceVersionChain.

## Implementation sequence

1. Preserve unrelated WIP and inspect direct callers and the [local pattern index](../../patterns/index.md). Rename actor model exposure through factories, returned/broad types, updater overrides, validations, spec projection/codecs, authorization and projection readers. Update existing examples, authored fixture declarations, SDK guidance and Explorer authored actor source only.
2. Rename public Aggregate and Service command types/codecs/constructors and their direct core/browser/backend consumers. Remove superseded command-family names without aliases; keep Aggregate Agent physical declarations intact.
3. Give Aggregate Actor storage explicit normalized bindings separate from Agent storage. Implement both Actor pending schemas, atomic publication insertion, immutable duplicate equality including absent resolutions, and acknowledgement-gated pending deletion.
4. Update both retained Actor history readers, checkpoints, snapshot private progress, replay, sockets and broadcasting to query/join local resolutions while preserving exact privacy and contiguous positions. Retain Agent's existing physical history and behavior through its own binding.
5. Amend governing [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md) and [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md), glossary, affected module READMEs and current architecture/pattern documentation. Reconcile Plan 151's current schema inventory without treating implementation as an unperformed table-purpose review. Mark the handoff incorporated into this plan.
6. Update existing verification scenarios only as needed; exercise both success/refusal publication, rollback, exact duplicate retry, changed resolution and forbidden late resolution, privacy/full claims, bounded recovery and Agent schema preservation. Create no test files, fixtures, runners or configuration.
7. Run required scoped checks, resolve in-scope failures, record evidence, then archive this same plan and repair links only when every required check passes.

## Planned files

```text
packages/shapes/src/
  ~ reference descriptors/rendering/encoding (primary-key foreign key support)
packages/core/src/
  ~ aggregateActor/, serviceActor/, declaration/, contracts/make/
  ~ aggregate/make/makeAggregateRelease.ts, service/make/makeServiceRelease.ts
  ~ system/{types.ts,SystemSpecSchema.ts,project/projectActorSpec.ts}
  ~ aggregateSession/, serviceSession/, AggregateNode/, systemApi/
packages/system-worker/src/
  ~ aggregateProjection/, aggregateSessionChain/
  ~ AggregateActorVersionRepo/, AggregateActorVersionChain/
  ~ AggregateAgentVersionRepo/, AggregateAgentVersionChain/ (bindings and API names only)
  ~ serviceProjection/, ServiceActorVersionRepo/, ServiceActorVersionChain/
  ~ AggregateVersionRepo/authorizeSession/, ServiceAccessApi/authorize/
  ~ filterAggregateBrowserCommand/, filterServiceBrowserCommand/
packages/browser/src/
  ~ StandaloneNode/, agentSession/, service-session command consumers
packages/system-worker/test/
  ~ existing authored declarations / direct assertions only
packages/sdk/skills/
  ~ existing declaration-evolution guidance
examples/{shopping,tic-tac-toe}/src/
  ~ existing actor declarations
explorer/src/zerospin/memberActorV1.ts
  ~ authored declaration only; never verify Explorer
scripts/verify-plan140.mjs
  ~ existing acceptance scenarios and assertions
wiki/
  ~ governing ADRs, glossary, current docs/patterns, Plan 151 inventory and handoff
```

## Verification and hard cutover

1. Run the existing scoped Nx graph: `pnpm nx run-many -t lib ts lint test-workerd-ts -p @zerospin/shapes @zerospin/core @zerospin/browser @zerospin/sdk system-worker shopping tic-tac-toe --nxBail`, selecting applicable existing tasks and excluding the disabled Tic-Tac-Toe `tsc:typecheck` task. After build artifacts are stable, run `pnpm nx run system-worker:test-workerd` and `node scripts/verify-plan140.mjs`. Keeping runtime verification after the library graph prevents Shopping Workerd bundling from racing another project's clean/rebuild. Never verify Explorer.
2. Format changed files, check scoped whitespace, and search active source/docs for superseded actor exposure fields and command symbols. Physical Aggregate Agent `projectedCommands`/`projectedCommandOutbox` remain intentional, with the same columns/indexes. Independently meaningful `models` and browser transport names remain valid.
3. Changed fixed schemas require empty affected AggregateActorVersionRepo/Chain and ServiceActorVersionRepo/Chain storage. Serialized actor definitions and enclosing accepted releases require empty affected SystemRepo storage. No reset, deployment, vendor propagation, translation migration, fallback reader or compatibility alias is authorized.
4. Keep this plan active while required verification is failed, blocked, deferred or unrun. Record actual checks separately from source review and prior verification evidence.

## Verification outcome

1. The scoped Nx library/type/lint/Workerd-type graph passed: 29 tasks across the seven explicit projects and their required dependencies; ten tasks used valid cached outputs. All new lint warnings were removed. Thirteen pre-existing `curly` warnings remain outside this change; lint reported zero errors.
2. `pnpm nx run system-worker:test-workerd` passed all 27 tests across six files, including cold activation, blocked publication, real Aggregate/Service receipts and configured Shopping checkout. It ran after build artifacts were stable. An earlier combined run raced Shopping Workerd bundling against a browser clean/rebuild; the final separated run passed without a source/configuration workaround.
3. `node scripts/verify-plan140.mjs` passed all thirteen existing groups against current artifacts. Updated scenarios cover resource/head/pending rollback, acknowledgement-gated deletion, actual resolution PK/FK constraints, immutable public-plus-private retry equality, refusal/full-claims privacy, captured position bounds, contiguous private recovery and rejection of late resolution attachment for both Actor Chains.
4. The source declaration capture was refreshed. Current backend inventory is 14 concrete classes and 50 fixed owner/table occurrences. Aggregate Agent table names, columns, nullability/descriptors and indexes compare exactly with the pre-change snapshot (source-location metadata excluded); the Agent retained table declaration also matches its previous declaration exactly after variable-name normalization.
5. Scoped formatting passed for all 136 changed non-Explorer source/documentation files, and scoped whitespace checks passed. Active production code/current documentation contain no superseded command symbols or actor-owned `models` fields; independently meaningful `db.models`, contract/session/lock models and Agent physical `projected*` names remain.
6. No new test files, fixtures, runners, test configuration, compatibility path, storage reset, deployment or vendor propagation was added. Nx Cloud reported ancillary authorization 401 messages, while the local Nx tasks succeeded. The fixed-schema/accepted-definition empty-storage requirements above remain deployment prerequisites, not an authorization to reset storage.

## Remaining work

None.
