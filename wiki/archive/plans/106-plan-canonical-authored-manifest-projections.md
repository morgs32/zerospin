# 106 — Canonical authored manifest projections

Status: Completed and verified on 2026-10-11. Canonical authored projections, encoded result/history facts and complete lock refusal/mutation isolation are verified.

## Problem and decision

1. [makeSystemSpec](../../../packages/core/src/system/make/makeSystemSpec.ts) separately reconstructs model and contract metadata for agents, aggregate releases, aggregate actors, service releases and service actors. Its service release contract branch omits `externalSpec`, while other owner branches include it. The [aggregate lock builder](../../../packages/core/src/aggregateSession/make/makeAggregateSessionLock.ts) and [service lock builder](../../../packages/core/src/serviceSession/make/makeServiceSessionLock.ts) repeat another projection, with server lock validators rebuilding those same fields again. Some paths read live fields and others read `spec` fields.
2. One pure core projection must own each authored fact. `projectModelSpec`, `projectContractSpec` and owner-specific actor projectors derive serializable data from canonical completed declarations. Existing exported `makeAggregateSessionLock` and `makeServiceSessionLock` are the canonical pure lock projectors; retain their names and typed declaration inputs rather than adding forwarding `project*SessionLock` wrappers. System specification export composes common fact projectors; server validation constructs an exact selected typed declaration, calls the same lock builder, then compares the complete decoded submitted lock once.
3. This is a projection of authored executable declarations, not a new executable registry, serialized contract interpreter or cached system mirror. Model/contract object identity remains the security and operation-binding capability. Different public manifests may include different fields, but their common fields must come from the same projection functions.

## Observable behavior and boundary policy

1. System specs include mapped-original and external response/timeout/retry metadata consistently for aggregate and service owners and actors. Historical failure schemas remain keyed by exact authored contract version. Result schemas continue to distinguish void/null wire results from authored result codecs.
2. Session locks include only the exact public ordinary declaration, using the mapper's original definition. External continuations remain absent. Aggregate actor, aggregate agent and service actor identities remain distinct discriminants; do not collapse their authority policies into one caller record.
3. Locks and system manifests own deterministic ordering of model/contract keys and index definitions. Clone framework-owned serializable fields at projection boundaries; callers cannot mutate authored metadata through a returned spec. Preserve codec-generated JSON Schema documents rather than changing JSON Schema dialect or treating schema equality as executable identity.
4. Bind the server's owner/actor/agent version before projecting its expected lock. Input schemas guarantee wire shape; exact whole-lock comparison guarantees declared metadata consistency. Authentication and business authorization run separately. No submitted lock grants authority merely because it matches.
5. Preserve current strict lock validation and denial categories. Fix the service spec external-metadata omission deliberately. This changes accepted persisted definition content for affected service contracts; follow the fixed-schema/definition hard cutover with empty storage where required. No fallback decoder, alias, translation migration or automatic storage deletion.

## Complete proposed parent shapes

```ts
function makeSystemSpec({ system }: { system: ISystem }): ISystemSpec {
  return {
    systemName: system.name,
    agents: mapValues(system.agents, versions =>
      mapValues(versions, projectAgentSpec),
    ),
    aggregates: mapValues(system.aggregates, versions =>
      mapValues(versions, projectAggregateSpec),
    ),
    services: mapValues(system.services, versions =>
      mapValues(versions, projectServiceSpec),
    ),
  };
}

function projectAggregateSpec(release: IAnyAggregateRelease) {
  return {
    name: release.name,
    version: release.version,
    models: mapValues(release.models, projectModelSpec),
    contracts: mapValues(release.contracts, projectContractSpec),
    actors: mapValues(release.actors, projectAggregateActorSpec),
  };
}

function projectServiceSpec(release: IAnyServiceRelease) {
  return {
    name: release.name,
    version: release.version,
    models: mapValues(release.models, projectModelSpec),
    contracts: mapValues(release.contracts, projectContractSpec),
    actors: mapValues(release.actors, projectServiceActorSpec),
    queries: mapValues(release.queries, projectServiceQuerySpec),
  };
}

function makeAggregateSessionLock(
  declaration: IAggregateSessionLockDeclaration,
) {
  const contracts = publicAggregateSessionContracts(declaration);
  return {
    sessionName: declaration.sessionName,
    origin: projectAggregateSessionOrigin(declaration),
    models: projectSessionModels(getAggregateSessionModels(declaration)),
    contracts: projectSessionContracts(contracts),
  };
}

function makeServiceSessionLock(declaration: IServiceSessionLockDeclaration) {
  return {
    sessionName: declaration.sessionName,
    actorName: declaration.actorName,
    actorVersion: declaration.actorVersion,
    claims: {
      claimsJsonSchema: Schema.toJsonSchemaDocument(declaration.claimsSchema),
    },
    models: projectSessionModels(declaration.models),
    contracts: projectSessionContracts(publicContracts(declaration.contracts)),
  };
}
```

1. `projectContractSpec` owns current metadata, historical failure schemas, original mapped metadata and external declaration metadata. It uses completed declaration fields as one authority and produces serializable copies. It does not execute guards/adapters or resolve registry membership.
2. `projectSessionModels` and `projectSessionContracts` intentionally select the smaller lock schema from these facts and impose deterministic ordering. They are not arbitrary projection modes with conditional fields. Small actor-specific identity and query-schema literals stay inline in their owner-specific projectors.
3. [123](123-plan-session-lock-validation.md) owns version binding, selection and failure classification. It calls `makeAggregateSessionLock` with the accepted actor/agent declaration fields, selected canonical contract versions and model definitions, and `makeServiceSessionLock` with its accepted service actor selection. The complete expected claims schema comes from the authored actor, never submitted JSON. These are the same typed declaration inputs used by current browser/native lock construction; no fabricated executable registry or cast is needed. [131](131-plan-accepted-definitions.md) consumes the decoded exported specification and flattens its already serialized definitions into catalogue entries; it must not invoke authored schema projectors on serialized data.

## File hierarchy and deletion

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
├── packages/core/src/
│   ├── + system/project/{projectModelSpec,projectContractSpec,projectActorSpec,projectOwnerSpec}.ts
│   ├── ~ system/{make/makeSystemSpec.ts,SystemSpecSchema.ts,types.ts}
│   ├── ~ aggregateSession/make/{makeAggregateSessionLock,makeAggregateSessionSpec}.ts
│   └── ~ serviceSession/make/{makeServiceSessionLock,makeServiceSessionSpec}.ts
├── packages/system-worker/src/
│   ├── ~ AggregateVersionRepo/authorizeSession/validateAggregateSessionLock.ts
│   ├── ~ ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/
│   └── ~ SystemRepo/ — accepted definition catalogue integration owned by its plan
└── wiki/
    ├── ~ architecture/ — manifest/lock boundaries
    └── ~ glossary.md — postimplementation reconciliation
```

1. Delete inline duplicated model/contract serialization in `makeSystemSpec`, duplicated lock model/index/contract construction and server copies of that projection. Remove forbidden `Object.entries` record loops in touched code; use `mapValues` and sort explicit key sequences only when order matters.
2. Preserve `SystemSpecSchema` as the receiving data boundary. Reconcile its type and schema definitions with the returned shapes, including only supported authentication policies. The current types still name historical `system`/service authentication alternatives unsupported by current actor constructors; delete unsupported alternatives after the exhaustive producer/consumer check, not through compatibility branches.
3. Studio Explorer, CLI spec comparison/deployment, SystemRepo immutable acceptance, session lock keys and browser/native declarations are affected callers. Do not merge the existing spec and session lock wire contracts merely to share code; they convey different facts to different receivers.

## Sequence, dependencies and verification

1. Implement shared pure projectors and replace the system export before server catalogue or lock validation changes. Coordinate with [105](105-plan-immutable-authored-declarations.md) so projections consume sealed declarations, and with the server ticket/lock and accepted-catalogue plans in the review index. These plans share projectors; only this plan owns their implementation.
2. Replace both lock builders and their spec/key consumers, then change server validators to project expected complete locks. Apply service external spec correction and reconcile schema/types. Keep all authentication and authority checks at their existing required trust boundaries.
3. Use existing declarations to compare aggregate/service/agent system exports and lock manifests, exercise index/key ordering, mapped public versus private definitions, historical failures, encoded result schemas, malformed lock refusal and output mutation isolation. Reuse existing Shopping and Studio fixtures; create no verification artifacts or tests.
4. Use resolved core/system-worker/browser/SDK/CLI Nx gates for implementation. No build, runtime, deployment or network validation was run during this source review. Codec schema equivalence across arbitrary application custom codecs is not established by this proposal; retain exact authored projected equality.
5. Reconcile existing READMEs, architecture citations and glossary after implementation. Create an ADR only for an implemented manifest/definition contract trade-off satisfying all repository criteria. Do not update glossary or create ADRs while planning. Archive after required verification completes.

## Implementation progress — 2026-10-11

System specs, aggregate/service locks and server expected-lock construction share detached sorted model/contract/actor/session fact projections. Existing declaration/source probes passed public mapped-original facts and exclusion of server external continuations; metadata copy isolation was exercised with authored construction. Scoped projector/consumer lint passed with zero warnings/errors.

The explicitly permitted disposable inline matrix now imports the actual Shopping System, aggregate/service releases and agent declaration, plus the existing Studio agent declaration. Their manifests and locks pass the receiving schemas, and common contract/model facts agree. Reversing System registries and owner model/contract/actor/agent-selection records yields identical projections; model attributes and index definitions sort deterministically, including detached partial-index predicates. Service external response/timeout/retry metadata matches its exact declaration. Mapped public locks retain original ordinary facts and exclude external continuations.

Actual aggregate/service lock validators accept their canonical locks. Seven changes to session name, model metadata, claims schema, or service result schema refuse with the existing family denial categories; changed agent locks refuse through the shared complete-lock comparator, and malformed locks fail their receiving schemas. Aggregate/service upgrades of existing declarations retain distinct exact `1.0.0` and `2.0.0` failure documents. Result projections match the encoded `NumberFromString` schema and string encoding while preserving the distinction between an omitted void result and an authored null codec. Mutating returned System, agent-selection, contract-history, model/index, and lock facts cannot change authored metadata or a subsequent projection. Lock key computation uses its existing asynchronous crypto Effect; no transaction, remote service, or executable serialized registry is constructed by these probes.

### Verified source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

## Completion evidence — 2026-10-11

- The required existing-declaration projection and refusal matrix is verified. Final source/consumer gates and glossary, ADR, review-index and source citations are reconciled. Arbitrary custom-codec schema equivalence is outside the claimed acceptance policy; exact authored projection equality remains required.

## Remaining work

None. Required bounded runtime cases, affected source and consumer checks, and documentation reconciliation are complete.
