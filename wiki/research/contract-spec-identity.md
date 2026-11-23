# Contract spec identity: derive the catalogue key from context

**Date:** 2026-10-25. **Status:** Source research and design recommendation, not an implemented change. Inspected Zerospin HEAD `6f99fa97e0` and the unimplemented [Plan 266](../archive/plans/266-plan-independent-contract-version-specs.md). Only this research note was written; no code, plan, storage, or dependency state was changed.

## Finding

A unique owner-qualified catalogue key is required. A separately materialized `{ identity, spec }` object is **not** an independent requirement: it is the input format chosen by today's generic catalogue helpers. When SystemRepo already has the aggregate/service context and owning release, all key facts can be derived from that context and the contract's own `spec.commandName` and `spec.version`. This is the same pattern already used by scoped Repo registration, which receives grouped release specs and derives their identities internally. [Current grouped registration and derivation](../../packages/system-worker/src/SystemRepo/registerRepo/requireAcceptedRepoSpecs.ts#L10), [own contract fields](../../packages/core/src/contracts/types.ts#L110), [current helper interface](../../packages/system-worker/src/SystemRepo/acceptedDefinitions/requireAcceptedDefinitionEntries.ts#L18).

## What the current representation does

1. `acceptedDefinitions` stores only `key` and `spec`. The key is unique and encodes the declaration family and scoped name/version tuple. No separate identity column is persisted. [Storage](../../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts#L8), [tuple encoding](../../packages/system-worker/src/SystemRepo/acceptedDefinitions/AcceptedDefinitionSchema.ts#L98).
2. `projectAcceptedDefinitionEntries` already receives releases under aggregate/service registry context, then constructs an identity object beside each already projected spec. For releases it repeats `spec.name` and `spec.version`; for nested Actors/Agents it adds the enclosing owner name. The resulting envelope makes a heterogeneous list convenient for a generic helper, but adds no new declaration facts. [Projection](../../packages/system-worker/src/SystemRepo/acceptedDefinitions/projectAcceptedDefinitionEntries.ts#L6).
3. `acceptDefinitionEntriesTx` strictly decodes each envelope, derives its key, compares an existing spec or inserts a new `key/spec` row inside one transaction. `readAcceptedDefinition` reconstructs the envelope from the requested identity plus stored spec and checks their consistency. Thus removing the envelope would require rewriting these helper interfaces; keeping it private is also possible. Neither choice changes the need for strict key/spec consistency or atomic acceptance. [Acceptance](../../packages/system-worker/src/SystemRepo/acceptedDefinitions/acceptDefinitionEntriesTx.ts#L24), [stored read](../../packages/system-worker/src/SystemRepo/acceptedDefinitions/readAcceptedDefinition.ts#L38), [identity/spec consistency](../../packages/system-worker/src/SystemRepo/acceptedDefinitions/AcceptedDefinitionSchema.ts#L165).
4. Exact equality compares JSON-compatible spec values and uses identity for lookup/diagnostics, not as part of the spec value itself. Registration is require-only and cannot create catalogue entries. [Comparison](../../packages/system-worker/src/SystemRepo/assertAcceptedSpec/assertAcceptedSpec.ts#L18), [require-only helper](../../packages/system-worker/src/SystemRepo/acceptedDefinitions/requireAcceptedDefinitionEntries.ts#L28), [registration](../../packages/system-worker/src/SystemRepo/registerRepo/registerRepo.ts#L31).

## Identity already on spec versus catalogue location

The contract's local identity is already on its spec: `commandName` and `version`. Adding `spec.identity = { commandName, version }` would wrap/repeat existing fields rather than supply missing information. The missing catalogue scope is the aggregate/service family and owner name. Those facts exist on the containing release and its registry context. [Contract spec](../../packages/core/src/contracts/types.ts#L110), [Aggregate spec](../../packages/core/src/aggregate/AggregateSpecSchema.ts#L11), [Service spec](../../packages/core/src/service/ServiceSpecSchema.ts#L11).

The contract factory seals its spec before an owner release contains it, and its construction inputs are a contract definition plus contract-version props, not an aggregate/service owner name. Aggregate/Service canonical-version validation is scoped separately to each owner name. Putting the **full owner-qualified catalogue identity** on this factory-owned spec would require new owner binding during construction or owner-specific spec copies afterward. That is a different declaration model, not merely deletion of the current envelope. [Factory inputs and spec creation](../../packages/core/src/contracts/make/constructContractVersion.ts#L240), [Aggregate namespaces](../../packages/core/src/system/make/makeSystem/validateAggregateContractVersions.ts#L6), [Service namespaces](../../packages/core/src/system/make/makeSystem/validateServiceContractVersions.ts#L6).

A pure construction probe against QRK's installed SDK `36.0.0` corroborated that one model-free service `ping@1` contract can be reused by `first@1` and `second@1` in one System: both releases retained the exact same contract object, and its spec had no owner fields. This is limited installed-package evidence, not a build or test of the source checkout; the source namespace checks above explain why reuse is permitted.

## Proposed shape

Keep the contract's own spec unchanged in identity terms and let an explicitly scoped SystemRepo operation derive the catalogue key:

```ts
// Proposed use at initial acceptance: owner context already exists.
const catalogueKey = [
  'aggregateContract',
  aggregateRelease.name,
  contractSpec.commandName,
  contractSpec.version,
];

// Proposed replay comparison: the retired source release is unnecessary.
yield* systemRepo.requireAcceptedContractSpecs({
  aggregateContracts: path.map(contract => ({
    aggregateName: key.aggregateName,
    spec: contract.spec,
  })),
  serviceContracts: [],
});
```

The snippets describe proposed behavior, not current exported functions. The grouped request is already the proposed replay interface in Plan 266: Aggregate/Service family comes from its group, owner name from the item, and command name/version from its spec. A separate identity object is unnecessary at this caller. Explicit Aggregate/Service methods could also supply that context, but splitting the current proposal is not required for this conclusion. SystemRepo may keep a small private envelope if its heterogeneous acceptance transaction benefits from it, or work directly with validated encoded keys. That is an internal implementation choice; it should not leak back to contract authors or release registration. The existing source already demonstrates deriving a typed identity inside the SystemRepo adapter. [Current derivation](../../packages/system-worker/src/SystemRepo/registerRepo/requireAcceptedRepoSpecs.ts#L14).

## Replay and correctness constraints

1. Removing the original V1 release does not remove the remaining VersionRepo's owner context: Aggregate replay has `key.aggregateName`; Service replay has `key.serviceName`. The runtime path supplies each historical contract's own `commandName/version/spec`. Consequently replay can derive the same permanent key without reconstructing the retired source release or putting owner identity onto its spec. The independent contract entries and historical comparison are proposed in Plan 266, not yet implemented. [Aggregate replay inputs](../../packages/system-worker/src/AggregateVersionRepo/replayCommands/replayCommand.ts#L15), [Service replay inputs](../../packages/system-worker/src/ServiceVersionRepo/replayCommands/replayCommand.ts#L14), [Plan 266](../archive/plans/266-plan-independent-contract-version-specs.md).
2. A derived-key implementation must retain family/owner separation, reject spec/key name/version mismatches, reject missing retained entries during replay, and keep require-only comparisons separate from acceptance. Stored rows must be decoded against the expected spec family and requested key; a generic JSON object alone is insufficient. [Existing typed keys and schema](../../packages/system-worker/src/SystemRepo/acceptedDefinitions/AcceptedDefinitionSchema.ts#L98), [strict stored read](../../packages/system-worker/src/SystemRepo/acceptedDefinitions/readAcceptedDefinition.ts#L38), [missing-entry refusal](../../packages/system-worker/src/SystemRepo/acceptedDefinitions/requireAcceptedDefinitionEntries.ts#L28).
3. Deriving a key from release context does not imply including the **owner release version** in the contract key. The user has chosen one contract-version identity across releases of the same owner; only family, owner name, command name and contract version belong in that proposed key. Derive the owner name from the containing release, then discard its release version for this purpose. [Agreed identity scope](../archive/plans/266-plan-independent-contract-version-specs.md#problem-and-agreed-behavior).

## Recommendation and limits

Prefer owner-scoped key derivation inside SystemRepo. Preserve the contract's own name/version fields and portable spec; do not add full catalogue ownership to it. Treat today's `{ identity, spec }` envelope as removable adapter machinery, not an application-level identity model. A private intermediate envelope can remain only if its actual use in the atomic heterogeneous catalogue transaction earns its complexity. This recommendation follows the current information ownership and storage behavior; it is not a measured performance finding. [Storage](../../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts#L8), [acceptance transaction](../../packages/system-worker/src/SystemRepo/acceptedDefinitions/acceptDefinitionEntriesTx.ts#L24).

Plan 266 should be revised only after the parent discussion settles the interface. This investigation ran no source-checkout tests or builds and does not establish runtime behavior of a replacement implementation. Its one installed-SDK construction probe is described separately above.
