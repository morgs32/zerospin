# Plan 270: Contract release names and command kinds

Status: Completed and verified on 2026-10-26 in `codex/explicit-contract-grants`, integrated onto main `c4f8335fc6`, including merged PR #77 identity cleanup, PR #79 documentation consolidation and PR #76 Node recovery verification. All authorized Phase 3 source work and documentation are complete. Before the final main integration, the complete test compiler plus 154 tests in 30 files and a focused compiler plus 41 tests in seven files passed. After integration, 34 quality tasks and the complete compiler plus the two existing Node recovery cases passed. Runtime storage, publication and deployment remain untouched.

## Committed baseline and scope

1. Phase 1's Release factory/type names landed in PR #70. Factory-owned Actor specs landed in PR #71; props cleanup landed in PR #72. Do not repeat those implementations.
2. [Plan 271](./271-plan-remove-connected-session-command-execution.md), merged as [PR #74](https://github.com/morgs32/zerospin/pull/74), removed connected-session `executeCommand`, its private admitting RPCs, exclusive helpers/types and Node-less Actor commands. Every admitted Actor command already requires its real Node/session/push tuple. Preserve ordinary synchronous staging, Node delivery, administrative/authorization execution and Standalone behavior.
3. Earlier command-kind, Actor-Node and builder-rename experiments were discarded. Their old checks and Node **21** / Native **10** stamps are historical, not current source or readiness evidence. Current Node format is **20** and Native format is **9**. Do not recreate unstaged submissions, private outcome RPCs, Node command point reads or browser execution gates.
4. Preserve the accepted public shape below and replace superseded machinery outright. No compatibility aliases, fallback decoders, translation migrations, extra support registry, generated clients or `ownerKind` are permitted. Record traversal uses `mapValues`.
5. Phase 2 is a bounded command/ticket schema cutover. Phase 3 coherently changes owner assembly, fresh invocation grants, typed administrative execution, seeds and their callers. Do not report Phase 3 complete while seeds or the harness still use the removed interfaces. Preserve the existing phase boundary before Phase 3 unless its implementation is explicitly advanced.
6. The local reexecution inventory and checkpoint preserve discarded work and research. They are reference material, not patches to apply wholesale. This plan records the approved cutover, implemented after Plan 271 and rebased onto the merged identity cleanup in [Plan 272](./272-plan-remove-actor-origin-and-session-origin-union.md).

## Agreed ordinary-contract model

1. An ordinary contract release describes the business action, payload, optional claims requirements, guards/program, results and lineage. It has no immutable invocation kind, `actorName` or `agentName` binding. Keep the existing generic ordinary `define*Contract`, `make*ContractRelease` and `upgrade*ContractRelease` families; do not introduce category-specific ordinary factories.
2. `command.kind` records the actual Actor, Agent, System or external invocation. Explicit maps authorize execution: Actor releases grant ordinary contracts through `actors[*].contracts`; Agent releases grant them through `agents[*].contracts`; an owner release explicitly grants System execution through `system`; external implementations belong under `external`.
3. The same exact canonical ordinary release may appear in multiple authorized maps. For example, catalog Actor creation and System seed creation use the same `createProductV1`. Coalesce that object once in the derived execution inventory. Within one owner release, a command name selects one exact object/version across all grant sources; different versions cannot compete for the same flattened key. Reject different declarations claiming the same command name/version, incompatible lineage, wrong map keys/family, or mismatched model/external-operation identity. Do not reject identical reuse merely because two principals grant it.
4. An ordinary contract with a claims codec can be granted only by an Actor whose identity satisfies it. Agent and System grants reject claims-dependent contracts at types and runtime. Lack of a claims codec is not permission: an explicit selected map grant is also required.
5. Preserve current claims preparation: Actor invocation supplies authenticated claims and decodes declared contract requirements; a claims-free ordinary callback can receive the authenticated record or null according to its invocation. Agent/System/external invocation supplies null. Preserve Actor-selected reads for Actor execution; automated execution receives canonical reads restricted to its declared models. Do not fabricate Actor claims for automation.
6. External contracts remain distinct versioned pure declarations plus server implementations, with their existing recorded-outcome protocol. Ordinary maps reject external implementations; the external map rejects ordinary releases. Preserve exact pure descriptor identity, original-only external work, pending-work ownership and atomic observation/admission.

The implemented owner shape is:

```ts
const createProduct = defineServiceContract('createProduct');
const createProductV1 = makeServiceContractRelease(createProduct, {
  version: 1,
  // Existing payload, price guard, operations and create-only program.
});

const catalogActorV1 = makeServiceActorRelease(catalogActor, {
  version: 1,
  // Existing identity, authentication, selections and other props.
  contracts: { createProduct: createProductV1, deleteProduct: deleteProductV1 },
});

const marketplaceServiceReleaseV1 = makeServiceRelease(marketplaceService, {
  version: 1,
  models: marketplaceModels,
  actors: { catalog: catalogActorV1 },
  agents: {},
  system: { createProduct: createProductV1 },
  external: {},
});
```

Callback omissions above illustrate the interface; they are not replacement implementations. Aggregate owner assembly follows the corresponding shape.

## Current source anchors

1. [CommandSchema.ts](../../../packages/core/src/contracts/CommandSchema.ts), [types.ts](../../../packages/core/src/contracts/types.ts) and [dispositionChainHash.ts](../../../packages/core/src/contracts/dispositionChainHash.ts) define command `kind` variants, the complete Actor tuple and unchanged disposition preimage.
2. [makeAggregateRelease.ts](../../../packages/core/src/aggregate/make/makeAggregateRelease.ts), [makeServiceRelease.ts](../../../packages/core/src/service/make/makeServiceRelease.ts) and [assembleOwnerContracts.ts](../../../packages/core/src/declaration/assembleOwnerContracts.ts) derive one canonical inventory from Actor/Agent grants plus explicit `system` and `external` maps. Authored owner `contracts` and generic module composition are removed.
3. [SessionAdmissionSchema.ts](../../../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/SessionAdmissionSchema.ts), [validateSessionAdmission.ts](../../../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/validateSessionAdmission.ts) and [forwardSessionSocket.ts](../../../packages/system-worker/src/SystemRepo/handleFetch/forwardSessionSocket.ts) own retained ticket shape, authority and trusted forwarding.
4. [makeSystemApi.ts](../../../packages/core/src/utils/getSystemApi/makeSystemApi.ts) accepts the selected release plus typed command input. [prepareSystemAggregateCommand.ts](../../../packages/core/src/utils/getSystemApi/prepareSystemAggregateCommand.ts) and [prepareSystemServiceCommand.ts](../../../packages/core/src/utils/getSystemApi/prepareSystemServiceCommand.ts) freeze one encoded System envelope before transport. [ISystemApi.ts](../../../packages/core/src/systemApi/ISystemApi.ts) remains inferred from the shared HTTP/native facade.
5. [ISeedProgram.ts](../../../packages/core/src/systemApi/ISeedProgram.ts), [seedFn.ts](../../../packages/cli/src/seed/seedFn.ts), the [seed command](../../../packages/cli/src/commands/seed.tsx) and [Shopping seeds](../../../examples/shopping/src/zerospin/seeds.ts) implement the named sequential seed program. [requestPromotionCommitment.ts](../../../examples/shopping/src/zerospin/aggregates/user/contracts/utils/requestPromotionCommitment.ts) uses typed promotion V1 execution with its deterministic ID and bounded retry policy.
6. [ADR 023](../../adrs/023-flat-command-origins-and-claims-free-continuations.md) governs flat command provenance, external causality, recovery and the empty-state rollout gate. It now includes explicit invocation grants, typed administrative execution, seed programs and the merged flat Actor snapshot/header/connection identity representation.

7. Current documentation ownership follows [Plan 273](./273-plan-consolidate-source-readmes-into-documentation.md): developer concepts/API examples are in [Fragment](../../../docs/README.md); runtime owner assembly and portable metadata are in [AuthoredSystem](../../architecture/AuthoredSystem.md), administrative preparation in [SystemApi](../../architecture/SystemApi.md), and execution/recovery in [AgentExecution](../../architecture/server/AgentExecution.md), [DeliveryAndRecovery](../../architecture/server/DeliveryAndRecovery.md) and [SelectedViews](../../architecture/server/SelectedViews.md). Source-module README files are not current documentation destinations.

## Phase 2A: Command kind and external-schema cutover

1. Replace scalar command `origin` with `kind: 'actor' | 'agent' | 'system' | 'external'`; rename the `continuation` command variant to `external`. Preserve `originCommandId`, ordinary `externalOutcome: null`, recorded external observation, exact owner/release identities and the complete Actor Node tuple. No claims or Node metadata are added to external commands.
2. Rename the `Continuation*CommandSchema` family to `External*CommandSchema`. Consolidate the existing standalone external wrappers into `CommandSchema.ts`; the external Aggregate branch retains the nonempty aggregate ID already required by admission. Derive encoded branches by replacing only payload with `Schema.String`. Move the encoded external type aliases beside their schemas and remove obsolete wrapper files/subpaths without aliases.
3. Update actual producers and consumers together: Aggregate/Service staging and Node push, Agent frozen publication, administrative/authorization execution, command operations, original evaluation/replay, external observation, retained/evaluated row codecs, projections, browser synchronization, the harness and existing tests. Use the command discriminant for variant narrowing; boundary schemas reject contradictory envelopes.
4. Rename the scalar column in Aggregate/Service Chain command rows and VersionChain evaluated rows. Follow the evaluated shapes into VersionRepo pending-publication outboxes and complete commands into command-delivery/evaluated-operation JSON. Preserve nullable inactive SQL columns for other variants and reject incomplete Actor provenance.
5. Preserve non-command `origin`: session-lock identity, socket headers, hibernation/connection state, projection identity, URL/HTTP origins and `SessionFailure.origin`. Move the unchanged Aggregate session identity schema to `AggregateSessionOriginSchema.ts`; remove unused scalar command-origin schema modules. Node-continuation procedures still mean push continuity and retain their names.
6. Keep `[previousHash, index, commandId, outcome.result._tag]`, genesis and `dispositionChainHash` unchanged. Admission still recovers identical retained commands before fresh grant/declaration checks. Wrong immutable input rejects without partial batch retention. Execution commit, dispatch acknowledgement and retained `outcome` remain separate facts.
7. External observation still atomically records the observation, admits the stable child command and removes the completed pending row. Repeated observations cannot repeat external requests or replace the original observation. Replay emits no new outbound work.

## Phase 2B: Concrete admission tickets without duplicate identity

1. Preserve the four existing admission domain branches and owner coordinates. Principal names/versions come from each exact lock; actual Actor claims appear once. The ticket variants are:
   1. `aggregateActor`: Aggregate coordinates, nullable issued `nodeId`, `actorPath`, actual `claims` and an Actor-narrowed `aggregateSessionLock`; no duplicate admission `origin`.
   2. `aggregateAgent`: Aggregate coordinates, nonempty observer `nodeId` and an Agent-narrowed `aggregateSessionLock`; no duplicate admission `origin` or Actor claims.
   3. `serviceActor`: Service coordinates, nullable issued `nodeId`, `actorPath`, actual `claims` and `serviceSessionLock`; no duplicate principal fields outside the lock.
   4. `serviceAgent`: Service coordinates, nonempty observer `nodeId` and `serviceAgentSessionLock`; no duplicate admission `origin` or claims.
2. Build bounded Aggregate Actor/Agent lock specializations from existing lock fields with an exact identity branch. Keep the public Aggregate lock Struct and its `.fields` consumers unless a real remaining use requires otherwise. Retain declaration `claimsJsonSchema`; it is distinct from actual Actor claims. Remove the outer equality filter that reconciles redundant principal copies.
3. Actor ticket `nodeId` remains nullable because issuance precedes Node resume. This does not weaken the required Node tuple on admitted Actor commands. Preserve current authentication, Actor path derivation, Aggregate ID/claims agreement, exact authored lock comparison and running-owner validation.
4. Migrate all four actual issuers: Aggregate/Service `createWebSocketTicket` and administrative `openAggregateAgentSession` / `openServiceAgentSession`. Update retained ticket decoding and `SystemRepo.systemRepoDbConfig`'s admission JSON schema through its import. Ticket creation requires the concrete `ISessionAdmission` union. Preserve exact Actor/Agent lock branches from validated authorization and resolved Agent identity; strict runtime validation still protects the RPC boundary.
5. Keep existing trusted socket-header and hibernation contracts. `forwardSessionSocket` reconstructs Actor identity from the lock plus actual claims, and Agent identity from its lock. Strip caller-supplied trusted headers before synthesizing replacements; do not expand this work into a header/state rewrite.
6. Preserve whole-SystemSpec acceptance and validation before secret generation, hash-only secret retention, 30-second expiry, atomic expiry cleanup/insertion, wrong-family handling, and spending the matching-family ticket before decode/forward. Later validation or forwarding failure must not unburn it.

### Phase 2 acceptance and stop boundary

1. Existing codec/row scenarios cover every command variant, contradictory envelopes, required Actor provenance and unchanged hash/replay behavior. Existing lost-acknowledgement cases recover identical retained input and reject conflicts before fresh declaration checks.
2. Existing `repo-lifecycle` cases already provide all four ticket shapes. Adapt them to prove exact branch correlation, one principal source, actual claims once, expiry/rollback/one-time spend and rejection of corrupt retained admissions. No new fixture is needed.
3. Exercise all four real ticket issuers and forwarding paths in existing Actor connection/native and Agent Node suites. Direct `SystemRepo` fixture calls alone are insufficient evidence of correct issuer construction and authentication.
4. Record fresh scoped compiler/runtime/formatting evidence. Do not reuse discarded WIP results. Stop before Phase 3 unless that implementation scope is advanced.

## Phase 3: Explicit grants, typed administrative execution and seeds

### Owner assembly and portable facts

1. Replace authored owner `contracts` and dormant `modules` inputs with four sources: `actors[*].contracts`, `agents[*].contracts`, explicit `system` and explicit `external`. Mirror Aggregate and Service. Remove unused generic module composition/types rather than preserving a second registration path.
2. Retain precisely inferred readonly `system` and `external` subsets on completed owner releases and their erased types. An omitted authored map means no grants; completed and portable releases carry explicit empty maps. Do not default missing fields while decoding old persisted specs. Actor/Agent releases retain their contract maps. Flatten all grants once into the existing execution-facing `release.contracts`; do not persist an additional support registry. Identical canonical objects coalesce across maps; conflicts remain errors.
3. Validate keys against command names, correct Aggregate/Service family, exact models/external descriptors and ordinary/external eligibility. Actor grants validate declared claims against Actor identity; Agent/System grants reject a claims codec. Do not infer support from absent claims or silently filter bad author input into a plausible session.
4. Preserve existing ordinary definitions/releases/upgrades and canonical name/version conflict checks. Do not add immutable invocation kind/principal to ordinary definitions or `ContractSpecSchema`, or forbid explicit reuse across principals. No category-specific factories or per-name principal-invariance mechanism is needed. Do not refactor definition construction solely to support those discarded facts; keep exact existing external descriptor identity.
5. Project explicit per-owner-release System and external name-to-version grants into Aggregate/Service specs and the whole SystemSpec, alongside existing Actor/Agent bindings and the single `contractVersions` inventory. Update `AggregateSpecSchema.ts`, `ServiceSpecSchema.ts`, `declaration/makeReleaseSpecs.ts`, `system/make/makeSystemSpec.ts` and `SystemSpecSchema.ts`. Preserve eager factory-owned `actor.spec` and numeric bindings from Plan 268; do not duplicate complete contract bodies in each new grant map.
6. Extend existing portable owner validation: each System/external grant resolves to the exact version in `release.contracts` and its contract metadata; ordinary maps cannot reference external declarations. Whole-SystemSpec acceptance remains atomic. Changing grants under an already accepted owner release version rejects before any new spec is stored; a new owner release may change grants while reusing unchanged ContractSpecs. Same-hash acceptance remains a no-write operation. No accepted-contract/grant tables are added.
7. Selected lock projections retain ordinary codec facts and principal identity at the lock level. Do not add kind/principal to each ContractSpec or change selected lock bytes merely because owner grants change; test that unchanged selections remain unchanged.
8. Session/Agent selected contracts remain ordinary contracts, validated against their actual selected principal grant. Replace ambiguous `publicContracts` / `IPublicContracts` uses with the actual ordinary-versus-external and claims/grant constraints required at each use site. Do not introduce a category filter which silently drops invalid authored entries.

### Fresh invocation authority and the harness

1. Fresh Actor admission/preparation requires the exact selected Actor grant, authenticated captured claims and real Node tuple. Agent invocation requires the source owner release's exact Agent identity/version and grant; System invocation requires the selected owner release's explicit `system` grant. External invocation uses only originating-Chain pending-work authority and exact `external` registration. Permission comes from those maps, never a nonexistent ordinary `contract.kind`.
2. Preserve retained-command recovery before fresh grant checks and the recorded source release for execution/replay. Current grant removal must not reauthorize or invalidate an already-admitted exact retry. Guard execution remains in the original business transaction.
3. Preserve `makeCommandOperation`'s ordinary/claims-free construction constraint: it has a destination definition/version, not the live destination release. Its declaration validator and runtime preparer must check the exact destination release's `system` map. Aggregate `authorize.executeCommand` and administrative execution also require that explicit grant. A claims-free Actor/Agent grant alone is insufficient; the same release is eligible when also granted under `system`. Do not add a constructor registry or change the command-operation authoring interface solely to force an unavailable construction-time check.
4. Make `harness.push` genuinely support complete Actor/Agent inputs. For Actor input, validate owner/Actor identity/version/grant and claims, build `makeActorContractReadDb` from the Actor's captured selections and invoke the guard with that Actor context. Removing the current Actor refusal without replacing canonical reads/undefined claims is insufficient. Agent input validates source Agent/grant and uses null claims; System/external inputs retain their declared canonical read scopes.
5. Keep the harness Service API aligned with the new typed SystemApi signature and its existing `ISystemHarnessApi` subset/type equality. It remains System-only; Actor/Agent actions enter through `harness.push`. Share internal preparation where it earns reuse, without publishing a new command factory or manufacturing a full unused RPC facade. Preserve frozen output and synchronous transaction boundaries.

### Typed administrative execution and seeds

#### Typed administrative execution

1. Implement the accepted two-family interface in `makeSystemApi`:

   ```ts
   api.executeServiceCommand(serviceRelease, { id, contractName, payload });
   api.executeAggregateCommand(aggregateRelease, {
     id,
     aggregateId,
     contractName,
     payload,
   });
   ```

2. Infer name/payload only from the selected readonly `release.system`. Validate and encode input, derive exact owner/name/version and `kind: 'system'`, and preserve the caller-supplied ID. Both HTTP and native acquisition continue using this shared typed facade; `ISystemApi` remains its inferred return type.
3. A returned command operation captures one selected release and immutable encoded envelope before transport retries. Retry transport with that prepared input; do not allocate IDs, reread mutable props, resolve a later release or cache a transport outcome. Preserve errors in the Effect/RPC channel and canonical business Failure in `outcome.result`.
4. Administrative RPC and Chain fresh admission enforce the actual System grant. The wire interface continues receiving the complete encoded command; it is transport, not an alternate public authoring interface. Return the current `ICommandOutcome` and JSON success representation. Preserve caller-side result decoding; automatic authored success decoding is outside this cutover.
5. Migrate `requestPromotionCommitment` with its existing deterministic command ID, three-code bounded retry policy and reservation-identity validation. Its only caller uses promotion V1 and only V1 is registered: use `promotionServiceReleaseV1`, derive its existing ID segment from `.version`, and remove the redundant numeric `serviceVersion` input. Do not invent a V2 registry to preserve an unused union.
6. Update the existing promotion test interceptor to the complete generic `(release, input)` method type so inference survives. Keep `ShoppingSystemApi` / its live acquisition and ordinary Service query behavior unchanged.
7. Migrate actual callers, then delete `makeAggregateCommand`, `makeServiceCommand`, their Core/SDK subpaths and the exclusive internal `contracts/make/makeCommand` helper. Do not perform the superseded intermediate `make*SystemCommand` rename. Keep `makeCommandOperation`, which owns a different capability.

#### Seed program and reruns

1. Reuse the existing claims-free `createProductV1` in both catalog Actor grants and `marketplaceServiceReleaseV1.system`. Preserve its price guard and create-only operation. Do not create `seedProduct` / `initializeCatalog`, add upsert/replacement behavior, silently overwrite products or reset storage.
2. Use one named program with the existing exported administrative type:

   ```ts
   type ISeedProgram = (api: ISystemApi) => Effect.Effect<void, unknown, never>;
   ```

   The seed module exports `seeds`; no new DSL, runner/configuration file or API instrumentation is required. The existing CLI loads the function, validates that invocation returns an Effect, runs it once and normalizes failure at its existing CLI seam.

3. Preserve path resolution, config/secret acquisition, URL precedence, environment loading and Jiti aliases. Replace decoded-command-array parsing, CLI payload encoding and Aggregate/Service family splitting with the typed administrative facade. Update the command argument description and completion display to “Seed program completed”; remove automatic `commandsSubmitted` reporting rather than reconstructing a count through wrappers. Completion is based on procedure status, not a truthy void result.
4. The program owns explicit command order through ordinary sequential Effects. After each execution, inspect `outcome.result`; a business Failure fails the program before the next command. A fulfilled execution Effect alone does not prove successful seeding.
5. Each command has its own transaction. Earlier successes remain committed if a later command fails. No automatic whole-program retry, rollback or parallel submission is introduced. A caller can rerun the authored sequence using the same IDs and recover earlier retained outcomes.
6. Shopping's twelve products keep their current product IDs/data and receive deterministic command IDs for those seed occurrences instead of module-time random IDs. Same ID plus identical input recovers the first `outcome`; changed input under the same ID conflicts. A new ID is a new create command and does not authorize overwriting an existing product. A future seed revision that updates products requires an explicit domain action, not a compatibility/reset path.

### Concrete caller and existing-fixture migration

1. Shopping user actions remain granted by `user`; catalog create/delete are granted by `catalog`, with `createProduct` also explicitly System-granted for seeds. Tracking actions remain purchases Agent grants. `releaseUncommittedReservation` is a `reservations` Agent grant, distinct from the System-granted promotion reservation/commit/redeem/release actions. Sharing another ordinary release is allowed only through an actual additional explicit grant.
2. Tic-tac-toe human grants include create/play actions; remove `playExternalOMove` from human grants and register it only under `external`. Studio's `editItem` and tracking actions are granted by `positiveItems`. No new definition/factory family is needed for those assignments.
3. Keep existing ordinary fixture declarations, names and meaningful Actor/Agent grants. Add explicit System grants for actual administrative/recorded-command consumers of those same claims-free releases. Do not bind `createReservation` or `performReservationWork` to a single principal, remove cross-Actor grants merely because they are shared, rename service-publication creation to `provisionReservation`, replace the fanout rejection, or substitute the native expiry command solely to satisfy the discarded fixed-category design. Remove only independently demonstrated unused grants.
4. Preserve the existing native administrative retained-failure/retry and fanout scenarios. An existing Agent action may also be System-granted where the current administrative scenario genuinely invokes that same business action. Keep exact identity/outcome assertions and do not duplicate the underlying contract.
5. Migrate test input construction to the new actual interfaces. Keep harness System invocations where owner `system` explicitly grants the action; use complete Actor/Agent envelopes when the scenario proves those invocation semantics. Do not fabricate Actor principals just to perform an administrative action.
6. Keep the receipt staging allocation/rollback/synchronous-program checks. Existing `requestReceiptV1` is an ordinary claims-free release: the receipt owner fixture can grant it through `system`, while the existing isolated reader session uses it for local staging. Keep the external receipt implementation under `external` and retain meaningful derived-inventory assertions. This test does not prove owner-level reader admission and needs no new reader Actor fixture.
7. The former three-fixture request belonged to removed private connected-execution scenarios. Do not recreate it. No new test files, fixture declarations, runners or test configuration are required or authorized. Use the smallest meaningful assertions in existing seams; do not preserve tests for the removed browser API.

## Storage and rollout gate

1. Phase 2A definitely changes Aggregate/Service Chain command rows, Aggregate/Service VersionChain evaluated rows, VersionRepo pending evaluated outboxes sharing those shapes, and complete recorded-command JSON in command-delivery/evaluated-operation outboxes. Phase 2B changes `SystemRepo.sessionWebSocketTickets.admission` JSON.
2. Do not blanket-reset or bump compact browser session, Aggregate/Service Node or AgentNode delivery stores for the command discriminant rename. They store compact name/payload/coordinates or owner-version facts, not command `origin`. External pending rows already retain child/parent/version/payload. Native's compact replica also does not acquire a new column from this rename.
3. Phase 3 definitely changes `SystemRepo.acceptedSystemSpecs.spec` because owner releases gain required System/external grant fields. Keep it as the sole persisted whole-spec acceptance representation; old snapshots receive no optional-field defaults or translation. Inventory any additional genuinely changed declaration/ticket/definition values separately. Ordinary ContractSpecs and selected lock bytes need no new fields for this authorization model; do not blanket-reset browser locks or contract records merely because owner grant metadata changed.
4. Changed fixed schemas require empty affected storage. Identify exact local/deployed partitions before any rollout and obtain specific reset authorization or use an explicitly approved fresh environment. No migrations, aliases, old-field readers, fallback defaults or deprecated-row preservation. Do not delete unrelated model-only stores or credentials.
5. Source implementation and existing disposable tests are separate from runtime rollout. No retained-storage reset, deployment, package publication or sibling consumer adoption is authorized by this plan review.

## Approved file areas

Root: `/Users/morgs32/GitHub/zerospin/`. `~` modifies, `-` removes, `+` creates only if an internal procedure has an actual shared responsibility. Brace groups abbreviate corresponding families; they do not authorize broad unrelated edits.

```text
packages/core/
  src/contracts/~ CommandSchema.ts, types.ts, externalContract.ts
  src/contracts/- AggregateSessionOriginSchema.ts (created in Phase 2, removed by merged Plan 272)
  src/contracts/- AggregateCommandOriginSchema.ts, ServiceCommandOriginSchema.ts
  src/contracts/- ExternalAggregateCommandSchema.ts, ExternalServiceCommandSchema.ts
  src/contracts/~ prepare/, makeCommandOperation.ts, prepareCommandOperation.ts
  src/contracts/make/- makeCommand.ts after its exclusive callers are removed
  src/aggregate/~ types.ts, make/makeAggregateRelease.ts
  src/service/~ types.ts, make/makeServiceRelease.ts
  src/aggregate/make/- makeAggregateCommand.ts
  src/service/make/- makeServiceCommand.ts
  src/aggregateActor/, serviceActor/, agent/~ existing grants/claims/model validation
  src/aggregateSession/, serviceSession/, serviceAgentSession/~ existing selection constraints
  src/aggregate/~ AggregateSpecSchema.ts; src/service/~ ServiceSpecSchema.ts
  src/declaration/~ makeReleaseSpecs.ts and existing grant/model validators
  src/system/~ SystemSpecSchema.ts, make/makeSystemSpec.ts and command-operation validation
  src/module/- unused composeModules.ts, types.ts
  src/utils/getSystemApi/~ makeSystemApi.ts; + internal family-specific preparation only if shared
  src/testing/systemHarness/~ typed API and Actor-selected invocation
  ~ package.json, existing tests/contracts.typecheck.ts, tests/receipt-delivery.spec.ts
packages/system-worker/src/
  AggregateChain/, ServiceChain/~ original rows/admission/recorded command JSON
  AggregateVersionChain/, ServiceVersionChain/~ evaluated rows/codecs
  AggregateVersionRepo/, ServiceVersionRepo/~ original/replay/pending publication
  AggregateAgentNodeRepo/, ServiceAgentNodeRepo/~ frozen input and exact grants
  aggregateProjection/, serviceProjection/, serviceAgentProjection/~ command consumers
  SystemRepo/sessionWebSocketTickets/~ SessionAdmissionSchema.ts, validateSessionAdmission.ts
  SystemRepo/sessionWebSocketTickets/~ existing create/consume procedures as required
  SystemRepo/~ systemRepoDbConfig.ts, handleFetch/forwardSessionSocket.ts
  SystemRepo/acceptSystemSpec/~ existing whole-spec acceptance validation/evidence
  AggregateSessionApi/createWebSocketTicket/~ createWebSocketTicket.ts
  ServiceSessionApi/createWebSocketTicket/~ createWebSocketTicket.ts
  SystemApi/open{Aggregate,Service}AgentSession/~ existing producer
  SystemApi/, aggregateSessionChain/, ServiceActorVersionChain/~ actual grant/command consumers
packages/system-worker/tests/~ existing repo-lifecycle, repo-names, admission/delivery/Actor/Agent/native scenarios
packages/browser/~ ordinary command serialization/synchronization consumers and existing tests
packages/sdk/~ existing src exports and skills
packages/cli/src/~ seed/seedFn.ts, commands/seed.tsx
packages/studio/src/fixtures/~ existing Agent examples
examples/shopping/~ existing grants, owner assembly, seeds, promotion helper/caller and tests
examples/tic-tac-toe/~ existing human/external registration and tests
fragment/content/~ current authoring/API/seed guidance
wiki/~ implemented glossary, ADR 023, current patterns/architecture citations and this plan
.nx/version-plans/~ existing breaking-change note
```

No new ordinary-contract factory files, public command constructors, receipt Actor fixture or browser outcome/wait API was introduced.

## Verification and documentation

1. Inspect resolved Nx targets for the actual changed projects once. Use explicit affected Core/SDK/Browser/System Worker/CLI/Studio/Shopping/Tic-tac-toe targets and required dependencies; include another real consumer only when changed source requires it. Preserve caches and dependency execution. Never verify Explorer; Shopping browser verification is also prohibited.
2. Run one scoped `lib,ts,lint` graph per implementation phase with the workspace package manager. Do not overlap builds writing the same outputs. Use existing targets rather than new check runners.
3. Run bounded existing `pnpm nx run zerospin:test -- <explicit existing paths> --maxWorkers=2` selections. Its compiler step checks the complete test program. Current runtime seams include Core contract/receipt scenarios; repo-lifecycle; repo-names; command/Chain admission and delivery; both Agent Node suites; Actor connection/prefix; native SystemApi; relevant adapter/replay/history fanout; Shopping and Tic-tac-toe.
4. Existing compiler/owner/whole-spec cases must prove one exact ordinary release coalesces across Actor/Agent/System grants; a different same-identity release rejects; absent grants cannot execute; claims-dependent contracts cannot enter Agent/System maps; and external implementations cannot enter ordinary maps. Preserve one metadata entry and explicit grant bindings. Check atomic rejection of changed grants under the same owner version, valid reuse in a new owner version, and unchanged selected lock projections. Do not catalogue permutations or add fixtures.
5. Preserve meaningful Actor selected-read/guard checks in the harness, exact retained-ID recovery despite later grant removal, frozen Agent draining, and original-only outbound behavior. Harness success alone does not prove authentication or distributed admission.
6. Administrative/seed checks extend the existing `contracts.typecheck.ts`, `repo-names.spec.ts` SDK adapter cases and Shopping harness/promotion cases for precise release/input inference, frozen input across transport retry, wrong System registration and sequential seed outcomes. Exercise the existing CLI loader with the actual Shopping seed export and existing mocked capability/configuration seams in an existing Node test file: checked business Failure stops the sequence, loader/program failures use the CLI error seam, and completed void programs render success without a count. No new canonical fixture, file, runner or test configuration is needed. Record exact evidence before completion; do not substitute inspection for an unrun required loader check or touch retained runtime storage.
7. After source changes, update the glossary and current SDK skills; keep developer concepts, public API usage and examples in existing Fragment sections, and runtime ownership/delivery/recovery in architecture. Preserve package-purpose and operational test READMEs, but do not create source-module READMEs. Refresh relevant architecture source ranges/hashes and the existing breaking-change note. Amend ADR 023 for implemented terminology/ownership; create a new ADR only for an implemented decision meeting repository criteria. Do not create new spec files or speculative governing records.
8. Record each phase's checks and blockers here. Archive only after the complete agreed work and required verification/documentation are finished, or the maintainer explicitly cancels/supersedes the remainder.

## Phase 2 outcome, 2026-10-26

This historical milestone predates Phase 3 and merged Plan 272. The later identity cleanup removed ActorOrigin and the Aggregate session-origin union; current Actor snapshots and connection state use the flat fields described by the current architecture docs.

1. Canonical command envelopes, encoded inputs, retained/evaluated SQL rows and complete pending-command JSON now use `kind`; external commands use `kind: 'external'`. External schemas and encoded types are consolidated in `CommandSchema.ts`. Aggregate session identity moved unchanged to `AggregateSessionOriginSchema.ts`. Removed scalar-origin and external-wrapper modules have no compatibility aliases.
2. The four ticket branches derive principal names/versions from exact selected locks, retain actual Actor claims once, and keep nullable pre-Node Actor ticket identity. Strict retained decoding runs after the matching-family SQL burn, so removed duplicate identity fields cannot be silently discarded. Authentication, declaration validation, trusted forwarding headers, expiry and one-use behavior are preserved.
3. `NX_NO_CLOUD=true pnpm nx run-many --projects=@zerospin/error,@zerospin/core,@zerospin/sdk,@zerospin/browser,system-worker,@zerospin/studio,@zerospin/dev-worker,shopping,tic-tac-toe,@zerospin/react --targets=lib,ts,lint` passed **34 tasks**. Existing unrelated lint warnings remain; two import-order warnings introduced during ticket test edits were fixed and `system-worker:lint` rerun.
4. The complete test compiler plus **152 tests in 30 existing files** passed through `pnpm nx run zerospin:test -- <explicit existing file selection> --maxWorkers=2`. Selection covered all 23 changed System Worker suites, Core receipt delivery, both Browser Node authentication/network suites, Shopping system/promotion/checkout, and Tic-tac-toe computer move. This proves codec/SQL round trips, immutable retry/conflict recovery, Agent delivery, external observation, original/replay behavior, projections, histories and administrative execution at the existing seams.
5. The native forwarding case now obtains its Aggregate Actor ticket through real `AggregateApi.admit` / authorization / snapshot / `AggregateSessionApi.createWebSocketTicket`, then checks addressed forwarding, exact trusted headers, caller-header stripping and single use. The existing native suite and complete test compiler were rerun: **6 tests passed**. Existing Service Actor and both Agent Node suites exercise the other three real issuers; native forwarding also covers both Agent families.
6. Scoped formatting and `git diff --check` passed. Independent command and ticket source audits completed. **94 changed-source architecture SHA references** match current source. Glossary, SDK guidance, current module/pattern/architecture docs, ADR 023 and the existing breaking-change note reflect Phase 2.
7. Phase 3 owner maps, typed administrative inputs, seed programs and their caller migration have not started. Generic command builders and current administrative interfaces remain. Node format **20**, Native format **9**, hash preimage and `dispositionChainHash` are unchanged. No runtime storage, deployment, publication or sibling consumer was changed.

## PR 75 review outcome, 2026-10-26

This historical review outcome predates the completed Phase 3 work below and the merged Plan 272 identity cleanup.

1. Restored precise `ISessionAdmission` inputs on both `SystemRepo.createSessionWebSocketTicket` and its issuance procedure. Strict runtime decoding remains. The owning Aggregate lock validator now preserves the Actor branch after exact lock equality; the Agent opener retains its resolved Agent identity in the lock. No casts, overloads, new decoders or schema changes were introduced.
2. Audited the complete PR for widened `unknown` inputs. The one added widening is removed. The Actor claims record still has opaque values, relocated from the removed duplicate identity object. Existing malformed-input cases now exercise the real typed RPC boundary through the established `Reflect.apply` seam.
3. `IActorOrigin` and `IAgentOrigin` predate this PR and describe authenticated session snapshots, trusted socket headers and connection state. The native test no longer imports those types or creates three redundant copied identity objects; it retains explicit claims and expected header assertions. Corrected the schema's stale ticket reference.
4. The scoped Core/SDK/Browser/System Worker `lib,ts,lint` graph passed **16 tasks**. The complete test compiler and **41 tests in 6 existing files** passed with `--maxWorkers=2`: repo-lifecycle, native-system-api, service-projections, both Agent Node suites and service-actor-connections. Existing unrelated lint warnings remain. Independent source review, scoped formatting, diff checks and affected architecture references passed.
5. Phase 3 remains unimplemented. Runtime storage, deployment and publication remain untouched; unrelated handoff work is preserved.

## Phase 3 implementation and verification, 2026-10-26

1. Aggregate and Service owner releases now derive their canonical `contracts` inventory from `actors[*].contracts`, `agents[*].contracts`, `system` and `external`. Identical ordinary releases coalesce across grants; conflicting declarations, wrong families/keys, claims-dependent Agent/System grants and ordinary/external map mismatches reject. Completed releases retain exact readonly System/external subsets. Removed owner `contracts`, generic modules and generic command builders have no compatibility aliases.
2. Required portable System/external version bindings join the existing Actor/Agent bindings and owner-scoped `contractVersions`. Whole-SystemSpec acceptance rejects changed grants under an accepted owner release version atomically. Ordinary ContractSpecs and selected lock formats gain no invocation category or fixed principal. Existing owner/compiler cases cover canonical reuse, invalid grants, immutable acceptance and unchanged lock projections.
3. Fresh Chain admission, Aggregate `authorize.executeCommand` and command-operation destination preparation enforce the exact selected principal/System grant. Exact retained-input recovery precedes fresh grant checks. External observation still requires pending-work authority and the emitting release's exact external registration; frozen Agent delivery preserves its source binding while draining. The harness now supplies complete Actor claims, selected reads and Actor guard context, while its Service administrative subset uses the same typed System-only signature.
4. HTTP/native administrative callers use `(release, input)`, infer only from `release.system`, retain supplied IDs and capture one frozen encoded envelope before transport retries. Shopping promotion execution keeps its deterministic occurrence ID, bounded retry policy and reservation checks. Shopping and Tic-tac-toe callers, existing fixtures, SDK skills, Fragment/CLI guidance, glossary, ADR023, consolidated architecture references and the breaking-change note are reconciled.
5. The CLI loads one named `ISeedProgram` and runs its returned Effect once. Shopping reuses the existing create-only `createProductV1` through both catalog Actor and System grants, checks each business outcome and uses deterministic IDs for twelve unchanged products. Each command retains its own transaction; earlier successes survive a later failure. No upsert, whole-program rollback, automatic retry, parallel submission or storage reset was added.
6. The branch was cleanly rebased onto merged [PR #77](https://github.com/morgs32/zerospin/pull/77)/main `7b44d48e68`; Phase 3 rebased commit `e48108a31b` preserves flat Actor snapshots/headers/connection state and the remaining Agent origin. The complete test compiler plus **154 tests in 30 existing files** passed after that rebase with bounded workers. The final scoped `lib,ts,lint` graph passed **34 tasks for 10 projects** after the valid-command-name inventory fix. Explicit lint checks for changed application test files also passed; unrelated pre-existing warnings remain.
7. The existing `repo-names.spec.ts` CLI case uses the real loader and actual Shopping seed export with controlled configuration/RPC seams. Two runs emit the same **12 encoded commands**. Injected business Failure stops at command **3**; a transport defect stops at command **1**, both through `seed-submit-failed`. A bad module produces `seed-load-failed`; the completed void procedure renders **Seed program completed** without a submitted-command count. These checks do not write retained runtime storage.
8. The inventory and owned grant maps support legal command names such as `constructor`, `toString` and `__proto__` without inherited entries conferring grants. The existing regression assertion specifically proves that an ungranted `toString` cannot execute. Before the final documentation consolidation, scoped source formatting, diff checks and the combined Phase 3/PR77 architecture audit passed: **95 source SHA entries across 63 unique sources** match current source, with affected source ranges and metadata links reconciled. No new test files, fixtures, runners or test configuration were introduced.
9. **Final focused rerun:** the complete test compiler plus **41 tests in seven existing files** passed after all source fixes, with an explicit Nx success summary. The uncached run rebuilt eleven normal dependencies. An earlier exit-zero invocation without a Vitest/Nx summary was treated as inconclusive and replaced by this confirmed run.

10. Final main integration onto `c4f8335fc6` preserves [Plan 273](./273-plan-consolidate-source-readmes-into-documentation.md) documentation ownership and PR #76's typed staging overload and existing Node recovery/refusal cases. Exactly two recovery-test owner constructors changed from `contracts` to `system`; the upstream runtime staging body is unchanged. The scoped **34-task** `lib,ts,lint` graph passed again, followed by the complete test compiler and **2/2 existing Node recovery cases**. Earlier **154/30** and **41/7** results remain their separately recorded, pre-integration evidence.

11. The consolidated documentation audit validates all **877 architecture source SHA/range entries** against current source. The existing Nx formatter checks **146 changed files** successfully; changed Fragment pages have no broken relative paths. The removed owner-module composition entry is deleted from the glossary.

## Rollout outside this completed source scope

`SystemRepo.acceptedSystemSpecs.spec` now requires explicit System/external grant maps. Before a future rollout, identify the exact affected partitions and obtain separate, precise empty-storage authorization or use an explicitly approved fresh environment. Old accepted snapshots receive no optional-field defaults, translation or compatibility decoder. The earlier Phase 2 fixed-schema rollout gates also remain applicable to affected retained state.

Runtime storage, deployment, package publication and sibling consumer adoption were not changed or performed by this implementation. The two unrelated WIP handoffs remain preserved. These future rollout actions are outside the authorized source implementation and verification scope.

## Remaining work

None.
