---
name: zerospin-evolve-declarations
description: >-
  Use when changing existing Zerospin model, command payload, or actor
  declarations and updating exact owner release and browser session bindings.
metadata:
  purpose: Evolve canonical declarations while preserving intentional history and exact release bindings.
  type: core
  library: '@zerospin/sdk'
  library_version: '38.2.0'
requires:
  - zerospin-parallel-models
---

# Evolve Zerospin declarations

First load `pnpm exec intent load @zerospin/sdk#zerospin-parallel-models` and
apply its model-data invariant throughout this task.

Follow the [System registry rule](../zerospin-parallel-models/SKILL.md#system-registry-changes):
present exact before-and-after snippets and obtain the user's approval before
changing `system.ts`.

1. Trace the changed declaration through its contracts, actor query database,
   exposed models, owner release, System registry and browser session definition.
   On compatible framework storage, new releases reuse the existing owner Chain
   and replay retained history into release-specific state. Treat a framework storage change and
   release retirement as separate decisions. For a framework upgrade that changes
   storage or has unknown compatibility, follow the
   [deployment storage preflight](https://github.com/morgs32/zerospin/blob/main/docs/content/guides/develop-and-deploy.md#inspect-storage-before-a-framework-rollout).
   Storage resets require explicit authorization.
2. Import model and ordinary contract upgrades from `@zerospin/sdk/browser`;
   import actor updates and owner releases from `@zerospin/sdk`. Use
   `upgradeModelVersion` for attribute patches; `null` removes an existing
   attribute. Declare model relationships with `modelRef({ model: identity, relation, inverse })`,
   importing the stable `defineModel` identity rather than another version's `.table`.
   The owner release selects the referenced version and validates its key. Unchanged
   referencing models/contracts do not need new versions for an unrelated field
   added to the referenced model. Recheck retained indexes and references. This creates a declaration;
   it does not transform persisted rows.
3. For an existing ordinary contract, use `upgradeAggregateContractRelease` or
   `upgradeServiceContractRelease` with the exact previous declaration, a unique
   next version and only the changes. This is mandatory even when only operation
   descriptors change and the payload stays identical. Omitted
   payload, claims, failures, result, guard and program inherit. Model and payload
   maps patch by key; operation maps replace supplied entries and retain others.
   Omitted `up` passes the decoded payload through with destination validation;
   supply it for a real transformation or custom error mapping. A stricter
   validator can reject retained history without changing its stored bytes.
   Guards and programs receive the original decoded `command` as well as the
   `payload` adapted for the executing contract. Use `command.contractVersion`
   when behavior depends on the source version. For typed access to known source
   payloads, narrow with `Schema.is(contract.knownCommandSchema)(command)`;
   a later version unknown to this declaration has an unknown payload. Admission
   validates authority separately from the command data supplied to a callback.
   `down` remains explicit when reverse adaptation is needed. An ordinary `down` can return `DownAdapterRefused` from the SDK for
   valid input the older contract cannot represent. After validating the source
   command, replay records a release-local unsupported outcome and advances.
   Missing adapters, callback failures, and invalid results still stop replay.
   Adapters belong to their version edge and are not inherited. Inherited programs read through
   `db.models` and receive the selected operation bindings; a closed-over model
   version does not change automatically. Define each external request version with its exact pure
   definition and backend implementation. Rebind the emitted descriptor and
   release registration together. Its emitting release uses the retained
   observation to build an ordinary command. Use ordinary payload adapters
   when that continuation contract changes.
   A command descriptor pins an owner definition, release version and ordinary
   contract object; update all three registrations together when that binding
   changes.
4. Actor updates inherit omitted fields and merge selections/contracts by key;
   empty maps preserve access. Reconstruct an actor when removing entries.
   Rebuild selections against the chosen query database and preserve exact
   canonical objects and valid exposed schemas. Register a **new owner release**
   for changed bindings; evaluate existing releases separately before retiring
   them. [Call the Zerospin constructor directly for each release](../zerospin-parallel-models/SKILL.md#call-zerospin-constructors-directly).
   Reuse unchanged declarations; advancing an owner release does not require
   bumping them. Update intended
   `@zerospin/browser` session owner/actor versions, claims, models and public
   contracts deliberately. For a Service, evaluate changes to `canonical`
   separately from updating session bindings.
   Older releases that lack its command retain a local unsupported outcome and
   do not apply its operations, so their views can differ.
5. Run existing application type/build and retained-history checks. Verify the
   candidate's required history prefix, source declaration coverage, execution
   behavior and publication progress for existing instances. When considering
   promotion or retirement, present evidence and the proposed before-and-after
   registry changes for the user's approval; successful SystemSpec acceptance
   or a typecheck does not establish either.
   Report missing runtime evidence.

Before changing lineage or storage, read
[declaration evolution](references/declaration-evolution.md), including its
[promotion and retirement sequence](references/declaration-evolution.md#introduce-and-validate-consider-promotion-or-retirement).
