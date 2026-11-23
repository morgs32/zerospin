# Complete SystemSpec and independent contract-version specs

**Status:** Complete, 2026-10-25. Implementation and authorized framework verification finished; Cloud page/verification and dependency reconciliation are explicitly deferred.

## Problem and agreed behavior

1. Portable contract metadata currently transposes runtime lineage into `payloadShapes` and `failureSchemas`. Replace those collections with each version's immutable own spec. Include every contract version whose schemas are reachable during replay, including omitted ancestors, intermediate adaptation versions and reachable descendants. No portable spec contains `previous`, `next` or another lineage representation.
2. If the contract is not on an aggregate/service release it's not supported. The existing authored `release.contracts` map remains the registration authority. A new command must use the exact version registered on its addressed release. Historical metadata, another release's binding, Actor/Agent exposure and runtime lineage do not grant that support.
3. The **whole SystemSpec** is accepted or rejected in one atomic operation. Comparing immutable contract/release/Actor/Agent facts is internal work during that operation, not independent acceptance of those parts. Retain whole accepted SystemSpecs by hash; use no separate persisted per-component acceptance records or full identity envelope.
4. `makeSystem` finalizes all participating contract lineages after successful validation. Authors must finish upgrades before composing any System that uses those declarations. Reusing an already finalized lineage is valid; extending it afterward is refused, including from another System sharing the same objects.
5. `makeSystemSpec` remains synchronous and constructs the complete, immutable portable snapshot with its flat `.hash`. The hash covers canonical schema-normalized content excluding the hash field itself. It identifies declared metadata, not executable codec transformations, guards, programs, adapters or lineage topology.
6. Repo startup and session-ticket issuance require that their actual compiled SystemSpec hash has been accepted. Replace their scoped structural comparisons with this membership check. Startup remains gated before child local SQL, migrations, bootstrap and activation.
7. Do not add an acceptance-comparison RPC or preflight to replay. Current replay has no such check; the earlier version of this plan proposed one. Complete accepted-spec coverage and finalized runtime lineage make that proposed work unnecessary. Keep stored-byte decoding, adapter-output validation, exact version and recorded-authority checks, history hashes and retained-operation validation.
8. Preserve release/Actor/Agent composition, public session-lock fields, command provenance, guards, idempotency, transaction boundaries and retained-output restoration. No test files, fixtures, runners, compatibility paths, dependency reconciliation, publication or storage resets are authorized by this plan revision.

## Interface and ownership decisions

1. **Complete own contract metadata.** Define `ContractSpecSchema` and infer the existing `IContractSpec` from it. Retain `commandName`, `version`, singular `payloadShape`, singular `failureJsonSchema`, `resultJsonSchema`, `models`, `operations` and `operationsJsonSchema`. Add nullable `claimsJsonSchema` and capture the existing optional external response-schema/timeout facts in `finishContractDefinition` before sealing. A missing claims declaration is represented by `null`. Reuse existing codec projections; do not fingerprint executable functions.
2. **Separate version facts from exact release bindings in compiled metadata.** Within each Aggregate/Service owner, SystemSpec contains `releases` and `contractVersions`. `contractVersions[commandName][version]` contains the complete own spec once. Each compiled release, Actor and Agent contract map binds a command name to its exact version. The schema validates map keys, own identities, reference existence and canonical release exposure. Factory-owned `release.spec`, Actor/Agent snapshots and executable declarations continue to capture their own selected facts; the SystemSpec compiler emits the normalized owner bundle. No new author-maintained registry, author factory argument or session-lock reference format is introduced.
3. **Derive scope rather than copying identities.** Contract identity is Aggregate/Service namespace plus owner name plus the own spec's `commandName` and `version`. It is shared across releases of that owner; owner release, Actor and Agent versions do not become part of it. Derive comparison keys inside compilation/acceptance. Do not put a full owner identity on `contract.spec` or create persisted `{ identity, spec }` component records. Different owners and Aggregate/Service namespaces remain independent.
4. **Compile the actual runtime dependency set.** Start from every registered owner release's executable contract objects and collect both directions of each runtime lineage until exhausted, deduplicating by owner/command/version. Include every source, intermediate and execution version, even when none of the currently configured releases selects that version. Reject conflicting same-owner own specs while compiling. Actor/Agent/session exposure cannot introduce unrelated contracts. Never use stale historical maps from a previously captured `release.spec` as the dependency source. Historical codec presence does not require configuring a release that supports new commands using it.
5. **Finalize before returning a System.** After all existing `makeSystem` validations succeed, mark every reachable contract node finalized in the existing internal construction machinery. `constructUpgradedContractVersion` must reject a finalized parent before constructing or linking a child. Mark both `previous` and `next` nodes, not just registered heads; an unsuccessful System composition must not finalize declarations. Keep pre-composition upgrades and reuse of an already finalized graph valid. Add no public finalization flag, reopening operation, per-System resolver snapshot or lifecycle RPC. `makeSystemSpec` remains observational and does not seal declarations as a side effect. Its current structural input surface must not allow an unfinalized graph to be hashed: assert internal finalization state (and narrow to the completed System input where appropriate), without a new public wrapper or token.
6. **Finalize portable content and hash together.** Construct the complete body, validate/encode it through the canonical schema and an explicit JSON-value boundary, then recursively canonicalize JSON with locale-independent object-key ordering while preserving array order, compute synchronous SHA-256 over its UTF-8 bytes, then attach `.hash` and recursively freeze the final result. Reject non-JSON metadata rather than allowing `JSON.stringify` to drop or coerce it; replace schema-document `Schema.Unknown` fields with JSON-valued codecs where appropriate, or validate the final encoded body. Use existing backend `node:crypto` support; no dependency or asynchronous API is needed. Share this encoding/hash calculation between construction and acceptance. Do not use registry sorting or `localeCompare` as the canonical format. Inspection, Studio and system-deployment artifacts use this same SystemSpec shape.
7. **Retain accepted whole snapshots.** Replace the current component-record storage with `acceptedSystemSpecs`, containing unique `hash` and complete `spec` validated by `SystemSpecSchema`. Retain all accepted snapshots, including after release omission, so later reintroduction cannot redefine old versions and previously accepted code can coexist. Recompute the hash of received candidate content before trusting its supplied `.hash`. `SystemApi.acceptSystemSpec` may send a candidate built by a different Cloudflare Worker version than SystemRepo is executing; acceptance must hash the supplied validated snapshot, never substitute SystemRepo's local compiled hash. During one synchronous acceptance transaction, compare incoming immutable facts against retained snapshots, then insert the whole snapshot only if every check passes. Equal reacceptance is idempotent; any conflicting historical or selected fact rejects the whole operation and writes nothing. New historical-only dependencies are included in this whole acceptance without enabling fresh commands. Root Agent Node selections remain SystemSpec composition facts and may change between accepted snapshots without redefining an unchanged versioned declaration. Do not add a persisted per-component index, individual acceptance API, acceptance token or cache; derive temporary comparison lookups only inside acceptance.
8. **Use the existing startup gate.** The configured executable System supplies `makeSystemSpec({ system }).hash` through the existing registration path as `systemSpecHash`, replacing `specs`. SystemRepo strictly decodes it and requires an `acceptedSystemSpecs` match before registration writes. Remove `requiredSpecs`, `IRequiredSpecs`, `IRepoSpecs`, their selectors and scoped comparison helpers. Preserve declaration-existence/retirement refusals that were incidental to those selectors. The registration await stays before the first child PRAGMA/local schema operation. A rejection cannot register metadata, register Aggregate membership or activate the child. SystemRepo retains its existing self-registration exemption so first acceptance can bootstrap; its inspection/acceptance endpoints must not require prior acceptance of themselves.
9. **Use the same prerequisite for session tickets.** Derive the hash from SystemRepo's own configured executable System, not browser/session input, an environment pin or a caller-supplied accepted identifier. Require its acceptance before generating/retaining a ticket. Preserve `validateSessionAdmission`, exact current owner/Actor/Agent/session bindings, claims validation, identity/path checks, ticket family/expiry and one-use consumption. Remove only the repeated structural comparison. This is a local membership read, not a new RPC or token in public session fields.
10. **Coordinate with Plan 267.** [Explicit AggregateChain registration](267-plan-aggregate-chain-registration.md) still owns its two registration operations, typed adapters, physical metadata writes and atomic Aggregate membership. This plan supersedes only that plan's scoped-spec inputs/selectors/comparisons: both operations and the registration context take `systemSpecHash` instead. Do not reintroduce a generic AggregateChain dispatcher or split its transaction. Only Plan 266 is edited during this revision; reconcile the overlapping implementation contracts when carrying out the plans.

## Annotated examples

1. Finish upgrades before System composition. The authored release still selects exactly one version of each command; it does not register every codec dependency.

```ts
// renameUserV3 and its V1/V2 lineage were constructed before this release.
const userReleaseV2 = makeAggregateRelease(user, {
  version: 2,
  contracts: { renameUser: renameUserV3 },
});
const system = makeSystem({
  name: 'qrk',
  aggregates: { user: { 2: userReleaseV2 } },
});
// All reachable V1/V2/V3 nodes are now finalized. A later upgrade is refused.
const spec = makeSystemSpec({ system }); // Complete frozen snapshot plus hash.
```

2. The compiler discovers version facts automatically. This abbreviated proposed SystemSpec shows exact release bindings alongside complete historical metadata; it is not another object authors must construct.

```ts
{
  systemName: 'qrk',
  hash: '<SHA-256 of canonical body excluding hash>',
  aggregates: {
    user: {
      releases: {
        2: {
          name: 'user',
          version: 2,
          contracts: { renameUser: 3 }, // Only V3 supports new commands here.
          // Existing models, Actors and Agents remain release facts.
        },
      },
      contractVersions: {
        renameUser: {
          1: renameUserV1.spec, // Historical source, no current release required.
          2: renameUserV2.spec, // Intermediate schema, not just the endpoints.
          3: renameUserV3.spec, // Selected execution declaration.
        },
      },
    },
  },
  // services uses the same owner-scoped layout; Agent Node pins remain present.
}
```

3. The whole snapshot is the durable acceptance fact. Individual comparisons occur only inside this operation; startup performs a hash membership read.

```ts
// SystemRepo verifies content/hash correspondence, compares immutable facts
// with earlier snapshots, and inserts { hash, spec } in one transaction.
yield * acceptSystemSpec({ db, spec });

// Existing child construction/registration position, before child local SQL.
const systemSpecHash = makeSystemSpec({ system }).hash;
yield * registerWithSystem({ key, name, schema, systemSpecHash });
// SystemRepo requires this hash before its existing registration writes.
```

4. Fresh admission still uses the addressed release's exact contract binding. The compiled historical version collection is never an admission lookup.

```ts
const contract = release.contracts[command.commandName];
if (contract === undefined || contract.version !== command.contractVersion) {
  // Return the admission path's declared unsupported-version failure.
}
// Decode with this exact declaration; lineage remains available for replay.
```

5. Replay keeps its existing transaction boundary without an acceptance RPC. A V1 command may traverse V2 to V3 after V1's release is omitted because their complete schema facts were included when this SystemSpec was accepted. Missing executable Actor/external declarations still refuse replay.

```ts
// Repo startup already required this finalized SystemSpec's accepted hash.
// Existing replay resolution and decoding validate source/intermediate payloads.
yield * execution.withPermits(1)(materializeCommandTx(/* existing inputs */));
// Retained output restoration still bypasses adapters/programs and reapplies
// recorded operations using the exact selected model codecs.
```

## Implementation steps

1. Add the canonical own-contract schema and complete claims/external facts in `finishContractDefinition`. Replace property-history projections with selected `contract.spec` reads in release/Actor/Agent metadata and session fact projection. Delete `projectContractSpec.ts` after replacing its imports. Preserve public lock field shapes and compile-time historical payload/failure inference.
2. Add internal lineage finalization after successful `makeSystem` validation and the early refusal in the upgrade constructor. Reuse this complete finalized graph when compiling owner-scoped `contractVersions`. Normalize compiled release/Actor/Agent contract references and validate their identities, existence and exact release bindings through `SystemSpecSchema`. Preserve immutable factory snapshots: compiling a later System must not rewrite an existing release's own metadata.
3. Update `ISystemSpec`, `SystemSpecSchema` and `makeSystemSpec` together for the complete owner bundles and flat hash. Implement one canonical encoding/SHA-256 calculation used by construction and received-spec verification. Keep the factory synchronous, detach/freeze its final JSON, and reuse the full result across `getSystemSpec`, inspection, acceptance and Studio serialization. Update SDK exports only as required by changed existing types; expose no new author registration/finalization API.
4. Replace component-record persistence with the whole-snapshot `acceptedSystemSpecs` table. Rewrite acceptance to strictly decode and verify the supplied hash, compare immutable version facts against every retained accepted snapshot, and insert only the whole successful snapshot in one transaction. Retain omissions permanently and preserve equality/idempotency and actionable owner/command/version mismatch diagnostics. Add a shared internal accepted-hash membership program used by registration and ticket issuance. Delete superseded component-record schemas/projectors/read/comparison modules; retain no compatibility alias or separately callable component-acceptance path.
5. Replace registration `specs` with `systemSpecHash` across SystemRepo, its internal namespace/callers, the constructor contract and all sixteen child configurations. Remove scoped selectors/types/helpers and maintain every declaration-availability refusal elsewhere at its owning lookup. Keep the startup await before local SQL and preserve SystemRepo's exemption. If Plan 267 is implemented, update both explicit registration operations/adapters rather than restoring the former dispatch branch; preserve its atomic membership transaction in either execution order.
6. Replace session-ticket structural comparison with membership of the actual configured SystemSpec hash. Keep all session admission/identity/claims/capability validation and ticket consumption behavior. Remove the obsolete scoped-admission helper after transferring any remaining binding existence checks to the existing admission validation. Do not add a hash supplied by the browser, a session token field or a per-command check.
7. Separate fresh admission from historical resolution in AggregateChain, ServiceChain/shared admission, aggregate `authorize.executeCommand`, Aggregate/Service session-lock selection and service capability restoration. Require the exact release-selected version for every new command. Preserve ordinary/external kind, claims, owner, Actor and producer checks and existing canonical Actor bindings. Previously admitted retries remain idempotent. Keep replay decoding/adaptation and retained-output restoration; add no comparison RPC, path-preflight helper or new replay capability to `SystemRepos`.
8. Update Declaration Board/Studio and existing direct SystemSpec consumers to resolve selected contract versions through the owner's compiled version collection. Continue displaying the release-bound versions, not a new history browser; field dialogs use singular `payloadShape`. Update system-deployment artifact codecs and consumers against the same final schema, preserving artifact/candidate equality before acceptance. Keep QRK's exact dependency reconciliation and publication outside this plan.
9. Extend existing verification seams with the scenarios below, then run the scoped Nx checks. Resolve failures attributable to this change; preserve unrelated WIP. Do not create test, fixture, runner or configuration files. Do not add per-replay acceptance RPCs, caches or a replacement adaptation-path abstraction merely to support checks that are no longer needed.
10. After implementation, reconcile glossary, lifecycle patterns/READMEs, affected architecture flows, Fragment contract/release guidance, SDK feature/evolution guidance and research with the implemented result. Describe whole-SystemSpec acceptance, exact fresh-version support and finalization order consistently. Evaluate an ADR only if the implemented decision meets all repository criteria. Record actual verification and archive this plan only when no required work remains.

## Planned files

Legend: `+` create, `~` modify, `-` remove. Groups identify the implementation area; inspect concurrent WIP before editing. Proposed internal filenames can follow nearby conventions without adding public APIs.

```text
zerospin/
  packages/core/src/
    contracts/
      + ContractSpecSchema.ts
      ~ types.ts
      ~ make/constructContractVersion.ts
    declaration/
      ~ ReleaseSpecSchemas.ts
      ~ makeReleaseSpecs.ts
    ~ aggregate/AggregateSpecSchema.ts
    ~ service/ServiceSpecSchema.ts
    system/
      ~ types.ts
      ~ SystemSpecSchema.ts
      + hashSystemSpec.ts
      make/
        ~ makeSystemSpec.ts
        makeSystem/
          ~ makeSystem.ts
      project/
        - projectContractSpec.ts
        ~ projectActorSpec.ts
        ~ projectSessionFacts.ts
    ~ aggregateSession/make/makeAggregateSessionSpec.ts
  packages/system-worker/src/
    ~ getSystemSpec/getSystemSpec.ts
    makeMigratableDORepo/
      ~ makeMigratableDORepo.ts
      ~ types.ts
      ~ README.md
    SystemRepo/
      ~ SystemRepo.ts
      ~ systemRepoDbConfig.ts
      ~ README.md
      acceptSystemSpec/
        ~ acceptSystemSpec.ts
        + acceptSystemSpecTx.ts
      + requireAcceptedSystemSpec.ts
      - acceptedDefinitions/ (superseded component storage and helper modules)
      - assertAcceptedSpec/assertAcceptedSpec.ts
      registerRepo/
        ~ registerRepo.ts
        ~ registerRepoWithSystem.ts
        ~ systemRepoNamespaces.ts
        - RepoSpecsSchema.ts
        - requireAcceptedRepoSpecs.ts
      sessionWebSocketTickets/
        ~ createSessionWebSocketTicket.ts
        ~ validateSessionAdmission.ts
        - requireAcceptedSessionAdmission.ts
    ~ repoServices/SystemRepos.ts (only if an existing signature requires it)
    ~ AggregateChain/AggregateChain.ts
    ~ AggregateVersionRepo/AggregateVersionRepo.ts
    ~ AggregateVersionChain/AggregateVersionChain.ts
    ~ AggregateActorVersionRepo/AggregateActorVersionRepo.ts
    ~ AggregateActorVersionChain/AggregateActorVersionChain.ts
    ~ AggregateAgentVersionRepo/AggregateAgentVersionRepo.ts
    ~ AggregateAgentVersionChain/AggregateAgentVersionChain.ts
    ~ AggregateAgentNodeRepo/AggregateAgentNodeRepo.ts
    ~ ServiceChain/ServiceChain.ts
    ~ ServiceVersionRepo/ServiceVersionRepo.ts
    ~ ServiceVersionChain/ServiceVersionChain.ts
    ~ ServiceActorVersionRepo/ServiceActorVersionRepo.ts
    ~ ServiceActorVersionChain/ServiceActorVersionChain.ts
    ~ ServiceAgentVersionRepo/ServiceAgentVersionRepo.ts
    ~ ServiceAgentVersionChain/ServiceAgentVersionChain.ts
    ~ ServiceAgentNodeRepo/ServiceAgentNodeRepo.ts
    ~ AggregateChain/admitAggregateCommands/validateNewAggregateCommand.ts
    ~ checkAdmission.ts
    ~ AggregateVersionRepo/authorizeSession/authorizeSession.ts
    ~ AggregateVersionRepo/authorizeSession/selectAggregateLockMembers.ts
    ~ ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/selectServiceLockMembers.ts
    ~ ServiceActorVersionChain/readServiceConnectionCapabilities.ts
  packages/system-diagrams/src/
    ~ makeDeclarationBoard.ts
    ~ SystemDiagrams.tsx
  packages/studio/src/
    ~ fixtures/agents.ts
    ~ server/makeStudioViteConfig.ts
    ~ entry.rsc.tsx
  ~ packages/cli/src/commands/useStudioServer.ts
  ~ packages/sdk/src/index.ts (existing SystemSpec exports only if needed)
  packages/system-worker/tests/
    ~ repo-names/repo-names.spec.ts
    ~ repo-lifecycle/repo-lifecycle.workerd.spec.ts
    ~ chain-command-delivery/chain-command-delivery.workerd.spec.ts
    ~ service-command-admission/service-command-admission.workerd.spec.ts
    ~ service-replay/service-replay.workerd.spec.ts
  wiki/
    ~ glossary.md
    ~ patterns/system-worker/repo-lifecycle.md
    ~ architecture/AuthoredSystem.md
    ~ architecture/SystemApi.md
    ~ architecture/server/admitAggregateCommands.md
    ~ architecture/server/admitServiceCommand.md
    ~ research/system-spec-hash-construction.md
  fragment/content/handbook/
    ~ contracts-and-operations.md
    ~ releases-and-systems.md
  packages/sdk/skills/
    ~ zerospin-author-feature/SKILL.md
    ~ zerospin-evolve-declarations/references/declaration-evolution.md
zerospin-cloud/ (canonical source, never a vendor copy)
  apis/src/
    ~ CloudRepo/DeploymentArtifact.ts
    ~ CliApi/deployArtifact.ts
  ~ existing artifact/Studio consumers identified by typecheck
qrk.sh/
  ~ wiki/research/zerospin-contract-payload-history.md (post-implementation result only)
```

If Plan 267 lands first, its `registerAggregateChain` operation/adapter and registration context are additional existing signature updates; its separate behavior and files remain owned by that plan. Replay source files are verification/read sites, not places to add acceptance helpers. Historical archived plans remain historical; explain supersession in current documentation instead of rewriting them as implemented behavior.

## Verification and acceptance

1. **Complete own metadata and compiled coverage:** round-trip strict SystemSpec/contract codecs; verify rejection of non-JSON metadata, deep detachment/freeze, singular payload/failure facts, claims and external facts, and absence of property-history maps/portable lineage. Include an ordinary source/intermediate/execution chain where the first two versions have no configured release, plus a reachable descendant used for downward adaptation. Prove every actual codec-bearing node appears in the owner's compiled versions. Keep Actor/Agent exact bindings, public session-lock shape and release-selected Declaration Board display.
2. **Finalization:** upgrades before `makeSystem` succeed; upgrades from any participating finalized node refuse without changing the graph or hash. A failed System validation does not finalize declarations. The compiler refuses an unfinalized graph passed through the former structural input surface. Reusing a finalized graph in another System succeeds. Capturing a release's own spec before a later pre-System upgrade preserves its snapshot. Verify the global shared-lineage restriction explicitly.
3. **Deterministic content identity:** reordered nested object keys produce the same hash; changing a declared schema, release binding or root composition fact changes it; array-order changes remain visible. Verify acceptance uses the supplied candidate content even when SystemRepo executes another compiled System; supplied hash/body mismatches refuse acceptance, `.hash` is excluded from its own input, and the same compiled content yields the same result through Worker/CLI serialization paths. The synchronous factory and backend/browser export boundary remain usable.
4. **Atomic whole acceptance and retention:** equal snapshots are idempotent. An edited source/intermediate/selected contract fact under the same owner/command/version rejects the entire snapshot, including claims, result/failure, read-model, operation and external facts. Any newly introduced facts from the failed snapshot remain absent. Reuse across owner releases is equal, namespaces do not collide, and historical facts remain protected after all releases selecting them are omitted. Adding a new codec dependency or changing Node pins may produce a new accepted snapshot without redefining unchanged version facts. A retained earlier accepted hash remains usable after a newer snapshot is accepted.
5. **Startup and session gates:** an unaccepted but correctly computed hash refuses child startup before PRAGMA/schema/bootstrap/activation, physical registration and Aggregate membership. An accepted actual hash succeeds without structural re-comparison. Verify the factory/adapter derives its configured System's hash without a caller override, and independently prove RPC rejection of malformed or unaccepted hashes. Membership alone cannot detect a trusted internal caller substituting another already accepted hash; do not compare a child's hash with SystemRepo's potentially different executing hash. First acceptance remains possible through the SystemRepo exemption. Session issuance from unaccepted SystemRepo code refuses before ticket retention while exact release/Actor/Agent/claims/session-lock validation and ticket family/expiry/one-use behavior remain enforced. Preserve Plan 267's atomic registration rollback case.
6. **Fresh admission:** both Aggregate and Service exact release-bound versions succeed; an older version bound only on another release and a runtime-only ancestor/descendant are refused. Cover session-lock, authorization-time system commands and previously admitted retries. Preserve guards, claims restrictions, provenance and external-continuation behavior.
7. **Replay and restoration:** after whole acceptance, a retained V1 ordinary command adapts through V2 into V3 after V1/V2 releases are omitted, with no acceptance RPC per command. Changed historical facts refuse at whole acceptance; unaccepted code refuses at startup, before replay can begin. Keep payload and adapter-output rejection behavior, recorded Actor/Agent authority and missing executable external-contract refusals. Restoring retained evaluated output still replays recorded exact-model operations without running adapters/programs. Neither the hash nor these checks claims callback-body immutability.
8. **Existing seams and checks:** extend the existing Repo metadata/lifecycle, command-admission and replay files listed above; reuse their current setups. Inspect resolved Nx targets before running one explicit `lib`, `lint` and `ts` graph for affected Core/System Worker/SDK/diagrams/Studio/CLI and required consumers. Run the existing backend test target filtered to affected existing files; its compiler still checks the full test program. Include canonical Cloud artifact consumers in their existing type/build checks when the shared schema changes. Finish with scoped formatting and diff checks. Never verify Explorer. No new test/fixture/runner/configuration files, application storage reset, deployment, publication or consumer dependency reconciliation are part of verification.

## Decisions, alternatives and cutover

1. Use complete own version specs collected automatically, rather than parallel property-history maps or per-replay comparison requests. Keep compiled codec dependencies outside immutable release snapshots so adding a version does not redefine an existing release. Historical metadata grants no new-command support.
2. Finalize lineage at System composition rather than maintaining a second per-System runtime resolver. The explicit cost is that an already used shared declaration cannot subsequently be extended; declare all upgrades first. Existing executable adapter selection/behavior remains unchanged within the finalized graph.
3. Retain whole accepted SystemSpecs keyed by hash. Internal immutable-fact comparisons happen only when accepting a snapshot; repeated startup/session structural comparisons and a separately persisted component-acceptance model are removed. This initial implementation deliberately avoids a second persisted index and does not add a cache or per-command hash check.
4. This revises the earlier Plan 266 design in place. Do not create `requireAcceptedContractSpecs`, Aggregate/Service replay comparison programs or `getContractVersionPath` solely for that removed preflight. Do not expose a new public registration/finalization API or alter the authored owner registries. Preserve factory-owned metadata and owner-local Agents from Plans 263/264 and the distinct AggregateChain transaction from Plan 267.
5. The SystemRepo storage and portable spec shapes are a hard cutover. No fallback decoder, alias, migration, dual table or translation path is permitted. Empty affected storage is an operational prerequisite requiring separate explicit authorization; this plan authorizes no reset. A cutover must not silently discard immutable history needed by retained commands. Establish the retained-history/initial whole-snapshot acceptance procedure before any authorized rollout; otherwise rollout remains blocked. This planning task performs no deployment or dependency reconciliation.
6. Reuse the final SystemSpec format across local compilation, inspection, Studio and system-deployment artifacts. Acceptance records approval of declared metadata, not proof that a Cloud system deployment, Cloudflare Worker promotion or initialization succeeded. Preserve existing artifact/candidate matching and deployment sequencing.
7. Implementation preserves unrelated WIP. No package publication, consumer dependency update, operational rollout or application storage reset was performed. Cloud's old-layout page and its verification were explicitly deferred by the maintainer to dependency reconciliation.

## Relevant source and prior work

1. [Contract own metadata and mutable lineage construction](../../../packages/core/src/contracts/make/constructContractVersion.ts), [complete own contract schema](../../../packages/core/src/contracts/ContractSpecSchema.ts), [System composition](../../../packages/core/src/system/make/makeSystem/makeSystem.ts), and [current SystemSpec factory](../../../packages/core/src/system/make/makeSystemSpec.ts).
2. [Payload source resolution](../../../packages/core/src/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts), [intermediate adaptation validation](../../../packages/core/src/contracts/decodeAndAdaptPayload/adaptPayload/adaptPayload.ts), and [contract claims validation](../../../packages/core/src/contracts/prepare/prepareContractClaims.ts).
3. [Current acceptance](../../../packages/system-worker/src/SystemRepo/acceptSystemSpec/acceptSystemSpec.ts), [SystemRepo storage](../../../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts), [startup registration](../../../packages/system-worker/src/SystemRepo/registerRepo/registerRepo.ts), and [session validation/issuance](../../../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/createSessionWebSocketTicket.ts).
4. [Aggregate replay](../../../packages/system-worker/src/AggregateVersionRepo/replayCommands/replayCommand.ts), [Service replay](../../../packages/system-worker/src/ServiceVersionRepo/replayCommands/replayCommand.ts), and [exact-model retained-operation decoding](../../../packages/core/src/contracts/prepareReplayAppliedOperation.ts).
5. [Plan 261](261-plan-scoped-repo-spec-checks.md), [Plan 263](263-plan-factory-owned-release-specs.md), [Plan 264](264-plan-owner-local-agents-and-node-selection.md), and [Plan 267](267-plan-aggregate-chain-registration.md). This plan supersedes Plan 261's property-history/scoped-comparison design while preserving its pre-local-SQL admission boundary.
6. [Complete replay coverage and hash research](../../research/system-spec-hash-construction.md), [SystemSpec lifecycle research](../../research/system-spec-lifecycle.md), [owner identity research](../../research/contract-spec-identity.md), and [initial QRK research](../../../../qrk.sh/wiki/research/zerospin-contract-payload-history.md). Earlier component-acceptance/per-replay proposals in those notes are superseded by this plan.

## Implementation notes

1. Complete own contract metadata, normalized owner bundles, lineage finalization and shared canonical hash calculation are implemented. Finalization stays beside the existing private lineage maps in `constructContractVersion.ts`; no separate finalization module or System-provenance registry was needed.
2. Whole `acceptedSystemSpecs` persistence and startup/session hash gates replace the component/scoped comparison paths. Exact fresh-version checks remain separate from historical replay decoding. No per-replay acceptance RPC or preflight was added.
3. Cloud's old-layout page and its verification were explicitly deferred by the maintainer to dependency reconciliation during implementation. Cloud source, package pins and unrelated WIP remain untouched; this is outside the remaining framework work.
4. Build, typecheck and lint succeeded for the eight selected framework packages and seven dependency tasks. The complete test program compiles. All affected backend suites have passing results after the scoped reruns below. Existing unrelated warnings and an Nx Cloud remote-cache authorization notice did not fail the successful checks.
5. No new test files, fixture files, runners, compatibility paths or storage reset were introduced. Historical replay materialization was verified through the existing domain/database seam with an explicit System layer; acceptance/startup are verified independently, without redefining the fixed Durable Object fixture to imitate an accepted end-to-end configuration.

## Verification results

1. **Framework graph passed:** `pnpm nx run-many --projects=@zerospin/core,system-worker,@zerospin/sdk,@zerospin/system-diagrams,@zerospin/studio,@zerospin/cli,@zerospin/dev-worker,@zerospin/browser --targets=lib,ts,lint`. Final System Worker `ts,lint` and lint-only checks also passed after the test edits. Introduced lint findings were fixed; unrelated existing warnings remain unchanged. Nx Cloud reported remote-cache authorization warnings without failing these commands.
2. **Affected backend behavior passed through existing seams:** the selected set covers Repo metadata/lifecycle, Aggregate command delivery, Service admission/replay/connections, Aggregate/Service Agent Nodes and adapter failures. The broad run established passing results for eight suites; scoped fixes were followed by a clean two-suite run of lifecycle and connections with **16 tests passed, no unhandled errors**. Each test target also compiled the full existing test program. No passing unrelated suite was broadened into a workspace polish pass.
3. **History proof:** the existing replay spec materializes V1 through omitted V2 into V3 using the real materialization program and existing database/key/model with an explicit System dependency. It verifies the resulting resource, checkpoint/disposition hash and complete retained output. Acceptance and binding to executing code are separately verified at the lifecycle seam; this is not a configured Worker end-to-end rollout claim.
4. **Gate/transaction proof:** public registration rejects malformed/unaccepted hashes without metadata or membership writes. The existing positive constructor test observes the actual compiled hash and confirms registration precedes activation; source inspection places its await before local SQL. The real registration transaction's forced SQL failure is captured with `Effect.exit` at its owning domain seam and rolls back both writes. Ticket tests prove the local executing hash prerequisite, even after another candidate is accepted, while preserving exact locks/claims, expiry, family and one-use checks. No artificial paused-Promise protocol or unhandled-error suppression remains.
5. **Metadata and admission proof:** existing tests cover complete ancestor/intermediate/descendant own specs, claims/external facts, finalization/reuse/refusal, canonical nested key ordering and content changes, atomic historical conflicts after omission, and exact fresh-version refusal while historical upward/downward decoding remains possible. Declaration Board selection was reviewed directly and its owning library/typechecks passed; no internal helper export was added merely for testing.
6. **Formatting/documentation:** all 57 changed TypeScript files passed scoped `oxfmt --check`; `git diff --check` passed. In-scope architecture/handbook/skills/glossary/research now describe the implemented model. New source links and code fences were checked; existing unrelated TraceExplorer links remain outside scope. Intent skill frontmatter was preserved; the generic Codex validator does not recognize its preexisting `requires` key, so that metadata was not rewritten to make the validator fit.
7. **Boundaries preserved:** no new test files, fixture files, runners, configuration, compatibility paths, dependency pins or application storage resets. The preexisting support-rule edits and Plan 267 remain intact. Cloud's page/verification, publication and dependency reconciliation remain separate authorized work. The fixed storage/spec cutover must be handled before a later rollout; no reset or migration was performed here.

## Remaining work

None within this implementation. Publication, deferred Cloud page/verification, consumer dependency reconciliation and any separately authorized operational cutover remain outside Plan 266's completed framework work.
