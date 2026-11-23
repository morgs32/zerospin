# Factory-owned Actor specs

**Status:** Completed and verified, 2026-10-26. Reviewed against completed Plans 266 and 267; adopting Plan 270 phase 1's Release API names.

Implementation began on [PR #70](https://github.com/morgs32/zerospin/pull/70) (`codex/contract-release-apis`, original base commit `2399fbd1f6105f561e9fe766b0a8f6686a4a523b`), which renames Actor/Contract factory APIs and result types to Release without changing numeric versions or metadata. PR #70 has since merged; [PR #71](https://github.com/morgs32/zerospin/pull/71) is rebased onto `main` at `5e83e0f438af1dc37cc571dff62c8c3a3da0b52a`, with unchanged implementation contents. Versioned Repo/Chain names remain unchanged.

The [source review](../../research/factory-owned-actor-specs-review.md) records the metadata-stage distinction, preservation oracle, finalization boundary and final Plan 267 integration contract reconciled below.

## Problem and intended behavior

1. Aggregate and Service Actor factories validate and freeze executable declarations and capture selections, but do not own their portable specs. Each enclosing Release currently runs `projectAggregateActorSpec` or `projectServiceActorSpec` again. The time at which Actor metadata becomes a snapshot therefore belongs to the enclosing Release rather than the Actor construction.
2. Give every completed Aggregate and Service Actor version an eager, required, readonly `.spec`. Construct it after validation and selection capture, detach all portable JSON metadata, recursively freeze that metadata, then freeze the completed canonical Actor declaration. Repeated reads return the same stored value; there is no getter or lazy cache.
3. Preserve the current Actor JSON values exactly: name/version, each selected contract's own `.spec`, exposed Model specs, identity/claims JSON Schemas, route-pattern source, captured selections and authentication metadata. Aggregate authentication retains its credentials JSON Schema; Service authentication retains either `'none'` or its credentials JSON Schema. Do not add owner identity, callbacks or guards to this shape.
4. Preserve the current canonical SystemSpec content and hash for the same captured static declaration facts. [Plan 266](./266-plan-independent-contract-version-specs.md) governs whole-snapshot acceptance, own-version Contract specs, lineage finalization and compiled numeric contract bindings. This change does not reintroduce independent component acceptance or scoped registration. Actor version comparisons across enclosing Releases remain internal checks against retained whole SystemSpecs.
5. Preserve executable callbacks, query databases, runtime codecs, contract instances and their generic inference. Recursively freeze only newly owned JSON metadata. Preserve existing Actor provenance checks, the within-System rule that repeated Actor name/version registrations under one owner use the same canonical Actor object, and the behavior of both Actor update helpers. Portable JSON equality does not replace executable declaration identity.

## Interface and ownership

1. Keep `AggregateActorSpecSchema` and `ServiceActorSpecSchema` in the existing data-only `declaration/ReleaseSpecSchemas.ts`. These describe the factory snapshot with full selected Contract specs. Export the factory snapshot types beside them:

   ```ts
   export type IAggregateActorSpec = typeof AggregateActorSpecSchema.Type;
   export type IServiceActorSpec = typeof ServiceActorSpecSchema.Type;
   ```

2. Add `readonly spec: IAggregateActorSpec` to both `IAnyAggregateActorRelease` and the precise `IAggregateActorRelease`. Add `readonly spec: IServiceActorSpec` to `IAnyServiceActorRelease` and the precise `IServiceActorRelease` exported by its factory. These are result properties, never authored constructor or update inputs. Preserve current inference for name/version literals, claims, selections, contracts, credentials and Effect requirements, including existing erasures. In particular, the precise Aggregate Actor result currently erases its authentication credentials to `Schema.Codec<unknown, unknown>`; improving that unrelated typing is outside this change.
3. Add `declaration/makeActorSpecs.ts` with explicit `makeAggregateActorSpec` and `makeServiceActorSpec` builders. Give each an explicit canonical return type and structural inputs that select only the required pre-spec fields: `name`, `version`, `contracts`, `exposedModels`, `identity`, `capturedSelections` and `authentication`. No input depends on the completed Actor's `.spec`; no `ReturnType` cycle, new cast or domain dispatcher is needed.
4. Move the actual shared Actor fact construction into these builders. Reuse `projectModelSpec`, `projectSortedRecord` and selected `contract.spec` values. Preserve strict decoding through the named Actor schemas, detach the complete decoded JSON value, then call `sealOwnedMetadata`. Preserve JSON-value validation for schema documents. Actor capture neither traverses Contract lineage nor requires or triggers its finalization. Finishing an Actor must leave Contract upgrades available until a successful `makeSystem` finalizes the participating graph.
5. Preserve the two existing metadata stages explicitly. `actor.spec.contracts[commandName]` and `release.spec.actors[actorName].contracts[commandName]` contain the selected Contract's complete own spec. The final `SystemSpec.aggregates/services[ownerName].releases[version].actors[actorName].contracts[commandName]` contains only its numeric version binding; full version facts live in the owner's `contractVersions`. Do not compare a factory Actor snapshot directly with that compiled Actor object or change either schema to make them identical.
6. Owner Release builders select `actor.spec`. Their existing complete-output clone/seal remains; an embedded factory Actor spec must have equal JSON values, without requiring reference identity with the Actor declaration's `.spec`. The existing SystemSpec compiler continues lowering only contract maps and collecting the actual runtime dependency graph from executable `release.contracts`, in both lineage directions, after System finalization. An Actor snapshot is never a replacement dependency source, support registry, hash input wrapper or acceptance prerequisite.

## Implementation

1. Before changing factory capture or deleting the old projector, record a fixed canonical hash for one compact SystemSpec containing both Actor families in the existing Node regression. Use existing direct declaration imports, with meaningful Actor contracts and selections, as the pre-refactor oracle. Keep that expected hash and a few explicit compiled-fact assertions after the refactor; do not retain an old projector, duplicate compiler or separate baseline fixture. A changed hash is a preservation failure to diagnose, not permission to regenerate the expected value after the change.
2. Add the two canonical Actor spec type exports and the two builders. Remove `system/project/projectActorSpec.ts` after migrating its only production consumers; update imports and documentation without compatibility re-exports or forwarding wrappers.
3. In `constructAggregateActorRelease`, retain the existing validation order and create the completed fields, including one selection capture, before building its spec. Attach `.spec` before freezing the canonical `AggregateActorRelease` instance. Both direct construction and `updateAggregateActorRelease` must reach this same capture point. Do not spread the completed Actor, including its old spec, back into constructor inputs.
4. In `makeServiceActorRelease`, perform the equivalent capture after validation, default resolution and selection capture. Preserve optional authorization, guard ownership, Service authentication variants and canonical instance validation. `updateServiceActorRelease` already delegates to this factory; ensure each update constructs a new spec and leaves its predecessor unchanged. Both update helpers already forward authored fields rather than a completed Actor, so no updater production edit is required unless an actual integration failure appears.
5. Replace both Actor projector callbacks in `makeReleaseSpecs.ts` with `actor => actor.spec`. Preserve owner validation of Actor contract/model membership. Attaching a spec never makes a contract supported: support still requires its exact registration on the enclosing Aggregate or Service Release.
6. Extend the existing Node regression at the seams below and reuse existing lifecycle/admission tests. No new test files, fixtures, runners or configuration. Do not alter registration, session admission, selected-version session-lock projection, transaction boundaries or acceptance storage.
7. After implementation, reconcile the glossary, both Actor module READMEs, Actor authoring guidance and the affected AuthoredSystem workflow sections. Replace deleted-source citations, align any affected sequence messages/annotated steps, and refresh source hashes and range citations. Preserve historical plans and completed Plan 267 documentation. This routine ownership change does not need a new ADR.
8. Record actual verification results and archive this plan only when implementation and required checks are complete. Preserve [Plan 267](./267-plan-aggregate-chain-registration.md)'s final contract: whole-hash-gated physical registration precedes local initialization, and a separate `registerAggregate` is awaited during AggregateChain activation before recovery holds and queue wakeups. Do not restore the former combined membership transaction or add an Actor-specific registration/ticket gate.

## Planned file hierarchy

Paths are rooted at `/Users/morgs32/GitHub/zerospin/`. `+` creates, `~` modifies and `-` removes.

```text
packages/core/src/
  declaration/
    ~ ReleaseSpecSchemas.ts
    + makeActorSpecs.ts
    ~ makeReleaseSpecs.ts
  aggregateActor/
    ~ types.ts
    ~ make/makeAggregateActorRelease/makeAggregateActorRelease.ts
    ~ README.md
  serviceActor/
    ~ types.ts
    ~ make/makeServiceActorRelease.ts
    ~ README.md
  system/project/
    - projectActorSpec.ts
packages/system-worker/tests/
  repo-names/~ repo-names.spec.ts
  service-time/~ service-time.workerd.spec.ts
packages/sdk/skills/zerospin-authorize-actors/
  ~ SKILL.md
wiki/
  ~ glossary.md
  architecture/~ AuthoredSystem.md
```

## Verification

1. Keep the Actor-bearing pre-refactor hash oracle in `repo-names.spec.ts`. Existing `reservationsV1`/`operatorV1` direct declarations supply a Model, selected contracts, identity and captured selection without importing a Workerd System or environment; include `accountV1`/`viewerV1` for Aggregate credentials metadata in that same SystemSpec. Assert the fixed original hash plus representative authentication/path/selection facts, numeric compiled Actor bindings and complete own Contract facts in `contractVersions`. The existing Actor-free repeated-hash and reordered-key cases establish determinism, not this preservation guarantee.
2. Add compact factory-level coverage for both Actor families in that same Node file. Include a credentials-bearing Actor and the Service `'none'` branch. Prove stored snapshot reuse, JSON round-trip, detached nested metadata and one representative nested mutation refusal. Compare caller capability freeze status before and after capture rather than assuming every input was initially unfrozen; retain callback/codec identities. Include one representative credentials/identity codec that cannot produce portable JSON Schema and prove rejection occurs at Actor construction, without constructing an owner Release. Avoid an invalid-input matrix.
3. Reuse an Actor across two owner Releases and compare each embedded factory Actor spec with its `.spec`. Exercise both existing update helpers: the updated versions get matching specs and preserve predecessor snapshots. Prove exact version literals and assignment to both erased Actor types; use one compact compile-only readonly assertion without executing a forbidden mutation. Preserve current credential/Effect inference boundaries rather than repairing pre-existing erasures. No updater fixtures or inference framework are needed.
4. Extend the existing Contract-lineage regression with an Actor to prove capture neither requires nor performs System finalization: a later Contract version can still be constructed after the Actor and owner Release but before `makeSystem`; compiling an older selected release still discovers reachable later codec facts from the executable graph while the Actor's binding and snapshot stay unchanged. The existing refusal to extend after System finalization remains. Do not add a second lineage harness or put `previous`/`next` into Actor specs.
5. Run the existing `repo-lifecycle.workerd.spec.ts` whole-acceptance case unchanged unless implementation reveals a concrete gap. It already compiles real Actor declarations, rejects changed Actor facts across Releases and retained snapshots after omission, and proves rejected candidates add no accepted snapshot. Preserve Plan 267's adjacent registration/activation assertions. Reuse existing Actor session/admission coverage for exact identity, authentication/authorization, claims, capabilities and lock formats; make no new acceptance or registration API.
6. Refresh resolved Nx targets at implementation time, then run one explicit graph with available `lib,ts,lint` tasks for Core, System Worker and their Browser/SDK/Dev Worker consumers:

   ```sh
   pnpm nx run-many --projects=@zerospin/core,system-worker,@zerospin/browser,@zerospin/sdk,@zerospin/dev-worker --targets=lib,ts,lint
   pnpm nx run zerospin:test -- packages/system-worker/tests --maxWorkers=2
   ```

7. Finish with scoped formatting, changed-source citation/link checks and `git diff --check`. Do not verify Explorer. No new test/check infrastructure is required.

## Scope and decisions

1. Choose eager capture in the Actor factories because those factories already validate the complete Actor and compile its selections. Owner Releases then consume existing metadata, matching the current Release, Agent and Contract ownership convention. Keep the real shared projection work inside the builders; delete the superseded external projector API.
2. Add canonical types beside the existing schemas instead of creating duplicate family schemas or deriving Actor spec types from SystemSpec fields. Preserve the Aggregate/Service authentication distinction with explicit builders.
3. Preserve selected `contract.spec` and session-lock formats. This plan does not change Contract finalization, support registries, runtime authentication/authorization, owner guards, Agent composition, registration or pending-delivery behavior. It does not revive earlier `payloadShapes`/`failureSchemas` formats or independently accepted Actor records.
4. The guarantee remains spec immutability. Changing executable callback bodies can leave `.spec` unchanged. This refactor moves capture earlier; it adds no executable-code immutability guarantee.
5. Portable projection or JSON validation failures now occur when constructing the Actor, before it can be returned as a canonical declaration, rather than when constructing an enclosing Release. Existing enclosing-Release membership validation remains in the owner factories. Later changes to caller-owned schema annotations or other mutable capability metadata are not re-observed by owner Release construction: the stored Actor snapshot is the recorded fact. This intentionally earlier capture is consistent with existing Contract/Agent snapshot ownership; it does not freeze or fingerprint those capabilities.
6. No additional persistent schema or portable format changes are intended, so this plan introduces no additional storage-format cutover. Existing operational requirements from Plan 266 remain. Storage resets, deployment, publication and external consumer dependency changes require their own authorization.

## Implementation evidence

1. Created managed worktree `factory-owned-actor-specs` and branch `codex/factory-owned-actor-specs` from PR #70 head `2399fbd1f6105f561e9fe766b0a8f6686a4a523b`. The original checkout and unrelated Plan 269 remain separate.
2. Frozen offline dependency installation succeeded without a lockfile change. Refreshed resolved Nx target configuration for the scoped graph and existing root test target.
3. Before production edits, the existing Node test target passed **8 tests in 1 file**, including a newly recorded baseline covering both Actor families. The canonical SystemSpec hash is `6fa4ddd8f0ae92a15427324298b0d6bbacf89ec1d965cebd3b52fa8dc9513968`; keep this value unchanged after factory capture moves.
4. Both Actor factories now attach detached, recursively frozen specs after one selection capture; precise and erased Release types expose the canonical family spec. Release builders consume stored Actor snapshots, and the old external projector is removed. The new builder inputs require credentials-schema metadata only, avoiding the decoded Service callback's erased return type without a cast or runtime change.
5. The explicit five-project Nx `lib,ts,lint` graph passed **18 tasks including dependencies**. Source peer review confirmed the selected metadata/authentication branches, capability retention, update capture points and unchanged finalization behavior.
6. The first full System Worker test run passed **127 tests** and failed two cases. The new rejection test incorrectly assumed `Schema.declare` cannot export JSON Schema; Effect exports a permissive approximation instead. It was corrected to use a real throwing JSON Schema annotation. The existing Service-time original-evaluation case submitted `observeTime@1` to Release 2, whose exact registry contains only `observeTime@2`; this conflicted with the implemented Plan 266 support rule. On 2026-10-26, the maintainer authorized a bounded repair in that existing test: original evaluation submits `@2`, while replay retains the `@1` to `@2` adapter assertion. No admission behavior has been relaxed.
7. After correcting the test's projection-failure assumption, the Node regression passed **10 tests in 1 file**, including the unchanged pre-refactor hash oracle, both Actor update paths, deep immutability/capability retention, eager projection failure and Contract finalization ordering.
8. After the authorized Service-time correction, the required `pnpm nx run zerospin:test -- packages/system-worker/tests --maxWorkers=2` passed **129 tests in 25 files**, including the complete test TypeScript program. Original evaluation checks guard/program time; replay additionally checks adapter time against the retained `finalizedAt`.
9. Final scoped formatting, changed-source hashes/range citations, archival link repair and `git diff --check` pass. No new test files, fixtures, runners or configuration were introduced. Persistent storage, deployment and package publication remain untouched.

## Remaining work

None.
