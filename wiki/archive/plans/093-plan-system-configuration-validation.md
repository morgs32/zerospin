# System configuration validation

Status: Completed — 2026-10-10.

## Problem and agreed behavior

1. `makeSystem` mixes construction with long inline validation loops. Admission repeats some declaration consistency checks, and its explorer injects malformed plain `ISystem` objects that bypass construction.
2. `makeSystem` will compose real, synchronous validators through explicit function calls. Each validator returns `void` and throws on invalid configuration. No Effect pipeline or validators that return the System.
3. Validate configuration once during System construction. Admission checks submitted commands against valid declarations.
4. Use `mapValues` from `es-toolkit` for record traversal, with `(value, key)` callbacks. The root `AGENTS.md` now prohibits `for ... of Object.entries(...)` record loops.
5. Preserve authored contract, actor, selection, and model object identities. Do not return schema-produced replacements for canonical declaration objects. Preserve the current generic inference and optional empty registry defaults.
6. Keep the existing structural `ISystem` API in this scope. An opaque type, runtime validation marker, lookup indexes, deep freezing, and repository-wide caller migration are not part of this update. Construction is the supported boundary; this plan does not claim protection against arbitrary post-construction mutation.

## Composition

```ts
const system = decodeSystemProps(props);
validateReleaseRegistries(system);
validateContractRegistries(system);
validateMappedContracts(system);
validateActorVersions(system);
validateServiceModelOwnership(system);
validateAgentBindings(system);
return system;
```

1. Adjust `decodeSystemProps` to validate input structure and return normalized System registries while retaining authored object references. Its existing implementation is only used for the decoded name by `makeSystem`; adopting its entire decoded result requires verifying reference preservation.
2. Import each validator directly from its defining file. Put one named exported function in each file beside `makeSystem.ts`, with no barrel or generic validation framework.

## Validator responsibilities

1. `validateReleaseRegistries(system)`: check aggregate/service registry names and exact version keys against their releases. Preserve existing failures and useful identity context.
2. `validateContractRegistries(system)`: check release and actor contract registration names and owner kinds, including supported `previous` versions. Keep declaration-constructor structural guarantees at their existing boundary rather than decoding declarations again.
3. `validateMappedContracts(system)`: check mapped wrappers preserve their original contract name, version, owner kind, and claims schema. Check configured external contract ownership/name consistency where applicable. Do not require actor contracts to be identical to owner contracts: actors can declare their own permitted contract implementations.
4. `validateActorVersions(system)`: preserve aggregate and service historical actor consistency checks. Within an owner registry, one actor name/version must identify one authored object across releases. Validate actor registration names against authored names.
5. `validateServiceModelOwnership(system)`: preserve the existing rule that different services cannot own the same source model object; reuse within releases of the same service is permitted.
6. `validateAgentBindings(system)`: move existing agent identity, System/aggregate version binding, reserved model name, canonical model, selection, ordinary contract, claims availability, and selected binding model checks intact. Keep canonical contract object equality here.
7. Where a constructor already establishes an invariant, reuse that guarantee. Do not create competing validators for the same invariant at admission or runtime activation.

## Admission boundary

1. Remove configuration-only owner-kind, registration-name, canonical binding-object equality, and historical actor conflict checks from the admission path after construction establishes them. Inspect each affected call site before changing shared helpers; preserve their unrelated callers.
2. Retain command address, System name, release availability, actor/agent existence, permitted contract subset/version, agent aggregate/session binding, claims, public async prohibition, continuation kind/version, payload, duplicate provenance, and producer order checks. A valid configuration does not make a submitted command valid.
3. Preserve the synchronous retention transaction, staging evidence, occurrence order, duplicate recovery, and complete-batch rollback behavior.
4. Historical actor resolution must still fail for an unsupported submitted actor version. Declaration conflicts belong to construction; preserve lookup behavior without introducing derived indexes.
5. Admission explorer catalogues and their profiling infrastructure were removed at the user's request. Do not recreate them.
6. Follow [ADR 004: Versioned agent selected views](../../adrs/004-versioned-agent-selected-views.md): agent ordinary contract allowlists and exact command bindings remain required.

## Planned files

Legend: `+` create, `~` modify. Paths are rooted at the repository.

```text
zerospin/
├── AGENTS.md                                                    ~ (rule added)
├── packages/core/src/system/make/makeSystem/
│   ├── makeSystem.ts                                            ~
│   ├── decodeSystemProps/decodeSystemProps.ts                    ~
│   ├── validateReleaseRegistries.ts                             +
│   ├── validateContractRegistries.ts                            +
│   ├── validateMappedContracts.ts                               +
│   ├── validateActorVersions.ts                                 +
│   ├── validateServiceModelOwnership.ts                         +
│   └── validateAgentBindings.ts                                 +
├── packages/core/src/aggregateActor/getAggregateActorVersion.ts  ~
├── packages/system-worker/src/checkAdmission.ts                  ~
├── packages/system-worker/src/AggregateChain/admitAggregateCommands/
│   └── admitAggregateCommands.ts                                ~
└── wiki/plans/093-plan-system-configuration-validation.md         +
```

## Implementation and verification

1. Re-read scoped current diffs, especially existing WIP in admission, and preserve unrelated changes. Inspect constructor guarantees before extracting code.
2. Implement the six functions, reference-preserving normalization, and the approved `makeSystem` composition. Replace the temporary pseudocode and remove the superseded inline loops.
3. Test/check files and their runner configuration were removed at the user's request on 2026-10-10. Do not recreate configuration tests or admission check scripts as part of this plan. Review constructor reference preservation and invariant ownership directly in source.
4. Simplify admission and its shared lookup/check helpers only for proven construction guarantees.
5. Inspect resolved Nx configurations for core and system-worker once. Run the smallest available formatting, lint, source typechecking, and build tasks through the workspace package manager and Nx. Include required dependencies and check consumers affected by core exports. Do not broaden into a full-repo polish pass.
6. Review retained command authority and transactional rollback behavior in source. Confirm configuration failures occur before admission and no `for ... of Object.entries(...)` record loops remain in the extracted area.
7. Reconcile implemented terminology with `wiki/glossary.md`; add a glossary entry only if a new domain term is actually introduced. Create an ADR only for an implemented decision that is hard to reverse, surprising without context, and reflects a real trade-off. Update relevant existing docs if boundary descriptions change.
8. Record validation evidence, then archive this plan under `wiki/archive/plans/` using the implement workflow when implementation and verification are complete.

## Outcome

`makeSystem` now composes the six synchronous validators over reference-preserving decoded registries. Configuration-only declaration consistency checks were removed from admission while command authority and historical actor lookup remain at the admission boundary. No new glossary term or qualifying ADR was required.

Verification was reconciled from current source while implementing plan 094. `pnpm nx run-many -t ts lint -p system-worker` passed, including the core and system-worker library builds and the system-worker source typecheck. Lint reported only existing warnings outside the extracted validator area. Source review confirmed the six-validator composition and no `Object.entries` traversal in `makeSystem`.

## Remaining work

None.
