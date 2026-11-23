# Flat command fields and explicit continuation provenance

**Status:** Complete; source implementation and scoped verification passed. 2026-10-25.

## Problem and outcome

1. Canonical commands currently combine an `origin` JSON authority object with a separate nullable Node tuple. That permits combinations which admission later rejects and makes Actor identity, submission position, and external-result provenance overlap.
2. Replace canonical command provenance with a flat discriminated union: scalar `origin: 'actor' | 'agent' | 'system' | 'continuation'`, with each variant's data at the command root. Remove command `origin` JSON from SQL; preserve ordinary indexed columns and JSON only where data is genuinely structured, such as Actor `claims`.
3. External continuations are claims-free commands caused by the immediately preceding command that emitted their external work. They do not inherit Actor claims, Actor-specific guards, or Node submission positions.
4. Ordinary Actor submissions require complete Node metadata. Privileged administrative callers submit System commands; the Service API's current direct Actor-command exception is removed.

## Baseline and constraints

1. Implement against the current development checkout, including the owner-local Agent and factory-owned declaration work in [Plan 264](264-plan-owner-local-agents-and-node-selection.md) and [Plan 263](263-plan-factory-owned-release-specs.md). Preserve unrelated WIP. Current duplicate readers are `readRetainedCommand` and `readRetainedServiceCommand`; do not recreate the deleted `recoverRetainedCommand` helpers.
2. This changes public command codecs, TypeScript command shapes, and fixed persisted formats. It is a hard cutover, without compatibility aliases, dual decoders, old-shape fallbacks, or data translation. This plan authorizes no storage reset, deployment, or publication. Those operational actions require the appropriate explicit authorization.
3. Keep model writes command-driven, synchronous transaction/savepoint boundaries, immutable original input, original-only external production, retained replay, existing ordering and private-completion guarantees.
4. Keep the implementation concrete. Extend existing schemas, row boundaries, and family-specific procedures; introduce no generic provenance factory, envelope wrapper, new transport, or speculative authorization/delegation mechanism. Use existing `I`-prefixed type names where possible and infer variant types from their schemas.

## Agreed command contract

1. Preserve common command fields: canonical `id`, exact command name/version, encoded or decoded `payload` as appropriate, exact owner name/version and Aggregate ID where applicable, and execution/admission fields supplied by their existing stages.
2. Every submitted canonical command has one scalar origin. Variant-only fields are absent from other command variants, rather than optional fields on a wide interface:
   1. `actor`: required `actorName`, `actorVersion`, complete encoded `claims`, nonempty `nodeId`, nonempty `sessionName`, and positive safe-integer `pushIndex`.
   2. `agent`: required `agentName` and `agentVersion`, retaining the current owner-local Agent binding. No Actor claims, Node tuple, or continuation parent.
   3. `system`: no Actor, Agent, Node, claims, or continuation-parent fields.
   4. `continuation`: required `originCommandId`, using the command ID codec. No Actor, Agent, claims, or Node fields.
3. Ordinary Actor/Agent/System commands have `externalOutcome: null`. A continuation requires a complete non-null external Success/Failure observation. Preserve the distinction between a successful external JSON `null` and absent external input.
4. `originCommandId` identifies the **immediate producing command in the same owner Chain**, not the root Actor command. The continuation keeps its own frozen `id`. Several operations emitted by one parent retain distinct child IDs; the parent ID is neither a provider idempotency key nor a substitute for the existing external work occurrence.
5. Define concrete Actor, Agent, System and Continuation command schemas from the existing family/common fields; compose the complete Aggregate/Service unions. Ordinary ingress accepts only Actor/Agent/System variants. External-result recording accepts the Continuation variant. Remove positional schema coupling such as `EncodedAggregateCommandSchema.members[0]` and Service protocol `members[1]` selection; reference the appropriate concrete variant.
6. Use `Schema.is(ActorCommandSchema)(command)` and the corresponding concrete schemas where full variant checks aid the typed program. Unknown input is decoded once by the owning boundary. Do not re-decode the whole wire command in typed owner procedures or use a failed Actor predicate as permission to treat malformed Actor input as System. Reject mixed-origin field combinations at command boundaries.
7. Stable authenticated session identity and declaration locks remain distinct from canonical submitted commands. Keep actual claims and Actor/Agent identity in their existing session/ticket representations; do not add `pushIndex` to locks or stable identity. Local Actor command drafts also use scalar origin and flat Actor fields, but remain a separate input schema without an allocated Node tuple; they become valid submitted Actor commands only when the Node retains/submits them. Do not preserve object-origin drafts as a second command format. Public browser frames continue to omit full provenance and claims.

### Annotated command examples

```ts
// 1. Common Aggregate/Service fields are omitted from these examples.
//    An ordinary Actor submission has a complete producer position.
const actorSubmission = {
  origin: 'actor',
  actorName: 'web',
  actorVersion: 1,
  claims,
  nodeId,
  sessionName,
  pushIndex,
  externalOutcome: null,
};

// 2. A continuation carries its immediate cause, not inherited Actor authority.
//    If B emitted this work after being caused by A, this value identifies B.
const continuation = {
  id: externalCommandId,
  origin: 'continuation',
  originCommandId: producingCommand.id,
  externalOutcome,
};
```

## Storage and immutable input

1. Change the four canonical command-row declarations: AggregateChain commands, ServiceChain commands, AggregateVersionChain evaluated commands and ServiceVersionChain evaluated commands. Their `origin` column becomes scalar text constrained by the command codecs.
2. Store applicable provenance exactly once in flat columns: `actorName`, `actorVersion`, `claims`, `agentName`, `agentVersion`, `nodeId`, `sessionName`, `pushIndex`, and `originCommandId`. `claims` stays JSON. SQL uses null for inapplicable variant columns; canonical command codecs reconstruct the corresponding branch with those fields absent. Row encode/decode boundaries reject contradictory combinations instead of adding optional-field guards throughout callers.
3. Preserve `UNIQUE(nodeId, pushIndex)` and existing latest-Node-position queries in both admission Chains. Keep canonical ID uniqueness and owner order indexes. Do not add JSON-expression indexes, duplicated provenance JSON, derived producer counters, or a new producer table.
4. Update existing row encode/decode and immutable-input comparison paths in both admission and evaluated history. Compare every applicable flat field, including claims and continuation parent; ignore only the same mutable delivery/execution metadata excluded today. Preserve exact retained ID recovery before current release/contract lookup.
5. A row's parent ID is causal data, not foreign authority. No runtime parent traversal, Actor-claims hydration, cross-owner lookup, or new parent-history dependency is needed for recording or executing a continuation. Existing bound owner fields provide the parent lookup scope for inspection.
6. Audit retained publication, delivery, projection and harness records which carry complete commands. They must use the same logical flat command variants; do not accidentally flatten full Actor claims into public browser command frames.

### Annotated persistence example

```ts
// 1. Logical command variants share one relational command table.
//    These are ordinary columns; no origin JSON envelope remains.
origin: primitives.text(),
actorName: primitives.text({ nullable: true }),
actorVersion: primitives.integer({ nullable: true }),
claims: primitives.json({
  schema: Schema.Record(Schema.String, Schema.Unknown),
  nullable: true,
}),
nodeId: primitives.text({ nullable: true }),
sessionName: primitives.text({ nullable: true }),
pushIndex: primitives.integer({ nullable: true }),
originCommandId: primitives.text({ nullable: true }),

// 2. Preserve the existing SQL uniqueness/lookup key.
//    Agent/System/Continuation rows have null Node columns.
indexes: [{
  name: 'commands_node',
  columns: ['nodeId', 'pushIndex'],
  unique: true,
}],
```

The snippet omits unchanged fields and the nullable Agent name/version columns. Nullability belongs to the shared SQL row; it does not weaken the Actor command schema.

## Continuation production and authority

1. Preserve the existing frozen external child ID, exact external contract/version, payload, emitting owner release and sparse operation index/history. Remove copied parent Actor/Agent/System authority from prepared external work. Retain the existing immediate `initiatingCommandId` in prepared descriptions where needed; enclosing evaluated commands already provide this context in retained operation arrays, so do not duplicate it there.
2. When the originating Chain commits a successful original receipt and inserts pending external work, replace pending `origin` JSON with scalar `originCommandId: input.id`. The pending row otherwise retains the same child ID, exact contract/version, payload and emitting owner version. No extra parent lookup or request allocation is required.
3. Record an observation only through the existing pending-work path. Read the exact row by `externalCommandId`; missing pending work remains a no-op. Construct `origin: 'continuation'` and `originCommandId` from that retained row, append the child under its frozen ID, and delete pending work in the same synchronous transaction. Recording failure rolls back both changes.
4. Reject caller-supplied Continuation input through ordinary Chain admission, authenticated Actor ingress, administrative APIs and ordinary recorded-command delivery. An existing parent ID does not prove that pending work exists or that an external observation is authorized. Do not introduce a caller-supplied trusted marker or proof flag.
5. Continuation B may emit more external work. Its original receipt naturally inserts `originCommandId: B.id` for child C, preserving A → B → C rather than repeating A. Replay and additional materializers allocate no new external IDs or requests.
6. Remove the `claims` declaration option and its generic capability from both external-contract implementation constructors. Continuation guard/program preparation supplies no Actor claims (use the existing claims-free/null invocation semantics); it resolves no Actor identity and selects no Actor-specific guard. The continuation's own guard/program and canonical owner reads still run. If current membership/requester identity is required, it must be explicit frozen payload data and rechecked against current domain state.
7. External continuation execution stays pinned to its recorded owner release and exact external contract lineage; do not add latest-version fallback. Preserve external request failure as recorded input distinct from the continuation's own retained execution outcome.
8. Ordinary commands recorded with `makeCommandOperation` remain claims-free **System** commands. They do not become external continuations merely because another command emitted them.

### Annotated observation construction

```ts
// 1. Work is read from the owning Chain's retained pending row.
//    Never obtain originCommandId or a replacement child ID from the caller.
const continuation = {
  id: work.externalCommandId,
  origin: 'continuation',
  originCommandId: work.originCommandId,
  commandName: work.externalContractName,
  contractVersion: work.externalContractVersion,
  payload: JSON.stringify(work.payload),
  externalOutcome: observation,
  // Existing exact owner scope/release fields remain here.
};

// 2. Child admission and deletion of this exact pending row remain atomic.
//    The request is not rerun to reconstruct the observation or command.
```

## Implementation order

1. **Canonical schemas and types.** Introduce the flat concrete command variants in the existing command schema modules, update `IAggregateCommand`, `IServiceCommand`, encoded/chained/evaluated types, external command schemas, constructors and command operation codecs. Keep scalar origin literals distinct from existing stable session identity schemas. Update retained snapshots/spec-derived schema facts through current factory-owned projectors; do not change unrelated authored model/release versions merely because the framework wire codec changed.
2. **SQL and complete command transport.** Replace origin JSON and add the flat provenance columns in admission/evaluated command rows; update row encoding/decoding, retained readers, append/publication/fanout and administrative result reconstruction. Preserve scalar Node indexes, immutable equality, original-first retention and current duplicate-first declaration semantics.
3. **External work and execution.** Change prepared/pending work to immediate-parent linkage, stamp the Continuation branch only during atomic observation recording, and make external implementations claims-free. Update both owner families, continuation-to-continuation production, original delivery/recovery and the system harness. Keep ordinary recorded destination commands System-origin.
4. **Ingress and identities.** Convert Actor Node producers and automatic Agent producers to the flat variants. Both SystemApi administrative command methods accept only ordinary System commands; tighten Service to match Aggregate. Preserve exact authenticated Actor/claims/owner/release/session/Node and contract-capability checks. Update ingress, Node continuity, private completion and reconnect code to compare the explicit stable identity fields, while command retry equality includes all immutable fields. Remove redundant cross-field metadata checks now guaranteed by the decoded variant.
5. **Local consumers.** Update browser/native Node journals and canonical readers, standalone execution after Node allocation, session staging/replay adapters, Agent production, harness execution and existing repo examples/stories/profiles that author or inspect commands. Keep the local pre-Node draft lifecycle distinct while flattening its command identity fields; keep minimal public browser frames unchanged. Do not publish a new version or reconcile sibling package pins as part of this source-only implementation; those are a separate coordinated release after the source gate passes.
6. **Verification and documentation.** Complete the existing seams below. Then reconcile the existing glossary, command-origin research/review guidance, architecture and module READMEs, consumer SDK skills and overlapping [Plan 157](157-plan-command-origin-checks.md). Record that this plan intentionally changes the Actor-continuation authority preserved in [ADR 008](../../adrs/008-ordinary-and-recorded-continuation-authority.md), [ADR 012](../../adrs/012-opaque-external-work-and-originating-chain-continuations.md) and [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md). After implementation, create a successor ADR for this persisted authority/protocol trade-off, mark replaced decisions Superseded with links, and preserve any independently governing portions. Do not create that ADR or alter the glossary during planning. Archive this plan only when its source work and required verification are complete.

## Planned file hierarchy

`~` means modify existing files; `+` means create. Braces and `**` identify bounded existing file groups: edit only actual consumers of the changed command contract, preserving unrelated changes in those files. No production helper module, test file, fixture, runner, or configuration file is planned for creation.

```text
zerospin/
├── packages/core/src/
│   ├── contracts/
│   │   ├── ~ {CommandSchema,types,OriginSchema,AggregateCommandOriginSchema,ServiceCommandOriginSchema}.ts
│   │   ├── ~ {ExternalAggregateCommandSchema,ExternalServiceCommandSchema,prepareCommandOperation}.ts
│   │   ├── ~ make/{makeCommand,makeAggregateExternalContract,makeServiceExternalContract}.ts
│   │   └── ~ prepare/{prepareAggregateExternalInvocation,prepareServiceExternalInvocation}.ts
│   ├── ~ aggregate/make/makeAggregateCommand.ts
│   ├── ~ service/make/makeServiceCommand.ts
│   ├── ~ {AggregateNode,ServiceNode,AggregateAgentNode,ServiceAgentNode}/**
│   ├── ~ {aggregateSession,serviceSession,sessionExecution}/**
│   └── ~ testing/systemHarness/**
├── packages/browser/
│   ├── ~ src/{AggregateNode,ServiceNode,StandaloneNode,AggregateAgentNode,ServiceAgentNode}/**
│   └── ~ tests/{node-authentication,node-network-errors}.spec.ts
├── packages/system-worker/src/
│   ├── AggregateChain/
│   │   ├── ~ {aggregateChainDbConfig,recordOriginalCommandOutcomeTx,recordExternalOutcomeAndAdmitCommandTx}.ts
│   │   └── ~ admitAggregateCommands/**
│   ├── ServiceChain/
│   │   ├── ~ {serviceChainDbConfig,recordOriginalCommandOutcomeTx,recordExternalOutcomeAndAdmitCommandTx}.ts
│   │   └── ~ admitServiceCommands/**
│   ├── ~ AggregateVersionChain/{evaluatedCommand,appendEvaluatedCommandsTx}.ts
│   ├── ~ ServiceVersionChain/{evaluatedServiceCommand,appendEvaluatedCommandsTx}.ts
│   ├── ~ {AggregateVersionRepo,ServiceVersionRepo}/utils/**
│   ├── ~ {AggregateAgentNodeRepo,ServiceAgentNodeRepo,agentNodeRepo}/**
│   ├── ~ {aggregateSessionChain,aggregateProjection,ServiceActorVersionChain,ServiceActorVersionRepo}/**
│   ├── ~ externalOperations/{externalOperation.ts,prepareExternalOperation.ts,README.md}
│   ├── ~ commandOperations/{commandOperation,admitRecordedCommand}.ts
│   ├── ~ SystemApi/{executeAggregateCommand,executeServiceCommand}/**
│   └── ~ {executeDirectAggregateCommand,executeDirectServiceCommand}/**
├── ~ packages/core/tests/contracts.typecheck.ts
├── ~ packages/system-worker/tests/{native-system-api,service-command-admission,chain-command-delivery}/**
├── ~ packages/system-worker/tests/{service-external-delivery,service-external-settlement,aggregate-adapter-failures}/**
├── ~ packages/system-worker/tests/{service-actor-connections,service-actor-prefix,service-projections,agent-node-aggregate,agent-node-service}/**
├── ~ packages/sdk/skills/{zerospin-submit-commands,zerospin-external-work,zerospin-authorize-actors}/**
├── ~ examples/{shopping,tic-tac-toe}/**  (actual command consumers only)
├── ~ packages/{core,system-worker,browser}/**/README.md  (affected modules only)
└── wiki/
    ├── + plans/265-plan-flat-command-origins.md
    ├── ~ plans/157-plan-command-origin-checks.md
    ├── ~ glossary.md
    ├── ~ architecture/{AuthoredSystem,SystemApi}.md and affected admission/session workflows
    ├── ~ patterns/system-worker/{identity-and-ownership.md,aggregate-session-admission.ts}
    └── ~ research/command-origin-schema-guards.md and linked command-origin consumer review
```

## Verification at existing seams

1. **Schema and typing:** extend `packages/core/tests/contracts.typecheck.ts` and appropriate existing runtime suites. Prove all four flat variants round-trip; Actor requires the full nonempty/positive Node tuple; continuation requires parent and non-null external observation; ordinary origins reject observations; mixed fields and old object-origin input fail. External implementation constructors reject claims codecs. `Schema.is(ActorCommandSchema)` narrows to the complete Actor shape.
2. **Physical rows and admission:** extend existing Service admission and Aggregate/Service command-delivery suites. Inspect the four command tables and both pending request tables: scalar origin, flat nullable provenance fields, claims JSON only, no copied authority JSON, unchanged unique Node index, complete row/command round trips. Prove exact duplicates return the original index before current declaration lookup; changed parent/provenance/payload under the same ID fails. Preserve dense Node positions and transaction rollback.
3. **Authority:** extend existing native System API and Actor connection/prefix suites. Both administrative APIs reject Actor, Agent and Continuation input. Actor ingress rejects missing metadata, wrong authenticated Actor/claims, wrong Node/session/owner/release, unavailable contracts and wrong push positions. Private completion remains restricted to the matching Actor/session/Node and public frames expose no claims.
4. **External lifecycle:** extend existing external delivery/settlement and Aggregate adapter/delivery cases. Prove parent A → child B → child C retains C's parent as B; multiple children of A have distinct frozen IDs; Success and Failure observations both create claims-free continuations; no Actor-specific guard/claims are used, while the continuation's own guard can refuse. Invalid caller-supplied continuation/parent input grants no authority. Observation recording failure leaves pending work and admits no child; retry/reconstruction after committed recording causes no second request or new child ID. Replay and additional owner releases allocate no outbound work.
5. **Consumer behavior:** run existing browser authentication/recovery cases and standalone/native session seams, with actual typed producers after Node allocation and unchanged staging draft behavior. Exercise System harness external execution against registered implementations; distinguish harness/program evidence from real Durable Object transport and authenticated browser evidence.
6. **Scoped execution:** inspect current resolved targets with `pnpm nx show project <name> --json`; use one bounded Nx task graph for relevant `lib`, `ts` and `lint` targets in core, browser, system-worker, SDK and affected runtime packages, with normal prerequisites. Run existing `pnpm nx run zerospin:test -- packages/system-worker/tests` and affected browser/core checks through their existing targets, plus repo-local Shopping/tic-tac-toe type/build checks. Never verify Explorer. Run formatting in check mode on changed files and `git diff --check`. Do not create new tests, fixtures, check runners or configuration. Diagnose unrelated blockers without absorbing unrelated WIP.
7. **Rollout gate:** source verification does not establish a consumer release or deployed cutover. Publishing this breaking command format requires a coordinated fixed-group release, exact consumer pins/lockfiles and their checks. Deployment requires separately authorized empty affected Durable Object/browser storage. No reset, compatibility reader, publication, install or deployment is performed merely by writing this plan.

## Alternatives and rationale

1. **Nested command origin with Node metadata:** rejected for this implementation. It is representable, but does not match the required scalar indexed SQL fields and would add flatten/reconstruction work or tempt duplicate persisted provenance.
2. **Keep Actor origin on external results:** rejected by the explicit claims-free decision. It couples a recorded observation to historical Actor claims/guards and obscures the absence of a new Node submission.
3. **One root union with optional fields everywhere:** rejected. Flat placement must preserve required variant invariants rather than move runtime cross-field checks to every caller.
4. **Parent ID as completion authorization or automatic claims inheritance:** rejected. The existing exact pending work occurrence is the authority seam; the parent reference is causal and owner-scoped. Business identity needed at completion is explicit payload data.

## Implementation outcome and verification

1. Implemented all six implementation steps. The concrete flat codecs are in
   [`CommandSchema.ts`](../../../packages/core/src/contracts/CommandSchema.ts).
   [Aggregate](../../../packages/system-worker/src/AggregateVersionChain/evaluatedAggregateCommand.ts)
   and [Service](../../../packages/system-worker/src/ServiceVersionChain/evaluatedServiceCommand.ts)
   row boundaries store scalar provenance and reconstruct exact variants, including
   retained publication/recovery and Node continuity.
2. Trusted observation recording now constructs claims-free immediate-parent
   Continuations from exact pending work. Existing cases prove A → B → C, distinct
   child IDs, immutable parent mismatch, own guard refusal, null claims without
   Actor lookup, rollback on recording faults and stable retry/reconstruction.
   Ordinary recorded destination commands remain System-origin.
3. Actor drafts, Node producers, sockets, Agent production, harness, CLI seeds,
   Shopping and tic-tac-toe use the new variants. Both administrative methods are
   System-only. Stable session identities and minimal public browser frames remain
   separate from command provenance.
4. Updated glossary, consumer review/research, patterns, affected module READMEs,
   SDK skills and six architecture workflows. [ADR 023](../../adrs/023-flat-command-origins-and-claims-free-continuations.md)
   replaces the prior copied-authority decisions while retaining their independently
   governing parts. Plan 157 is archived as superseded.
5. Scoped Nx gate passed: `pnpm nx run-many -t lib,ts,lint,build -p @zerospin/core,@zerospin/sdk,@zerospin/browser,system-worker,@zerospin/native,@zerospin/cli,shopping,tic-tac-toe`
   ran 31 tasks, including prerequisites. Existing library/type/lint/example and
   native bundle targets passed. Explorer was excluded.
6. Existing acceptance target passed: `pnpm nx run zerospin:test -- packages/system-worker/tests packages/browser/tests packages/core/tests examples/shopping/tests examples/tic-tac-toe/tests`
   — **149 tests across 32 suites**, including 119 System Worker cases. Test
   compilation includes required positive/negative command and constructor examples.
   Scoped formatting and `git diff --check` pass. No test files, fixtures, runners,
   configuration, compatibility path or storage reset was added.

This evidence covers local Workerd transport/SQL, authored harness execution,
existing browser authentication/recovery cases and native/example compilation.
It does not claim a deployed cutover, live provider behavior or a real browser/native
UI journey. Publication, exact sibling package adoption and operational storage
cutover remain separate release/deployment work outside this source plan.

## Remaining work

None.
